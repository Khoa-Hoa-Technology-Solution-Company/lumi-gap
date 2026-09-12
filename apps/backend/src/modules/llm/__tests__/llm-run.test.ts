import { describe, expect, it, vi } from "vitest";
import { buildLlmCacheKey, cachedGenerate, routeLlmModel } from "../llm.run.js";

vi.mock("../../../infrastructure/cache.js", () => {
  const store = new Map<string, unknown>();
  return {
    LLM_CACHE_TTL_SECONDS: 604800,
    hashKey: (x: unknown) => JSON.stringify(x),
    cache: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
      del: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    },
  };
});

describe("llm.run", () => {
  it("routes cheap tasks to fast model and deep tasks to deep model", () => {
    expect(routeLlmModel("judge")).toContain("flash");
    expect(routeLlmModel("report")).toContain("flash");
    expect(routeLlmModel("chat", "custom")).toBe("custom");
  });

  it("builds stable cache keys from task, version, model and key parts", () => {
    expect(
      buildLlmCacheKey({ task: "chat", promptVersion: "v1", model: "m", keyParts: { q: "x" }, inputHash: "h1" }),
    ).toBe(
      buildLlmCacheKey({ task: "chat", promptVersion: "v1", model: "m", keyParts: { q: "x" }, inputHash: "h1" }),
    );
    expect(
      buildLlmCacheKey({ task: "chat", promptVersion: "v2", model: "m", keyParts: { q: "x" }, inputHash: "h1" }),
    ).not.toBe(
      buildLlmCacheKey({ task: "chat", promptVersion: "v1", model: "m", keyParts: { q: "x" }, inputHash: "h1" }),
    );
    expect(
      buildLlmCacheKey({ task: "chat", promptVersion: "v1", model: "m", keyParts: { q: "x" }, inputHash: "h2" }),
    ).not.toBe(
      buildLlmCacheKey({ task: "chat", promptVersion: "v1", model: "m", keyParts: { q: "x" }, inputHash: "h1" }),
    );
  });

  it("caches generated output", async () => {
    const generate = vi.fn(async () => ({ ok: true }));
    const args = {
      task: "judge" as const,
      promptVersion: "v1",
      keyParts: { id: "a" },
      generate,
    };
    await expect(cachedGenerate(args)).resolves.toEqual({ ok: true });
    await expect(cachedGenerate(args)).resolves.toEqual({ ok: true });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("awaits cache-miss work before generation and skips it on a cache hit", async () => {
    const order: string[] = [];
    const onCacheMiss = vi.fn(async () => {
      await Promise.resolve();
      order.push("charged");
    });
    const generate = vi.fn(async () => {
      order.push("generated");
      return { ok: true };
    });
    const args = {
      task: "rerank" as const,
      promptVersion: "v2",
      keyParts: { id: "cache-miss-hook" },
      onCacheMiss,
      generate,
    };

    await expect(cachedGenerate(args)).resolves.toEqual({ ok: true });
    await expect(cachedGenerate(args)).resolves.toEqual({ ok: true });

    expect(order).toEqual(["charged", "generated"]);
    expect(onCacheMiss).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("does not cache generated output that fails validation", async () => {
    const generate = vi.fn(async () => ({ gaps: [] }));
    const args = {
      task: "gap" as const,
      promptVersion: "v1",
      keyParts: { id: "bad-generate" },
      generate,
      validate: (output: { gaps: unknown[] }) => {
        if (output.gaps.length === 0) throw new Error("empty gaps");
        return output;
      },
    };

    await expect(cachedGenerate(args)).rejects.toThrow("empty gaps");
    await expect(cachedGenerate(args)).rejects.toThrow("empty gaps");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("evicts invalid cached output and regenerates", async () => {
    let calls = 0;
    const args = {
      task: "directions" as const,
      promptVersion: "v1",
      keyParts: { id: "poisoned-cache" },
      generate: vi.fn(async () => {
        calls++;
        return { directions: calls === 1 ? [] : ["ok"] };
      }),
      validate: (output: { directions: string[] }) => {
        if (output.directions.length === 0) throw new Error("empty directions");
        return output;
      },
    };

    await expect(cachedGenerate({ ...args, validate: undefined })).resolves.toEqual({ directions: [] });
    await expect(cachedGenerate(args)).resolves.toEqual({ directions: ["ok"] });
    expect(args.generate).toHaveBeenCalledTimes(2);
  });
});
