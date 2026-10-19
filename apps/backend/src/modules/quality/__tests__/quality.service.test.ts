import { beforeEach, describe, expect, it, vi } from "vitest";
import { ABSTRACT, makeJudgeOutput } from "./quality.fixture.js";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  db: {
    paper: { findUnique: vi.fn(), findMany: vi.fn() },
    report: { findUnique: vi.fn() },
    researchGap: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    userRating: { groupBy: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    qualityEvaluation: { findFirst: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  tx: { $queryRaw: vi.fn(), qualityEvaluation: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() } },
  projectAccess: vi.fn(),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.db }));
vi.mock("../../../config/env.js", () => ({ env: { GEMINI_API_KEY: "test", GEMINI_MODEL_FAST: "test-model" } }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
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
  it("refuses to save unverified model quotes", async () => {
    const raw = makeJudgeOutput(); raw.criteria[0]!.evidence[0]!.quote = "An invented randomized double-blind design was used.";
    mocks.generate.mockResolvedValue(raw);
    await expect(qualityService.evaluate(actor, request)).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
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
    await expect(evaluate()).rejects.toBe(error);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("keeps other provider internals out of the HTTP error", async () => {
    mocks.generate.mockRejectedValue(new Error("Private provider diagnostics"));
    await expect(evaluate()).rejects.toMatchObject({ statusCode: 503, message: "AI evaluation is temporarily unavailable. Please try again." });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});
