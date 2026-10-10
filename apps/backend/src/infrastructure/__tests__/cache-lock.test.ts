import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const failing = { value: false };

vi.mock("../redis.js", () => ({
  redis: {
    async set(key: string, value: string, _ex: string, _ttl: number, nx: string) {
      if (failing.value) throw new Error("redis down");
      if (nx === "NX" && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async del(key: string) {
      store.delete(key);
      return 1;
    },
  },
}));
vi.mock("../logger.js", () => ({ logger: { warn: vi.fn() } }));

const { acquireLock } = await import("../cache.js");

describe("acquireLock", () => {
  beforeEach(() => {
    store.clear();
    failing.value = false;
  });

  it("lets one holder in until it releases", async () => {
    const release = await acquireLock("lock:test", 60);
    expect(release).toBeTypeOf("function");
    expect(await acquireLock("lock:test", 60)).toBeNull();

    await release!();
    expect(await acquireLock("lock:test", 60)).toBeTypeOf("function");
  });

  it("does not release a lock that expired and was taken by someone else", async () => {
    const release = await acquireLock("lock:test", 60);
    store.set("lock:test", "another-holder");

    await release!();
    expect(store.get("lock:test")).toBe("another-holder");
  });

  it("fails open when Redis is unavailable", async () => {
    failing.value = true;
    const release = await acquireLock("lock:test", 60);

    expect(release).toBeTypeOf("function");
    await expect(release!()).resolves.toBeUndefined();
  });
});
