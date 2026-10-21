import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { gapsQueue } from "../../../infrastructure/queue.js";
import { cachedGenerateJSON } from "../../llm/llm.run.js";
import { gapsService } from "../../gaps/gaps.service.js";
import { projectEvidenceService as evidence } from "../project-evidence.service.js";
import { projectSynthesisService as synthesis } from "../project-synthesis.service.js";
import { projectGapResearchService as gaps } from "../project-gap-research.service.js";
import { projectPaperAnalysisService } from "../project-paper-analysis.service.js";
import { assertSynthesisCitations } from "../research-synthesis.js";
import { sourceFingerprint, RAG_INDEX_VERSION } from "../../knowledge/knowledge.text.js";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { projectResearchRouter } from "../project-research.routes.js";
import { requireVerifiedAuth } from "../../../common/middleware/auth.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";

vi.mock("../../../infrastructure/queue.js", () => ({ gapsQueue: { add: vi.fn().mockResolvedValue({}) }, paperAnalysisQueue: { add: vi.fn().mockResolvedValue({}) }, hasLiveJob: vi.fn().mockResolvedValue(false) }));
vi.mock("../../llm/llm.run.js", () => ({ cachedGenerateJSON: vi.fn() }));
vi.mock("../../embeddings/embedding.factory.js", () => ({ getEmbeddingProvider: () => ({ embed: vi.fn().mockRejectedValue(new Error("No network in tests")) }) }));

