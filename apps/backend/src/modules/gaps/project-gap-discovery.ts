import type { DiscoveryPaperResult, ProjectGapDiscoveryResult, SynthesisContent } from "@trend/shared-types";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { indexPaper } from "../knowledge/knowledge.ingest.js";
import { knowledgeService } from "../knowledge/knowledge.service.js";
import { sourceFingerprint } from "../knowledge/knowledge.text.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import { aiModel } from "../user-ai/user-ai.runtime.js";
import { DISCOVERY_SYNTHESIS_SYSTEM, DISCOVERY_SYNTHESIS_VERSION, parseDiscoverySynthesis } from "./discovery-synthesis.js";
import type { DiscoveryCandidate } from "./project-gap-candidates.js";
import { jsonSnapshot, withWorkspace, type WorkspaceContext, type WorkspaceDb } from "../projects/workspace-access.js";

export interface DiscoveryInput {
  kind: "PROJECT_DISCOVERY";
  projectContext?: { title: string; summary: string; researchField: string; researchAreas: string[] };
  sources: Array<{ id: string; projectPaperId: string; updatedAt: string; fingerprint: string }>;
  result: ProjectGapDiscoveryResult;
}
export async function discoverySources(context: WorkspaceContext, selectedIds: string[]) {
  if (selectedIds.length < 2 || new Set(selectedIds).size !== selectedIds.length) throw AppError.badRequest("Select at least 2 distinct relevant papers");
  const [links, papers] = await Promise.all([
    context.tx.projectPaper.findMany({ where: { projectId: context.project.id, paperId: { in: selectedIds }, screeningStatus: "INCLUDED" } }),
    context.tx.paper.findMany({ where: { id: { in: selectedIds }, dataStatus: "active" } }),
  ]);
  if (links.length !== selectedIds.length || papers.length !== selectedIds.length) throw AppError.conflict("Selected papers must still be Relevant in this project");
  return selectedIds.map(id => { const link = links.find(row => row.paperId === id)!; return { id, projectPaperId: link.id, updatedAt: link.updatedAt.toISOString(), fingerprint: sourceFingerprint(papers.find(paper => paper.id === id)!) }; });
}
export async function assertDiscoverySources(context: WorkspaceContext, input: DiscoveryInput, result?: ProjectGapDiscoveryResult) {
  if (result?.papers.length) {
    await context.tx.$queryRaw`SELECT id FROM papers WHERE id = ANY(${input.sources.map(source => source.id)}::uuid[]) ORDER BY id FOR SHARE`;
    await context.tx.$queryRaw`SELECT id FROM paper_documents WHERE paper_id = ANY(${input.sources.map(source => source.id)}::uuid[]) ORDER BY id FOR SHARE`;
  }
  const current = await discoverySources(context, input.sources.map(source => source.id));
  if (!isDeepStrictEqual(current, input.sources)) throw AppError.conflict("Selected sources changed during analysis. Review Relevant papers and try again");
  if (result?.papers.length) {
    const documents = await context.tx.paperDocument.findMany({ where: { paperId: { in: result.papers.map(paper => paper.id) } } });
    if (result.papers.some(paper => !documents.some(doc => doc.paperId === paper.id && doc.status === "ready" && doc.contentHash === paper.contentHash && doc.sourceHash === current.find(source => source.id === paper.id)?.fingerprint))) throw AppError.conflict("An indexed source changed during analysis. Run the analysis again");
  }
}
export async function discoveryProgress(projectId: string, actorId: string, analysisId: string, input: DiscoveryInput, result: ProjectGapDiscoveryResult) {
  await withWorkspace(projectId, actorId, { write: true }, async context => {
    await assertDiscoverySources(context, input, result);
    const latest = await context.tx.projectWorkspaceRevision.findFirst({ where: { projectId, entityKind: "GAP_ANALYSIS_INPUT", entityId: analysisId }, orderBy: { version: "desc" } });
    await context.tx.projectWorkspaceRevision.create({ data: { projectId, actorId, entityKind: "GAP_ANALYSIS_INPUT", entityId: analysisId, version: (latest?.version ?? 0) + 1, snapshot: jsonSnapshot({ ...input, result }) } });
    await context.tx.gapAnalysis.update({ where: { id: analysisId }, data: { updatedAt: new Date() } });
  });
}

