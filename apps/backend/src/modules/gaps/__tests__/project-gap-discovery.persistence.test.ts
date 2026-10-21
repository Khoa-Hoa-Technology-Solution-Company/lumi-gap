import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { gapsQueue } from "../../../infrastructure/queue.js";
import { cachedGenerateJSON } from "../../llm/llm.run.js";
import { indexPaper } from "../../knowledge/knowledge.ingest.js";
import { digest, sourceFingerprint, RAG_INDEX_VERSION } from "../../knowledge/knowledge.text.js";
import { projectGapResearchService as research } from "../../projects/project-gap-research.service.js";
import { gapsService } from "../gaps.service.js";

vi.mock("../../../infrastructure/queue.js", () => ({ gapsQueue: { add: vi.fn() }, paperAnalysisQueue: { add: vi.fn() }, hasLiveJob: vi.fn() }));
vi.mock("../../llm/llm.run.js", () => ({ cachedGenerateJSON: vi.fn() }));
vi.mock("../../knowledge/knowledge.ingest.js", () => ({ indexPaper: vi.fn() }));
vi.mock("../../embeddings/embedding.factory.js", () => ({ getEmbeddingProvider: () => { throw new Error("No external services in persistence tests"); } }));

const isolated = process.env.NODE_ENV === "test" && process.env.DATABASE_URL?.includes("codex_mentorship_");
describe.skipIf(!isolated).sequential("project discovery using existing gap queue (isolated PostgreSQL)", () => {
  const db = getPrisma(), users: string[] = [], projects: string[] = [], papers: string[] = [];
  let owner: string, member: string, outsider: string;
  const analysis = { researchQuestions: ["Does learning transfer?"], summary: "Mixed learning outcomes", methods: "Survey", dataset: "One institution", findings: ["The study reports mixed learning outcomes."], limitations: ["Single institution."], futureWork: ["Test replication."], contributions: [], keyTerms: ["learning"], extractedBy: "llm", analysisPromptVersion: "test", extractedAt: "2026-10-19T00:00:00.000Z" };
  const synthesis = { commonFindings: "Mixed learning outcomes [1] [2].", contradictions: "", openQuestions: "Does this replicate? [1] [2]" };
  const gaps = { gaps: [{ title: "Replication across institutions", description: "Cross-institution replication is not established by this sample", rationale: "The selected studies have bounded samples [1] [2]", scope: "Selected learning studies", suggestedResearchQuestion: "Do the learning outcomes replicate across institutions?", observedLimitation: "The selected studies use a single institution.", missingEvidence: "Replication across institutions is missing from these studies.", assumptions: "Search for contradictory studies", supportingEvidence: [1, 2], confidence: 0.8 }] };
  async function generated(input: { keyParts: unknown }) {
    const ids = (input.keyParts as { retrievedPaperIds: string[] }).retrievedPaperIds;
    const sourceAnchors = await Promise.all(ids.map(async (id, index) => {
      const doc = await db.paperDocument.findUniqueOrThrow({ where: { paperId: id } });
      const chunk = await db.paperChunk.findFirstOrThrow({ where: { documentId: doc.id }, orderBy: { position: "asc" } });
      return { paperNumber: index + 1, chunkId: chunk.id, quote: "Single institution." };
    }));
    return { gaps: gaps.gaps.map(gap => ({ ...gap, sourceAnchors })) };
  }
  async function index(id: string) {
    const paper = await db.paper.findUniqueOrThrow({ where: { id } });
    const text = paper.abstractText!;
    const values = { status: "ready", sourceKind: "abstract", sourceHash: sourceFingerprint(paper), contentHash: digest(text), indexVersion: RAG_INDEX_VERSION, warnings: ["Abstract-only coverage"] };
    const doc = await db.paperDocument.upsert({ where: { paperId: id }, create: { paperId: id, ...values }, update: values });
    await db.paperChunk.upsert({ where: { documentId_position: { documentId: doc.id, position: 0 } }, create: { documentId: doc.id, position: 0, text, contentHash: digest(text) }, update: { text, contentHash: digest(text) } });
    await db.paper.update({ where: { id }, data: { aiAnalysis: analysis } });
    return analysis as never;
  }
  async function fixture() {
    const project = await createProjectFixture({ data: { ownerId: owner, title: `Discovery ${crypto.randomUUID()}`, visibility: "PRIVATE" } }); projects.push(project.id);
    await db.projectMember.create({ data: { projectId: project.id, userId: member, role: "MEMBER" } });
    const sources = [];
    for (const status of ["INCLUDED", "INCLUDED", "EXCLUDED", "UNDECIDED"]) {
      const paper = await db.paper.create({ data: { title: `${status} learning study`, abstractText: "The study reports mixed learning outcomes. Single institution. Test replication.", publicationYear: 2024, primaryProvider: "user", dataStatus: "active" } }); papers.push(paper.id);
      await db.projectPaper.create({ data: { projectId: project.id, paperId: paper.id, addedById: owner, screeningStatus: status } }); sources.push(paper);
    }
    const input = { projectId: project.id, projectDiscovery: true, topic: "Learning outcomes", evidenceMode: "selected" as const, selectedPaperIds: sources.slice(0, 2).map(source => source.id) };
    return { project, sources, input };
  }
  async function ready() {
    const pack = await fixture(), id = await gapsService.enqueue(owner, pack.input);
    await gapsService.runGapPipeline({ analysisId: id });
    const gap = await db.researchGap.findFirstOrThrow({ where: { analysisId: id } });
    const view = await research.detail(pack.project.id, member, gap.id);
    const reviewedEvidence = view.evidence.map(item => ({ id: item.evidenceItemId!, version: item.evidenceVersion! }));
    return { ...pack, id, gap, view, reviewedEvidence };
  }
  beforeAll(async () => {
    for (const fullName of ["owner", "member", "outsider"]) { const user = await db.user.create({ data: { email: `${crypto.randomUUID()}@discovery.invalid`, fullName, credits: 2000, emailVerifiedAt: new Date() } }); users.push(user.id); }
    [owner, member, outsider] = users as [string, string, string];
  });
  beforeEach(() => {
    vi.mocked(gapsQueue.add).mockReset().mockResolvedValue({} as never);
    vi.mocked(indexPaper).mockReset().mockImplementation(index);
    vi.mocked(cachedGenerateJSON).mockReset().mockImplementation(async input => input.validate!(input.task === "gap" ? await generated(input) : synthesis) as never);
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
  it("loads only active included papers and authorizes shared project results", async () => {
    const { project, sources, input } = await fixture();
    expect((await gapsService.projectDiscoveryOverview(project.id, member)).eligibleCount).toBe(2);
    await expect(gapsService.projectDiscoveryOverview(project.id, outsider)).rejects.toMatchObject({ statusCode: 404 });
    await db.paper.update({ where: { id: sources[1]!.id }, data: { dataStatus: "draft" } });
    expect((await gapsService.projectDiscoveryOverview(project.id, owner)).eligibleCount).toBe(1);
    await expect(gapsService.enqueue(owner, input)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("runs extraction → synthesis → candidates with source snapshots, never auto-accepts evidence", async () => {
    const { project, id, gap, view } = await ready();
    const status = await gapsService.getAnalysis(member, id);
    expect(status.status).toBe("ready"); expect(status.discovery?.stage).toBe("ready");
    expect(status.discovery?.papers).toHaveLength(2); expect(status.discovery?.synthesis).toEqual(synthesis);
    expect(status.discovery?.papers[0]?.analysis.researchQuestions).toEqual(analysis.researchQuestions);
    expect(status.discovery?.papers[0]?.passages[0]?.text).toContain("Single institution");
    expect(indexPaper).toHaveBeenCalledTimes(2);
    expect(view.evidence).toHaveLength(2); expect(view.evidence.every(item => !item.reviewed && item.reviewState === "PENDING" && !item.sourceChanged)).toBe(true);
    expect(gap.validationStatus).toBe("CANDIDATE"); expect(gap.confidence).toBe(0);
    expect(gap.suggestedResearchQuestion).toContain("replicate"); expect(view.evidence.every(item => item.excerpt === "Single institution.")).toBe(true);
    const snapshots = await db.projectWorkspaceRevision.findMany({ where: { projectId: project.id, entityId: id, entityKind: "GAP_ANALYSIS_INPUT" }, orderBy: { version: "asc" } });
    expect(snapshots.map(row => (row.snapshot as { result: { stage: string } }).result.stage)).toEqual(["queued", "extracting", "extracting", "extracting", "synthesizing", "generating", "ready"]);
    await expect(gapsService.getAnalysis(outsider, id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("completes the pipeline when synthesis returns bullet arrays and citation metadata", async () => {
    vi.mocked(cachedGenerateJSON).mockImplementation(async call => call.validate!(call.task === "gap" ? await generated(call) : {
      commonFindings: [synthesis.commonFindings], contradictions: [], openQuestions: [synthesis.openQuestions], citingPaperNumbers: [1, 2],
    }) as never);
    const { id } = await ready();
    expect((await gapsService.getAnalysis(member, id)).discovery?.synthesis).toEqual(synthesis);
    expect(vi.mocked(cachedGenerateJSON).mock.calls.find(([call]) => call.task === "extract")?.[0].options?.system).toContain("exactly three string fields");
  });
  it("requires explicit evidence review and retains candidate status after team support", async () => {
    const { project, gap, reviewedEvidence } = await ready();
    const input = { expectedVersion: gap.version, status: "TEAM_SUPPORTED" as const, rationale: "Checked source passages and bounded the interpretation" };
    await expect(research.assess(project.id, member, gap.id, input)).rejects.toMatchObject({ statusCode: 409 });
    const assessed = await research.assess(project.id, member, gap.id, { ...input, reviewedEvidence });
    expect(assessed.assessmentStatus).toBe("TEAM_SUPPORTED"); expect(assessed.validationStatus).toBe("CANDIDATE");
    expect((await research.detail(project.id, member, gap.id)).evidence.every(item => item.reviewed && !item.sourceChanged)).toBe(true);
    await research.assess(project.id, owner, gap.id, { expectedVersion: assessed.version, status: "NEEDS_MORE_EVIDENCE", rationale: "Find additional institutions" });
    const current = await db.researchGap.findUniqueOrThrow({ where: { id: gap.id } });
    const rejected = await research.assess(project.id, owner, gap.id, { expectedVersion: current.version, status: "REJECTED", rationale: "Contradictory studies were found" });
    expect(rejected.validationStatus).toBe("CANDIDATE"); expect(rejected.assessmentStatus).toBe("REJECTED");
  });
  it("returns a successful empty result instead of inventing unsupported gaps", async () => {
    const { input, project } = await fixture();
    vi.mocked(cachedGenerateJSON).mockImplementation(async call => call.validate!(call.task === "gap" ? { gaps: [{ ...gaps.gaps[0], sourceAnchors: [{ paperNumber: 1, chunkId: "invented", quote: "A fabricated quote." }] }] } : synthesis) as never);
    const id = await gapsService.enqueue(owner, input); await gapsService.runGapPipeline({ analysisId: id });
    const result = await gapsService.getAnalysis(owner, id);
    expect(result.status).toBe("ready"); expect(result.gapIds).toEqual([]);
    expect(await db.projectEvidenceItem.count({ where: { projectId: project.id } })).toBe(0);
  });
  it("keeps results scoped to the requested analysis and project", async () => {
    const first = await ready(), second = await ready();
    const query = { analysisId: first.id, projectId: first.project.id, page: 1, pageSize: 20, sortBy: "newest" as const, status: "active" as const };
    expect((await gapsService.list(owner, query)).gaps.map(gap => gap.id)).toEqual([first.gap.id]);
    expect((await gapsService.list(owner, { ...query, analysisId: second.id })).gaps).toEqual([]);
    await expect(gapsService.list(outsider, query)).rejects.toMatchObject({ statusCode: 404 });
    const packet = await db.projectWorkspaceRevision.findFirstOrThrow({ where: { entityId: first.id, entityKind: "GAP_ANALYSIS_INPUT", version: 1 } });
    expect((packet.snapshot as { projectContext: { title: string } }).projectContext.title).toBe(first.project.title);
  });
  it("allows review and rejection without approving AI source extractions", async () => {
    const { project, gap } = await ready();
    const review = await research.assess(project.id, member, gap.id, { expectedVersion: gap.version, status: "IN_REVIEW", rationale: "Discuss with the research team" });
    await research.assess(project.id, owner, gap.id, { expectedVersion: review.version, status: "REJECTED", rationale: "The sources do not establish this interpretation" });
    expect((await research.detail(project.id, owner, gap.id)).evidence.every(item => item.reviewState === "PENDING")).toBe(true);
  });
  it("prevents concurrent analyses and refunds the losing enqueue", async () => {
    const { project, input } = await fixture(), before = (await db.user.findUniqueOrThrow({ where: { id: owner } })).credits;
    const runs = await Promise.allSettled([gapsService.enqueue(owner, input), gapsService.enqueue(owner, input)]);
    expect(runs.filter(run => run.status === "fulfilled")).toHaveLength(1);
    expect(await db.gapAnalysis.count({ where: { projectId: project.id, status: "queued" } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: owner } })).credits).toBe(before - 30);
  });
  it("refunds a failed queue submission and exposes a retryable failure", async () => {
    const { project, input } = await fixture(), before = (await db.user.findUniqueOrThrow({ where: { id: owner } })).credits;
    vi.mocked(gapsQueue.add).mockRejectedValueOnce(new Error("Queue offline"));
    await expect(gapsService.enqueue(owner, input)).rejects.toThrow("Queue offline");
    expect((await db.user.findUniqueOrThrow({ where: { id: owner } })).credits).toBe(before);
    expect((await gapsService.projectDiscoveryOverview(project.id, owner)).latestAnalysis?.status).toBe("failed");
  });
  it("rejects excluded, unreviewed, foreign or malformed selections before charging", async () => {
    const { input, sources } = await fixture(), other = await fixture(), before = (await db.user.findUniqueOrThrow({ where: { id: owner } })).credits;
    for (const id of [sources[2]!.id, sources[3]!.id, other.sources[0]!.id]) await expect(gapsService.enqueue(owner, { ...input, selectedPaperIds: [sources[0]!.id, id] })).rejects.toMatchObject({ statusCode: 409 });
    await expect(gapsService.enqueue(owner, { ...input, projectId: undefined })).rejects.toMatchObject({ statusCode: 400 });
    await expect(gapsService.enqueue(outsider, input)).rejects.toMatchObject({ statusCode: 404 });
    expect((await db.user.findUniqueOrThrow({ where: { id: owner } })).credits).toBe(before); expect(cachedGenerateJSON).not.toHaveBeenCalled();
  });
  it("rejects simultaneous assessments and stale evidence versions atomically", async () => {
    const { project, gap, reviewedEvidence } = await ready();
    const input = { expectedVersion: gap.version, status: "TEAM_SUPPORTED" as const, rationale: "Checked these exact source revisions", reviewedEvidence };
    await expect(research.assess(project.id, owner, gap.id, { ...input, reviewedEvidence: [reviewedEvidence[0]!, reviewedEvidence[0]!] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(research.assess(project.id, owner, gap.id, { ...input, reviewedEvidence: reviewedEvidence.map(item => ({ ...item, version: 999 })) })).rejects.toMatchObject({ statusCode: 409 });
    const assessed = await Promise.allSettled([owner, member].map(actor => research.assess(project.id, actor, gap.id, input)));
    expect(assessed.filter(result => result.status === "fulfilled")).toHaveLength(1);
  });
  it("discards output when sources change during generation and refunds failed runs once", async () => {
    const { input, sources } = await fixture(), id = await gapsService.enqueue(owner, input), afterCharge = (await db.user.findUniqueOrThrow({ where: { id: owner } })).credits;
    vi.mocked(cachedGenerateJSON).mockImplementation(async call => {
      if (call.task === "gap") await db.paper.update({ where: { id: sources[0]!.id }, data: { abstractText: "Changed source" } });
      return call.validate!(call.task === "gap" ? await generated(call) : synthesis) as never;
    });
    await expect(gapsService.runGapPipeline({ analysisId: id })).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.researchGap.count({ where: { analysisId: id } })).toBe(0);
    await gapsService.markAnalysisFailed(id, "Source changed"); await gapsService.markAnalysisFailed(id, "Source changed");
    expect((await db.user.findUniqueOrThrow({ where: { id: owner } })).credits).toBe(afterCharge + 30);
  });
  it("blocks support and question derivation after source content changes", async () => {
    const { project, gap, sources, reviewedEvidence } = await ready();
    await db.paper.update({ where: { id: sources[0]!.id }, data: { abstractText: "Updated findings" } });
    await expect(research.assess(project.id, owner, gap.id, { expectedVersion: gap.version, status: "TEAM_SUPPORTED", rationale: "Old interpretation", reviewedEvidence })).rejects.toMatchObject({ statusCode: 409 });
    expect((await research.detail(project.id, owner, gap.id)).evidence.some(item => item.sourceChanged)).toBe(true);
    expect(await db.projectEvidenceItem.count({ where: { projectId: project.id, reviewState: "ACCEPTED" } })).toBe(0);
  });
  it("rechecks membership before publication and revokes access to saved results", async () => {
    const { project, input } = await fixture(), id = await gapsService.enqueue(member, input);
    vi.mocked(cachedGenerateJSON).mockImplementation(async call => {
      if (call.task === "gap") await db.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: member } }, data: { status: "REMOVED" } });
      return call.validate!(call.task === "gap" ? await generated(call) : synthesis) as never;
    });
    await expect(gapsService.runGapPipeline({ analysisId: id })).rejects.toMatchObject({ statusCode: 404 });
    expect(await db.researchGap.count({ where: { analysisId: id } })).toBe(0);
    await expect(gapsService.getAnalysis(member, id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
