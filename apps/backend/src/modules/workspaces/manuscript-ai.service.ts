import { z } from "zod";
import type { ManuscriptAiInput, ManuscriptAiResult, ManuscriptAiRun, ManuscriptReference, ManuscriptCompilation } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { aiJobsQueue } from "../../infrastructure/queue.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import { withProjectAi } from "../user-ai/user-ai.runtime.js";
import { withWorkspace } from "../projects/workspace-access.js";
import { discoveryEvidenceIsCurrent } from "../projects/project-evidence.service.js";
import { markAiRunStarted, completeAiRun, failAiRun } from "../ai-jobs/ai-run.service.js";
import { manuscriptService } from "./manuscript.service.js";
import { sourceText } from "./manuscript-source.js";
import { manuscriptAiSchema } from "./dto/manuscript-ai.schema.js";
import { manuscriptAiOperations, manuscriptAiSystem, validateManuscriptProposal } from "./manuscript-ai-policy.js";

export const MANUSCRIPT_AI_JOB = "manuscript_writing";
const outputSchema = z.object({
  text: z.string().max(16000), explanation: z.string().trim().min(1).max(3000),
  needsContext: z.boolean().optional(),
  citations: z.array(z.object({ paperId: z.string().uuid(), reason: z.string().max(700), supportQuote: z.string().trim().min(20).max(1000).optional() }).strict()).max(8),
}).strict();
type Output = z.infer<typeof outputSchema>;
type Source = ManuscriptReference & { abstract: string; excerpts?: Array<{ quotation: string; locator: string }>; evidenceStatus: "PROJECT_SOURCE" | "REVIEWED_EVIDENCE" };

// The compiler runs multiple passes. Earlier undefined citations can be resolved by the final pass.
export function compiledManuscriptRepair(compilation: Pick<ManuscriptCompilation, "id" | "status" | "sourceVersion" | "diagnostics"> | null, version: number): ManuscriptAiResult | null {
  if (!compilation || compilation.status !== "SUCCESS" || compilation.sourceVersion !== version) return null;
  const passes = [...compilation.diagnostics.matchAll(/^This is (?:pdfTeX|XeTeX|Lua(?:HB)?TeX)\b/gm)];
  const finalLog = compilation.diagnostics.slice(passes.at(-1)?.index ?? 0);
  const warnings = [...new Set(finalLog.split(/\r?\n/).filter(line => /\bWarning:|(?:pdfTeX|XeTeX) warning|(?:Over|Under)full \\[hv]box/.test(line)).map(line => line.trim().slice(0, 500)))].slice(0, 12);
  return { text: "", explanation: warnings.length
    ? "Compiler đã tạo PDF thành công cho phiên bản mã nguồn này. Nhật ký cuối còn cảnh báo, không phải lỗi chặn biên dịch. Chưa có bản sửa mã nguồn được đề xuất."
    : "Compiler đã tạo PDF thành công cho phiên bản mã nguồn này; không ghi nhận cảnh báo trong lượt biên dịch cuối. Không cần áp dụng bản sửa.",
    citations: [], warnings, repair: { outcome: warnings.length ? "WARNINGS" : "COMPILED", sourceVersion: version, compilationId: compilation.id } };
}

