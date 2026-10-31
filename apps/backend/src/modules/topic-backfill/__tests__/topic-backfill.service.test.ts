import { UnrecoverableError } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { topicBackfillService } from "../topic-backfill.service.js";

const m = vi.hoisted(() => ({
  runCreate: vi.fn(), runFindFirst: vi.fn(), runFindMany: vi.fn(), runFindUnique: vi.fn(),
  runUpdate: vi.fn(), runUpdateMany: vi.fn(), runCount: vi.fn(),
  providerFind: vi.fn(),
  loadTarget: vi.fn(),
  fetchPage: vi.fn(), ingest: vi.fn(), present: vi.fn(),
  refreshCounts: vi.fn(), embeddingAdd: vi.fn(), analysisAdd: vi.fn(), backfillAdd: vi.fn(), hasLiveJob: vi.fn(),
  enqueueApplyTag: vi.fn(), enqueueApplyAll: vi.fn(),
  audit: vi.fn(), warn: vi.fn(),
  env: {
    TOPIC_BACKFILL_SEARCH_ENABLED: true,
    TOPIC_BACKFILL_THIN_MAX_PAPERS: 30,
    TOPIC_BACKFILL_DEFAULT_NEW_PAPERS: 100,
    TOPIC_BACKFILL_MAX_NEW_PAPERS: 1000,
    TOPIC_BACKFILL_MAX_PAGES: 10,
    TOPIC_BACKFILL_COOLDOWN_HOURS: 24,
    TOPIC_BACKFILL_DAILY_MAX_PAPERS: 2000,
  },
}));

vi.mock("../../../config/env.js", () => ({ env: m.env }));
vi.mock("../../../infrastructure/logger.js", () => ({
  logger: { info: vi.fn(), warn: m.warn, error: vi.fn() },
}));
vi.mock("../../../infrastructure/queue.js", () => ({
  embeddingQueue: { add: m.embeddingAdd },
  paperAnalysisQueue: { add: m.analysisAdd },
  topicBackfillQueue: { add: m.backfillAdd },
  hasLiveJob: m.hasLiveJob,
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({
    topicBackfillRun: {
      create: m.runCreate, findFirst: m.runFindFirst, findMany: m.runFindMany, findUnique: m.runFindUnique,
      update: m.runUpdate, updateMany: m.runUpdateMany, count: m.runCount,
    },
    apiProvider: { findUnique: m.providerFind },
  }),
}));
vi.mock("../topic-backfill.queries.js", () => ({ loadBackfillTarget: m.loadTarget }));
vi.mock("../../api-sync/providers/openalex.client.js", () => ({ fetchOpenAlexPage: m.fetchPage, OPENALEX_MAX_PER_PAGE: 100 }));
vi.mock("../../api-sync/sync.service.js", () => ({ ingestOpenAlexWorks: m.ingest }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: m.audit } }));
vi.mock("../../gaps/gap-literature.js", () => ({
  openAlexId: (work: { id?: string }) => (work.id ?? "").replace("https://openalex.org/", ""),
  presentInCorpus: m.present,
}));
vi.mock("../../tags/tag-assignment.service.js", () => ({
  tagAssignmentService: { enqueueApplyTag: m.enqueueApplyTag, enqueueApplyAll: m.enqueueApplyAll },
}));
vi.mock("../../taxonomy/taxonomy-backfill.service.js", () => ({ taxonomyBackfillService: { refreshCounts: m.refreshCounts } }));

const USER = "00000000-0000-4000-8000-0000000000cc";
const TARGET = "00000000-0000-4000-8000-000000000001";
const RUN = "00000000-0000-4000-8000-0000000000f1";
const now = new Date("2026-10-30T12:00:00.000Z");

