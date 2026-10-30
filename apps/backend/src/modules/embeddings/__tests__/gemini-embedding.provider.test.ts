import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiEmbeddingProvider } from "../gemini-embedding.provider.js";

const embedContent = vi.hoisted(() => vi.fn());
vi.mock("../../llm/gemini.client.js", () => ({ geminiClient: { models: { embedContent } } }));

const quotaBody = (quotaId: string) => JSON.stringify({
  error: {
    status: "RESOURCE_EXHAUSTED",
    message: "You exceeded your current quota. Quota exceeded for metric: embed_content_free_tier_requests",
    details: [
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId }] },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "35s" },
    ],
  },
});
const rateError = (quotaId: string) => Object.assign(new Error(quotaBody(quotaId)), { status: 429 });
const MINUTE = "EmbedContentRequestsPerMinutePerUserPerProjectPerModel-FreeTier";
const DAY = "EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier";

describe("GeminiEmbeddingProvider rate limits", () => {
  const provider = new GeminiEmbeddingProvider();
  const vector = () => ({ embeddings: [{ values: new Array(provider.dimensions).fill(0.1) }] });

  beforeEach(() => {
    vi.useFakeTimers();
    embedContent.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a batch waits out the per-minute limit for as long as Gemini asks", async () => {
    embedContent.mockRejectedValueOnce(rateError(MINUTE)).mockResolvedValue(vector());

    const batch = provider.embedBatch(["a paper"]);
    await vi.advanceTimersByTimeAsync(35_999);
    expect(embedContent).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(batch).resolves.toHaveLength(1);
    expect(embedContent).toHaveBeenCalledTimes(2);
  });

  it("a single query fails fast on the per-minute limit, so search can fall back", async () => {
    embedContent.mockRejectedValueOnce(rateError(MINUTE));

    await expect(provider.embed("a query")).rejects.toMatchObject({ statusCode: 503 });
    expect(embedContent).toHaveBeenCalledTimes(1);
  });

  it("a batch fails fast on a daily quota, which waiting cannot clear", async () => {
    embedContent.mockRejectedValueOnce(rateError(DAY));

    await expect(provider.embedBatch(["a paper"])).rejects.toMatchObject({ statusCode: 503 });
    expect(embedContent).toHaveBeenCalledTimes(1);
  });
});
