import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { projectEvidenceService as evidence } from "../project-evidence.service.js";
import { projectMatrixService as matrix } from "../project-matrix.service.js";
import { projectLimitationService as limitations } from "../project-limitation.service.js";
import { projectFeasibilityService as feasibility } from "../project-feasibility.service.js";
import { projectGapResearchService as gaps } from "../project-gap-research.service.js";
import { matrixQuerySchema } from "../dto/project-literature.schema.js";

/**
 * Literature matrix -> limitation identification -> feasibility -> gap candidate, on a disposable database.
 * Run with LITERATURE_INTEGRATION=1 and a DATABASE_URL whose database name ends in "_test" (migrations applied).
 */
const isolated = process.env.NODE_ENV === "test" && process.env.LITERATURE_INTEGRATION === "1" && /_test(?:\?|$)/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!isolated).sequential("literature matrix, limitations and feasibility on isolated PostgreSQL", () => {
  const db = getPrisma(); let owner: string, member: string, outsider: string;
  const content = { claim: "Quantization keeps accuracy on printed text", methodology: "CNN + CTC, 8-bit quantization", limitations: "Only printed characters were tested", results: "-1.2% accuracy", quotation: "", locator: "", context: "Mobile OCR", population: "UIT-HWDB", themes: ["compression"] };
  const feasible = { dataAvailability: 4, expertise: 4, resources: 3, timeline: 4, risk: 4, notes: "" };

  async function fixture() {
    const project = await createProjectFixture({ data: { ownerId: owner, title: `Matrix ${crypto.randomUUID()}` } });
    await db.projectMember.create({ data: { projectId: project.id, userId: member } });
    const papers = [];
    for (const title of ["Alpha study", "Beta study", "Gamma study"]) {
      const paper = await db.paper.create({ data: { title, abstractText: "A source passage.", primaryProvider: "user", publicationYear: 2024 } });
      await db.projectPaper.create({ data: { projectId: project.id, paperId: paper.id, addedById: owner, screeningStatus: "INCLUDED" } });
      papers.push(paper);
    }
    return { project, papers };
  }
  async function accepted(projectId: string, paperId: string, extra: Record<string, unknown> = {}) {
    const item = await evidence.create(projectId, member, { ...content, paperId, clientKey: crypto.randomUUID(), origin: "HUMAN", ...extra });
    return evidence.review(projectId, owner, item.id, { state: "ACCEPTED", expectedVersion: item.version, rationale: "Compared with the source", sourceConfirmed: true });
  }

  beforeAll(async () => {
    const users = [];
    for (const name of ["Owner", "Member", "Outsider"]) users.push(await db.user.create({ data: { email: `${crypto.randomUUID()}@literature.invalid`, fullName: name, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } }));
    [owner, member, outsider] = users.map((user) => user.id) as [string, string, string];
  });
  afterAll(async () => { await disconnectPostgres(); });

  it("adds custom columns, stores values with the extraction and shows only verified rows by default", async () => {
    const f = await fixture();
    const dataset = await matrix.createCriterion(f.project.id, member, { label: "Dataset", description: "" });
    await expect(matrix.createCriterion(f.project.id, owner, { label: "dataset", description: "" })).rejects.toMatchObject({ statusCode: 409 });
    const draft = await evidence.create(f.project.id, member, { ...content, paperId: f.papers[0]!.id, clientKey: crypto.randomUUID(), origin: "HUMAN", criteriaValues: { [dataset.id]: "UIT-HWDB" } });
    expect(draft.criteriaValues).toEqual({ [dataset.id]: "UIT-HWDB" });
    await expect(evidence.create(f.project.id, member, { ...content, paperId: f.papers[0]!.id, clientKey: crypto.randomUUID(), origin: "HUMAN", criteriaValues: { [crypto.randomUUID()]: "x" } })).rejects.toMatchObject({ statusCode: 409 });

    expect((await matrix.matrix(f.project.id, owner, matrixQuerySchema.parse({}))).rows).toHaveLength(0);
    const all = await matrix.matrix(f.project.id, owner, matrixQuerySchema.parse({ status: "ALL" }));
    expect(all.rows).toHaveLength(1); expect(all.rows[0]?.criteriaValues).toEqual({ [dataset.id]: "UIT-HWDB" });

    await evidence.review(f.project.id, owner, draft.id, { state: "ACCEPTED", expectedVersion: draft.version, rationale: "Checked", sourceConfirmed: true });
    const verified = await matrix.matrix(f.project.id, owner, matrixQuerySchema.parse({}));
    expect(verified.rows.map((row) => row.evidenceId)).toEqual([draft.id]);
    expect(verified.criteria.map((column) => column.label)).toEqual(["Dataset"]);
    await expect(matrix.matrix(f.project.id, outsider, matrixQuerySchema.parse({}))).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps values of an archived column when the extraction is edited", async () => {
    const f = await fixture();
    const metric = await matrix.createCriterion(f.project.id, member, { label: "Metric", description: "" });
    const item = await evidence.create(f.project.id, member, { ...content, paperId: f.papers[0]!.id, clientKey: crypto.randomUUID(), origin: "HUMAN", criteriaValues: { [metric.id]: "CER" } });
    await matrix.archiveCriterion(f.project.id, owner, metric.id, { expectedVersion: metric.version });
    const edited = await evidence.update(f.project.id, member, item.id, { ...content, claim: "Revised claim", criteriaValues: {}, expectedVersion: item.version });
    expect(edited.criteriaValues).toEqual({ [metric.id]: "CER" });
    expect((await matrix.matrix(f.project.id, owner, matrixQuerySchema.parse({ status: "ALL" }))).rows[0]?.criteriaValues).toEqual({});
  });

  it("groups accepted limitations, counts distinct papers and refuses unreviewed sources", async () => {
    const f = await fixture();
    const a = await accepted(f.project.id, f.papers[0]!.id), b = await accepted(f.project.id, f.papers[1]!.id), c = await accepted(f.project.id, f.papers[1]!.id, { claim: "Second finding" });
    const pending = await evidence.create(f.project.id, member, { ...content, paperId: f.papers[2]!.id, clientKey: crypto.randomUUID(), origin: "HUMAN" });
    const before = await limitations.list(f.project.id, owner);
    expect(before.ungrouped.map((row) => row.evidenceId).sort()).toEqual([a.id, b.id, c.id].sort());

    const clientKey = crypto.randomUUID();
    const input = { statement: "No study tests handwritten Vietnamese with diacritics", category: "DATA" as const, evidenceIds: [a.id, b.id, c.id], clientKey };
    await expect(limitations.create(f.project.id, member, { ...input, evidenceIds: [pending.id] })).rejects.toMatchObject({ statusCode: 400 });
    const created = await limitations.create(f.project.id, member, input);
    expect(created.paperCount).toBe(2); expect(created.sources).toHaveLength(3); expect(created.status).toBe("OPEN");
    expect((await limitations.create(f.project.id, member, input)).id).toBe(created.id); // retry is idempotent
    await expect(limitations.create(f.project.id, member, { ...input, statement: "Different text" })).rejects.toMatchObject({ statusCode: 409 });
    expect((await limitations.list(f.project.id, owner)).ungrouped).toHaveLength(0);

    await expect(limitations.setStatus(f.project.id, owner, created.id, { status: "DISMISSED", rationale: "", expectedVersion: created.version })).rejects.toBeTruthy();
    const dismissed = await limitations.setStatus(f.project.id, owner, created.id, { status: "DISMISSED", rationale: "Out of project scope", expectedVersion: created.version });
    await expect(limitations.update(f.project.id, member, created.id, { statement: input.statement, category: "DATA", evidenceIds: [a.id], expectedVersion: dismissed.version })).rejects.toMatchObject({ statusCode: 409 });
    const reopened = await limitations.setStatus(f.project.id, owner, created.id, { status: "OPEN", rationale: "", expectedVersion: dismissed.version });
    const narrowed = await limitations.update(f.project.id, member, created.id, { statement: input.statement, category: "DATA", evidenceIds: [a.id], expectedVersion: reopened.version });
    expect(narrowed.paperCount).toBe(1);
  });

  it("records one feasibility assessment per member and requires notes for low scores", async () => {
    const f = await fixture();
    const a = await accepted(f.project.id, f.papers[0]!.id);
    const created = await limitations.create(f.project.id, member, { statement: "Only printed text was evaluated", category: "DATA", evidenceIds: [a.id], clientKey: crypto.randomUUID() });
    await expect(feasibility.save(f.project.id, member, "LIMITATION", created.id, { ...feasible, timeline: 2, notes: "" })).rejects.toMatchObject({ statusCode: 400 });
    const first = await feasibility.save(f.project.id, member, "LIMITATION", created.id, feasible);
    expect(first.summary.count).toBe(1); expect(first.summary.verdict).toBe("FEASIBLE");
    await expect(feasibility.save(f.project.id, member, "LIMITATION", created.id, feasible)).rejects.toMatchObject({ statusCode: 409 });
    const blocked = await feasibility.save(f.project.id, owner, "LIMITATION", created.id, { ...feasible, dataAvailability: 1, notes: "No labelled handwritten corpus" });
    expect(blocked.summary.count).toBe(2); expect(blocked.summary.verdict).toBe("NOT_FEASIBLE"); expect(blocked.summary.blockers).toEqual(["dataAvailability"]);
    const mine = blocked.assessments.find((row) => row.assessorId === owner)!;
    const revised = await feasibility.save(f.project.id, owner, "LIMITATION", created.id, { ...feasible, dataAvailability: 3, notes: "Partner lab shares a corpus", expectedVersion: mine.version });
    expect(revised.summary.verdict).toBe("FEASIBLE");
    await expect(feasibility.get(f.project.id, outsider, "LIMITATION", created.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("promotes a limitation into a gap candidate with supporting evidence and carried-over feasibility", async () => {
    const f = await fixture();
    const a = await accepted(f.project.id, f.papers[0]!.id), b = await accepted(f.project.id, f.papers[1]!.id);
    const created = await limitations.create(f.project.id, member, { statement: "Compression was never evaluated on handwritten Vietnamese", category: "METHOD", evidenceIds: [a.id, b.id], clientKey: crypto.randomUUID() });
    await feasibility.save(f.project.id, member, "LIMITATION", created.id, feasible);
    const promoted = await limitations.promote(f.project.id, owner, created.id, { expectedVersion: created.version, title: "Compression for handwritten Vietnamese OCR", topic: "model compression OCR", significance: "Mobile OCR for Vietnamese needs small models that keep accuracy on diacritics." });
    expect(promoted.status).toBe("PROMOTED"); expect(promoted.gapId).toBeTruthy();
    await expect(limitations.promote(f.project.id, owner, created.id, { expectedVersion: promoted.version, title: "Again", topic: "again", significance: "Trying twice should fail." })).rejects.toMatchObject({ statusCode: 409 });

    const detail = await gaps.detail(f.project.id, owner, promoted.gapId!);
    expect(detail.gap.origin).toBe("HUMAN");
    expect(detail.evidence.filter((row) => row.evidenceKind === "SUPPORTING").map((row) => row.evidenceItemId).sort()).toEqual([a.id, b.id].sort());
    expect(detail.feasibility?.count).toBe(1);
    expect(detail.limitations).toEqual([{ id: created.id, statement: created.statement, paperCount: 2 }]);
    const gap = await db.researchGap.findUniqueOrThrow({ where: { id: promoted.gapId! } });
    expect(gap.gapType).toBe("METHODOLOGICAL_GAP");
    const supported = await gaps.assess(f.project.id, member, gap.id, { expectedVersion: gap.version, status: "TEAM_SUPPORTED", rationale: "Two included papers report the same limitation" });
    expect(supported.assessmentStatus).toBe("TEAM_SUPPORTED");
  });

  it("blocks team support without a feasibility assessment, or when the team found it not feasible", async () => {
    const f = await fixture();
    const a = await accepted(f.project.id, f.papers[0]!.id);
    const created = await limitations.create(f.project.id, member, { statement: "Evaluation used one device only", category: "CONTEXT", evidenceIds: [a.id], clientKey: crypto.randomUUID() });
    const promoted = await limitations.promote(f.project.id, owner, created.id, { expectedVersion: created.version, title: "Cross-device OCR evaluation", topic: "OCR devices", significance: "Results on one phone may not transfer to low-end devices." });
    const gap = await db.researchGap.findUniqueOrThrow({ where: { id: promoted.gapId! } });
    const input = { expectedVersion: gap.version, status: "TEAM_SUPPORTED" as const, rationale: "Supported by one included paper" };
    await expect(gaps.assess(f.project.id, member, gap.id, input)).rejects.toMatchObject({ statusCode: 400 });
    await feasibility.save(f.project.id, member, "GAP", gap.id, { ...feasible, resources: 1, notes: "Needs ten device models we do not have" });
    await expect(gaps.assess(f.project.id, member, gap.id, input)).rejects.toMatchObject({ statusCode: 400 });
    await expect(gaps.assess(f.project.id, member, gap.id, { ...input, status: "IN_REVIEW" })).resolves.toMatchObject({ assessmentStatus: "IN_REVIEW" });
  });
});
