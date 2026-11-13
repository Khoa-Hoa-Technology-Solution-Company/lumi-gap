import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  watchFindMany: vi.fn(), watchFindUnique: vi.fn(), watchUpdate: vi.fn(), watchUpsert: vi.fn(), watchAggregate: vi.fn(), watchCount: vi.fn(),
  providerFindUnique: vi.fn(), runCreate: vi.fn(), runUpdate: vi.fn(), transaction: vi.fn(),
  fetchPage: vi.fn(), ingest: vi.fn(), present: vi.fn(), loadTarget: vi.fn(), followUps: vi.fn(), audit: vi.fn(),
  getJobs: vi.fn(), queueAdd: vi.fn(),
}));

vi.mock("../../../config/env.js", () => ({
  env: { TOPIC_WATCH_DAILY_MAX_PAPERS: 500, EMBED_MAX_PAPERS_PER_RUN: 1000, SYNC_MAX_PAGES_PER_RUN: 10, TOPIC_WATCH_OVERLAP_DAYS: 7, TOPIC_WATCH_DEFAULT_BACKLOG_PAPERS: 1000 },
}));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("../../../infrastructure/queue.js", () => ({ apiSyncQueue: { getJobs: m.getJobs, add: m.queueAdd } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({
    topicWatch: { findMany: m.watchFindMany, findUnique: m.watchFindUnique, update: m.watchUpdate, upsert: m.watchUpsert, aggregate: m.watchAggregate, count: m.watchCount },
    apiProvider: { findUnique: m.providerFindUnique },
    apiSyncRun: { create: m.runCreate, update: m.runUpdate },
    $transaction: m.transaction,
  }),
}));
vi.mock("../../api-sync/providers/openalex.client.js", () => ({
  fetchOpenAlexPage: m.fetchPage,
  OPENALEX_MAX_PER_PAGE: 100,
  isNonRetryableOpenAlexError: (error: unknown) => (error as { fatal?: boolean }).fatal === true,
}));
vi.mock("../../api-sync/sync.service.js", () => ({ ingestOpenAlexWorks: m.ingest }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: m.audit } }));
vi.mock("../../gaps/gap-literature.js", () => ({
  openAlexId: (work: { id?: string }) => work.id ?? "",
  presentInCorpus: m.present,
}));
vi.mock("../../topic-backfill/topic-backfill.queries.js", () => ({
  loadBackfillTarget: m.loadTarget,
  filterOnlyExpression: (query: { filterExpression: string }) => query.filterExpression,
}));
vi.mock("../../topic-backfill/topic-backfill.service.js", () => ({ runImportFollowUps: m.followUps }));

import { topicWatchService } from "../topic-watch.service.js";

const NOW = new Date("2026-11-07T02:00:00.000Z");
const WATCH = {
  id: "w1", targetKind: "topic", targetId: "t1", targetName: "Topic", enabled: true, phase: "backlog",
  dailyMaxNewPapers: null, backlogTargetPapers: 1000, backlogInserted: 0, queryFingerprint: null, queryIndex: 0, cursor: null,
  windowFrom: null, windowStartedOn: null, lastWindowCompletedOn: null, quotaDay: null, insertedOnQuotaDay: 0,
  totalInserted: 0, totalSkipped: 0, lastRunAt: null, lastError: null, createdAt: new Date("2026-11-01T00:00:00.000Z"),
};
const works = (...ids: string[]) => ids.map((id) => ({ id }));
const lastWatchData = () => m.watchUpdate.mock.calls.at(-1)![0].data;

beforeEach(() => {
  vi.resetAllMocks();
  m.providerFindUnique.mockResolvedValue({ id: "p1" });
  m.watchAggregate.mockResolvedValue({ _sum: { insertedOnQuotaDay: 0 } });
  m.loadTarget.mockResolvedValue({ name: "Topic", queries: [{ filterExpression: "q1" }] });
  m.runCreate.mockResolvedValue({ id: "r1" });
  m.present.mockResolvedValue(new Set());
  m.ingest.mockImplementation(async (list: unknown[]) => ({ insertedCount: list.length, updatedCount: 0, rejectedCount: 0 }));
  m.transaction.mockResolvedValue([]);
});