// Only server-resolved project references may become citations. The model never supplies BibTeX or keys.
export function validateManuscriptAiOutput(raw: unknown, sources: Source[], allowedKeys: string[], action: ManuscriptAiInput["action"], original = "", scope?: Parameters<typeof validateManuscriptProposal>[3]): ManuscriptAiResult {
  const output = outputSchema.parse(raw);
  if (output.needsContext) {
    if (output.text.trim() || output.citations.length || ["explain", "citations"].includes(action)) throw AppError.badRequest("A clarification cannot contain source edits or citations");
    return { text: "", explanation: output.explanation, citations: [], needsContext: true, warnings: ["More research context is needed before proposing an edit."] };
  }
  if (action === "citations" && output.text !== "") throw AppError.badRequest("Citation searches cannot return insertable prose");
  if (action === "explain" && !output.text.trim()) throw AppError.badRequest("AI returned an empty explanation");
  const proposalWarnings = validateManuscriptProposal(action, original, output.text, scope);
  // Validate complete tokens: a cursor or selection can split a command, key or DOI.
  const editScope = !["explain", "citations"].includes(action) ? scope : undefined;
  const editFrom = editScope ? action === "continue" ? editScope.to : editScope.from : 0;
  const originalSource = editScope?.fullSource ?? original;
  const proposedSource = editScope ? originalSource.slice(0, editFrom) + output.text + originalSource.slice(editScope.to) : output.text;
  const overlapsEdit = (from: number, length: number) => !editScope || (from < editFrom + output.text.length && from + length > editFrom);
  const existingKeys = [...originalSource.matchAll(/\\[A-Za-z]*cite[A-Za-z]*\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/gi)].flatMap(match => match[1]!.split(",").map(key => key.trim()));
  const keys = new Set([...allowedKeys, ...existingKeys]);
  const citedKeys = new Set<string>();
  const citationCommands = new Set(["cite", "citep", "citet", "citeauthor", "citeyear", "citeyearpar", "citealp", "citealt", "citetitle", "citeurl", "parencite", "textcite", "autocite", "footcite", "nocite", "supercite"]);
  for (const match of action === "explain" ? [] : proposedSource.matchAll(/\\([A-Za-z]*cite[A-Za-z]*)\*?/gi)) {
    const arguments_ = proposedSource.slice(match.index! + match[0].length).match(/^\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/);
    if (!overlapsEdit(match.index!, match[0].length + (arguments_?.[0].length ?? 0))) continue;
    if (!citationCommands.has(match[1]!.toLowerCase()) || !arguments_) throw AppError.badRequest("AI returned an unsupported citation command");
    for (const key of arguments_[1]!.split(",").map(key => key.trim())) {
      if (!keys.has(key)) throw AppError.badRequest("AI returned an unknown citation key. Try again.");
      citedKeys.add(key);
    }
  }
  if (action !== "explain") {
    const records = (text: string): string[] => text.match(/@[a-z]+\s*\{/gi) ?? [];
    const retainedRecords = records(originalSource);
    for (const record of records(proposedSource)) {
      const index = retainedRecords.indexOf(record);
      if (index < 0) throw AppError.badRequest("AI cannot create bibliography records");
      retainedRecords.splice(index, 1);
    }
    const bibliography = (text: string) => text.match(/\\(?:bibitem|bibliography|bibliographystyle|addbibresource)\b(?:\s*\[[^\]]*\])?\s*\{[^}]*\}|\\begin\s*\{thebibliography\}/g) ?? [];
    const retained = bibliography(originalSource).map(command => command.replace(/\s+/g, ""));
    for (const command of bibliography(proposedSource)) {
      const index = retained.indexOf(command.replace(/\s+/g, ""));
      if (index < 0) throw AppError.badRequest("AI cannot create bibliography records");
      retained.splice(index, 1);
    }
    if (retained.length && !["continue", "citations"].includes(action)) throw AppError.badRequest("AI removed bibliography commands");
  }
  const originalDois = new Set(originalSource.match(/10\.\d{4,9}\/[^\s{}<>]+/gi) ?? []);
  for (const doi of action === "explain" ? [] : proposedSource.match(/10\.\d{4,9}\/[^\s{}<>]+/gi) ?? []) {
    if (!sources.some(source => source.doi === doi) && !originalDois.has(doi)) throw AppError.badRequest("AI returned an unrecognized DOI");
  }
  const citations = [...new Map(output.citations.map(c => {
    const source = sources.find(s => s.id === c.paperId);
    if (!source) throw AppError.badRequest("AI returned a source outside this project");
    const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
    const quote = c.supportQuote;
    const excerpt = quote ? source.excerpts?.find(item => normalize(item.quotation).includes(normalize(quote))) : undefined;
    const inAbstract = quote && normalize(source.abstract).includes(normalize(quote));
    if ((action === "citations" && !quote) || (quote && !excerpt && !inAbstract)) throw AppError.badRequest("Citation suggestions require a traceable source quotation");
    const { abstract: _abstract, excerpts: _excerpts, ...reference } = source;
    const support = quote ? { quote, locator: excerpt?.locator ?? "Abstract", kind: excerpt ? "REVIEWED_EXCERPT" as const : "ABSTRACT" as const } : undefined;
    return [source.id, { ...reference, reason: c.reason, ...(support ? { support } : {}) }] as const;
  })).values()];
  for (const source of sources) {
    if (citedKeys.has(source.citationKey) && !citations.some(c => c.id === source.id)) {
      const { abstract: _abstract, excerpts: _excerpts, ...reference } = source;
      citations.push({ ...reference, reason: "Cited in the proposed passage; verify support before accepting." });
    }
  }
  return { text: action === "citations" ? "" : output.text, explanation: output.explanation, citations,
    warnings: [action === "repair" ? "The proposed fix has not been compiled. Review it and compile again after applying." : "AI suggestions require human review. Project sources do not establish that a claim is supported.", ...proposalWarnings] };
}

