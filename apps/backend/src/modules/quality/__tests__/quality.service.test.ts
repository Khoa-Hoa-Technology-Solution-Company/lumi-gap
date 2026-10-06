import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  db: {
    paper: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    qualityEvaluation: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.db }));
vi.mock("../../../config/env.js", () => ({ env: { GEMINI_API_KEY: "test", GEMINI_MODEL_FAST: "test-model" } }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../auth/points.service.js", () => ({ syncUserPoints: vi.fn() }));
vi.mock("../../llm/llm.run.js", () => ({ cachedGenerateJSON: mocks.generate }));
import { LlmQuotaError } from "../../llm/gemini.client.js";
import { qualityService } from "../quality.service.js";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.paper.findUnique.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001", title: "Evidence", abstractText: "Research evidence", dataStatus: "active" });
  mocks.db.user.findUnique.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002", role: "admin" });
  mocks.db.qualityEvaluation.findFirst.mockResolvedValue(null);
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
