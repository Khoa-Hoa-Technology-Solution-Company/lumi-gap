import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for the Redis-backed cache so the test needs no Redis.
const store = new Map<string, unknown>();
vi.mock("../../../infrastructure/cache.js", () => ({
  cache: {
    get: async (k: string) => (store.has(k) ? store.get(k) : null),
    set: async (k: string, v: unknown) => {
      store.set(k, v);
    },
  },
  hashKey: (parts: unknown) => JSON.stringify(parts),
}));

import { CachingEmbeddingProvider } from "../caching-embedding.provider.js";
import type { EmbeddingProvider } from "../embedding.provider.js";

function fakeInner(vec: number[]): EmbeddingProvider & { embed: ReturnType<typeof vi.fn> } {
  const embed = vi.fn(async () => vec);
  return {
    modelName: "test-model",
    modelVersion: "1",
    dimensions: vec.length,
    embed,
    embedBatch: vi.fn(async () => []),
  };
}

describe("CachingEmbeddingProvider", () => {
  beforeEach(() => store.clear());

  it("embeds once on a miss, then serves repeats from cache (0 extra API calls)", async () => {
    const inner = fakeInner([0.1, 0.2, 0.3]);
    const provider = new CachingEmbeddingProvider(inner);

    const first = await provider.embed("rising trends in NLP");
    const second = await provider.embed("rising trends in NLP");

    expect(first).toEqual([0.1, 0.2, 0.3]);
    expect(second).toEqual([0.1, 0.2, 0.3]);
    expect(inner.embed).toHaveBeenCalledTimes(1); // <-- the whole point: only one API call
  });

  it("keys the cache by text, so a different query still hits the API", async () => {
    const inner = fakeInner([1, 0, 0]);
    const provider = new CachingEmbeddingProvider(inner);

    await provider.embed("query A");
    await provider.embed("query B");

    expect(inner.embed).toHaveBeenCalledTimes(2);
  });

  it("ignores a cached vector whose dimension no longer matches the model", async () => {
    const inner = fakeInner([1, 2, 3, 4]); // model now 4-dim
    const provider = new CachingEmbeddingProvider(inner);
    store.set('emb:test-model:1:4:"q"', [9, 9]); // stale 2-dim entry

    const vec = await provider.embed("q");

    expect(vec).toEqual([1, 2, 3, 4]); // recomputed, not the stale 2-dim
    expect(inner.embed).toHaveBeenCalledTimes(1);
  });
});
