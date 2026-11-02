import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { projectEvidenceService as evidence } from "../project-evidence.service.js";
import { projectEvidenceWorkspaceService as workspace } from "../project-evidence-workspace.service.js";
import { evidenceWorkspaceSchema, reviewEvidenceSchema } from "../dto/project-research.schema.js";
import { projectResearchRouter } from "../project-research.routes.js";
import { requireAuth } from "../../../common/middleware/auth.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { RAG_INDEX_VERSION, sourceFingerprint } from "../../knowledge/knowledge.text.js";

const isolated = process.env.NODE_ENV === "test" && process.env.SCREENING_INTEGRATION === "1" && /\/lumigap_evidence_workspace_test(?:\?|$)/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!isolated).sequential("research synthesis workspace on isolated PostgreSQL", () => {
  const db = getPrisma(); let owner: string, member: string, outsider: string;
  const content = { claim: "Reported benefit in a bounded population", methodology: "Interviews", limitations: "One site", results: "Mixed outcomes", quotation: "A source passage.", locator: "Abstract", context: "Higher education", population: "24 students", themes: ["learning"] };
  const query = (extra = {}) => evidenceWorkspaceSchema.parse(extra);
  async function fixture() {
    const project = await createProjectFixture({ data: { ownerId: owner, title: `Evidence ${crypto.randomUUID()}` } });
    await db.projectMember.create({ data: { projectId: project.id, userId: member } });
    const q1 = crypto.randomUUID(), q2 = crypto.randomUUID();
    await db.researchPlan.update({ where: { projectId: project.id }, data: { questions: [{ id: q1, text: "How do methods affect outcomes?" }, { id: q2, text: "Which limitations remain?" }] } });
    const papers = [];
    for (let index = 0; index < 2; index++) {
      const paper = await db.paper.create({ data: { title: `${index ? "Beta" : "Alpha"} study`, abstractText: "A source passage.", primaryProvider: "user", publicationYear: 2024 } });
      await db.projectPaper.create({ data: { projectId: project.id, paperId: paper.id, addedById: owner, screeningStatus: "INCLUDED", tags: ["education"] } }); papers.push(paper);
    }
    return { project, papers, q1, q2 };
  }
  async function create(f: Awaited<ReturnType<typeof fixture>>, extra = {}, paperId = f.papers[0]!.id) { return evidence.create(f.project.id, member, { ...content, paperId, clientKey: crypto.randomUUID(), origin: "HUMAN", ...extra }); }
  beforeAll(async () => {
    const users = [];
    for (const name of ["Owner", "Member", "Outsider"]) users.push(await db.user.create({ data: { email: `${crypto.randomUUID()}@evidence.invalid`, fullName: name, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } }));
    [owner, member, outsider] = users.map(user => user.id) as [string, string, string];
  });
  afterAll(async () => { await disconnectPostgres(); });
  it("groups repeated extraction records by paper before pagination, without deleting or merging findings", async () => {
    const f = await fixture();
    for (let index = 0; index < 4; index++) await create(f, { claim: `Distinct finding ${index}`, quotation: "A source passage." });
    const first = await workspace.get(f.project.id, owner, query({ pageSize: 1 }));
    expect(first.total).toBe(2); expect(first.items).toHaveLength(1); expect(first.items[0]?.extractionCount).toBe(4); expect(first.hasNext).toBe(true);
    const second = await workspace.get(f.project.id, owner, query({ page: 2, pageSize: 1 })); expect(second.items[0]?.paperId).not.toBe(first.items[0]?.paperId);
    expect(JSON.stringify(first)).not.toContain("A source passage.");
    const details = await evidence.list(f.project.id, owner, { page: 1, pageSize: 50, q: "", paperId: f.papers[0]!.id });
    expect(details.items).toHaveLength(4); expect(new Set(details.items.map(item => item.claim)).size).toBe(4);
  });
  it("links project RQs, filters across all records, and keeps the preview scoped to the selected RQ", async () => {
    const f = await fixture();
    await create(f, { questionIds: [f.q1], claim: "Finding specific to question one" });
    await create(f, { questionIds: [f.q2], claim: "Finding specific to question two" });
    const result = await workspace.get(f.project.id, owner, query({ questionId: f.q1 }));
    expect(result.items).toHaveLength(1); expect(result.items[0]?.entries[0]?.claim).toBe("Finding specific to question one");
    expect(result.items[0]?.questions.map(question => question.id)).toEqual([f.q1, f.q2]);
    await expect(create(f, { questionIds: [crypto.randomUUID()] })).rejects.toMatchObject({ statusCode: 400 });
  });
  it("searches titles, findings, limitations and quotations, and filters project topics and verification", async () => {
    const f = await fixture(); await create(f, { draft: true, limitations: "Limited generalization" });
    expect((await workspace.get(f.project.id, owner, query({ q: "generalization", theme: "education", status: "DRAFT" }))).items).toHaveLength(1);
    expect((await workspace.get(f.project.id, owner, query({ q: "Beta" }))).items[0]?.title).toBe("Beta study");
    expect((await workspace.get(f.project.id, owner, query({ theme: "missing" }))).items).toHaveLength(0);
  });
  it("keeps AI suggestions unverified until explicit source confirmation and resets review after edits", async () => {
    const f = await fixture();
    const corpus = await db.literatureCorpus.create({ data: { projectId: f.project.id, ownerId: owner, name: "Test corpus", topic: "Learning" } });
    const suggestion = await db.corpusPaper.create({ data: { corpusId: corpus.id, paperId: f.papers[0]!.id, included: true, addedById: owner, evidence: { findings: content.claim } } });
    const item = await create(f, { origin: "AI_SUGGESTED", corpusPaperId: suggestion.id, draft: true });
    expect(item.reviewState).toBe("PENDING");
    expect((await workspace.get(f.project.id, owner, query({ status: "VERIFIED" }))).items).toHaveLength(0);
    await expect(evidence.review(f.project.id, member, item.id, { state: "ACCEPTED", expectedVersion: 1, rationale: "Attempt without checking" })).rejects.toMatchObject({ statusCode: 400 });
    const accepted = await evidence.review(f.project.id, owner, item.id, { state: "ACCEPTED", expectedVersion: 1, rationale: "Compared with the source", sourceConfirmed: true });
    expect((await workspace.get(f.project.id, owner, query({ status: "VERIFIED" }))).items[0]?.verifiedCount).toBe(1);
    const revised = await evidence.update(f.project.id, member, item.id, { ...content, claim: "Corrected interpretation", expectedVersion: accepted.version, draft: false });
    expect(revised).toMatchObject({ reviewState: "PENDING", origin: "AI_SUGGESTED" }); expect((await evidence.history(f.project.id, owner, item.id)).length).toBe(3);
    expect((await workspace.get(f.project.id, owner, query({ status: "NEEDS_VERIFICATION" }))).items).toHaveLength(1);
  });
  it.each([
    ["NEEDS_RESOLUTION", "FULL_TEXT", false], ["EXCLUDED", "FULL_TEXT", false], ["INCLUDED", "TITLE_ABSTRACT", false], ["INCLUDED", "FULL_TEXT", true],
  ])("excludes %s / %s / legacy=%s despite a stale INCLUDED cache and preserves old extractions", async (status, phase, legacyNeedsAudit) => {
    const f = await fixture(), item = await create(f);
    await db.screeningRound.create({ data: { projectId: f.project.id, paperId: f.papers[0]!.id, number: 1, status, phase, legacyNeedsAudit, settings: { reviewMode: "INDEPENDENT", requiredReviewers: 2, stages: ["TITLE_ABSTRACT", "FULL_TEXT"] }, createdById: owner } });
    expect((await workspace.get(f.project.id, owner, query())).items.map(paper => paper.paperId)).not.toContain(f.papers[0]!.id);
    const archived = await workspace.get(f.project.id, owner, query({ eligibility: "ALL" }));
    expect(archived.items.find(paper => paper.paperId === f.papers[0]!.id)).toMatchObject({ eligible: false, entries: [expect.objectContaining({ id: item.id, verificationStatus: "REVISIT" })] });
    await expect(evidence.review(f.project.id, owner, item.id, { state: "ACCEPTED", sourceConfirmed: true, rationale: "Cannot bypass screening", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(create(f)).rejects.toMatchObject({ statusCode: 400 }); expect(await db.projectEvidenceItem.count({ where: { projectId: f.project.id } })).toBe(1);
  });
  it("allows completed full-text analysis, labels abstract-only extraction and does not gate screening on evidence", async () => {
    const f = await fixture();
    await db.screeningRound.create({ data: { projectId: f.project.id, paperId: f.papers[0]!.id, number: 1, status: "INCLUDED", phase: "FULL_TEXT", settings: { reviewMode: "INDEPENDENT", requiredReviewers: 2, stages: ["TITLE_ABSTRACT", "FULL_TEXT"] }, createdById: owner } });
    expect((await workspace.get(f.project.id, owner, query())).items[0]?.extractionCount).toBe(0);
    const row = await create(f, { sourceScope: "FULL_TEXT" });
    const details = await evidence.list(f.project.id, owner, { q: "", page: 1, pageSize: 20, itemId: row.id });
    expect(details.items[0]?.sourceScope).toBe("ABSTRACT"); // A matched abstract quote overrides a declared full-text scope.
    expect(details.items[0]?.extractedByName).toBe("Member");
  });
  it("marks changed sources for reconsideration and preserves accepted provenance and history", async () => {
    const f = await fixture(), item = await create(f);
    await evidence.review(f.project.id, owner, item.id, { state: "ACCEPTED", expectedVersion: item.version, sourceConfirmed: true, rationale: "Compared to original source" });
    await db.paper.update({ where: { id: f.papers[0]!.id }, data: { abstractText: "A revised abstract with a different finding." } });
    const result = await workspace.get(f.project.id, owner, query());
    expect(result.items.find(paper => paper.paperId === f.papers[0]!.id)).toMatchObject({ verifiedCount: 0, entries: [expect.objectContaining({ id: item.id, reviewState: "ACCEPTED", verificationStatus: "REVISIT" })] });
    await expect(evidence.review(f.project.id, owner, item.id, { state: "ACCEPTED", expectedVersion: 2, sourceConfirmed: true, rationale: "Cannot accept a stale source" })).rejects.toMatchObject({ statusCode: 409 });
    expect(await evidence.history(f.project.id, owner, item.id)).toHaveLength(2);
  });
  it("refuses stale indexed passages and invalidates their verification when the index changes", async () => {
    const f = await fixture(), paper = f.papers[0]!;
    const document = await db.paperDocument.create({ data: { paperId: paper.id, sourceHash: sourceFingerprint(paper), contentHash: "a".repeat(64), indexVersion: RAG_INDEX_VERSION, status: "ready" } });
    const chunk = await db.paperChunk.create({ data: { documentId: document.id, position: 0, text: content.quotation, contentHash: "b".repeat(64) } });
    const item = await create(f, { sourceChunkId: chunk.id });
    await evidence.review(f.project.id, owner, item.id, { state: "ACCEPTED", expectedVersion: 1, sourceConfirmed: true, rationale: "Compared indexed passage" });
    await db.paperDocument.update({ where: { id: document.id }, data: { sourceHash: "c".repeat(64) } });
    expect((await workspace.get(f.project.id, owner, query({ status: "VERIFIED" }))).items).toHaveLength(0);
    await expect(create(f, { sourceChunkId: chunk.id })).rejects.toMatchObject({ statusCode: 409 });
    expect(await evidence.history(f.project.id, owner, item.id)).toHaveLength(2);
  });
  it("protects project membership and validates HTTP filters and source-confirmation explicitly", async () => {
    const f = await fixture(); await create(f);
    await expect(workspace.get(f.project.id, outsider, query())).rejects.toMatchObject({ statusCode: 404 });
    const app = express(); app.use(express.json()); app.use("/projects/:id/research", requireAuth, projectResearchRouter); app.use(errorHandler);
    const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const sessionId = crypto.randomUUID(); await db.refreshToken.create({ data: { userId: member, familyId: sessionId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
    const token = tokenService.signAccessToken({ sub: member, sessionId, systemRole: "USER" }).token;
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/projects/${f.project.id}/research/evidence/workspace`;
    try {
      expect((await fetch(base)).status).toBe(401);
      const response = await fetch(`${base}?questionId=${f.q1}&status=DRAFT&eligibility=ALL`, { headers: { authorization: `Bearer ${token}` } }); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
      for (const suffix of ["status=ACCEPTED", "eligibility=INVALID", "unknown=true"]) expect((await fetch(`${base}?${suffix}`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(400);
      expect(reviewEvidenceSchema.safeParse({ expectedVersion: 1, state: "ACCEPTED", rationale: "No confirmation" }).success).toBe(false);
    } finally { server.close(); server.closeAllConnections(); }
  });
});
