import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { models = { generateContent: generate }; },
}));
vi.mock("../../../config/env.js", () => ({ env: { GEMINI_API_KEY: "test", GEMINI_MODEL_FAST: "test-model" } }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
import { generateText, LlmQuotaError, LlmTruncationError } from "../gemini.client.js";

beforeEach(() => { generate.mockReset(); });
afterEach(() => vi.useRealTimers());

describe("Gemini generation recovery", () => {
  it("recovers from temporary overload with bounded retries", async () => {
    vi.useFakeTimers();
    generate.mockRejectedValueOnce({ status: 503 }).mockRejectedValueOnce({ status: 503 })
      .mockResolvedValue({ text: "Recovered", candidates: [{ finishReason: "STOP" }] });
    const assertion = expect(generateText("Evidence")).resolves.toBe("Recovered");
    await vi.runAllTimersAsync();
    await assertion;
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("stops after three unsuccessful attempts", async () => {
    vi.useFakeTimers();
    const error = { status: 503 };
    generate.mockRejectedValue(error);
    const assertion = expect(generateText("Evidence")).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("honors the provider's retry delay for a per-minute quota", async () => {
    vi.useFakeTimers();
    generate.mockRejectedValueOnce({ status: 429, message: JSON.stringify({ error: { details: [
      { violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", quotaValue: "5" }] },
      { retryDelay: "20s" },
    ] } }) }).mockResolvedValue({ text: "Recovered", candidates: [{ finishReason: "STOP" }] });
    const result = generateText("Evidence");
    const assertion = expect(result).resolves.toBe("Recovered");
    await vi.advanceTimersByTimeAsync(20000);
    expect(generate).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it.each([
    { status: 404, message: "Model no longer available" },
    { status: 429, message: "You exceeded your current quota" },
  ])("does not retry permanent model or quota errors ($status)", async (error) => {
    generate.mockRejectedValue(error);
    await expect(generateText("Evidence")).rejects.toBe(error);
    expect(generate).toHaveBeenCalledOnce();
  });

  it.each([
    { quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "20" },
    { quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", quotaValue: "0" },
  ])("surfaces exhausted quota without SDK JSON or worker retries ($quotaValue)", async (violation) => {
    generate.mockRejectedValue({ status: 429, message: JSON.stringify({ error: { details: [
      { violations: [violation] }, { retryDelay: "52783s" },
    ] } }) });
    const error = await generateText("Evidence").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(LlmQuotaError);
    expect(error).toMatchObject({ statusCode: 429, code: "LLM_QUOTA_EXHAUSTED", nonRetryable: true });
    expect((error as Error).message).toContain("project with available quota");
    expect((error as Error).message).not.toContain("violations");
    expect(generate).toHaveBeenCalledOnce();
  });

  it("keeps truncated content non-retryable", async () => {
    generate.mockResolvedValue({ text: '{"partial":', candidates: [{ finishReason: "MAX_TOKENS" }] });
    await expect(generateText("Evidence")).rejects.toBeInstanceOf(LlmTruncationError);
    expect(generate).toHaveBeenCalledOnce();
  });
});