const isolated = process.env.NODE_ENV === "test" && process.env.DATABASE_URL?.includes("codex_mentorship_");
describe.skipIf(!isolated).sequential("reviewed project research flow (isolated PostgreSQL)", () => {
  const db = getPrisma(), users: string[] = [], projects: string[] = [], papers: string[] = [];
  let owner: string, member: string, outsider: string;
  const content = { claim: "The source reports mixed learning outcomes", quotation: "Mixed learning outcomes.", locator: "Abstract", methodology: "Interviews", population: "Students", context: "University", results: "Mixed outcomes", limitations: "One institution", themes: ["learning"] };
  const summary = { commonFindings: "Studies report mixed learning outcomes [1] [2] [3].", contradictions: "", openQuestions: "Does the finding transfer to other institutions? [1]" };
  async function pack() {
    const project = await createProjectFixture({ data: { title: `Learning ${crypto.randomUUID()}`, ownerId: owner } }); projects.push(project.id);
    await db.projectMember.create({ data: { projectId: project.id, userId: member, role: "MEMBER" } });
    const sources = [];
    for (let i = 0; i < 3; i++) {
      const paper = await db.paper.create({ data: { title: `Learning study ${i}`, abstractText: "Mixed learning outcomes.", publicationYear: 2024, primaryProvider: "user", dataStatus: "active", ...(i === 0 ? { legacyMongoId: crypto.randomUUID().replaceAll("-", "").slice(0, 24) } : {}) } }); papers.push(paper.id);
      await db.projectPaper.create({ data: { projectId: project.id, paperId: paper.id, addedById: owner, screeningStatus: "INCLUDED" } });
      const item = await evidence.create(project.id, member, { ...content, paperId: paper.id, origin: "HUMAN", clientKey: crypto.randomUUID() });
      sources.push(await evidence.review(project.id, owner, item.id, { state: "ACCEPTED", expectedVersion: item.version, rationale: "Checked the source and interpretation" }));
    }
    return { project, sources, selection: sources.map(item => ({ id: item.id, version: item.version })) };
  }
  async function approved() {
    const result = await pack();
    const draft = await synthesis.save(result.project.id, member, { ...summary, evidence: result.selection, expectedVersion: 0 });
    const accepted = await synthesis.accept(result.project.id, owner, { expectedVersion: draft.version, rationale: "Compared the studies and their limitations" });
    return { ...result, accepted };
  }
  beforeAll(async () => {
    for (const name of ["owner", "member", "outsider"]) {
      const user = await db.user.create({ data: { email: `${crypto.randomUUID()}@research.invalid`, fullName: name, emailVerifiedAt: new Date(), credits: 500 } }); users.push(user.id);
    }
    [owner, member, outsider] = users as [string, string, string];
    vi.mocked(cachedGenerateJSON).mockImplementation(async input => input.validate!(summary) as never);
  });
  afterAll(async () => {
    await db.gapEvidenceRecord.deleteMany({ where: { addedById: { in: users } } });
    await db.researchGap.deleteMany({ where: { projectId: { in: projects } } });
    await db.gapAnalysis.deleteMany({ where: { projectId: { in: projects } } });
    await db.project.deleteMany({ where: { id: { in: projects } } });
    await db.paper.deleteMany({ where: { id: { in: papers } } });
    await db.creditTransaction.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  it("requires real, in-range source citations and allows empty optional sections", () => {
    expect(() => assertSynthesisCitations(summary, 3)).not.toThrow();
    expect(() => assertSynthesisCitations({ ...summary, contradictions: "Uncited contradiction" }, 3)).toThrow();
    expect(() => assertSynthesisCitations({ ...summary, commonFindings: "Invented [4]" }, 3)).toThrow();
  });
  it("pins accepted revisions, requires human acceptance and rejects concurrent saves", async () => {
    const { project, selection } = await pack();
    const saved = await synthesis.save(project.id, member, { ...summary, evidence: selection, expectedVersion: 0 });
    expect(saved.status).toBe("DRAFT"); expect(saved.sources).toHaveLength(3); expect(saved.stale).toBe(false);
    expect(saved.sources.every(source => source.revisionId && source.version === 2)).toBe(true);
    const results = await Promise.allSettled([owner, member].map(actor => synthesis.save(project.id, actor, { ...summary, evidence: selection, expectedVersion: saved.version })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await synthesis.accept(project.id, owner, { expectedVersion: 2, rationale: "All sources checked" })).status).toBe("ACCEPTED");
  });
  it("denies outsiders and refuses unaccepted or cross-project extractions", async () => {
    const first = await pack(), second = await pack();
    await expect(synthesis.get(first.project.id, outsider)).rejects.toMatchObject({ statusCode: 404 });
    await expect(projectPaperAnalysisService.get(first.project.id, outsider, first.sources[0]!.paperId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(synthesis.save(first.project.id, member, { ...summary, expectedVersion: 0, evidence: second.selection })).rejects.toMatchObject({ statusCode: 409 });
    await evidence.review(first.project.id, owner, first.sources[0]!.id, { expectedVersion: 2, state: "REJECTED", rationale: "Interpretation not supported" });
    await expect(synthesis.save(first.project.id, member, { ...summary, expectedVersion: 0, evidence: first.selection })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("invalidates a synthesis when evidence changes and blocks analysis before billing", async () => {
    const { project, sources, accepted } = await approved();
    await evidence.update(project.id, member, sources[0]!.id, { ...content, claim: "Changed interpretation", expectedVersion: 2 });
    expect((await synthesis.get(project.id, owner))?.stale).toBe(true);
    const before = (await db.user.findUniqueOrThrow({ where: { id: owner } })).credits;
    await expect(gapsService.enqueue(owner, { topic: "Learning outcomes", projectId: project.id, evidenceMode: "selected", selectedPaperIds: sources.map(source => source.paperId), synthesisRevisionId: accepted.revisionId })).rejects.toMatchObject({ statusCode: 409 });
    expect((await db.user.findUniqueOrThrow({ where: { id: owner } })).credits).toBe(before);
  });
  it("refuses missing synthesis and mismatched papers even if called without HTTP validation", async () => {
    const { project, sources, accepted } = await approved();
    const input = { topic: "Learning outcomes", projectId: project.id, evidenceMode: "selected" as const, selectedPaperIds: sources.map(source => source.paperId) };
    await expect(gapsService.enqueue(owner, input)).rejects.toMatchObject({ statusCode: 400 });
    await expect(gapsService.enqueue(owner, { ...input, synthesisRevisionId: accepted.revisionId, selectedPaperIds: input.selectedPaperIds.slice(0, 2) })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("completes AI synthesis → human review → gap → team assessment → research question", async () => {
    const { project, selection, sources } = await pack();
    const before = (await db.user.findUniqueOrThrow({ where: { id: owner } })).credits;
    const queued = await synthesis.generate(project.id, owner, { expectedVersion: 0, evidence: selection });
    expect((await db.user.findUniqueOrThrow({ where: { id: owner } })).credits).toBe(before - 20);
    await synthesis.run({ projectId: project.id, userId: owner, version: queued.version });
    const draft = (await synthesis.get(project.id, member))!; expect(draft.status).toBe("DRAFT");
    const accepted = await synthesis.accept(project.id, member, { expectedVersion: draft.version, rationale: "Compared the synthesis against all cited extractions" });
    vi.mocked(cachedGenerateJSON).mockImplementationOnce(async input => input.validate!({ gaps: [{ title: "Cross-institution learning outcomes", description: "Replication across institutions is needed", rationale: "The reviewed studies describe one institution", supportingEvidence: [1, 2, 3], confidence: 0, assumptions: "Search for contrary studies" }] }) as never);
    const id = await gapsService.enqueue(owner, { topic: "Learning outcomes", projectId: project.id, synthesisRevisionId: accepted.revisionId, evidenceMode: "selected", selectedPaperIds: sources.map(item => item.paperId) });
    await gapsService.runGapPipeline({ analysisId: id });
    expect((await db.gapAnalysis.findUniqueOrThrow({ where: { id } })).status).toBe("ready");
    const gap = await db.researchGap.findFirstOrThrow({ where: { analysisId: id } });
    expect(gap.assessmentStatus).toBe("PROPOSED");
    const links = await db.gapEvidenceRecord.findMany({ where: { gapId: gap.id } }); expect(links).toHaveLength(3);
    expect(links.every(link => accepted.sources.some(source => source.revisionId === link.evidenceRevisionId))).toBe(true);
    const assessed = await gaps.assess(project.id, member, gap.id, { expectedVersion: gap.version, status: "TEAM_SUPPORTED", rationale: "Evidence supports testing replication, not a global absence claim" });
    const plan = await db.researchPlan.findUniqueOrThrow({ where: { projectId: project.id } });
    await gaps.derive(project.id, owner, gap.id, { expectedVersion: assessed.version, expectedPlanVersion: plan.version, text: "Do these outcomes replicate across institutions?", clientKey: crypto.randomUUID() });
    const questions = await synthesis.questions(project.id, member); expect(questions).toHaveLength(1); expect(questions[0]).toMatchObject({ sourceGapId: gap.id, evidenceCount: 3, needsReview: false });
    await evidence.update(project.id, member, sources[0]!.id, { ...content, claim: "Revised evidence", expectedVersion: 2 });
    expect((await synthesis.questions(project.id, owner))[0]!.needsReview).toBe(true);
    expect((await db.researchPlan.findUniqueOrThrow({ where: { projectId: project.id } })).problem).toEqual(plan.problem);
  });
  it("never sends raw private files or papers outside the approved pack to synthesis", async () => {
    const { project, selection, sources } = await pack();
    await db.projectPaperFile.create({ data: { projectId: project.id, paperId: sources[0]!.paperId, uploadedById: owner, sha256: "f".repeat(64), content: Buffer.from("PRIVATE_ATTACHMENT_SENTINEL"), byteSize: 27 } });
    await db.paper.update({ where: { id: sources[0]!.paperId }, data: { abstractText: "UNREVIEWED_ABSTRACT_SENTINEL" } });
    const queued = await synthesis.generate(project.id, owner, { expectedVersion: 0, evidence: selection });
    await synthesis.run({ projectId: project.id, userId: owner, version: queued.version });
    const call = vi.mocked(cachedGenerateJSON).mock.calls.at(-1)![0];
    expect(call.prompt).toContain(content.claim); expect(call.prompt).not.toContain("PRIVATE_ATTACHMENT_SENTINEL"); expect(call.prompt).not.toContain("UNREVIEWED_ABSTRACT_SENTINEL");
  });
  it("refunds queued work exactly once after membership revocation", async () => {
    const { project, selection } = await pack();
    const before = (await db.user.findUniqueOrThrow({ where: { id: member } })).credits;
    const queued = await synthesis.generate(project.id, member, { expectedVersion: 0, evidence: selection });
    await db.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: member } }, data: { status: "REMOVED" } });
    const job = { projectId: project.id, userId: member, version: queued.version };
    await expect(synthesis.run(job)).rejects.toMatchObject({ statusCode: 404 });
    await synthesis.fail(job); await synthesis.fail(job);
    expect((await db.user.findUniqueOrThrow({ where: { id: member } })).credits).toBe(before);
    expect((await synthesis.get(project.id, owner))?.status).toBe("FAILED");
  });
  it("refunds a queue failure and allows a new attempt", async () => {
    const { project, selection } = await pack();
    const before = (await db.user.findUniqueOrThrow({ where: { id: owner } })).credits;
    vi.mocked(gapsQueue.add).mockRejectedValueOnce(new Error("Queue unavailable"));
    await expect(synthesis.generate(project.id, owner, { expectedVersion: 0, evidence: selection })).rejects.toThrow("Queue unavailable");
    expect((await db.user.findUniqueOrThrow({ where: { id: owner } })).credits).toBe(before);
    const failed = (await synthesis.get(project.id, owner))!; expect(failed.status).toBe("FAILED");
    expect((await synthesis.generate(project.id, owner, { expectedVersion: failed.version, evidence: selection })).version).toBe(failed.version + 1);
    await synthesis.fail({ projectId: project.id, userId: owner, version: failed.version + 1 });
  });
  it("copies a current paper-analysis suggestion as pending and refuses stale provenance", async () => {
    const { project, sources } = await pack(), paperId = sources[0]!.paperId;
    const paper = await db.paper.update({ where: { id: paperId }, data: { aiAnalysis: { findings: ["AI finding"], methods: "Interviews", dataset: "Students", limitations: ["Small sample"], keyTerms: [] } } });
    await db.paperDocument.create({ data: { paperId, sourceHash: sourceFingerprint(paper), indexVersion: RAG_INDEX_VERSION, status: "ready" } });
    const suggestion = (await evidence.suggestions(project.id, member, paperId)).find(item => item.analysisHash)!;
    expect(suggestion.content.claim).toBe("AI finding");
    const created = await evidence.create(project.id, member, { ...suggestion.content, paperId, origin: "AI_SUGGESTED", analysisHash: suggestion.analysisHash, clientKey: crypto.randomUUID() });
    expect(created.reviewState).toBe("PENDING"); expect(created.origin).toBe("AI_SUGGESTED");
    await db.paper.update({ where: { id: paperId }, data: { aiAnalysis: { findings: ["New AI finding"] } } });
    await expect(evidence.create(project.id, member, { ...suggestion.content, paperId, origin: "AI_SUGGESTED", analysisHash: suggestion.analysisHash, clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("refuses publication after a source changes during AI synthesis and refunds the failure", async () => {
    const { project, selection, sources } = await pack();
    const before = (await db.user.findUniqueOrThrow({ where: { id: owner } })).credits;
    const queued = await synthesis.generate(project.id, owner, { expectedVersion: 0, evidence: selection });
    vi.mocked(cachedGenerateJSON).mockImplementationOnce(async input => {
      await db.projectPaper.update({ where: { projectId_paperId: { projectId: project.id, paperId: sources[0]!.paperId } }, data: { screeningStatus: "EXCLUDED" } });
      return input.validate!(summary) as never;
    });
    const job = { projectId: project.id, userId: owner, version: queued.version };
    await expect(synthesis.run(job)).rejects.toMatchObject({ statusCode: 409 }); await synthesis.fail(job);
    expect((await synthesis.get(project.id, owner))?.status).toBe("FAILED");
    expect((await db.user.findUniqueOrThrow({ where: { id: owner } })).credits).toBe(before);
  });
  it("requires the same accepted synthesis at gap publication, not only at enqueue", async () => {
    const { project, selection, sources, accepted } = await approved();
    const id = await gapsService.enqueue(owner, { topic: "Learning outcomes", projectId: project.id, synthesisRevisionId: accepted.revisionId, evidenceMode: "selected", selectedPaperIds: sources.map(item => item.paperId) });
    vi.mocked(cachedGenerateJSON).mockImplementationOnce(async input => {
      await synthesis.save(project.id, member, { ...summary, commonFindings: "Revised synthesis [1]", evidence: selection, expectedVersion: accepted.version });
      return input.validate!({ gaps: [{ title: "Potential gap", description: "Replication could help", rationale: "Single institution", supportingEvidence: [1, 2, 3], confidence: 0 }] }) as never;
    });
    await expect(gapsService.runGapPipeline({ analysisId: id })).rejects.toMatchObject({ statusCode: 409 });
    await gapsService.markAnalysisFailed(id, "Research context changed");
    expect(await db.researchGap.count({ where: { analysisId: id } })).toBe(0);
  });
  it("denies archived writes before charging credits", async () => {
    const { project, selection } = await pack();
    await db.project.update({ where: { id: project.id }, data: { status: "ARCHIVED" } });
    const before = await db.creditTransaction.count({ where: { userId: owner } });
    await expect(synthesis.generate(project.id, owner, { expectedVersion: 0, evidence: selection })).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.creditTransaction.count({ where: { userId: owner } })).toBe(before);
  });
  it("enforces signed sessions, validation and project boundaries over HTTP", async () => {
    const { project, selection } = await pack();
    const app = express(); app.use(express.json()); app.use("/projects/:id/research", requireVerifiedAuth, projectResearchRouter); app.use(errorHandler);
    const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No server address");
    const familyId = crypto.randomUUID();
    await db.refreshToken.create({ data: { userId: member, familyId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 60000) } });
    const token = tokenService.signAccessToken({ sub: member, systemRole: "USER", sessionId: familyId }).token;
    const url = `http://127.0.0.1:${address.port}/projects/${project.id}/research/synthesis`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    try {
      expect((await fetch(url)).status).toBe(401);
      expect((await fetch(url, { method: "PUT", headers, body: JSON.stringify({ ...summary, expectedVersion: 0, evidence: [] }) })).status).toBe(400);
      const saved = await fetch(url, { method: "PUT", headers, body: JSON.stringify({ ...summary, expectedVersion: 0, evidence: selection }) }); expect(saved.status).toBe(200);
      expect((await saved.json()).data.status).toBe("DRAFT");
      await db.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: member } }, data: { status: "REMOVED" } });
      expect((await fetch(url, { headers })).status).toBe(404);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});
