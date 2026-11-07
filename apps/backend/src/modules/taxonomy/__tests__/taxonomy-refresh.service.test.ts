import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ aggregate: vi.fn(), getJobs: vi.fn(), add: vi.fn(), syncAll: vi.fn(), backfillAll: vi.fn() }));

vi.mock("../../../infrastructure/logger.js", () => ({ logger: { info: vi.fn() } }));
vi.mock("../../../infrastructure/queue.js", () => ({ taggingQueue: { getJobs: m.getJobs, add: m.add } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({ researchTopic: { aggregate: m.aggregate } }),
}));
vi.mock("../taxonomy-sync.service.js", () => ({ taxonomySyncService: { syncAll: m.syncAll } }));
vi.mock("../taxonomy-backfill.service.js", () => ({ taxonomyBackfillService: { backfillAll: m.backfillAll } }));

import { taxonomyRefreshService } from "../taxonomy-refresh.service.js";

const SYNCED = new Date("2026-10-30T00:00:00.000Z");
const synced = (value: Date | null) => m.aggregate.mockResolvedValue({ _max: { syncedAt: value } });

beforeEach(() => {
  vi.resetAllMocks();
  m.getJobs.mockResolvedValue([]);
});

describe("ensureLoaded", () => {
  it("queues a load when the catalogue was never loaded", async () => {
    synced(null);
    await taxonomyRefreshService.ensureLoaded();
    expect(m.add).toHaveBeenCalledWith("sync-taxonomy", {});
  });

  it("does nothing once it was loaded", async () => {
    synced(SYNCED);
    await taxonomyRefreshService.ensureLoaded();
    expect(m.add).not.toHaveBeenCalled();
  });

  it("does not queue a second load after a quick restart", async () => {
    synced(null);
    m.getJobs.mockResolvedValue([{ name: "sync-taxonomy" }]);
    await taxonomyRefreshService.ensureLoaded();
    expect(m.add).not.toHaveBeenCalled();
  });
});

describe("requestSync", () => {
  it("is not blocked by other tagging jobs", async () => {
    m.getJobs.mockResolvedValue([{ name: "apply-all-tags" }]);
    await expect(taxonomyRefreshService.requestSync()).resolves.toEqual({ queued: true });
  });
});

describe("status", () => {
  it("reports an empty catalogue", async () => {
    synced(null);
    await expect(taxonomyRefreshService.status()).resolves.toEqual({ loaded: false, running: false, lastSyncedAt: null, lastError: null });
  });

  it("reports a failure newer than the last load", async () => {
    synced(SYNCED);
    m.getJobs.mockImplementation(async (states: string[]) => (states[0] === "failed"
      ? [{ name: "sync-taxonomy", timestamp: SYNCED.getTime() + 1000, failedReason: "OpenAlex down" }]
      : []));
    await expect(taxonomyRefreshService.status()).resolves.toMatchObject({ loaded: true, lastError: "OpenAlex down" });
  });

  it("ignores a failure from before the last successful load", async () => {
    synced(SYNCED);
    m.getJobs.mockImplementation(async (states: string[]) => (states[0] === "failed"
      ? [{ name: "sync-taxonomy", timestamp: SYNCED.getTime() - 1000, failedReason: "old" }]
      : []));
    await expect(taxonomyRefreshService.status()).resolves.toMatchObject({ lastError: null });
  });
});

describe("run", () => {
  it("loads the tree first, then links the stored papers to it", async () => {
    const order: string[] = [];
    m.syncAll.mockImplementation(async () => { order.push("sync"); return { topic: 1 }; });
    m.backfillAll.mockImplementation(async () => { order.push("backfill"); return { topicLinks: 2 }; });
    await expect(taxonomyRefreshService.run()).resolves.toEqual({ synced: { topic: 1 }, backfill: { topicLinks: 2 } });
    expect(order).toEqual(["sync", "backfill"]);
  });
});
