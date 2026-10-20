import { beforeEach, describe, expect, it, vi } from "vitest";
import { ABSTRACT, PROJECT_ID, makeJudgeOutput, makePlanRow, makeProjectOutput, makeProjectRow } from "./quality.fixture.js";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  db: {
    paper: { findUnique: vi.fn(), findMany: vi.fn() },
    report: { findUnique: vi.fn() },
    researchGap: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    userRating: { groupBy: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    qualityEvaluation: { findFirst: vi.fn(), findMany: vi.fn() },
    qualityProjectAssessment: { findUnique: vi.fn() },
    researchPlan: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  tx: { $queryRaw: vi.fn(), qualityEvaluation: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() }, qualityProjectAssessment: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() } },
  projectAccess: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.db }));
vi.mock("../../../config/env.js", () => ({ env: { GEMINI_API_KEY: "test", GEMINI_MODEL_FAST: "test-model" } }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: mocks.logger }));
vi.mock("../../auth/points.service.js", () => ({ syncUserPoints: vi.fn() }));
vi.mock("../../llm/llm.run.js", () => ({ cachedGenerateJSON: mocks.generate }));
vi.mock("../../authorization/project-membership.js", () => ({ requireCurrentProjectMembership: mocks.projectAccess }));
import { LlmQuotaError } from "../../llm/gemini.client.js";
import { qualityService } from "../quality.service.js";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.paper.findUnique.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001", title: "Evidence", abstractText: ABSTRACT, dataStatus: "active" });
  mocks.db.user.findUnique.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002", role: "admin" });
  mocks.db.qualityEvaluation.findFirst.mockResolvedValue(null);
  mocks.db.$transaction.mockImplementation((run) => run(mocks.tx));
  mocks.tx.qualityEvaluation.findFirst.mockResolvedValue(null);
  mocks.tx.qualityEvaluation.create.mockImplementation(({ data }) => ({ id: "saved", paperId: null, reportId: null, gapId: null, ...data, createdAt: new Date(), updatedAt: new Date() }));
  mocks.tx.qualityEvaluation.update.mockImplementation(({ data }) => ({ id: "saved", paperId: "00000000-0000-4000-8000-000000000001", reportId: null, gapId: null, ...data, createdAt: new Date(), updatedAt: new Date() }));
  mocks.db.qualityProjectAssessment.findUnique.mockResolvedValue(null);
  mocks.db.researchPlan.findUnique.mockResolvedValue(makePlanRow());
  mocks.projectAccess.mockResolvedValue(makeProjectRow());
  mocks.tx.qualityProjectAssessment.findUnique.mockResolvedValue(null);
  mocks.tx.qualityProjectAssessment.create.mockImplementation(({ data }) => ({ id: "project-saved", ...data, createdAt: new Date(), updatedAt: new Date() }));
});