describe("runDaily", () => {
  it("does nothing and calls OpenAlex for nothing when no entry is followed", async () => {
    m.watchFindMany.mockResolvedValue([]);
    await expect(topicWatchService.runDaily(NOW)).resolves.toMatchObject({ watches: 0, inserted: 0 });
    expect(m.fetchPage).not.toHaveBeenCalled();
    expect(m.followUps).not.toHaveBeenCalled();
  });

  it("continues from the stored cursor instead of the first page", async () => {
    m.watchFindMany.mockResolvedValue([{ ...WATCH, cursor: "saved" }]);
    m.fetchPage.mockResolvedValue({ results: [], nextCursor: null });
    await topicWatchService.runDaily(NOW);
    expect(m.fetchPage.mock.calls[0]![0]).toMatchObject({ cursor: "saved", filterExpression: "q1", sort: "cited_by_count:desc" });
  });

  it("imports only works the corpus is missing and stores where it stopped", async () => {
    m.watchFindMany.mockResolvedValue([WATCH]);
    m.present.mockResolvedValue(new Set(["W1"]));
    m.fetchPage.mockResolvedValueOnce({ results: works("W1", "W2"), nextCursor: "c2" }).mockResolvedValue({ results: [], nextCursor: null });
    await topicWatchService.runDaily(NOW);
    expect(m.ingest.mock.calls[0]![0]).toEqual(works("W2"));
    expect(m.watchUpdate.mock.calls[0]![0].data).toMatchObject({ cursor: "c2", backlogInserted: 1, totalSkipped: { increment: 1 }, insertedOnQuotaDay: 1 });
  });

  it("stops at the shared daily budget, keeping its place on the page", async () => {
    m.watchFindMany.mockResolvedValue([{ ...WATCH, cursor: "here" }]);
    m.watchAggregate.mockResolvedValue({ _sum: { insertedOnQuotaDay: 498 } });
    m.fetchPage.mockResolvedValue({ results: works("W1", "W2", "W3"), nextCursor: "next" });
    await expect(topicWatchService.runDaily(NOW)).resolves.toMatchObject({ inserted: 2, pages: 1 });
    expect(m.watchUpdate.mock.calls[0]![0].data).toMatchObject({ cursor: "here" });
  });

  it("does not call OpenAlex when the day's budget is already used", async () => {
    m.watchFindMany.mockResolvedValue([WATCH]);
    m.watchAggregate.mockResolvedValue({ _sum: { insertedOnQuotaDay: 500 } });
    await topicWatchService.runDaily(NOW);
    expect(m.fetchPage).not.toHaveBeenCalled();
  });

  it("never imports more than the embedding limit allows", async () => {
    const { env } = await import("../../../config/env.js");
    const before = env.EMBED_MAX_PAPERS_PER_RUN;
    (env as { EMBED_MAX_PAPERS_PER_RUN: number }).EMBED_MAX_PAPERS_PER_RUN = 1;
    try {
      m.watchFindMany.mockResolvedValue([WATCH]);
      m.fetchPage.mockResolvedValue({ results: works("W1", "W2"), nextCursor: "next" });
      await expect(topicWatchService.runDaily(NOW)).resolves.toMatchObject({ inserted: 1 });
    } finally {
      (env as { EMBED_MAX_PAPERS_PER_RUN: number }).EMBED_MAX_PAPERS_PER_RUN = before;
    }
  });

  it("applies an entry's own cap, counting what it already imported today", async () => {
    m.watchFindMany.mockResolvedValue([{ ...WATCH, dailyMaxNewPapers: 5, quotaDay: new Date("2026-11-07T00:00:00.000Z"), insertedOnQuotaDay: 4 }]);
    m.watchAggregate.mockResolvedValue({ _sum: { insertedOnQuotaDay: 4 } });
    m.fetchPage.mockResolvedValue({ results: works("W1", "W2", "W3"), nextCursor: "next" });
    await expect(topicWatchService.runDaily(NOW)).resolves.toMatchObject({ inserted: 1 });
    expect(m.watchUpdate.mock.calls[0]![0].data).toMatchObject({ insertedOnQuotaDay: 5 });
  });

  it("splits the budget so a large entry cannot use up the day", async () => {
    m.watchFindMany.mockResolvedValue([{ ...WATCH, id: "a" }, { ...WATCH, id: "b" }]);
    m.watchAggregate.mockResolvedValue({ _sum: { insertedOnQuotaDay: 496 } });
    m.fetchPage.mockResolvedValue({ results: works("W1", "W2", "W3", "W4", "W5", "W6"), nextCursor: "next" });
    await topicWatchService.runDaily(NOW);
    expect(m.ingest.mock.calls[0]![0]).toHaveLength(2);
    expect(m.ingest.mock.calls[1]![0]).toHaveLength(2);
  });

  it("shares the page budget too", async () => {
    m.watchFindMany.mockResolvedValue([{ ...WATCH, id: "a" }, { ...WATCH, id: "b" }]);
    m.present.mockImplementation(async (ids: string[]) => new Set(ids));
    m.fetchPage.mockResolvedValue({ results: works("W1"), nextCursor: "next" });
    await expect(topicWatchService.runDaily(NOW)).resolves.toMatchObject({ pages: 10, inserted: 0 });
  });

  it("restarts the position when a tag's rules changed", async () => {
    m.watchFindMany.mockResolvedValue([{ ...WATCH, targetKind: "tag", queryFingerprint: "other", queryIndex: 1, cursor: "old" }]);
    m.fetchPage.mockResolvedValue({ results: [], nextCursor: null });
    await topicWatchService.runDaily(NOW);
    expect(m.fetchPage.mock.calls[0]![0]).toMatchObject({ cursor: "*", filterExpression: "q1" });
  });

  it("reads newly published works when tracking, and is done for the day once caught up", async () => {
    m.watchFindMany.mockResolvedValue([{ ...WATCH, phase: "tracking", lastWindowCompletedOn: new Date("2026-11-06T00:00:00.000Z") }]);
    m.fetchPage.mockResolvedValue({ results: works("W9"), nextCursor: null });
    await expect(topicWatchService.runDaily(NOW)).resolves.toMatchObject({ pages: 1, inserted: 1 });
    expect(m.fetchPage.mock.calls[0]![0]).toMatchObject({
      filterExpression: "q1,from_publication_date:2026-10-30", sort: "publication_date:desc", cursor: "*",
    });
    expect(lastWatchData().lastWindowCompletedOn).toEqual(new Date("2026-11-07T00:00:00.000Z"));
  });

  it("makes no OpenAlex call for an entry already caught up today", async () => {
    m.watchFindMany.mockResolvedValue([{ ...WATCH, phase: "tracking", lastWindowCompletedOn: new Date("2026-11-07T00:00:00.000Z") }]);
    await topicWatchService.runDaily(NOW);
    expect(m.fetchPage).not.toHaveBeenCalled();
  });

  it("one failing entry records its error and the others still run", async () => {
    m.watchFindMany.mockResolvedValue([{ ...WATCH, id: "bad", cursor: "keep" }, { ...WATCH, id: "good" }]);
    m.fetchPage
      .mockRejectedValueOnce(new Error("OpenAlex down"))
      .mockResolvedValueOnce({ results: works("W1"), nextCursor: null })
      // The good entry finished its backlog, so the same run goes on to read its first tracking window.
      .mockResolvedValue({ results: [], nextCursor: null });
    await expect(topicWatchService.runDaily(NOW)).resolves.toMatchObject({ watches: 2, inserted: 1 });
    expect(m.watchUpdate).toHaveBeenCalledWith({ where: { id: "bad" }, data: expect.objectContaining({ lastError: "OpenAlex down" }) });
    expect(m.watchUpdate.mock.calls[0]![0].data).not.toHaveProperty("cursor");
    expect(m.runUpdate).toHaveBeenCalledWith({ where: { id: "r1" }, data: expect.objectContaining({ runStatus: "failed" }) });
  });

  it("drops a cursor OpenAlex refuses, so the next run is not stuck on it", async () => {
    m.watchFindMany.mockResolvedValue([{ ...WATCH, cursor: "expired" }]);
    m.fetchPage.mockRejectedValue(Object.assign(new Error("bad cursor"), { fatal: true }));
    await topicWatchService.runDaily(NOW);
    expect(m.watchUpdate.mock.calls[0]![0].data).toMatchObject({ cursor: null, lastError: "bad cursor" });
  });

  it("records an entry that was removed without calling OpenAlex", async () => {
    m.watchFindMany.mockResolvedValue([WATCH]);
    m.loadTarget.mockResolvedValue(null);
    await topicWatchService.runDaily(NOW);
    expect(m.fetchPage).not.toHaveBeenCalled();
    expect(lastWatchData().lastError).toMatch(/removed or deactivated/);
  });

  it("queues embeddings, counts and re-tagging only when something was imported", async () => {
    m.watchFindMany.mockResolvedValue([WATCH]);
    m.fetchPage.mockResolvedValue({ results: works("W1"), nextCursor: null });
    await topicWatchService.runDaily(NOW);
    expect(m.followUps).toHaveBeenCalledTimes(1);
  });
});