/** Runs inside the existing gaps worker and its per-user AI context. No private attachments are indexed. */
export async function prepareDiscovery(projectId: string, actorId: string, analysisId: string, topic: string, input: DiscoveryInput) {
  const result: ProjectGapDiscoveryResult = { stage: "extracting", completed: 0, total: input.sources.length, papers: [] };
  await discoveryProgress(projectId, actorId, analysisId, input, result);
  for (const source of input.sources) {
    await withWorkspace(projectId, actorId, { write: true }, context => assertDiscoverySources(context, input));
    const before = await getPrisma().paper.findUniqueOrThrow({ where: { id: source.id } });
    // Older indexes without research-question extraction can be refreshed on this explicit user action.
    await indexPaper(source.id, !Array.isArray((before.aiAnalysis as { researchQuestions?: unknown } | null)?.researchQuestions));
    const [paper, knowledge] = await Promise.all([getPrisma().paper.findUniqueOrThrow({ where: { id: source.id } }), knowledgeService.get(source.id)]);
    if (knowledge.status !== "ready" || !paper.aiAnalysis) throw AppError.conflict("A selected paper could not be analyzed. Retry when its source is available");
    const doc = await getPrisma().paperDocument.findUniqueOrThrow({ where: { paperId: paper.id } });
    const relations = knowledge.edges.slice(0, 24).map(edge => ({ kind: edge.kind, quote: edge.quote, chunkId: edge.chunkId, pageNumber: edge.pageNumber }));
    const chunkIds = [...new Set([...relations.map(edge => edge.chunkId), ...knowledge.passages.map(passage => passage.id)])].slice(0, 8);
    const chunks = await getPrisma().paperChunk.findMany({ where: { id: { in: chunkIds }, documentId: doc.id }, orderBy: { position: "asc" }, select: { id: true, pageNumber: true, text: true } });
    const item: DiscoveryPaperResult = { id: paper.id, title: paper.title, analysis: paper.aiAnalysis as unknown as DiscoveryPaperResult["analysis"], sourceKind: knowledge.sourceKind ?? "abstract",
      contentHash: doc.contentHash ?? "", warnings: knowledge.warnings, relations: relations.filter(edge => chunks.some(chunk => chunk.id === edge.chunkId && chunk.text.includes(edge.quote))), passages: chunks.map(passage => ({ ...passage, text: passage.text.slice(0, 5000) })) };
    result.papers.push(item); result.completed++;
    if (JSON.stringify(result.papers).length > 180000) throw AppError.badRequest("The analysis pack is too large. Select fewer papers");
    await discoveryProgress(projectId, actorId, analysisId, input, result);
  }
  result.stage = "synthesizing";
  await discoveryProgress(projectId, actorId, analysisId, input, result);
  result.synthesis = await cachedGenerateJSON<SynthesisContent>({ task: "extract", promptVersion: DISCOVERY_SYNTHESIS_VERSION, model: aiModel(),
    keyParts: { papers: result.papers.map(paper => [paper.id, paper.contentHash]) },
    prompt: JSON.stringify({ topic, projectContext: input.projectContext, papers: result.papers.map((paper, index) => ({ number: index + 1, ...paper })) }),
    options: { system: DISCOVERY_SYNTHESIS_SYSTEM, temperature: 0, maxOutputTokens: 4096 },
    validate: raw => parseDiscoverySynthesis(raw, result.papers.length) });
  result.stage = "generating";
  await discoveryProgress(projectId, actorId, analysisId, input, result);
  return result;
}

export async function publishDiscoveryEvidence(tx: WorkspaceDb, projectId: string, actorId: string, gapId: string, analysisId: string, result: ProjectGapDiscoveryResult, input: DiscoveryInput, supportingIds: string[], anchors?: DiscoveryCandidate["sourceAnchors"]) {
  for (const paper of result.papers.filter(paper => supportingIds.includes(paper.id))) {
    const anchor = anchors?.find(item => item.paperNumber === result.papers.indexOf(paper) + 1);
    const relation = paper.relations?.find(edge => ["HAS_LIMITATION", "REPORTS_FINDING", "PROPOSES_FUTURE_WORK"].includes(edge.kind));
    const passage = paper.passages.find(passage => passage.id === (anchor?.chunkId ?? relation?.chunkId)) ?? paper.passages[0];
    const claim = paper.analysis.findings?.[0] || paper.analysis.limitations?.[0] || paper.analysis.summary || "AI interpretation requires source review";
    const source = input.sources.find(source => source.id === paper.id)!;
    const item = await tx.projectEvidenceItem.create({ data: { projectId, paperId: paper.id, extractedById: actorId, clientKey: randomUUID(), origin: "AI_SUGGESTED",
      claim: claim.slice(0, 5000), quotation: anchor?.quote ?? relation?.quote ?? passage?.text ?? "", locator: passage?.pageNumber ? `PDF p. ${passage.pageNumber}` : paper.sourceKind === "abstract" ? "Abstract" : "Indexed source passage",
      methodology: paper.analysis.methods?.slice(0, 5000) ?? "", population: paper.analysis.dataset?.slice(0, 5000) ?? "", results: paper.analysis.findings.join("\n").slice(0, 5000), limitations: paper.analysis.limitations.join("\n").slice(0, 5000),
      sourceSnapshot: jsonSnapshot({ analysisId, sourceFingerprint: source.fingerprint, title: paper.title, sourceKind: paper.sourceKind, contentHash: paper.contentHash, sourceText: passage?.text ?? "", chunkId: passage?.id, quoteCheckedAgainstIndexedSource: Boolean(passage), originalSuggestion: paper.analysis }) } });
    const revision = await tx.projectWorkspaceRevision.create({ data: { projectId, actorId, entityKind: "EXTRACTION", entityId: item.id, version: item.version, snapshot: jsonSnapshot(item) } });
    await tx.gapEvidenceRecord.create({ data: { gapId, paperId: paper.id, projectPaperId: source.projectPaperId, evidenceKind: "SUPPORTING", evidenceType: `EXTRACTION:${item.id}`, evidenceItemId: item.id, evidenceRevisionId: revision.id,
      excerpt: item.quotation || item.claim, sourceLocation: item.locator, explanation: "AI-suggested source relation. Check the source and interpretation before recording team support.", addedById: actorId } });
  }
}
