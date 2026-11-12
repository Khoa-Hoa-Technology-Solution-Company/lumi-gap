import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ updateMany: vi.fn(), audit: vi.fn() }));

vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({ apiSyncRun: { updateMany: m.updateMany } }) }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { warn: vi.fn() } }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: m.audit } }));

import { failStaleSyncRuns, failStaleSyncRunsSafely, INTERRUPTED_RUN_MESSAGE } from "../stale-runs.js";

const NOW = new Date("2026-11-12T10:00:00.000Z");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("failStaleSyncRuns", () => {
  it("closes only running runs that started more than two hours ago", async () => {
    m.updateMany.mockResolvedValue({ count: 1 });
    await expect(failStaleSyncRuns(NOW)).resolves.toBe(1);
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { runStatus: "running", startedAt: { lt: new Date("2026-11-12T08:00:00.000Z") } },
      data: { runStatus: "failed", errorMessage: INTERRUPTED_RUN_MESSAGE, finishedAt: NOW },
    });
    expect(m.audit).toHaveBeenCalledWith("sync.interrupted_runs_closed", expect.objectContaining({ details: expect.objectContaining({ count: 1 }) }));
  });

  it("writes no audit entry when nothing was stuck", async () => {
    m.updateMany.mockResolvedValue({ count: 0 });
    await expect(failStaleSyncRuns(NOW)).resolves.toBe(0);
    expect(m.audit).not.toHaveBeenCalled();
  });
});

describe("failStaleSyncRunsSafely", () => {
  it("never throws, so a sync still runs when the cleanup fails", async () => {
    m.updateMany.mockRejectedValue(new Error("db down"));
    await expect(failStaleSyncRunsSafely(NOW)).resolves.toBe(0);
  });
});
