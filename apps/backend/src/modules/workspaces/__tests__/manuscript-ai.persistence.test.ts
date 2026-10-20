import { beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { ManuscriptAiInput } from "@trend/shared-types";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { manuscriptService } from "../manuscript.service.js";
import { manuscriptAiService as ai } from "../manuscript-ai.service.js";
import { sourceText, sourceDocument } from "../manuscript-source.js";
import { processCompilation } from "../manuscript-compiler.js";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), enqueue: vi.fn().mockResolvedValue({}) }));
vi.mock("../../../infrastructure/queue.js", () => ({ aiJobsQueue: { add: mocks.enqueue }, notificationQueue: { add: vi.fn() }, manuscriptCompileQueue: { add: vi.fn().mockResolvedValue({}) } }));
vi.mock("../../llm/llm.run.js", () => ({ cachedGenerateJSON: mocks.generate }));
const isolated = process.env.NODE_ENV === "test" && process.env.MANUSCRIPT_COMPILER_INTEGRATION === "1" && /^postgres(?:ql)?:\/\/[^/]+@(127\.0\.0\.1|localhost):[0-9]+\/codex_mentorship_[a-f0-9]{12}_test(?:\?|$)/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!isolated).sequential("manuscript writing in disposable PostgreSQL", () => {
  const db = getPrisma(); let owner: string, member: string, outsider: string;
  async function actor() {
    const user = await db.user.create({ data: { fullName: "Writing fixture", email: `${crypto.randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), admissionBasis: "INVITATION" } });
    await db.academicProfile.create({ data: { userId: user.id, primaryPosition: "RESEARCH_STAFF", academicRole: "RESEARCHER", roleVerificationStatus: "SELF_DECLARED", positionStatus: "NOT_SUBMITTED" } }); return user.id;
  }
  beforeAll(async () => { owner = await actor(); member = await actor(); outsider = await actor(); });
  async function fixture() {
    const project = await createProjectFixture({ data: { title: "Private writing study", ownerId: owner, status: "ACTIVE", visibility: "PRIVATE" } });
    await db.projectMember.create({ data: { projectId: project.id, userId: member } });
    const draft = await manuscriptService.create(project.id, owner, { title: "Writing test", description: "", documentType: "RESEARCH_PAPER", template: "ARTICLE", clientKey: crypto.randomUUID() });
    const detail = await manuscriptService.detail(project.id, owner, draft.id), file = detail.mainFileId!;
    const content = await manuscriptService.fileContent(project.id, owner, draft.id, file), text = sourceText(Buffer.from(content.state!, "base64"));
    const from = text.indexOf("Writing test"), to = from + "Writing test".length;
    const input: ManuscriptAiInput = { fileId: file, from, to, original: text.slice(from, to), action: "improve", instruction: "Make it clearer", language: "English" };
    mocks.generate.mockImplementation(async (args: { validate: (value: unknown) => unknown }) => args.validate({ text: "Improved academic passage.", explanation: "Preserved meaning.", citations: [] }));
    return { p: project.id, id: draft.id, file, input, text };
  }
  async function appendCollaborativeEdit(d: Awaited<ReturnType<typeof fixture>>) {
    const content = await manuscriptService.fileContent(d.p, owner, d.id, d.file), doc = sourceDocument(Buffer.from(content.state!, "base64"));
    try {
      const vector = Y.encodeStateVector(doc), text = doc.getText("source"); text.insert(text.length, "\n% Collaborator changed context\n");
      await manuscriptService.applyUpdate(d.p, owner, d.id, d.file, { clientSessionId: crypto.randomUUID(), clientSequence: 1, update: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString("base64") });
    } finally { doc.destroy(); }
  }
  it("pins source sequence and refuses stale queued work before calling the model", async () => {
    const d = await fixture(), run = await ai.create(d.p, owner, d.id, d.input);
    expect(run.input.sourceSequence).toBeTypeOf("number");
    await appendCollaborativeEdit(d); mocks.generate.mockClear(); await ai.process(run.id);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect((await ai.get(d.p, owner, d.id, run.id)).status).toBe("failed");
    await expect(ai.create(d.p, owner, d.id, { ...d.input, sourceSequence: run.input.sourceSequence })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("discards a proposal if a collaborator edits the file during model generation", async () => {
    const d = await fixture(), run = await ai.create(d.p, owner, d.id, d.input);
    mocks.generate.mockImplementation(async (args: { validate: (value: unknown) => unknown }) => {
      await appendCollaborativeEdit(d);
      return args.validate({ text: "Improved academic passage.", explanation: "Style only", citations: [] });
    });
    await ai.process(run.id);
    expect(await ai.get(d.p, owner, d.id, run.id)).toMatchObject({ status: "failed", result: null });
  });
  it("regenerates an owned completed proposal with a fresh cache key and unchanged scope", async () => {
    const d = await fixture(), initial = await ai.create(d.p, owner, d.id, d.input); await ai.process(initial.id);
    const run = await ai.create(d.p, owner, d.id, { ...initial.input, regenerateOf: initial.id }); await ai.process(run.id);
    expect((await ai.get(d.p, owner, d.id, run.id)).status).toBe("completed");
    expect(mocks.generate.mock.calls.at(-1)![0].keyParts).toMatchObject({ regeneration: run.id });
    const payload = JSON.parse(mocks.generate.mock.calls.at(-1)![0].prompt);
    expect(payload).toMatchObject({ selection: d.input.original, operation: { mode: "replace" }, sourceSequence: initial.input.sourceSequence });
    expect(payload.before).toBe(d.text.slice(Math.max(0, d.input.from - 4000), d.input.from));
    expect(payload.after).toBe(d.text.slice(d.input.to, d.input.to + 4000));
    await expect(ai.create(d.p, member, d.id, { ...initial.input, regenerateOf: initial.id })).rejects.toMatchObject({ statusCode: 404 });
    await expect(ai.create(d.p, owner, d.id, { ...initial.input, action: "grammar", regenerateOf: initial.id })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("queues, uses real project context and persists a proposal without modifying source", async () => {
    const d = await fixture();
    const paper = await db.paper.create({ data: { primaryProvider: "user", dataStatus: "active", title: "Included real source", abstractText: "Evidence from this project only", publicationYear: 2024 } });
    const excluded = await db.paper.create({ data: { primaryProvider: "user", title: "Excluded source", publicationYear: 2023 } });
    await db.projectPaper.createMany({ data: [{ projectId: d.p, paperId: paper.id, addedById: owner, screeningStatus: "INCLUDED" }, { projectId: d.p, paperId: excluded.id, addedById: owner, screeningStatus: "EXCLUDED" }] });
    await db.projectEvidenceItem.create({ data: { projectId: d.p, paperId: paper.id, claim: "Reviewed claim", quotation: "Evidence from this project only", locator: "Abstract", origin: "HUMAN", reviewState: "ACCEPTED", reviewRationale: "Compared the claim with the source abstract", extractedById: owner, reviewedById: owner, reviewedAt: new Date(), clientKey: crypto.randomUUID() } });
    const run = await ai.create(d.p, owner, d.id, d.input);
    expect(run.status).toBe("queued"); expect(mocks.enqueue).toHaveBeenCalledWith("manuscript_writing", { runId: run.id }, expect.anything());
    await ai.process(run.id);
    const completed = await ai.get(d.p, owner, d.id, run.id);
    expect(completed.status).toBe("completed"); expect(completed.result?.text).toContain("Improved");
    const payload = JSON.parse(mocks.generate.mock.calls.at(-1)![0].prompt);
    expect(payload.sources.map((s: { id: string }) => s.id)).toEqual([paper.id]);
    expect(payload.sources[0].abstract).toContain("this project only");
    expect(payload.sources[0].evidenceStatus).toBe("REVIEWED_EVIDENCE");
    expect(payload.verifiedEvidence[0].locator).toBe("Abstract");
    const source = await manuscriptService.fileContent(d.p, owner, d.id, d.file);
    expect(sourceText(Buffer.from(source.state!, "base64"))).toBe(d.text);
    await expect(ai.get(d.p, member, d.id, run.id)).rejects.toMatchObject({ statusCode: 404 });
    mocks.generate.mockImplementation(async (args: { validate: (value: unknown) => unknown }) => args.validate({ text: "", explanation: "Possible support; verify the claim", citations: [{ paperId: paper.id, reason: "Matches the project research topic", supportQuote: "Evidence from this project only" }] }));
    const citationRun = await ai.create(d.p, owner, d.id, { ...d.input, action: "citations" }); await ai.process(citationRun.id);
    const suggestion = (await ai.get(d.p, owner, d.id, citationRun.id)).result!.citations[0]!;
    const inserted = await manuscriptService.insertCitation(d.p, owner, d.id, suggestion.id);
    expect(inserted.key).toBe(suggestion.citationKey);
    expect((await manuscriptService.insertCitation(d.p, owner, d.id, suggestion.id)).key).toBe(inserted.key);
    const bibliography = await manuscriptService.fileContent(d.p, owner, d.id, inserted.fileId);
    expect(sourceText(Buffer.from(bibliography.state!, "base64"))).toContain(`% lumigap-paper:${paper.id}`);
  });
  it("denies outsiders, stale selections and files in another manuscript", async () => {
    const d = await fixture(), other = await fixture();
    await expect(ai.create(d.p, outsider, d.id, d.input)).rejects.toMatchObject({ statusCode: 404 });
    await expect(ai.create(d.p, owner, d.id, { ...d.input, original: "x".repeat(d.input.original.length) })).rejects.toMatchObject({ statusCode: 409 });
    await expect(ai.create(d.p, owner, d.id, { ...d.input, fileId: other.file })).rejects.toMatchObject({ statusCode: 404 });
  });
  it("preserves keys at the end of a bibliography outside the source-context file budget", async () => {
    const d = await fixture();
    for (let index = 0; index < 17; index++) await manuscriptService.createFile(d.p, owner, d.id, { path: `a-${String(index).padStart(2, "0")}.tex`, kind: "TEXT", content: "Context", clientKey: crypto.randomUUID() });
    await manuscriptService.createFile(d.p, owner, d.id, { path: "zz-extra.bib", kind: "TEXT", content: "% Bibliography padding\n".repeat(150) + "@article{LateManualKey, title={Real manual reference}}", clientKey: crypto.randomUUID() });
    mocks.generate.mockImplementation(async (args: { prompt: string; validate: (value: unknown) => unknown }) => {
      const payload = JSON.parse(args.prompt);
      expect(payload.files).toHaveLength(16);
      expect(payload.files.some((file: { path: string }) => file.path === "zz-extra.bib")).toBe(false);
      expect(payload.allowedCitationKeys).toContain("LateManualKey");
      return args.validate({ text: "Preserved \\cite [p. 2] {LateManualKey}.", explanation: "Retains an existing source", citations: [] });
    });
    const run = await ai.create(d.p, owner, d.id, d.input); await ai.process(run.id);
    expect((await ai.get(d.p, owner, d.id, run.id)).status).toBe("completed");
  });
  it("rejects a source excluded while generating, and rechecks eligibility when inserting an AI citation", async () => {
    const d = await fixture();
    const paper = await db.paper.create({ data: { primaryProvider: "user", dataStatus: "active", title: "Current source", abstractText: "This source discusses collaboration in academic writing.", publicationYear: 2025 } });
    await db.projectPaper.create({ data: { projectId: d.p, paperId: paper.id, addedById: owner, screeningStatus: "INCLUDED" } });
    mocks.generate.mockImplementation(async (args: { validate: (value: unknown) => unknown }) => {
      const result = args.validate({ text: "", explanation: "Potential source support", citations: [{ paperId: paper.id, reason: "Discussion of collaboration", supportQuote: "This source discusses collaboration in academic writing." }] });
      await db.projectPaper.update({ where: { projectId_paperId: { projectId: d.p, paperId: paper.id } }, data: { screeningStatus: "EXCLUDED" } });
      return result;
    });
    const run = await ai.create(d.p, owner, d.id, { ...d.input, action: "citations" }); await ai.process(run.id);
    expect(await ai.get(d.p, owner, d.id, run.id)).toMatchObject({ status: "failed", result: null });
    await expect(manuscriptService.insertCitation(d.p, owner, d.id, paper.id, true)).rejects.toMatchObject({ statusCode: 404 });
    const detail = await manuscriptService.detail(d.p, owner, d.id), bib = detail.files.find(file => file.path === "references.bib")!;
    expect(sourceText(Buffer.from((await manuscriptService.fileContent(d.p, owner, d.id, bib.id)).state!, "base64"))).not.toContain(paper.id);
  });
  it("does not publish results cancelled while the provider is running", async () => {
    const d = await fixture(), run = await ai.create(d.p, owner, d.id, d.input);
    mocks.generate.mockImplementation(async () => {
      await ai.cancel(d.p, owner, d.id, run.id);
      return { text: "Cancelled proposal", explanation: "", citations: [] };
    });
    await ai.process(run.id);
    expect(await ai.get(d.p, owner, d.id, run.id)).toMatchObject({ status: "cancelled", result: null });
  });
  it("does not publish results after membership is revoked during generation", async () => {
    const d = await fixture(), run = await ai.create(d.p, member, d.id, d.input);
    mocks.generate.mockImplementation(async () => {
      await db.projectMember.delete({ where: { projectId_userId: { projectId: d.p, userId: member } } });
      return { text: "Private proposal", explanation: "", citations: [] };
    });
    await ai.process(run.id);
    expect(await db.aiRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: "failed", resultSummary: null });
  });
  it("rechecks membership in the worker and when polling", async () => {
    const d = await fixture(), run = await ai.create(d.p, member, d.id, d.input);
    await db.projectMember.delete({ where: { projectId_userId: { projectId: d.p, userId: member } } });
    mocks.generate.mockClear(); await ai.process(run.id);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect((await db.aiRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("failed");
    await expect(ai.get(d.p, member, d.id, run.id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("cancels pending work and fails invalid AI output without changing source", async () => {
    const d = await fixture(), cancelled = await ai.create(d.p, owner, d.id, d.input);
    await ai.cancel(d.p, owner, d.id, cancelled.id); await ai.process(cancelled.id);
    expect((await ai.get(d.p, owner, d.id, cancelled.id)).status).toBe("cancelled");
    mocks.generate.mockImplementation(async (args: { validate: (value: unknown) => unknown }) => args.validate({ text: "\\cite{Invented}", explanation: "", citations: [] }));
    const bad = await ai.create(d.p, owner, d.id, d.input); await ai.process(bad.id);
    expect((await ai.get(d.p, owner, d.id, bad.id)).status).toBe("failed");
    expect(sourceText(Buffer.from((await manuscriptService.fileContent(d.p, owner, d.id, d.file)).state!, "base64"))).toBe(d.text);
  });
  it("limits concurrent requests atomically across the user's projects", async () => {
    const d = await fixture();
    const attempts = await Promise.allSettled(Array.from({ length: 3 }, () => ai.create(d.p, owner, d.id, d.input)));
    const accepted = attempts.filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof ai.create>>> => item.status === "fulfilled");
    expect(accepted).toHaveLength(2);
    expect(attempts.find(item => item.status === "rejected")).toMatchObject({ reason: { statusCode: 409 } });
    await Promise.all(accepted.map(item => ai.cancel(d.p, owner, d.id, item.value.id)));
  });
  it("persists unchanged advice as no change, without an uncompiled-fix warning", async () => {
    const d = await fixture();
    mocks.generate.mockImplementation(async (args: { validate: (value: unknown) => unknown }) => args.validate({ text: d.input.original, explanation: "No source changes proposed.", citations: [] }));
    const run = await ai.create(d.p, owner, d.id, { ...d.input, action: "repair" }); await ai.process(run.id);
    expect((await ai.get(d.p, owner, d.id, run.id)).result).toMatchObject({ text: d.input.original, warnings: [], repair: { outcome: "NO_CHANGE" } });
  });
  it("diagnoses a real failed compilation, persists an accepted repair and compiles a real PDF", async () => {
    const d = await fixture();
    const broken = "\\documentclass{article}\n\\title{Research}\n\\begin{abstract}\nResearch summary.\n\\end{abstract}\n\\begin{document}\n\\maketitle\n\\bibliographystyle{plain}\n\\bibliography{references}\n\\end{document}";
    const fixed = "\\documentclass{article}\n\\title{Research}\n\\begin{document}\n\\maketitle\n\\begin{abstract}\nResearch summary.\n\\end{abstract}\n\\bibliographystyle{plain}\n\\bibliography{references}\n\\end{document}";
    const replace = async (replacement: string) => {
      const file = await manuscriptService.fileContent(d.p, owner, d.id, d.file), doc = sourceDocument(Buffer.from(file.state!, "base64"));
      try {
        const vector = Y.encodeStateVector(doc), text = doc.getText("source"); text.delete(0, text.length); text.insert(0, replacement);
        await manuscriptService.applyUpdate(d.p, owner, d.id, d.file, { clientSessionId: crypto.randomUUID(), clientSequence: 1, update: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString("base64") });
      } finally { doc.destroy(); }
    };
    const compile = async () => {
      const snapshot = await manuscriptService.snapshot(d.p, owner, d.id, { label: "AI repair test", clientKey: crypto.randomUUID(), minimumSequences: {} });
      const compilation = await manuscriptService.compile(d.p, owner, d.id, snapshot.id, "pdflatex");
      await processCompilation(compilation.id);
      return db.manuscriptCompilation.findUniqueOrThrow({ where: { id: compilation.id } });
    };
    await replace(broken);
    expect(await compile()).toMatchObject({ status: "FAILED", diagnostics: expect.stringContaining("Missing \\begin{document}") });
    mocks.generate.mockImplementation(async (args: { prompt: string; validate: (value: unknown) => unknown }) => {
      const payload = JSON.parse(args.prompt);
      expect(payload).toMatchObject({ action: "repair", targetFile: "main.tex", selection: broken, compilation: { status: "FAILED", engine: "pdflatex", stale: false, diagnostics: expect.stringContaining("Missing \\begin{document}") } });
      return args.validate({ text: fixed, explanation: "Move the abstract inside the document environment.", citations: [] });
    });
    const run = await ai.create(d.p, owner, d.id, { ...d.input, action: "repair", from: 0, to: broken.length, original: broken }); await ai.process(run.id);
    const proposal = await ai.get(d.p, owner, d.id, run.id);
    expect(proposal.status).toBe("completed");
    expect(sourceText(Buffer.from((await manuscriptService.fileContent(d.p, owner, d.id, d.file)).state!, "base64"))).toBe(broken);
    await replace(proposal.result!.text);
    const compiled = await compile(); expect(compiled.status, compiled.diagnostics).toBe("SUCCESS");
    expect(Buffer.from(compiled.pdfData!).subarray(0, 5).toString()).toBe("%PDF-");
    mocks.generate.mockClear();
    const check = await ai.create(d.p, owner, d.id, { ...d.input, action: "repair", from: 0, to: fixed.length, original: fixed }); await ai.process(check.id);
    const checked = await ai.get(d.p, owner, d.id, check.id);
    expect(checked.status).toBe("completed");
    expect(checked.result?.text).toBe("");
    expect(["COMPILED", "WARNINGS"]).toContain(checked.result?.repair?.outcome);
    expect(checked.result?.repair?.compilationId).toBe(compiled.id);
    expect(mocks.generate).not.toHaveBeenCalled();
    // The earlier failure must not be treated as an error in a later, uncompiled source revision.
    await replace(fixed + "\n% New saved revision\n");
    mocks.generate.mockImplementation(async (args: { prompt: string; validate: (value: unknown) => unknown }) => {
      expect(JSON.parse(args.prompt).compilation).toMatchObject({ status: "SUCCESS", stale: true, diagnostics: "" });
      return args.validate({ text: fixed, explanation: "No source changes proposed; compile the current revision to verify.", citations: [] });
    });
    const stale = await ai.create(d.p, owner, d.id, { ...d.input, action: "repair", from: 0, to: fixed.length, original: fixed }); await ai.process(stale.id);
    expect((await ai.get(d.p, owner, d.id, stale.id)).result?.repair?.outcome).toBe("NO_CHANGE");
  });
});
