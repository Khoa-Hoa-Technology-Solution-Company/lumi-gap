import { describe, expect, it, vi } from "vitest";
import { createPipelineStatusService } from "../pipeline.service.js";

const now = new Date("2026-07-13T04:00:00.000Z");

function makeDeps(overrides: Partial<Parameters<typeof createPipelineStatusService>[0]> = {}) {
  return {
    now: () => now,
    queueAdapters: [
      {
        name: "report",
        label: "Reports",
        getJobCounts: vi.fn(async () => ({
          waiting: 3,
          active: 1,
          delayed: 0,
          failed: 2,
          completed: 10,
          paused: 0,
        })),
        getOldestPendingJob: vi.fn(async () => ({ id: "wait-1", timestamp: now.getTime() - 90_000 })),
        getFailedJobs: vi.fn(async () => [
          {
            id: "job-1",
            name: "generate-report",
            failedReason: "Gemini quota exceeded",
            attemptsMade: 5,
            opts: { attempts: 5 },
            timestamp: now.getTime(),
          },
        ]),
      },
    ],
    heartbeatRepository: {
      getHeartbeats: vi.fn(async () => [
        {
          workerName: "worker:report",
          queueName: "report",
          hostname: "devbox",
          pid: 1001,
          startedAt: new Date(now.getTime() - 10 * 60_000).toISOString(),
          lastSeenAt: new Date(now.getTime() - 10_000).toISOString(),
        },
        {
          workerName: "worker:gaps",
          queueName: "gaps",
          hostname: "devbox",
          pid: 1002,
          startedAt: new Date(now.getTime() - 20 * 60_000).toISOString(),
          lastSeenAt: new Date(now.getTime() - 10 * 60_000).toISOString(),
        },
      ]),
    },
    corpusRepository: {
      countTotalPapers: vi.fn(async () => 100),
      countActivePapers: vi.fn(async () => 80),
      countAnalyzablePapers: vi.fn(async () => 75),
      countEmbeddedPapers: vi.fn(async () => 60),
      countAiAnalyzedPapers: vi.fn(async () => 30),
    },
    staleRepository: {
      countReportsQueuedBefore: vi.fn(async () => 2),
      countReportsGeneratingBefore: vi.fn(async () => 1),
      countGapsQueuedBefore: vi.fn(async () => 0),
      countGapsAnalyzingBefore: vi.fn(async () => 0),
      countSyncRunningBefore: vi.fn(async () => 0),
    },
    syncRepository: {
      getLatestRun: vi.fn(async () => ({
        id: "sync-1",
        status: "succeeded",
        searchText: "llm education",
        totalFetched: 200,
        totalInserted: 100,
        totalUpdated: 50,
        totalDuplicates: 50,
        totalRejected: 0,
      })),
      hasFreshRunningRun: vi.fn(async () => false),
    },
    ...overrides,
  };
}