const query = (name: string) => ({ filterExpression: `topics.id:${name},has_abstract:true`, sort: "cited_by_count:desc" });
const target = (over: Record<string, unknown> = {}) => ({
  kind: "topic", id: TARGET, name: "Deep learning", paperCount: 5, queries: [query("T1")], ...over,
});
const runRow = (over: Record<string, unknown> = {}) => ({
  id: RUN, targetKind: "topic", targetId: TARGET, targetName: "Deep learning", state: "queued", trigger: "search",
  requestedById: USER, maxNewPapers: 100, paperCountBefore: 5, fetchedCount: 0, insertedCount: 0, skippedCount: 0,
  rejectedCount: 0, pagesFetched: 0, errorMessage: null, startedAt: null, finishedAt: null,
  createdAt: now, updatedAt: now, ...over,
});
const work = (id: string) => ({ id: `https://openalex.org/${id}` });
const page = (ids: string[], nextCursor: string | null = "next") => ({ results: ids.map(work), nextCursor, total: 999 });
const p2002 = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
const insertResult = (n: number, over: Record<string, unknown> = {}) => ({
  records: [], fetchedCount: n, insertedCount: n, updatedCount: 0, rejectedCount: 0, rejectedWorks: [], ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
  Object.assign(m.env, {
    TOPIC_BACKFILL_SEARCH_ENABLED: true, TOPIC_BACKFILL_THIN_MAX_PAPERS: 30, TOPIC_BACKFILL_DEFAULT_NEW_PAPERS: 100,
    TOPIC_BACKFILL_MAX_NEW_PAPERS: 1000, TOPIC_BACKFILL_MAX_PAGES: 10, TOPIC_BACKFILL_COOLDOWN_HOURS: 24,
    TOPIC_BACKFILL_DAILY_MAX_PAPERS: 2000,
  });
  m.loadTarget.mockResolvedValue(target());
  m.runFindFirst.mockResolvedValue(null);
  m.runFindMany.mockResolvedValue([]);
  m.runCreate.mockImplementation(async ({ data }) => runRow(data));
  m.runUpdate.mockResolvedValue(runRow());
  m.runUpdateMany.mockResolvedValue({ count: 1 });
  m.backfillAdd.mockResolvedValue({ id: `topic-backfill-${RUN}` });
  m.providerFind.mockResolvedValue({ id: "provider-1" });
  m.present.mockResolvedValue(new Set());
  m.ingest.mockImplementation(async (works: unknown[]) => insertResult(works.length));
  m.refreshCounts.mockResolvedValue(undefined);
  m.embeddingAdd.mockResolvedValue({});
  m.analysisAdd.mockResolvedValue({});
  m.enqueueApplyAll.mockResolvedValue({});
  m.enqueueApplyTag.mockResolvedValue({});
  m.audit.mockResolvedValue(undefined);
});