describe("requestRun", () => {
  it("refuses when nothing is followed", async () => {
    m.watchCount.mockResolvedValue(0);
    await expect(topicWatchService.requestRun()).rejects.toMatchObject({ code: "NO_ENABLED_TOPIC_WATCHES" });
  });

  it("does not queue a second run while one is waiting", async () => {
    m.watchCount.mockResolvedValue(1);
    m.getJobs.mockResolvedValue([{ name: "topic-watch-run" }]);
    await expect(topicWatchService.requestRun()).resolves.toEqual({ queued: false });
    expect(m.queueAdd).not.toHaveBeenCalled();
  });

  it("is not blocked by an unrelated manual sync", async () => {
    m.watchCount.mockResolvedValue(1);
    m.getJobs.mockResolvedValue([{ name: "manual-sync" }]);
    await expect(topicWatchService.requestRun()).resolves.toEqual({ queued: true });
    expect(m.queueAdd).toHaveBeenCalledWith("topic-watch-run", {});
  });
});

describe("upsert", () => {
  it("refuses an entry OpenAlex cannot be asked about", async () => {
    m.loadTarget.mockResolvedValue({ name: "x", queries: [] });
    await expect(topicWatchService.upsert("u1", { targetKind: "tag", targetId: "t1" })).rejects.toMatchObject({ code: "WATCH_TARGET_NOT_SEARCHABLE" });
  });

  it("uses the default backlog target for a new watch", async () => {
    m.watchFindUnique.mockResolvedValue(null);
    m.watchUpsert.mockResolvedValue(WATCH);
    await expect(topicWatchService.upsert("u1", { targetKind: "topic", targetId: "t1" })).resolves.toMatchObject({ created: true });
    expect(m.watchUpsert.mock.calls[0]![0].create).toMatchObject({ backlogTargetPapers: 1000, createdById: "u1" });
  });

  it("turning an existing watch back on keeps its position", async () => {
    m.watchFindUnique.mockResolvedValue({ id: "w1" });
    m.watchUpsert.mockResolvedValue(WATCH);
    await expect(topicWatchService.upsert("u1", { targetKind: "topic", targetId: "t1" })).resolves.toMatchObject({ created: false });
    const update = m.watchUpsert.mock.calls[0]![0].update;
    expect(update.enabled).toBe(true);
    expect(update).not.toHaveProperty("cursor");
  });
});