describe("pipeline status service", () => {
  it("combines queue, corpus, stale, sync, and recommendation data", async () => {
    const service = createPipelineStatusService(makeDeps());

    const status = await service.getStatus();

    expect(status.generatedAt).toBe("2026-07-13T04:00:00.000Z");
    expect(status.redis.ok).toBe(true);
    expect(status.queues[0]).toMatchObject({
      name: "report",
      waiting: 3,
      active: 1,
      failed: 2,
      isBacklogged: false,
      hasFailures: true,
      oldestPendingJobAgeSeconds: 90,
    });
    expect(status.recentFailedJobs[0]).toMatchObject({
      queue: "report",
      jobId: "job-1",
      name: "generate-report",
      failedReason: "Gemini quota exceeded",
      attemptsMade: 5,
      maxAttempts: 5,
      isExhausted: true,
      timestamp: "2026-07-13T04:00:00.000Z",
    });
    expect(status.workers).toMatchObject({
      expected: 8,
      alive: 1,
      stale: 1,
      missing: 6,
    });
    expect(status.workers.heartbeats[0]).toMatchObject({
      workerName: "worker:report",
      status: "alive",
      ageSeconds: 10,
    });
    expect(status.workers.heartbeats[1]).toMatchObject({
      workerName: "worker:gaps",
      status: "stale",
      ageSeconds: 600,
    });
    expect(status.corpus).toMatchObject({
      totalPapers: 100,
      activePapers: 80,
      analyzablePapers: 75,
      embeddedPapers: 60,
      pendingEmbedding: 15,
      aiAnalyzedPapers: 30,
      pendingAiAnalysis: 45,
      embeddingCoveragePct: 80,
      aiAnalysisCoveragePct: 40,
    });
    expect(status.stale).toEqual({
      reportsQueuedTooLong: 2,
      reportsGeneratingTooLong: 1,
      gapsQueuedTooLong: 0,
      gapsAnalyzingTooLong: 0,
      syncRunningTooLong: 0,
    });
    expect(status.sync.latestRun?.id).toBe("sync-1");
    expect(status.recommendations.map((r) => r.title)).toEqual(
      expect.arrayContaining([
        "Queue has failed jobs",
        "Embedding coverage is below target",
        "Structured AI coverage is still warming up",
        "Stale AI work detected",
      ]),
    );
  });

  it("still returns corpus diagnostics when Redis queue inspection fails", async () => {
    const service = createPipelineStatusService(makeDeps({
      queueAdapters: [
        {
          name: "report",
          label: "Reports",
          getJobCounts: vi.fn(async () => {
            throw new Error("ERR max requests limit exceeded");
          }),
          getOldestPendingJob: vi.fn(async () => null),
          getFailedJobs: vi.fn(async () => []),
        },
      ],
    }));

    const status = await service.getStatus();

    expect(status.redis).toEqual({
      ok: false,
      error: "ERR max requests limit exceeded",
    });
    expect(status.queues).toEqual([]);
    expect(status.corpus.totalPapers).toBe(100);
    expect(status.recommendations[0]).toMatchObject({
      severity: "critical",
      title: "Redis/queue unavailable",
    });
  });

  it("still returns pipeline status when worker heartbeat inspection fails", async () => {
    const service = createPipelineStatusService(makeDeps({
      heartbeatRepository: {
        getHeartbeats: vi.fn(async () => {
          throw new Error("heartbeat redis timeout");
        }),
      },
    }));

    const status = await service.getStatus();

    expect(status.workers).toMatchObject({
      expected: 8,
      alive: 0,
      stale: 0,
      missing: 8,
    });
    expect(status.recommendations.map((r) => r.title)).toContain("Worker heartbeat missing or stale");
  });

  it("does not treat delayed repeatable jobs as high queue latency", async () => {
    const service = createPipelineStatusService(makeDeps({
      queueAdapters: [
        {
          name: "embedding",
          label: "Embeddings",
          getJobCounts: vi.fn(async () => ({
            waiting: 0,
            active: 0,
            delayed: 1,
            failed: 0,
            completed: 0,
            paused: 0,
          })),
          getOldestPendingJob: vi.fn(async () => null),
          getFailedJobs: vi.fn(async () => []),
        },
      ],
      heartbeatRepository: {
        getHeartbeats: vi.fn(async () => [
          {
            workerName: "worker:embedding",
            queueName: "embedding",
            hostname: "devbox",
            pid: 1003,
            startedAt: new Date(now.getTime() - 10 * 60_000).toISOString(),
            lastSeenAt: new Date(now.getTime() - 10_000).toISOString(),
          },
        ]),
      },
    }));

    const status = await service.getStatus();

    expect(status.queues[0]).toMatchObject({
      name: "embedding",
      delayed: 1,
      oldestPendingJobAgeSeconds: null,
    });
    expect(status.recommendations.map((r) => r.title)).not.toContain("Queue latency is high");
  });

  it("does not treat stale running sync runs as active pipeline work", async () => {
    const service = createPipelineStatusService(makeDeps({
      staleRepository: {
        countReportsQueuedBefore: vi.fn(async () => 0),
        countReportsGeneratingBefore: vi.fn(async () => 0),
        countGapsQueuedBefore: vi.fn(async () => 0),
        countGapsAnalyzingBefore: vi.fn(async () => 0),
        countSyncRunningBefore: vi.fn(async () => 1),
      },
      syncRepository: {
        getLatestRun: vi.fn(async () => ({
          id: "sync-stale",
          status: "running",
          searchText: "deep learning healthcare",
          startedAt: "2026-07-13T00:00:00.000Z",
        })),
        hasFreshRunningRun: vi.fn(async () => false),
      },
    }));

    const status = await service.getStatus();

    expect(status.sync.running).toBe(false);
    expect(status.stale.syncRunningTooLong).toBe(1);
    expect(status.recommendations.map((r) => r.title)).toContain("Stale sync run detected");
  });
});