describe("requestFromSearch", () => {
  const ask = (kind = "topic") => topicBackfillService.requestFromSearch(USER, { targetKind: kind as never, targetId: TARGET });

  it("is refused with TOPIC_BACKFILL_DISABLED before anything is loaded", async () => {
    m.env.TOPIC_BACKFILL_SEARCH_ENABLED = false;
    await expect(ask()).rejects.toMatchObject({ statusCode: 403, code: "TOPIC_BACKFILL_DISABLED" });
    expect(m.loadTarget).not.toHaveBeenCalled();
  });

  it("404s for a missing or inactive target", async () => {
    m.loadTarget.mockResolvedValue(null);
    await expect(ask()).rejects.toMatchObject({ statusCode: 404 });
    expect(m.runFindFirst).not.toHaveBeenCalled();
  });

  it("409s with TOPIC_NOT_THIN once the entry has the threshold number of papers, before looking at runs", async () => {
    m.loadTarget.mockResolvedValue(target({ paperCount: 30 }));
    await expect(ask()).rejects.toMatchObject({ statusCode: 409, code: "TOPIC_NOT_THIN" });
    expect(m.runFindFirst).not.toHaveBeenCalled();
    expect(m.runCreate).not.toHaveBeenCalled();

    m.loadTarget.mockResolvedValue(target({ paperCount: 29 }));
    await expect(ask()).resolves.toMatchObject({ created: true });
  });

  it("409s when OpenAlex cannot be asked about the entry", async () => {
    m.loadTarget.mockResolvedValue(target({ queries: [] }));
    await expect(ask()).rejects.toMatchObject({ statusCode: 409, code: "TOPIC_NOT_BACKFILLABLE" });
  });

  it("returns the live run instead of creating another, without touching cooldown or cap", async () => {
    m.runFindFirst.mockResolvedValueOnce(runRow({ state: "running", errorMessage: "secret detail" }));
    const result = await ask();
    expect(result.created).toBe(false);
    expect(result.run).toMatchObject({ id: RUN, state: "running", errorMessage: null });
    expect(m.runFindFirst).toHaveBeenCalledTimes(1);
    expect(m.runFindFirst.mock.calls[0]![0].where).toMatchObject({ targetKind: "topic", targetId: TARGET, state: { in: ["queued", "running"] } });
    expect(m.runFindMany).not.toHaveBeenCalled();
    expect(m.runCreate).not.toHaveBeenCalled();
  });

  it("returns a run completed within the cooldown, looking only at completed runs so failed ones never count", async () => {
    vi.useFakeTimers({ now });
    m.runFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(runRow({ state: "completed", finishedAt: new Date(now.getTime() - 3600_000) }));
    const result = await ask();
    expect(result).toMatchObject({ created: false, run: { state: "completed" } });
    const where = m.runFindFirst.mock.calls[1]![0].where;
    expect(where.state).toBe("completed");
    expect(where.finishedAt.gte.toISOString()).toBe("2026-10-29T12:00:00.000Z");
    expect(m.runFindMany).not.toHaveBeenCalled();
  });

  it("skips the cooldown lookup when the cooldown is 0 hours", async () => {
    m.env.TOPIC_BACKFILL_COOLDOWN_HOURS = 0;
    await ask();
    expect(m.runFindFirst).toHaveBeenCalledTimes(1);
  });

  it("adds finished runs' inserted papers and live runs' budgets for today's search imports", async () => {
    vi.useFakeTimers({ now });
    m.runFindMany.mockResolvedValue([
      { state: "completed", insertedCount: 900, maxNewPapers: 100 },
      { state: "failed", insertedCount: 100, maxNewPapers: 100 },
      { state: "queued", insertedCount: 0, maxNewPapers: 1000 },
    ]);
    await expect(ask()).rejects.toMatchObject({ statusCode: 429, code: "TOPIC_BACKFILL_DAILY_LIMIT" });
    const where = m.runFindMany.mock.calls[0]![0].where;
    expect(where.trigger).toBe("search");
    expect(where.createdAt.gte.toISOString()).toBe("2026-10-29T12:00:00.000Z");
    expect(m.runCreate).not.toHaveBeenCalled();

    m.runFindMany.mockResolvedValue([
      { state: "completed", insertedCount: 899, maxNewPapers: 100 },
      { state: "failed", insertedCount: 100, maxNewPapers: 100 },
      { state: "running", insertedCount: 40, maxNewPapers: 1000 },
    ]);
    // 899 + 100 + the live run's 1000 budget = 1999, one under the cap.
    await expect(ask()).resolves.toMatchObject({ created: true });
  });

  it("creates a search run with the default budget and queues it with a deterministic job id", async () => {
    const result = await ask();
    expect(m.runCreate).toHaveBeenCalledWith({
      data: {
        targetKind: "topic", targetId: TARGET, targetName: "Deep learning", state: "queued", trigger: "search",
        requestedById: USER, maxNewPapers: 100, paperCountBefore: 5,
      },
    });
    expect(m.backfillAdd).toHaveBeenCalledWith("topic-backfill", { runId: RUN }, { jobId: `topic-backfill-${RUN}`, attempts: 3 });
    expect(m.audit).toHaveBeenCalledWith("topic_backfill.requested", expect.objectContaining({ userId: USER, targetRecordId: RUN }));
    expect(result).toMatchObject({ created: true, run: { id: RUN, trigger: "search", errorMessage: null } });
  });

  it("joins the winner when a concurrent request takes the unique slot", async () => {
    m.runCreate.mockRejectedValue(p2002());
    m.runFindFirst
      .mockResolvedValueOnce(null) // live check
      .mockResolvedValueOnce(null) // cooldown
      .mockResolvedValueOnce(runRow({ state: "queued", id: "winner" })); // after the violation
    const result = await ask();
    expect(result).toMatchObject({ created: false, run: { id: "winner" } });
    expect(m.backfillAdd).not.toHaveBeenCalled();
  });

  it("rethrows a unique violation when no live run explains it", async () => {
    m.runCreate.mockRejectedValue(p2002());
    await expect(ask()).rejects.toMatchObject({ code: "P2002" });
  });

  it("marks the run failed and answers 503 when the job cannot be queued, so the target is not blocked", async () => {
    m.backfillAdd.mockRejectedValue(new Error("redis down"));
    await expect(ask()).rejects.toMatchObject({ statusCode: 503 });
    expect(m.runUpdateMany).toHaveBeenCalledWith({
      where: { id: RUN, state: { in: ["queued", "running"] } },
      data: expect.objectContaining({ state: "failed", errorMessage: "redis down" }),
    });
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("stores no requester for an id that is not a UUID", async () => {
    await topicBackfillService.requestFromSearch("legacy-id", { targetKind: "keyword", targetId: TARGET });
    expect(m.runCreate.mock.calls[0]![0].data.requestedById).toBeNull();
  });
});

describe("requestFromAdmin", () => {
  const ask = (input: Record<string, unknown> = {}) =>
    topicBackfillService.requestFromAdmin(USER, { targetKind: "tag", targetId: TARGET, ...input } as never);

  it("skips the thin check, the cooldown and the daily cap", async () => {
    m.loadTarget.mockResolvedValue(target({ kind: "tag", paperCount: 50_000 }));
    m.runFindFirst.mockResolvedValue(null);
    const result = await ask();
    expect(result.created).toBe(true);
    expect(m.runFindFirst).toHaveBeenCalledTimes(1);
    expect(m.runFindMany).not.toHaveBeenCalled();
    expect(m.runCreate.mock.calls[0]![0].data).toMatchObject({ trigger: "admin", maxNewPapers: 100, paperCountBefore: 50_000 });
  });

  it("works even when disabled for search", async () => {
    m.env.TOPIC_BACKFILL_SEARCH_ENABLED = false;
    await expect(ask()).resolves.toMatchObject({ created: true });
  });

  it("uses the requested budget up to TOPIC_BACKFILL_MAX_NEW_PAPERS and rejects more with 400", async () => {
    await ask({ maxNewPapers: 1000 });
    expect(m.runCreate.mock.calls[0]![0].data.maxNewPapers).toBe(1000);
    await expect(ask({ maxNewPapers: 1001 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(ask({ maxNewPapers: 0 })).rejects.toMatchObject({ statusCode: 400 });
    expect(m.runCreate).toHaveBeenCalledTimes(1);
  });

  it("404s for a missing target and 409s with TAG_HAS_NO_INCLUDE_RULES for a tag with nothing to search", async () => {
    m.loadTarget.mockResolvedValueOnce(null);
    await expect(ask()).rejects.toMatchObject({ statusCode: 404 });
    m.loadTarget.mockResolvedValueOnce(target({ kind: "tag", queries: [] }));
    await expect(ask()).rejects.toMatchObject({ statusCode: 409, code: "TAG_HAS_NO_INCLUDE_RULES" });
  });

  it("returns the live run, with its error message visible to the admin", async () => {
    m.runFindFirst.mockResolvedValueOnce(runRow({ state: "running", errorMessage: "detail" }));
    const result = await ask();
    expect(result).toMatchObject({ created: false, run: { errorMessage: "detail" } });
    expect(m.runCreate).not.toHaveBeenCalled();
  });
});

describe("runBackfill", () => {
  beforeEach(() => {
    m.runFindUnique.mockResolvedValue(runRow());
  });
  const updates = () => m.runUpdate.mock.calls.map((c) => c[0].data);
  const progress = () => updates().filter((data) => data.pagesFetched);

  it("fails permanently for an unknown run and does nothing for a finished one", async () => {
    m.runFindUnique.mockResolvedValueOnce(null);
    await expect(topicBackfillService.runBackfill(RUN)).rejects.toBeInstanceOf(UnrecoverableError);
    m.runFindUnique.mockResolvedValueOnce(runRow({ state: "completed", insertedCount: 7 }));
    await expect(topicBackfillService.runBackfill(RUN)).resolves.toMatchObject({ insertedCount: 7 });
    expect(m.fetchPage).not.toHaveBeenCalled();
    expect(m.runUpdate).not.toHaveBeenCalled();
  });

  it("fails permanently when the provider is not seeded or the target is gone", async () => {
    m.providerFind.mockResolvedValueOnce(null);
    await expect(topicBackfillService.runBackfill(RUN)).rejects.toBeInstanceOf(UnrecoverableError);
    m.loadTarget.mockResolvedValueOnce(null);
    await expect(topicBackfillService.runBackfill(RUN)).rejects.toBeInstanceOf(UnrecoverableError);
    m.loadTarget.mockResolvedValueOnce(target({ queries: [] }));
    await expect(topicBackfillService.runBackfill(RUN)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("marks the run running with a start time, keeping an earlier start on a retry", async () => {
    m.fetchPage.mockResolvedValue(page([], null));
    await topicBackfillService.runBackfill(RUN);
    expect(updates()[0]).toMatchObject({ state: "running", startedAt: expect.any(Date) });

    m.runUpdate.mockClear();
    const earlier = new Date("2026-10-30T10:00:00.000Z");
    m.runFindUnique.mockResolvedValue(runRow({ state: "running", startedAt: earlier }));
    await topicBackfillService.runBackfill(RUN);
    expect(updates()[0]).toMatchObject({ state: "running", startedAt: earlier });
  });

  it("leaves works already in the corpus untouched and imports only the missing ones", async () => {
    m.fetchPage.mockResolvedValue(page(["W1", "W2", "W3"], null));
    m.present.mockResolvedValue(new Set(["W1"]));
    const result = await topicBackfillService.runBackfill(RUN);
    expect(m.ingest.mock.calls[0]![0].map((w: { id: string }) => w.id)).toEqual([
      "https://openalex.org/W2", "https://openalex.org/W3",
    ]);
    expect(m.ingest.mock.calls[0]![1]).toBe("provider-1");
    expect(progress()).toEqual([expect.objectContaining({
      fetchedCount: { increment: 3 }, insertedCount: { increment: 2 }, skippedCount: { increment: 1 },
      rejectedCount: { increment: 0 }, pagesFetched: { increment: 1 },
    })]);
    expect(result).toMatchObject({ insertedCount: 2, skippedCount: 1, pagesFetched: 1 });
  });

  it("drops works without an OpenAlex id and counts them as rejected", async () => {
    m.fetchPage.mockResolvedValue({ results: [work("W1"), {}], nextCursor: null, total: 2 });
    await topicBackfillService.runBackfill(RUN);
    expect(m.present).toHaveBeenCalledWith(["W1"]);
    expect(m.ingest.mock.calls[0]![0]).toHaveLength(1);
    expect(progress()[0]).toMatchObject({ fetchedCount: { increment: 2 }, rejectedCount: { increment: 1 } });
  });

  it("counts rejected works and works that raced into the corpus as updates", async () => {
    m.fetchPage.mockResolvedValue(page(["W1", "W2", "W3"], null));
    m.ingest.mockResolvedValue(insertResult(1, { updatedCount: 1, rejectedCount: 1 }));
    await topicBackfillService.runBackfill(RUN);
    expect(progress()[0]).toMatchObject({
      insertedCount: { increment: 1 }, skippedCount: { increment: 1 }, rejectedCount: { increment: 1 },
    });
  });

  it("stops at the paper budget: trims the last page and fetches no further page", async () => {
    m.runFindUnique.mockResolvedValue(runRow({ maxNewPapers: 3 }));
    m.fetchPage.mockResolvedValue(page(["W1", "W2", "W3", "W4", "W5"]));
    const result = await topicBackfillService.runBackfill(RUN);
    expect(m.ingest.mock.calls[0]![0]).toHaveLength(3);
    expect(m.fetchPage).toHaveBeenCalledTimes(1);
    expect(result.insertedCount).toBe(3);
  });

  it("counts papers an earlier attempt imported against the budget", async () => {
    m.runFindUnique.mockResolvedValue(runRow({ state: "running", maxNewPapers: 10, insertedCount: 8, pagesFetched: 2 }));
    m.fetchPage.mockResolvedValue(page(["W1", "W2", "W3", "W4"]));
    await topicBackfillService.runBackfill(RUN);
    expect(m.ingest.mock.calls[0]![0]).toHaveLength(2);
    expect(m.fetchPage).toHaveBeenCalledTimes(1);
  });

  it("does not fetch at all when the budget is already spent", async () => {
    m.runFindUnique.mockResolvedValue(runRow({ state: "running", maxNewPapers: 5, insertedCount: 5 }));
    const result = await topicBackfillService.runBackfill(RUN);
    expect(m.fetchPage).not.toHaveBeenCalled();
    expect(result.insertedCount).toBe(5);
    expect(updates().at(-1)).toMatchObject({ state: "completed" });
  });

  it("walks the cursor and stops a query when OpenAlex has no next page", async () => {
    m.fetchPage
      .mockResolvedValueOnce(page(["W1"], "c2"))
      .mockResolvedValueOnce(page(["W2"], "c3"))
      .mockResolvedValueOnce(page(["W3"], null));
    await topicBackfillService.runBackfill(RUN);
    expect(m.fetchPage.mock.calls.map((c) => c[0].cursor)).toEqual(["*", "c2", "c3"]);
    expect(m.fetchPage.mock.calls[0]![0]).toMatchObject({ filterExpression: query("T1").filterExpression, sort: "cited_by_count:desc", perPage: 100 });
  });

  it("stops a query on an empty page", async () => {
    m.fetchPage.mockResolvedValue(page([], "more"));
    await topicBackfillService.runBackfill(RUN);
    expect(m.fetchPage).toHaveBeenCalledTimes(1);
    expect(m.ingest).not.toHaveBeenCalled();
  });

  it("limits the pages of one attempt, however many pages the entry has", async () => {
    m.env.TOPIC_BACKFILL_MAX_PAGES = 4;
    m.fetchPage.mockResolvedValue(page(["W1"], "more"));
    await topicBackfillService.runBackfill(RUN);
    expect(m.fetchPage).toHaveBeenCalledTimes(4);
  });

  it("shares the page limit fairly between queries: floor(remaining pages / remaining queries)", async () => {
    m.loadTarget.mockResolvedValue(target({ queries: [query("A"), query("B"), query("C")] }));
    m.fetchPage.mockResolvedValue(page(["W1"], "more"));
    await topicBackfillService.runBackfill(RUN);
    const perQuery = ["A", "B", "C"].map((name) =>
      m.fetchPage.mock.calls.filter((c) => c[0].filterExpression.includes(`topics.id:${name}`)).length);
    expect(perQuery).toEqual([3, 3, 4]);
  });

  it("gives a query a page even when there are more queries than pages", async () => {
    m.env.TOPIC_BACKFILL_MAX_PAGES = 2;
    m.loadTarget.mockResolvedValue(target({ queries: [query("A"), query("B"), query("C")] }));
    m.fetchPage.mockResolvedValue(page(["W1"], "more"));
    await topicBackfillService.runBackfill(RUN);
    expect(m.fetchPage).toHaveBeenCalledTimes(2);
  });

  it("hands the pages a short query did not use to the queries after it", async () => {
    m.loadTarget.mockResolvedValue(target({ queries: [query("A"), query("B")] }));
    m.fetchPage.mockImplementation(async (params: { filterExpression: string }) =>
      (params.filterExpression.includes("topics.id:A") ? page(["W1"], null) : page(["W2"], "more")));
    await topicBackfillService.runBackfill(RUN);
    const forB = m.fetchPage.mock.calls.filter((c) => c[0].filterExpression.includes("topics.id:B")).length;
    expect(forB).toBe(9);
  });

  it("passes the phrase search of a keyword query to OpenAlex", async () => {
    m.loadTarget.mockResolvedValue(target({
      kind: "keyword", queries: [{ searchText: "\"federated learning\"", filterExpression: "has_abstract:true" }],
    }));
    m.fetchPage.mockResolvedValue(page([], null));
    await topicBackfillService.runBackfill(RUN);
    expect(m.fetchPage.mock.calls[0]![0]).toMatchObject({
      searchText: "\"federated learning\"", filterExpression: "has_abstract:true", sort: undefined,
    });
  });

  it("writes progress after every page so polling sees it", async () => {
    m.fetchPage
      .mockResolvedValueOnce(page(["W1", "W2"], "c2"))
      .mockResolvedValueOnce(page(["W3"], null));
    await topicBackfillService.runBackfill(RUN);
    expect(progress()).toEqual([
      expect.objectContaining({ fetchedCount: { increment: 2 }, insertedCount: { increment: 2 }, pagesFetched: { increment: 1 } }),
      expect.objectContaining({ fetchedCount: { increment: 1 }, insertedCount: { increment: 1 }, pagesFetched: { increment: 1 } }),
    ]);
  });

  it("after an import: refreshes counts, queues embeddings and analysis, re-tags everything, then completes", async () => {
    m.fetchPage.mockResolvedValue(page(["W1"], null));
    const result = await topicBackfillService.runBackfill(RUN);
    expect(m.refreshCounts).toHaveBeenCalledTimes(1);
    expect(m.embeddingAdd).toHaveBeenCalledWith("manual-embedding", {});
    expect(m.analysisAdd).toHaveBeenCalledWith("synced-paper-knowledge", {});
    expect(m.enqueueApplyAll).toHaveBeenCalledTimes(1);
    expect(m.enqueueApplyTag).not.toHaveBeenCalled();
    expect(updates().at(-1)).toMatchObject({ state: "completed", finishedAt: expect.any(Date) });
    expect(m.refreshCounts.mock.invocationCallOrder[0]).toBeLessThan(m.runUpdate.mock.invocationCallOrder.at(-1)!);
    expect(result.insertedCount).toBe(1);
  });

  it("re-tags just the tag when the target is a tag", async () => {
    m.runFindUnique.mockResolvedValue(runRow({ targetKind: "tag" }));
    m.loadTarget.mockResolvedValue(target({ kind: "tag" }));
    m.fetchPage.mockResolvedValue(page(["W1"], null));
    await topicBackfillService.runBackfill(RUN);
    expect(m.enqueueApplyTag).toHaveBeenCalledWith(TARGET);
    expect(m.enqueueApplyAll).not.toHaveBeenCalled();
  });

  it("still completes when post-steps fail, running the others anyway", async () => {
    m.fetchPage.mockResolvedValue(page(["W1"], null));
    m.refreshCounts.mockRejectedValue(new Error("db busy"));
    m.embeddingAdd.mockRejectedValue(new Error("redis"));
    m.enqueueApplyAll.mockRejectedValue(new Error("redis"));
    await expect(topicBackfillService.runBackfill(RUN)).resolves.toMatchObject({ insertedCount: 1 });
    expect(m.analysisAdd).toHaveBeenCalled();
    expect(m.warn).toHaveBeenCalledTimes(3);
    expect(updates().at(-1)).toMatchObject({ state: "completed" });
  });

  it("runs no post-step when nothing was imported", async () => {
    m.fetchPage.mockResolvedValue(page(["W1", "W2"], null));
    m.present.mockResolvedValue(new Set(["W1", "W2"]));
    await topicBackfillService.runBackfill(RUN);
    expect(m.ingest).not.toHaveBeenCalled();
    expect(m.refreshCounts).not.toHaveBeenCalled();
    expect(m.embeddingAdd).not.toHaveBeenCalled();
    expect(m.analysisAdd).not.toHaveBeenCalled();
    expect(m.enqueueApplyAll).not.toHaveBeenCalled();
    expect(updates().at(-1)).toMatchObject({ state: "completed" });
  });

  it("lets an OpenAlex failure propagate so BullMQ retries, leaving the run running", async () => {
    m.fetchPage.mockRejectedValue(new Error("OpenAlex 503"));
    await expect(topicBackfillService.runBackfill(RUN)).rejects.toThrow("OpenAlex 503");
    expect(updates().some((data) => data.state === "completed")).toBe(false);
  });
});

describe("markFailed", () => {
  it("ends only a live run and stores a scrubbed, truncated message", async () => {
    const url = "https://api.openalex.org/works?filter=x&api_key=SECRET123&per_page=100&mailto=ops@example.com";
    await topicBackfillService.markFailed(RUN, new Error(`fetch failed: ${url} ${"x".repeat(900)}`));
    const call = m.runUpdateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ id: RUN, state: { in: ["queued", "running"] } });
    expect(call.data).toMatchObject({ state: "failed", finishedAt: expect.any(Date) });
    expect(call.data.errorMessage).toContain("api_key=[redacted]");
    expect(call.data.errorMessage).toContain("mailto=[redacted]");
    expect(call.data.errorMessage).not.toContain("SECRET123");
    expect(call.data.errorMessage).not.toContain("ops@example.com");
    expect(call.data.errorMessage.length).toBeLessThanOrEqual(500);
    expect(JSON.stringify(m.warn.mock.calls)).not.toContain("SECRET123");
  });

  it("redacts a key that would be cut by the truncation", async () => {
    await topicBackfillService.markFailed(RUN, `${"y".repeat(490)} api_key=ABCDEFGHIJKLMNOP`);
    const message = m.runUpdateMany.mock.calls[0]![0].data.errorMessage as string;
    expect(message).not.toContain("ABCDEF");
  });

  it("accepts a non-Error value", async () => {
    await topicBackfillService.markFailed(RUN, "plain text");
    expect(m.runUpdateMany.mock.calls[0]![0].data.errorMessage).toBe("plain text");
  });
});

describe("failOrphanedRuns", () => {
  it("fails queued/running runs that have no live job and keeps the ones that do", async () => {
    vi.useFakeTimers({ now });
    m.runFindMany.mockResolvedValue([{ id: "run-live" }, { id: "run-lost" }]);
    m.hasLiveJob.mockImplementation(async (_queue: unknown, jobId: string) => jobId === "topic-backfill-run-live");

    const failed = await topicBackfillService.failOrphanedRuns();

    expect(failed).toBe(1);
    expect(m.runUpdateMany).toHaveBeenCalledTimes(1);
    expect(m.runUpdateMany.mock.calls[0]![0].where.id).toBe("run-lost");
    const where = m.runFindMany.mock.calls[0]![0].where;
    expect(where.state).toEqual({ in: ["queued", "running"] });
    // A row from the last minute may not have reached the queue yet.
    expect(where.createdAt.lt.toISOString()).toBe("2026-10-30T11:59:00.000Z");
  });
});

describe("getRun and listRuns", () => {
  it("hides the error message from non-admins and shows it to admins", async () => {
    m.runFindUnique.mockResolvedValue(runRow({ state: "failed", errorMessage: "OpenAlex 500: boom", finishedAt: now }));
    expect((await topicBackfillService.getRun(RUN, { isAdmin: false })).errorMessage).toBeNull();
    const admin = await topicBackfillService.getRun(RUN, { isAdmin: true });
    expect(admin.errorMessage).toBe("OpenAlex 500: boom");
    expect(admin).toMatchObject({ createdAt: now.toISOString(), finishedAt: now.toISOString(), startedAt: null });
  });

  it("404s for an unknown run", async () => {
    m.runFindUnique.mockResolvedValue(null);
    await expect(topicBackfillService.getRun(RUN, { isAdmin: false })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lists newest first with filters and pagination meta, for admins", async () => {
    m.runFindMany.mockResolvedValue([runRow({ errorMessage: "detail" })]);
    m.runCount.mockResolvedValue(41);
    const result = await topicBackfillService.listRuns({ page: 3, pageSize: 20, state: "failed", targetKind: "tag", targetId: TARGET });
    expect(m.runFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { targetKind: "tag", targetId: TARGET, state: "failed" }, skip: 40, take: 20,
    }));
    expect(result.meta).toEqual({ page: 3, pageSize: 20, total: 41, totalPages: 3 });
    expect(result.data[0]!.errorMessage).toBe("detail");
  });
});