describe("structured evaluation lifecycle", () => {
  const actor = "00000000-0000-4000-8000-000000000002";
  const request = { targetKind: "paper" as const, targetId: "00000000-0000-4000-8000-000000000001" };
  const legacy = () => ({ id: "saved", paperId: request.targetId, reportId: null, gapId: null, relevance: 3, groundedness: 3, completeness: 3, overall: 3, rationale: "Short old note", model: "old-model", promptVersion: "quality-v1", assessment: null, inputFingerprint: null, createdAt: new Date(), updatedAt: new Date() });
  it("persists a complete assessment, source fingerprint and decimal average", async () => {
    mocks.generate.mockResolvedValue(makeJudgeOutput());
    const result = await qualityService.evaluate(actor, { ...request, language: "vi" });
    expect(result).toMatchObject({ overall: 3.3, freshness: "current", details: { rubric: { language: "vi" } } });
    expect(mocks.tx.qualityEvaluation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ overall: 3.3, assessment: expect.objectContaining({ actions: expect.any(Array) }), inputFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }) });
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ inputHash: expect.stringMatching(/^[a-f0-9]{64}$/), keyParts: expect.objectContaining({ language: "vi" }) }));
  });
  it("reuses a current structured evaluation but regenerates it when source content changes", async () => {
    mocks.generate.mockResolvedValue(makeJudgeOutput());
    await qualityService.evaluate(actor, request);
    const saved = mocks.tx.qualityEvaluation.create.mock.results[0]!.value;
    mocks.db.qualityEvaluation.findFirst.mockResolvedValue(saved);
    mocks.generate.mockClear();
    expect((await qualityService.evaluate(actor, request)).freshness).toBe("current");
    expect(mocks.generate).not.toHaveBeenCalled();
    mocks.db.paper.findUnique.mockResolvedValue({ id: request.targetId, title: "Evidence", abstractText: `${ABSTRACT} Additional context.`, dataStatus: "active" });
    await qualityService.evaluate(actor, request);
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it("upgrades a legacy result instead of pretending it has evidence", async () => {
    mocks.db.qualityEvaluation.findFirst.mockResolvedValue(legacy());
    const prepared = await qualityService.prepareEvaluation(actor, request);
    expect(prepared.current).toMatchObject({ freshness: "legacy", details: undefined });
    mocks.generate.mockResolvedValue(makeJudgeOutput());
    mocks.tx.qualityEvaluation.findFirst.mockResolvedValue(legacy());
    await qualityService.evaluate(actor, request);
    expect(mocks.tx.qualityEvaluation.update).toHaveBeenCalled();
    expect(mocks.tx.qualityEvaluation.create).not.toHaveBeenCalled();
  });
  it.each(["report", "gap"] as const)("checks access to a private %s before reading its cached evaluation", async (kind) => {
    mocks.db.report.findUnique.mockResolvedValue({ id: request.targetId, userId: "someone-else", projectId: null });
    mocks.db.researchGap.findUnique.mockResolvedValue({ id: request.targetId, userId: "someone-else", projectId: null });
    await expect(qualityService.evaluate(actor, { ...request, targetKind: kind })).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.db.qualityEvaluation.findFirst).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("does not serve a cached evaluation of an archived paper", async () => {
    mocks.db.paper.findUnique.mockResolvedValue({ id: request.targetId, dataStatus: "archived" });
    await expect(qualityService.evaluate(actor, request)).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.db.qualityEvaluation.findFirst).not.toHaveBeenCalled();
  });
  it("requires current project membership even for the historical artifact author", async () => {
    mocks.db.report.findUnique.mockResolvedValue({ id: request.targetId, userId: actor, projectId: "project" });
    mocks.projectAccess.mockRejectedValue({ statusCode: 404 });
    await expect(qualityService.prepareEvaluation(actor, { ...request, targetKind: "report" })).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.db.qualityEvaluation.findFirst).not.toHaveBeenCalled();
  });
  it("never saves an unverified quote and withdraws the score it supported", async () => {
    const raw = makeJudgeOutput(); raw.criteria[0]!.evidence[0]!.quote = "An invented randomized double-blind design was used.";
    mocks.generate.mockResolvedValue(raw);
    const result = await qualityService.evaluate(actor, request);
    expect(result).toMatchObject({ relevance: null, groundedness: 3, overall: null });
    expect(JSON.stringify(mocks.tx.qualityEvaluation.create.mock.calls[0]![0])).not.toContain("invented randomized");
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it("repairs a structurally invalid answer once, bypassing the cache", async () => {
    mocks.generate.mockResolvedValueOnce({ summary: "Too short" }).mockResolvedValueOnce(makeJudgeOutput());
    await expect(qualityService.evaluate(actor, request)).resolves.toMatchObject({ overall: 3.3 });
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[0]![0]).toMatchObject({ bypassCache: false });
    expect(mocks.generate.mock.calls[1]![0]).toMatchObject({ bypassCache: true, prompt: expect.stringContaining("REPAIR") });
  });
  it("gives up after a single failed repair", async () => {
    mocks.generate.mockResolvedValue({ summary: "Too short" });
    await expect(qualityService.evaluate(actor, request)).rejects.toMatchObject({ statusCode: 502, code: "AI_EVALUATION_INVALID_OUTPUT" });
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    const logged = JSON.stringify(mocks.logger.warn.mock.calls);
    expect(logged).toContain("criteria");
    expect(logged).not.toContain("SOURCES");
  });
  it("does not retry provider failures that are not about the answer's shape", async () => {
    mocks.generate.mockRejectedValue(new Error("network down"));
    await expect(qualityService.evaluate(actor, request)).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it("stores the v3 reading card for papers", async () => {
    mocks.generate.mockResolvedValue(makeJudgeOutput());
    const result = await qualityService.evaluate(actor, request);
    expect(result.details?.facts?.studyDesign).toMatchObject({ status: "reported" });
    expect(result.details?.guidance?.audience).toBe("newcomer");
    expect(result.details?.rubric.version).toBe("quality-v3");
  });
  it("excludes unscored evaluations from AI-human agreement statistics", async () => {
    mocks.db.qualityEvaluation.findMany.mockResolvedValue([{ ...legacy(), overall: null }]);
    mocks.db.userRating.findMany.mockResolvedValue([{ paperId: request.targetId, reportId: null, gapId: null, stars: 4 }]);
    expect((await qualityService.agreement()).sampleSize).toBe(0);
  });
});

describe("quality evaluation provider errors", () => {
  const evaluate = () => qualityService.evaluate("00000000-0000-4000-8000-000000000002", {
    targetKind: "paper", targetId: "00000000-0000-4000-8000-000000000001", force: true,
  });

  it("preserves actionable quota errors without saving an evaluation", async () => {
    const error = new LlmQuotaError("Gemini quota exhausted. Configure a project with available quota.");
    mocks.generate.mockRejectedValue(error);
    await expect(evaluate()).rejects.toMatchObject({ statusCode: 429, code: "AI_EVALUATION_QUOTA", message: error.message });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("keeps other provider internals out of the HTTP error", async () => {
    mocks.generate.mockRejectedValue(new Error("Private provider diagnostics"));
    await expect(evaluate()).rejects.toMatchObject({ statusCode: 503, code: "AI_EVALUATION_UNAVAILABLE", message: "AI evaluation is temporarily unavailable. Please try again." });
    expect(JSON.stringify(mocks.logger.warn.mock.calls)).toContain("Private provider diagnostics");
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});

describe("project-mode evaluations", () => {
  const actor = "00000000-0000-4000-8000-000000000002";
  const paperId = "00000000-0000-4000-8000-000000000001";
  const request = { targetKind: "paper" as const, targetId: paperId, projectId: PROJECT_ID, language: "vi" as const };
  let reference: unknown = null;
  beforeEach(() => {
    reference = null;
    mocks.db.userRating.groupBy.mockResolvedValue([]); mocks.db.userRating.findFirst.mockResolvedValue(null); mocks.db.userRating.findMany.mockResolvedValue([]); mocks.db.user.findMany.mockResolvedValue([]);
    mocks.db.qualityEvaluation.findFirst.mockImplementation(async () => reference);
    mocks.tx.qualityEvaluation.create.mockImplementation(({ data }) => (reference = { id: "saved", paperId, reportId: null, gapId: null, ...data, createdAt: new Date(), updatedAt: new Date() }));
    mocks.generate.mockImplementation(async (args: { keyParts: { projectId?: string } }) => (args.keyParts.projectId ? makeProjectOutput() : makeJudgeOutput()));
  });

  it("checks project membership before reading the reference or any project assessment", async () => {
    mocks.projectAccess.mockRejectedValue(Object.assign(new Error("Project not found"), { statusCode: 404 }));
    await expect(qualityService.evaluateProject(actor, request)).rejects.toMatchObject({ statusCode: 404 });
    await expect(qualityService.prepareProjectEvaluation(actor, request)).rejects.toMatchObject({ statusCode: 404 });
    await expect(qualityService.view(actor, "paper", paperId, { projectId: PROJECT_ID })).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.db.qualityEvaluation.findFirst).not.toHaveBeenCalled();
    expect(mocks.db.qualityProjectAssessment.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.paper.findUnique).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("computes a missing reference assessment first, then makes one project call", async () => {
    const result = await qualityService.evaluateProject(actor, request);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[0]![0].keyParts).not.toHaveProperty("projectId");
    expect(mocks.generate.mock.calls[1]![0]).toMatchObject({ keyParts: { projectId: PROJECT_ID, targetId: paperId, language: "vi" }, inputHash: expect.stringMatching(/^[a-f0-9]{64}$/), promptVersion: "quality-project-v1.1" });
    expect(mocks.generate.mock.calls[1]![0].prompt).toContain("Comparison of two feedback methods");
    expect(mocks.tx.qualityProjectAssessment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ projectId: PROJECT_ID, paperId, language: "vi", inputFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }) });
    expect(result).toMatchObject({ targetKind: "paper", targetId: paperId, projectId: PROJECT_ID, freshness: "current", assessment: { verdict: "core", project: { id: PROJECT_ID } } });
  });
  it("reuses a current reference and a current project assessment", async () => {
    await qualityService.evaluateProject(actor, request);
    const saved = mocks.tx.qualityProjectAssessment.create.mock.results[0]!.value;
    mocks.generate.mockClear();
    mocks.db.qualityProjectAssessment.findUnique.mockResolvedValue(saved);
    expect((await qualityService.evaluateProject(actor, request)).freshness).toBe("current");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect((await qualityService.view(actor, "paper", paperId, { projectId: PROJECT_ID, language: "vi" })).projectEvaluation).toMatchObject({ freshness: "current" });
  });
  it("marks the project assessment outdated when the plan changes and regenerates only the project call", async () => {
    await qualityService.evaluateProject(actor, request);
    mocks.db.qualityProjectAssessment.findUnique.mockResolvedValue(mocks.tx.qualityProjectAssessment.create.mock.results[0]!.value);
    mocks.db.researchPlan.findUnique.mockResolvedValue({ ...makePlanRow(), version: 4, questions: [{ id: "q", text: "Does feedback timing matter?" }] });
    expect((await qualityService.view(actor, "paper", paperId, { projectId: PROJECT_ID, language: "vi" })).projectEvaluation?.freshness).toBe("outdated");
    mocks.generate.mockClear();
    await qualityService.evaluateProject(actor, request);
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.generate.mock.calls[0]![0].keyParts).toMatchObject({ projectId: PROJECT_ID });
  });
  it("scopes the project cache key by project", async () => {
    await qualityService.evaluateProject(actor, request);
    const first = mocks.generate.mock.calls[1]![0];
    mocks.generate.mockClear();
    const other = "00000000-0000-4000-8000-0000000000cc";
    mocks.projectAccess.mockResolvedValue({ ...makeProjectRow(), id: other });
    await qualityService.evaluateProject(actor, { ...request, projectId: other });
    const second = mocks.generate.mock.calls[0]![0];
    expect(second.keyParts.projectId).toBe(other);
    expect(second.inputHash).not.toBe(first.inputHash);
  });
  it("rejects project mode for reports and gaps", async () => {
    await expect(qualityService.view(actor, "report", paperId, { projectId: PROJECT_ID })).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.projectAccess).not.toHaveBeenCalled();
  });
});

describe("coded generation failures and thin answers", () => {
  const actor = "00000000-0000-4000-8000-000000000002";
  const request = { targetKind: "paper" as const, targetId: "00000000-0000-4000-8000-000000000001" };
  it("reports provider overload as busy", async () => {
    mocks.generate.mockRejectedValue(Object.assign(new Error("The model is overloaded"), { status: 503 }));
    await expect(qualityService.evaluate(actor, request)).rejects.toMatchObject({ code: "AI_EVALUATION_BUSY" });
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it("keeps a thin answer without a repair call", async () => {
    const thin = makeJudgeOutput(); thin.actions = thin.actions.slice(0, 1); thin.researchQuestions = thin.researchQuestions.slice(0, 1);
    mocks.generate.mockResolvedValue(thin);
    const result = await qualityService.evaluate(actor, request);
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(result.details?.actions).toHaveLength(1);
  });
  it("saves the real model's answer that omitted criterionId instead of failing", async () => {
    const raw = makeJudgeOutput() as unknown as Record<string, any>;
    delete raw.actions[1].criterionId; delete raw.researchQuestions[1].criterionId;
    mocks.generate.mockResolvedValue(raw);
    await expect(qualityService.evaluate(actor, request)).resolves.toMatchObject({ overall: 3.3 });
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it("tells the repair call exactly which fields were wrong", async () => {
    const broken = makeJudgeOutput() as unknown as Record<string, any>;
    broken.criteria = broken.criteria.slice(0, 2);
    mocks.generate.mockResolvedValueOnce(broken).mockResolvedValueOnce(makeJudgeOutput());
    await qualityService.evaluate(actor, request);
    expect(mocks.generate.mock.calls[1]![0].prompt).toMatch(/REPAIR: .*criteria: Array must contain exactly 3/);
  });
});
