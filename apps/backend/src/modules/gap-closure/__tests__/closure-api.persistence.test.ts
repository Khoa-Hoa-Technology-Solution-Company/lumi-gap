import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const queueAdd = vi.hoisted(() => vi.fn());
const fetchByDois = vi.hoisted(() => vi.fn());
vi.mock("../../../infrastructure/queue.js", () => ({ gapsQueue: { add: queueAdd } }));
vi.mock("../../api-sync/providers/openalex.client.js", () => ({ fetchOpenAlexWorksByDois: fetchByDois }));

import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { AppError } from "../../../common/exceptions/app-error.js";
import { auditService } from "../../audit/audit.service.js";
import { calibrationService } from "../calibration.service.js";
import { closureService } from "../closure.service.js";
import { coverageService } from "../coverage.service.js";
import { GAP_CLOSURE_JOB } from "../closure.rules.js";

const ABSTRACT = "In a randomized trial, telehealth monitoring reduced 30-day readmissions among adults with heart failure.";
const QUOTE = "telehealth monitoring reduced 30-day readmissions";

async function expectAppError(promise: Promise<unknown>, statusCode: number) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).statusCode).toBe(statusCode);
}

describe.sequential("Gap Closure Protocol API (PostgreSQL)", () => {
  const marker = crypto.randomUUID();
  const prisma = getPrisma();
  const userIds: string[] = [];
  const gapIds: string[] = [];
  const paperIds: string[] = [];
  const calibrationIds: string[] = [];
  const coverageIds: string[] = [];
  let ownerId = "";
  let memberId = "";
  let strangerId = "";
  let adminId = "";
  let projectId = "";
  let gapId = "";
  let paperId = "";

  const topic = `closure api ${marker}`;

  async function seedChecked(opts: { labels: Array<{ aiLabel: string; aiQuote?: string; verified?: boolean }> }) {
    const check = await prisma.gapClosureCheck.create({
      data: { targetKind: "GAP", targetId: gapId, protocolVersion: "gcp-v1", status: "SCREENING", question: "Does telehealth reduce readmissions?", queries: [{ source: "LOCAL", query: "telehealth", executedAt: new Date().toISOString(), resultCount: opts.labels.length }], createdById: ownerId },
    });
    const docs = [];
    for (const [index, label] of opts.labels.entries()) {
      docs.push(await prisma.gapClosureDocument.create({
        data: { checkId: check.id, dedupeKey: `doi:10.1000/${marker}-${index}`, doi: `10.1000/${marker}-${index}`, paperId: index === 0 ? paperId : null, title: `Telehealth paper ${index}`, abstractText: ABSTRACT, retrievedFrom: "LOCAL", queryIndex: 0, rank: index + 1, aiLabel: label.aiLabel, aiQuote: label.aiQuote, aiQuoteVerified: label.verified ?? false },
      }));
    }
    return { check, docs };
  }

  beforeAll(async () => {
    vi.spyOn(auditService, "log").mockResolvedValue(undefined);
    const create = (name: string, extra: Record<string, unknown> = {}) => prisma.user.create({ data: { fullName: `Closure ${name}`, email: `closure-${name}-${marker}@example.test`, credits: 100, ...extra } });
    const [owner, member, stranger, admin] = await Promise.all([create("owner"), create("member"), create("stranger"), create("admin", { systemRole: "ADMIN" })]);
    ownerId = owner.id; memberId = member.id; strangerId = stranger.id; adminId = admin.id;
    userIds.push(ownerId, memberId, strangerId, adminId);
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({ data: { title: `Closure ${marker.slice(0, 8)}`, ownerId } });
      await tx.projectMember.create({ data: { projectId: created.id, userId: ownerId, role: "OWNER", status: "ACTIVE" } });
      return created;
    });
    projectId = project.id;
    await prisma.projectMember.create({ data: { projectId, userId: memberId, status: "ACTIVE" } });
    const paper = await prisma.paper.create({ data: { title: "Telehealth for heart failure", abstractText: ABSTRACT, publicationYear: 2024, primaryProvider: "user", dataStatus: "active", doi: `10.1000/local-${marker}` } });
    paperId = paper.id; paperIds.push(paper.id);
    const gap = await prisma.researchGap.create({
      data: { topic, normalizedTopic: topic.toLowerCase(), title: "Closure api gap", description: "d", rationale: "r", source: "standalone", userId: ownerId, projectId, suggestedResearchQuestion: "Does telehealth reduce readmissions in adults with heart failure?" },
    });
    gapId = gap.id; gapIds.push(gap.id);
  });

  beforeEach(() => {
    queueAdd.mockReset();
    queueAdd.mockResolvedValue(undefined);
    fetchByDois.mockReset();
  });

  afterAll(async () => {
    const checks = await prisma.gapClosureCheck.findMany({ where: { OR: [{ targetId: { in: gapIds } }, { createdById: { in: userIds } }] }, select: { id: true } });
    const checkIds = checks.map((check) => check.id);
    await prisma.gapClosureDocument.deleteMany({ where: { checkId: { in: checkIds } } });
    await prisma.gapEvidenceRecord.deleteMany({ where: { gapId: { in: gapIds } } });
    await prisma.gapClosureCheck.deleteMany({ where: { id: { in: checkIds } } });
    await prisma.calibrationQuestion.deleteMany({ where: { calibrationId: { in: calibrationIds } } });
    await prisma.closureCalibration.deleteMany({ where: { id: { in: calibrationIds } } });
    await prisma.coverageCheckItem.deleteMany({ where: { coverageCheckId: { in: coverageIds } } });
    await prisma.coverageCheck.deleteMany({ where: { id: { in: coverageIds } } });
    await prisma.creditTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.researchGap.deleteMany({ where: { id: { in: gapIds } } });
    await prisma.paper.deleteMany({ where: { id: { in: paperIds } } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    vi.restoreAllMocks();
  });

  it("starts a check: charges credits, stores the row QUEUED and enqueues the hand-written queries", async () => {
    const view = await closureService.startCheck(ownerId, gapId, { queries: ["telehealth heart failure"], facets: { population: "adults" } });
    expect(view).toMatchObject({ status: "QUEUED", targetKind: "GAP", targetId: gapId, documents: [], facets: { population: "adults" } });
    expect(view.question).toContain("telehealth");
    expect(queueAdd).toHaveBeenCalledWith(GAP_CLOSURE_JOB, { checkId: view.id, queries: ["telehealth heart failure"] }, { jobId: view.id });
    const [user, row, gap] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: ownerId } }), prisma.gapClosureCheck.findUniqueOrThrow({ where: { id: view.id } }), prisma.researchGap.findUniqueOrThrow({ where: { id: gapId } })]);
    expect(user.credits).toBe(90);
    expect(row.creditTransactionId).toBeTruthy();
    expect(gap.questionFacets).toEqual({ population: "adults" });
    await prisma.gapClosureCheck.update({ where: { id: view.id }, data: { status: "FAILED" } });
  });

  it("blocks a second check while one is running, and hides the gap from strangers", async () => {
    const first = await closureService.startCheck(ownerId, gapId, {});
    await expectAppError(closureService.startCheck(ownerId, gapId, {}), 409);
    await expectAppError(closureService.startCheck(strangerId, gapId, {}), 404);
    await expectAppError(closureService.getCheck(strangerId, first.id), 404);
    expect((await closureService.getCheck(memberId, first.id)).id).toBe(first.id);
    await prisma.gapClosureCheck.update({ where: { id: first.id }, data: { status: "FAILED" } });
  });

  it("refunds the credits when the job cannot be queued", async () => {
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).credits;
    queueAdd.mockRejectedValueOnce(new Error("redis down"));
    await expect(closureService.startCheck(ownerId, gapId, {})).rejects.toThrow("redis down");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).credits).toBe(before);
    expect(await prisma.gapClosureCheck.count({ where: { targetId: gapId, status: "QUEUED" } })).toBe(0);
  });

  it("asks for a question when the gap has none", async () => {
    const bare = await prisma.researchGap.create({ data: { topic: `${topic} bare`, normalizedTopic: `${topic} bare`, title: "No question", description: "d", rationale: "r", source: "standalone", userId: ownerId } });
    gapIds.push(bare.id);
    await expectAppError(closureService.startCheck(ownerId, bare.id, {}), 400);
  });

  it("reviews documents: verbatim quote required, second reviewer must differ, member may review but not decide", async () => {
    const { check, docs } = await seedChecked({ labels: [{ aiLabel: "UNRELATED" }, { aiLabel: "UNRELATED" }] });
    const [first] = docs;
    await expectAppError(closureService.reviewDocument(ownerId, check.id, first!.id, { label: "ANSWERS", quote: "this sentence is not in the abstract at all" }), 400);
    await expectAppError(closureService.reviewDocument(ownerId, check.id, first!.id, { label: "PARTIAL" }), 400);
    const reviewed = await closureService.reviewDocument(ownerId, check.id, first!.id, { label: "ANSWERS", quote: QUOTE });
    expect(reviewed).toMatchObject({ humanLabel: "ANSWERS", effectiveLabel: "ANSWERS", reviewerId: ownerId });

    await expectAppError(closureService.reviewDocument(ownerId, check.id, first!.id, { label: "ANSWERS", asSecondReviewer: true }), 409);
    const second = await closureService.reviewDocument(memberId, check.id, first!.id, { label: "PARTIAL", asSecondReviewer: true });
    expect(second).toMatchObject({ secondLabel: "PARTIAL", secondReviewerId: memberId });
    await expectAppError(closureService.reviewDocument(memberId, check.id, first!.id, { label: "UNRELATED" }), 409);
    await expectAppError(closureService.decide(memberId, check.id, {}), 403);
  });

  it("decides CLOSED with a corpus witness and stores COUNTER evidence; a new deciding label reopens the check", async () => {
    const { check, docs } = await seedChecked({ labels: [{ aiLabel: "ANSWERS", aiQuote: QUOTE, verified: true }, { aiLabel: "UNRELATED" }] });
    const decided = await closureService.decide(ownerId, check.id, {});
    expect(decided).toMatchObject({ status: "DECIDED", decision: "CLOSED", witnessDocumentId: docs[0]!.id, decidedById: ownerId });
    expect(decided.documents.map((doc) => doc.effectiveLabel)).toEqual(["ANSWERS", "UNRELATED"]);
    const gap = await prisma.researchGap.findUniqueOrThrow({ where: { id: gapId } });
    expect(gap).toMatchObject({ closureStatus: "CLOSED", latestClosureCheckId: check.id });
    const evidence = await prisma.gapEvidenceRecord.findMany({ where: { gapId, evidenceType: "CLOSURE_WITNESS" } });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ paperId, evidenceKind: "COUNTER", addedById: ownerId });
    expect(evidence[0]!.excerpt).toBe(QUOTE);

    await closureService.reviewDocument(ownerId, check.id, docs[0]!.id, { label: "UNRELATED" });
    const reopened = await closureService.getCheck(ownerId, check.id);
    expect(reopened).toMatchObject({ status: "SCREENING", decision: undefined, witnessDocumentId: undefined });
    expect((await prisma.researchGap.findUniqueOrThrow({ where: { id: gapId } })).closureStatus).toBe("NOT_CHECKED");
    expect(await prisma.gapEvidenceRecord.count({ where: { gapId, evidenceType: "CLOSURE_WITNESS" } })).toBe(0);
  });

  it("abstains with every reason when coverage and calibration are missing, and certifies openness when they are present", async () => {
    const { check } = await seedChecked({ labels: [{ aiLabel: "UNRELATED" }] });
    const abstain = await closureService.decide(ownerId, check.id, {});
    expect(abstain.decision).toBe("ABSTAIN");
    expect(abstain.decisionReasons).toContain("NO_COVERAGE");
    expect(abstain.maxFalseNovelty).toBeGreaterThan(0);

    const coverage = await prisma.coverageCheck.create({ data: { topic, normalizedTopic: topic.toLowerCase(), referenceSource: "test", m: 50, x: 0, delta: 0.05, pHat: 0.0582, createdById: ownerId } });
    coverageIds.push(coverage.id);
    const calibration = await prisma.closureCalibration.create({ data: { name: "t", domain: "t", judgeKind: "AI", protocolVersion: "gcp-v1", status: "COMPUTED", delta: 0.05, n: 40, misses: 0, epsHat: 0.0713, computedAt: new Date(), createdById: adminId } });
    calibrationIds.push(calibration.id);
    const certified = await closureService.decide(ownerId, check.id, { coverageCheckId: coverage.id, calibrationId: calibration.id });
    expect(certified).toMatchObject({ decision: "OPEN_CERTIFIED", pHat: 0.0582, epsHat: 0.0713, bound: 0.1295, coverageCheckId: coverage.id, calibrationId: calibration.id });
    expect((await prisma.researchGap.findUniqueOrThrow({ where: { id: gapId } })).closureStatus).toBe("OPEN_CERTIFIED");

    const dossier = await closureService.getDossier(ownerId, check.id);
    expect(dossier.arithmetic.join("\n")).toContain("B = 0.0713 + 0.0582 = 0.1295 <= 0.2");
    const markdown = await closureService.getDossierMarkdown(ownerId, check.id);
    expect(markdown.filename).toMatch(/^gap-closure-[0-9a-f]{8}\.md$/);
  });

  it("creates a coverage check: local + OpenAlex lookup, pHat from x, and nothing stored when OpenAlex fails", async () => {
    await prisma.paper.update({ where: { id: paperId }, data: { doi: `10.1000/LOCAL-${marker}` } });
    fetchByDois.mockResolvedValueOnce([{ id: "https://openalex.org/W42", doi: `https://doi.org/10.1000/remote-${marker}`, title: "Remote paper" }]);
    const view = await coverageService.create(ownerId, {
      topic: topic.toUpperCase(),
      referenceSource: "Reference list of a survey",
      dois: [`https://doi.org/10.1000/local-${marker}`, `10.1000/remote-${marker}`, `10.1000/missing-${marker}`, `10.1000/remote-${marker}`],
    });
    coverageIds.push(view.id);
    expect(view).toMatchObject({ m: 3, x: 1 });
    expect(view.items.map((item) => [item.foundLocal, item.foundOpenAlex])).toEqual([[true, false], [false, true], [false, false]]);
    expect(view.items[1]!.openalexId).toBe("W42");
    expect(view.pHat).toBeGreaterThan(1 / 3);

    const listed = await coverageService.list(ownerId, { topic });
    expect(listed.map((row) => row.id)).toContain(view.id);
    expect(await coverageService.list(strangerId, { topic })).toEqual([]);

    const countBefore = await prisma.coverageCheck.count({ where: { createdById: ownerId } });
    fetchByDois.mockRejectedValueOnce(new Error("OpenAlex 500"));
    await expectAppError(coverageService.create(ownerId, { topic, referenceSource: "Reference list of a survey", dois: [`10.1000/x-${marker}`] }), 503);
    expect(await prisma.coverageCheck.count({ where: { createdById: ownerId } })).toBe(countBefore);
    await expectAppError(coverageService.create(ownerId, { topic, referenceSource: "Reference list of a survey", dois: ["nope"] }), 400);
  });

  it("calibration: capability gate, run queues one check per question, compute waits for screening, then sets epsHat", async () => {
    await expectAppError(calibrationService.create(strangerId, { name: "Cardiology", domain: "cardiology", judgeKind: "AI" }), 403);
    const created = await calibrationService.create(adminId, { name: "Cardiology", domain: "cardiology", judgeKind: "AI" });
    calibrationIds.push(created.id);
    expect(created).toMatchObject({ status: "DRAFT", n: 0 });

    const q1 = await calibrationService.addQuestion(adminId, created.id, { question: "Does telehealth reduce readmissions?", witnessDoi: "10.1000/w1", labelSource: "SURVEY" });
    const q2 = await calibrationService.addQuestion(adminId, created.id, { question: "Does exercise improve sleep quality?", witnessDoi: "10.1000/w2", labelSource: "EXPERT_VALIDATION", labelSourceRef: "gap-1" });
    await expectAppError(calibrationService.addQuestion(ownerId, created.id, { question: "Another question here", witnessDoi: "10.1000/w3", labelSource: "SURVEY" }), 403);
    await expectAppError(calibrationService.compute(adminId, created.id), 409);

    const running = await calibrationService.run(adminId, created.id);
    expect(running.status).toBe("RUNNING");
    expect(queueAdd).toHaveBeenCalledTimes(2);
    expect(running.questions!.every((question) => question.closureCheckId)).toBe(true);
    const before = queueAdd.mock.calls.length;
    await calibrationService.run(adminId, created.id);
    expect(queueAdd.mock.calls.length).toBe(before);

    await expectAppError(calibrationService.compute(adminId, created.id), 409);

    const checkOf = (id: string) => running.questions!.find((question) => question.id === id)!.closureCheckId!;
    await prisma.gapClosureCheck.update({ where: { id: checkOf(q1.id) }, data: { status: "SCREENING" } });
    await prisma.gapClosureCheck.update({ where: { id: checkOf(q2.id) }, data: { status: "SCREENING" } });
    await prisma.gapClosureDocument.create({ data: { checkId: checkOf(q1.id), dedupeKey: "doi:10.1000/w1", title: "Witness", abstractText: ABSTRACT, retrievedFrom: "LOCAL", queryIndex: 0, rank: 1, aiLabel: "ANSWERS", aiQuote: QUOTE, aiQuoteVerified: true } });
    await prisma.gapClosureDocument.create({ data: { checkId: checkOf(q2.id), dedupeKey: "doi:10.1000/other", title: "Other", abstractText: ABSTRACT, retrievedFrom: "LOCAL", queryIndex: 0, rank: 1, aiLabel: "UNRELATED", aiQuoteVerified: false } });

    const computed = await calibrationService.compute(adminId, created.id);
    expect(computed).toMatchObject({ status: "COMPUTED", n: 2, misses: 1 });
    expect(computed.epsHat).toBeGreaterThan(0.5);
    expect(computed.questions!.map((question) => question.result).sort()).toEqual(["FOUND", "MISSED"]);

    await expectAppError(calibrationService.deleteQuestion(adminId, created.id, q1.id), 409);
    expect((await calibrationService.get(created.id)).id).toBe(created.id);
    expect((await calibrationService.list()).some((row) => row.id === created.id)).toBe(true);
    // The calibration creator can open the calibration check; a stranger cannot.
    expect((await closureService.getCheck(adminId, checkOf(q1.id))).targetKind).toBe("CALIBRATION_QUESTION");
    await expectAppError(closureService.getCheck(strangerId, checkOf(q1.id)), 404);
    await expectAppError(closureService.decide(adminId, checkOf(q1.id), {}), 400);
  });
});