async function access(project: string, actor: string, id: string) {
  return withWorkspace(project, actor, { write: true }, async context => {
    const draft = await context.tx.draftWorkspace.findFirst({ where: { id, projectId: context.project.id, writingMode: "LATEX", archivedAt: null, deletedAt: null } });
    if (!draft) throw AppError.notFound("Writable manuscript not found");
    if (context.project.aiDataPolicy === "DISABLED") throw AppError.forbidden("External AI processing is disabled by this project's security policy");
    return { project: context.project.id, actor: context.actorId };
  });
}
function present(row: { id: string; status: string; prompt: string | null; resultSummary: string | null; errorMessage: string | null }): ManuscriptAiRun {
  return { id: row.id, status: row.status as ManuscriptAiRun["status"], input: manuscriptAiSchema.parse(JSON.parse(row.prompt!)),
    result: row.resultSummary ? JSON.parse(row.resultSummary) as ManuscriptAiResult : null, error: row.errorMessage };
}
async function scoped(project: string, actor: string, id: string, runId: string) {
  const scope = await access(project, actor, id);
  const row = await getPrisma().aiRun.findFirst({ where: { id: runId, ownerId: scope.actor, projectId: scope.project, workspaceId: id, jobType: MANUSCRIPT_AI_JOB } });
  if (!row) throw AppError.notFound("Writing suggestion not found");
  return row;
}
export const manuscriptAiService = {
  async create(project: string, actor: string, id: string, raw: ManuscriptAiInput): Promise<ManuscriptAiRun> {
    let input = manuscriptAiSchema.parse(raw); const scope = await access(project, actor, id);
    const file = await manuscriptService.fileContent(project, actor, id, input.fileId);
    const text = file.state ? sourceText(Buffer.from(file.state, "base64")) : "";
    if (file.kind !== "TEXT" || input.to > text.length || text.slice(input.from, input.to) !== input.original) throw AppError.conflict("Wait for source synchronization and select the text again");
    if (input.sourceSequence !== undefined && input.sourceSequence !== file.sequence) throw AppError.conflict("Source revision changed; select the text again");
    input = { ...input, sourceSequence: file.sequence };
    if (input.regenerateOf) {
      const previous = await scoped(project, actor, id, input.regenerateOf);
      const previousInput = manuscriptAiSchema.parse(JSON.parse(previous.prompt!));
      if (previous.status !== "completed" || (["fileId", "action", "from", "to", "original", "instruction", "language", "sourceSequence"] as const).some(key => input[key] !== previousInput[key])) throw AppError.conflict("Regenerate only a completed proposal for the unchanged source and operation");
    }
    if (!file.path.endsWith(".tex") && input.action !== "explain") throw AppError.badRequest("Choose a LaTeX file for writing assistance");
    const db = getPrisma();
    const row = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${scope.actor}::uuid FOR UPDATE`;
      if (await tx.aiRun.count({ where: { ownerId: scope.actor, jobType: MANUSCRIPT_AI_JOB, status: { in: ["queued", "running"] }, createdAt: { gt: new Date(Date.now() - 10 * 60000) } } }) >= 2) throw AppError.conflict("Wait for your current writing suggestions");
      return tx.aiRun.create({ data: { ownerId: scope.actor, projectId: scope.project, workspaceId: id, jobType: MANUSCRIPT_AI_JOB, prompt: JSON.stringify(input), maxAttempts: 1 } });
    });
    try {
      const jobId = `manuscript-ai-${row.id}`;
      await aiJobsQueue.add(MANUSCRIPT_AI_JOB, { runId: row.id }, { jobId });
      await db.aiRun.update({ where: { id: row.id }, data: { queueJobId: jobId } });
    } catch (error) {
      await db.aiRun.update({ where: { id: row.id }, data: { status: "failed", errorMessage: "AI queue unavailable. Please try again.", completedAt: new Date() } }); throw error;
    }
    return present(row);
  },
  async get(project: string, actor: string, id: string, runId: string) {
    let row = await scoped(project, actor, id, runId);
    if (["queued", "running"].includes(row.status) && Date.now() - row.createdAt.getTime() > 10 * 60000) {
      await getPrisma().aiRun.updateMany({ where: { id: row.id, status: { in: ["queued", "running"] } }, data: { status: "failed", errorMessage: "AI request timed out. Please try again.", completedAt: new Date() } });
      row = await scoped(project, actor, id, runId);
    }
    return present(row);
  },
  async cancel(project: string, actor: string, id: string, runId: string) {
    const row = await scoped(project, actor, id, runId);
    await getPrisma().aiRun.updateMany({ where: { id: row.id, status: { in: ["queued", "running"] } }, data: { status: "cancelled", cancelRequestedAt: new Date(), completedAt: new Date() } });
  },
  async process(runId: string) {
    const db = getPrisma(), row = await db.aiRun.findUnique({ where: { id: runId } });
    if (!row || row.jobType !== MANUSCRIPT_AI_JOB || row.status !== "queued" || !row.projectId || !row.workspaceId) return;
    try { await markAiRunStarted(runId); } catch (error) { if (error instanceof AppError && error.statusCode === 409) return; throw error; }
    try {
      await access(row.projectId, row.ownerId, row.workspaceId);
      const input = manuscriptAiSchema.parse(JSON.parse(row.prompt!));
      const [detail, context, latest] = await Promise.all([manuscriptService.detail(row.projectId, row.ownerId, row.workspaceId), manuscriptService.context(row.projectId, row.ownerId, row.workspaceId), manuscriptService.compilations(row.projectId, row.ownerId, row.workspaceId)]);
      const textFiles = detail.files.filter(f => f.kind === "TEXT").sort((a, b) => Number(b.id === input.fileId) - Number(a.id === input.fileId));
      const contextFileIds = new Set(textFiles.slice(0, 16).map(f => f.id));
      // Validate against complete bibliography files, even when their content is outside the prompt budget.
      const loaded = await Promise.all(textFiles.filter(f => contextFileIds.has(f.id) || f.path.endsWith(".bib")).map(async f => {
        const content = await manuscriptService.fileContent(row.projectId!, row.ownerId, row.workspaceId!, f.id);
        const text = content.state ? sourceText(Buffer.from(content.state, "base64")) : "";
        if (f.id === input.fileId && (text.slice(input.from, input.to) !== input.original || (input.sourceSequence !== undefined && content.sequence !== input.sourceSequence))) throw AppError.conflict("Source changed before AI processing");
        return { id: f.id, path: f.path, sequence: content.sequence, fullSource: f.id === input.fileId ? text : "", keys: f.path.endsWith(".bib") ? [...text.matchAll(/@[A-Za-z]+\s*\{\s*([^,\s]+)\s*,/g)].map(m => m[1]!) : [], text: f.id === input.fileId ? text.slice(Math.max(0, input.from - 4000), input.to + 4000) : text.slice(0, 2000) };
      }));
      const target = loaded.find(file => file.id === input.fileId);
      if (!target) throw AppError.conflict("The source file no longer exists");
      const proposalScope = { fullSource: target.fullSource, from: input.from, to: input.to, paths: detail.files.map(file => file.path), supportedText: input.instruction };
      const ensureSourceCurrent = async () => {
        await access(row.projectId!, row.ownerId, row.workspaceId!);
        const current = await manuscriptService.fileContent(row.projectId!, row.ownerId, row.workspaceId!, input.fileId);
        if (current.sequence !== target.sequence) throw AppError.conflict("Source changed while AI was processing");
      };
      if (input.action === "repair") {
        const compiled = compiledManuscriptRepair(latest.latest, detail.version);
        if (compiled) {
          await ensureSourceCurrent();
          compiled.scope = { fileId: input.fileId, path: target.path, sourceSequence: target.sequence, sourceVersion: detail.version };
          await completeAiRun(runId, { resultSummary: JSON.stringify(compiled) });
          return;
        }
      }
      const files = loaded.filter(f => contextFileIds.has(f.id)).map(({ path, text }) => ({ path, text }));
      const links = await db.projectPaper.findMany({ where: { projectId: row.projectId, screeningStatus: "INCLUDED" }, select: { paperId: true }, take: 200 });
      const papers = await db.paper.findMany({ where: { id: { in: links.map(l => l.paperId) }, dataStatus: "active" }, select: { id: true, abstractText: true } });
      const verified = await withWorkspace(row.projectId, row.ownerId, {}, async scope => {
        const records = await scope.tx.projectEvidenceItem.findMany({ where: { projectId: scope.project.id, paperId: { in: papers.map(p => p.id) }, reviewState: "ACCEPTED" }, take: 40 });
        const current = [];
        for (const evidence of records) if (await discoveryEvidenceIsCurrent(scope, evidence)) current.push({ paperId: evidence.paperId, claim: evidence.claim.slice(0, 2000), context: evidence.context.slice(0, 2000), quotation: evidence.quotation.slice(0, 2000), locator: evidence.locator.slice(0, 300), limitations: evidence.limitations.slice(0, 1000) });
        return current;
      });
      const queryWords = new Set((`${input.original} ${input.instruction}`.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).slice(0, 120));
      const rankedSources = context.references.filter(ref => papers.some(p => p.id === ref.id)).map(ref => {
        const abstract = papers.find(p => p.id === ref.id)?.abstractText?.slice(0, 2500) ?? "";
        const words = new Set(`${ref.title} ${abstract}`.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
        return { ref, abstract, score: [...queryWords].filter(word => words.has(word)).length + (input.original.includes(ref.citationKey) ? 20 : 0) };
      }).sort((a, b) => b.score - a.score || a.ref.id.localeCompare(b.ref.id));
      const sources: Source[] = rankedSources.slice(0, 30).map(({ ref, abstract }) => ({ ...ref, abstract, excerpts: verified.filter(e => e.paperId === ref.id).map(e => ({ quotation: e.quotation, locator: e.locator })), evidenceStatus: verified.some(e => e.paperId === ref.id) ? "REVIEWED_EVIDENCE" : "PROJECT_SOURCE" }));
      proposalScope.supportedText += "\n" + sources.map(source => `${source.abstract}\n${source.excerpts?.map(excerpt => excerpt.quotation).join("\n") ?? ""}`).join("\n");
      const preservedKeys = [...input.original.matchAll(/\\[A-Za-z]*cite[A-Za-z]*\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/gi)].flatMap(match => match[1]!.split(",").map(key => key.trim()));
      const allowedKeys = [...new Set([...(input.action === "repair" ? [] : sources.map(r => r.citationKey)), ...loaded.flatMap(f => f.keys), ...preservedKeys])];
      const compilation = latest.latest ? { id: latest.latest.id, status: latest.latest.status, engine: latest.latest.engine, sourceVersion: latest.latest.sourceVersion, stale: latest.latest.sourceVersion !== detail.version, diagnostics: latest.latest.sourceVersion === detail.version ? latest.latest.diagnostics.slice(-12000) : "" } : null;
      const payload = { action: input.action, operation: manuscriptAiOperations[input.action], instruction: input.instruction, targetLanguage: input.language, selection: input.original, before: target.fullSource.slice(Math.max(0, input.from - 4000), input.from), after: target.fullSource.slice(input.to, input.to + 4000), sourceSequence: target.sequence, sourceVersion: detail.version, targetFile: target.path, selectionFrom: input.from, selectionTo: input.to, mainFile: detail.files.find(f => f.id === detail.mainFileId)?.path, compilation, files, research: context.plan, sources, verifiedEvidence: verified, allowedCitationKeys: allowedKeys };
      const result = await withProjectAi(row.projectId, row.ownerId, () => cachedGenerateJSON<Output>({
        task: "chat", promptVersion: "manuscript-writing-v6", keyParts: { owner: row.ownerId, manuscript: row.workspaceId, ...(input.regenerateOf ? { regeneration: row.id } : {}) }, ttlSeconds: 3600,
        prompt: JSON.stringify(payload), options: { temperature: 0.2, maxOutputTokens: 6000, system: manuscriptAiSystem(input.action) },
        validate: raw => { outputSchema.parse(raw); validateManuscriptAiOutput(raw, sources, allowedKeys, input.action, input.original, proposalScope); return raw; },
      }));
      await ensureSourceCurrent();
      const validated = validateManuscriptAiOutput(result, sources, allowedKeys, input.action, input.original, proposalScope);
      if (validated.citations.length) {
        const ids = validated.citations.map(citation => citation.id);
        const [included, active] = await Promise.all([db.projectPaper.count({ where: { projectId: row.projectId, paperId: { in: ids }, screeningStatus: "INCLUDED" } }), db.paper.count({ where: { id: { in: ids }, dataStatus: "active" } })]);
        if (included !== ids.length || active !== ids.length) throw AppError.conflict("Project sources changed during AI generation");
      }
      validated.scope = { fileId: input.fileId, path: target.path, sourceSequence: target.sequence, sourceVersion: detail.version };
      if (input.action === "repair" && !validated.needsContext) {
        const changed = validated.text.replace(/\r\n/g, "\n").trim() !== input.original.replace(/\r\n/g, "\n").trim();
        validated.repair = { outcome: changed ? "PROPOSED_FIX" : "NO_CHANGE", sourceVersion: detail.version, compilationId: latest.latest?.id ?? null };
        if (!changed) validated.warnings = [];
      }
      await completeAiRun(runId, { resultSummary: JSON.stringify(validated) });
    } catch {
      await failAiRun(runId, { code: "MANUSCRIPT_AI_FAILED", message: "Writing assistance failed or access changed. Your source is unchanged; please try again." });
    }
  },
};
