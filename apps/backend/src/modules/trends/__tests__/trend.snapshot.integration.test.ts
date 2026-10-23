import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P2.1 worker acceptance (moved from P2.0, 05_IMPLEMENTATION_PLAN.md §P2.1):
 * real PostgreSQL + Redis, OpenAlex replaced by a local mock HTTP server.
 * Run only against throwaway databases:
 *   TRENDS_INTEGRATION=1 DATABASE_URL=postgresql://…/<name>_test REDIS_URL=… vitest run <this file>
 */
vi.hoisted(() => {
  // Never send a real key anywhere from tests (the mock ignores it).
  process.env.OPENALEX_API_KEY = "test-key-not-real";
});

import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { isOpenAlexBudgetAvailable, resetOpenAlexBudgetLockForTests } from "../trend.openalex-client.js";
import { benjaminiHochberg } from "../trend.statistics.js";
import { computeSnapshotAnalytics } from "../trend.snapshot-analytics.js";
import { getActiveTrendSnapshot, runTrendSnapshotJob } from "../trend.snapshot.service.js";
import type { CollectorOptions } from "../trend.snapshot-collector.js";
import { expectedPages, makeDataset, startMockOpenAlex, type MockOpenAlex } from "./helpers/mock-openalex-server.js";

const enabled = process.env.TRENDS_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use an isolated _test database");

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const PAGE_SIZE = 3;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

describe.skipIf(!enabled).sequential("trend snapshot worker (P2.1, PostgreSQL + mock OpenAlex)", () => {
  const db = getPrisma();
  let mock: MockOpenAlex;
  const total = expectedPages(makeDataset(), PAGE_SIZE, YEARS);

  const options = (over: Partial<CollectorOptions> = {}): CollectorOptions => ({ workerId: "worker-a", baseUrl: mock.baseUrl, currentYear: 2026, pageDelayMs: 0, leaseMs: 60_000, ...over });
  const worksRequests = () => mock.log.filter((r) => r.path === "/works" || r.path === "/topics").length;
  const snapshots = () => db.trendSnapshot.findMany({ orderBy: { createdAt: "asc" } });
  /** Stored content without ids/timestamps, to compare two snapshots. */
  const content = async (snapshotId: string) => ({
    counts: (await db.trendSnapshotCount.findMany({ where: { snapshotId }, orderBy: [{ level: "asc" }, { unitKey: "asc" }, { year: "asc" }] })).map(({ snapshotId: _s, ...rest }) => rest),
    results: (await db.trendSnapshotResult.findMany({ where: { snapshotId }, orderBy: [{ baselineLevel: "asc" }, { topicId: "asc" }] })).map(({ snapshotId: _s, ...rest }) => rest),
  });
  const wipe = async () => { await db.trendSnapshot.deleteMany({}); };

  beforeAll(async () => { await wipe(); });
  beforeEach(async () => {
    await wipe();
    resetOpenAlexBudgetLockForTests();
    mock = await startMockOpenAlex({ pageSize: PAGE_SIZE });
  });
  afterEach(async () => { await mock.close(); });
  afterAll(async () => { await wipe(); });

  it("collects every page, validates, precomputes and activates (happy path)", async () => {
    const outcome = await runTrendSnapshotJob(options());
    expect(outcome.status).toBe("activated");
    const [snap] = await snapshots();
    expect(snap).toMatchObject({ status: "active", isActive: true, requests: total, creditsUsed: total, yearFrom: 2016, lastCompleteYear: 2025, leaseOwnerId: null });
    expect(worksRequests()).toBe(total);
    expect((snap!.validation as { ok: boolean }).ok).toBe(true);
    // Every topic × year and the unknown group are stored as served.
    const topicRows = await db.trendSnapshotCount.findMany({ where: { snapshotId: snap!.id, level: "topic" } });
    expect(topicRows).toHaveLength(YEARS.length * 9);
    for (const year of YEARS) {
      expect(topicRows.find((r) => r.unitKey === "unknown" && r.year === year)!.count).toBe(mock.dataset.unknown[year]);
      for (const t of mock.dataset.topics) expect(topicRows.find((r) => r.unitKey === t.id && r.year === year)!.count).toBe(mock.dataset.counts[year]![t.id]);
    }
    expect(await db.trendSnapshotResult.count({ where: { snapshotId: snap!.id } })).toBe(4 * mock.dataset.topics.length);
    expect((await getActiveTrendSnapshot())!.id).toBe(snap!.id);
  });

  it("applies BH to the full family of each baseline unit, matching an independent computation", async () => {
    await runTrendSnapshotJob(options());
    const [snap] = await snapshots();
    const results = await db.trendSnapshotResult.findMany({ where: { snapshotId: snap!.id } });
    for (const level of ["global", "domain", "field", "subfield"] as const) {
      const rows = results.filter((r) => r.baselineLevel === level);
      const families = new Map<string, typeof rows>();
      for (const r of rows) families.set(r.baselineUnit, [...(families.get(r.baselineUnit) ?? []), r]);
      if (level === "global") expect([...families.keys()]).toEqual(["all"]);
      for (const members of families.values()) {
        const p = members.map((r) => r.pValue);
        const q = benjaminiHochberg(p);
        members.forEach((r, i) => {
          expect(r.qFamilySize).toBe(p.filter((x) => x !== null).length);
          if (q[i] === null) expect(r.qValue).toBeNull();
          else expect(r.qValue!).toBeCloseTo(q[i]!, 12);
        });
      }
      // Field families are the dataset's fields, not pages: T10001…T10008 map to fields 11 (4 topics), 12 (2) and 22 (2).
      if (level === "field") expect(new Map([...families].map(([k, v]) => [k, v.length]))).toEqual(new Map([["11", 4], ["12", 2], ["22", 2]]));
    }
    // Same numbers as the pure P1 analytics on the dataset itself.
    const d = mock.dataset;
    const topicCounts = new Map(d.topics.map((t) => [t.id, new Map(YEARS.map((y) => [y, d.counts[y]![t.id]!]))]));
    const roll = (level: "domain" | "field" | "subfield") => {
      const m = new Map<string, Map<number, number>>();
      for (const t of d.topics) for (const y of YEARS) { const u = m.get(t[level]) ?? new Map(); u.set(y, (u.get(y) ?? 0) + d.counts[y]![t.id]!); m.set(t[level], u); }
      return m;
    };
    const expected = computeSnapshotAnalytics({ yearFrom: 2016, lastCompleteYear: 2025, topicCounts, levelCounts: { domain: roll("domain"), field: roll("field"), subfield: roll("subfield") }, catalogue: new Map(d.topics.map((t) => [t.id, { domainId: t.domain, fieldId: t.field, subfieldId: t.subfield }])) });
    for (const e of expected) {
      const r = results.find((x) => x.baselineLevel === e.baselineLevel && x.topicId === e.topicId)!;
      expect(r.verdict).toBe(e.classification.verdict);
      expect(r.qValue).toBe(e.classification.qValue);
      expect(r.ggtMeanPct).toBe(e.ggt.meanPct);
      expect(r.stabilityChecked).toBe(false);
      if (r.nelisThresholdGroup !== null) expect(r.ggtConditionsMet).toBe(true);
    }
  });

  describe("1. low quota during collection", () => {
    it("stops cleanly at the key reserve, keeps the checkpoint, and resumes the next day", async () => {
      // Limit 1 000 → reserve 200; 755 used → 45 pages allowed before the reserve:
      // catalogue (4) + 2016–2018 (3 × 12) + the first 5 pages of 2019 (topic unit done, domain unit started).
      mock.state.creditsLimit = 1000; mock.state.creditsUsed = 755;
      const first = await runTrendSnapshotJob(options());
      expect(first).toMatchObject({ status: "paused_budget" });
      expect((first as { reason: string }).reason).toMatch(/^KEY_RESERVE/);
      expect(worksRequests()).toBe(45);
      const [snap] = await snapshots();
      expect(snap).toMatchObject({ status: "paused_budget", isActive: false, leaseOwnerId: null, requests: 45, creditsUsed: 45 });
      expect(await db.trendSnapshotPage.count({ where: { snapshotId: snap!.id } })).toBe(45);
      const units = await db.trendSnapshotUnit.findMany({ where: { snapshotId: snap!.id, year: 2019 } });
      expect(units.find((u) => u.level === "topic")).toMatchObject({ status: "complete", cursor: null });
      expect(units.find((u) => u.level === "domain")).toMatchObject({ status: "pending", pagesFetched: 1 });
      expect(units.find((u) => u.level === "domain")!.cursor).not.toBe("*");
      expect(await getActiveTrendSnapshot()).toBeNull();

      // Next day, budget reset: complete years are kept; 2019, collected a day earlier and only in part,
      // is refetched as a whole so its 4 levels reconcile (YEAR_GROUP_MAX_AGE_MS). Nothing else is fetched twice.
      mock.state.creditsUsed = 0;
      const resumed = await runTrendSnapshotJob(options({ now: () => new Date(Date.now() + DAY + HOUR) }));
      expect(resumed.status).toBe("activated");
      const [after] = await snapshots();
      expect(after!.id).toBe(snap!.id);
      expect(worksRequests()).toBe(45 + (total - 40));
    });

    it("stops at the 30% collection cap even when the key has credits left", async () => {
      // 10 000 credits, cap 0.005 → 50 credits for trend collection today.
      const outcome = await runTrendSnapshotJob(options({ collectionFraction: 0.005 }));
      expect(outcome).toMatchObject({ status: "paused_budget" });
      expect((outcome as { reason: string }).reason).toMatch(/^COLLECTION_CAP/);
      expect(worksRequests()).toBe(50);
      // The cap counts every run of the day: a second run today makes no request.
      const again = await runTrendSnapshotJob(options({ collectionFraction: 0.005 }));
      expect(again.status).toBe("paused_budget");
      expect(worksRequests()).toBe(50);
    });
  });

  describe("2. quota-exhaustion 429 vs rate-limit 429", () => {
    it("retries a per-second 429 and loses no page", async () => {
      mock.faults.rateLimit429 = new Set([5, 30]);
      const outcome = await runTrendSnapshotJob(options());
      expect(outcome.status).toBe("activated");
      expect(worksRequests()).toBe(total + 2);
      expect(mock.log.filter((r) => r.status === 429)).toHaveLength(2);
    });

    it("never retries a 429 when the daily budget is spent; pauses until reset", async () => {
      mock.faults.quotaExhaustedFrom = 12;
      const outcome = await runTrendSnapshotJob(options());
      expect(outcome).toMatchObject({ status: "paused_budget" });
      expect((outcome as { reason: string }).reason).toMatch(/^QUOTA_429/);
      expect(mock.log.filter((r) => r.n >= 12)).toHaveLength(1);
      expect(isOpenAlexBudgetAvailable()).toBe(false);
      const [snap] = await snapshots();
      expect(snap).toMatchObject({ status: "paused_budget", requests: 11, isActive: false });
    });
  });

  describe("3. interrupted pagination", () => {
    it("a crash mid-unit never publishes the snapshot and keeps the previous active one", async () => {
      // Yesterday's complete snapshot.
      await runTrendSnapshotJob(options({ now: () => new Date(Date.now() - DAY) }));
      const [previous] = await snapshots();
      expect(previous!.isActive).toBe(true);
      let pages = 0;
      await expect(runTrendSnapshotJob(options({ hooks: { afterPageCommit: () => { if (++pages === 17) throw new Error("simulated crash"); } } }))).rejects.toThrow("simulated crash");
      const [, today] = await snapshots();
      expect(today).toMatchObject({ status: "collecting", isActive: false, leaseOwnerId: null });
      expect((await getActiveTrendSnapshot())!.id).toBe(previous!.id);
    });

    it("a network failure that outlasts the retries leaves an unpublished, resumable snapshot", async () => {
      mock.faults.dropRequest = (n) => n >= 9;
      await expect(runTrendSnapshotJob(options())).rejects.toThrow();
      const [snap] = await snapshots();
      expect(snap).toMatchObject({ status: "collecting", isActive: false, requests: 8, leaseOwnerId: null });
      expect(await getActiveTrendSnapshot()).toBeNull();
    });
  });

  describe("4. resume from checkpoint", () => {
    it("continues from the saved cursor: no page refetched, same result as an uninterrupted run", async () => {
      let pages = 0;
      await expect(runTrendSnapshotJob(options({ hooks: { afterPageCommit: () => { if (++pages === 23) throw new Error("crash"); } } }))).rejects.toThrow("crash");
      expect(worksRequests()).toBe(23);
      const resumed = await runTrendSnapshotJob(options({ workerId: "worker-b" }));
      expect(resumed.status).toBe("activated");
      expect(worksRequests()).toBe(total); // 23 + the remaining pages, nothing twice
      const [interrupted] = await snapshots();
      const interruptedContent = await content(interrupted!.id);

      // Uninterrupted run on identical data (another day) gives identical stored content.
      await wipe();
      await runTrendSnapshotJob(options({ now: () => new Date(Date.now() + 2 * DAY) }));
      const [clean] = await snapshots();
      expect(await content(clean!.id)).toEqual(interruptedContent);
    });

    it("produces the same stored content after a crash in the middle of a year", async () => {
      let pages = 0;
      await expect(runTrendSnapshotJob(options({ hooks: { afterPageCommit: () => { if (++pages === 61) throw new Error("crash"); } } }))).rejects.toThrow();
      await runTrendSnapshotJob(options());
      const [resumed] = await snapshots();
      const resumedContent = await content(resumed!.id);
      await db.trendSnapshot.update({ where: { id: resumed!.id }, data: { isActive: false, status: "superseded" } });
      await runTrendSnapshotJob(options({ now: () => new Date(Date.now() + 2 * DAY) }));
      const clean = (await snapshots()).find((s) => s.id !== resumed!.id)!;
      expect(await content(clean.id)).toEqual(resumedContent);
    });

    it("refetches a unit whose cursor is older than the freshness limit", async () => {
      let pages = 0;
      await expect(runTrendSnapshotJob(options({ hooks: { afterPageCommit: () => { if (++pages === 6) throw new Error("crash"); } } }))).rejects.toThrow();
      // Page 6 is inside the first year's topic unit (catalogue = 4 pages). Resume 2 h later.
      const outcome = await runTrendSnapshotJob(options({ now: () => new Date(Date.now() + 2 * HOUR) }));
      expect(outcome.status).toBe("activated");
      expect(worksRequests()).toBe(total + 2); // the 2 committed pages of the stale unit, once more
    });
  });

  describe("5. idempotency", () => {
    it("repeating the job after activation makes no request and changes nothing", async () => {
      await runTrendSnapshotJob(options());
      const [snap] = await snapshots();
      const before = await content(snap!.id);
      const again = await runTrendSnapshotJob(options({ workerId: "worker-b" }));
      expect(again.status).toBe("already_active");
      expect(worksRequests()).toBe(total);
      expect(await snapshots()).toHaveLength(1);
      expect(await content(snap!.id)).toEqual(before);
    });
  });

  it("two concurrent jobs: one collects, the other is locked out; one snapshot, one active", async () => {
    const [a, b] = await Promise.all([runTrendSnapshotJob(options({ workerId: "worker-a" })), runTrendSnapshotJob(options({ workerId: "worker-b" }))]);
    expect([a.status, b.status].sort()).toEqual(["activated", "locked"]);
    expect(await snapshots()).toHaveLength(1);
    expect(worksRequests()).toBe(total);
    expect(await db.trendSnapshot.count({ where: { isActive: true } })).toBe(1);
  });

  describe("validation keeps bad data out and the previous snapshot active", () => {
    const withPrevious = async () => {
      await runTrendSnapshotJob(options({ now: () => new Date(Date.now() - DAY) }));
      return (await snapshots())[0]!;
    };
    const failed = async (previousId: string, check: string) => {
      const today = (await snapshots()).find((s) => s.id !== previousId)!;
      expect(today.isActive).toBe(false);
      expect(await db.trendSnapshotResult.count({ where: { snapshotId: today.id } })).toBe(0);
      expect((await getActiveTrendSnapshot())!.id).toBe(previousId);
      const checks = (today.validation as { checks?: Array<{ name: string; ok: boolean }> }).checks ?? [];
      if (check) expect(checks.find((c) => c.name === check)?.ok).toBe(false);
      return today;
    };

    it("a topic counted in /works but missing from the catalogue", async () => {
      const previous = await withPrevious();
      mock.faults.uncataloguedTopic = { id: "T99999", year: 2020, count: 7 };
      const outcome = await runTrendSnapshotJob(options());
      expect(outcome.status).toBe("validation_failed");
      expect((await failed(previous.id, "topics_in_catalogue")).status).toBe("validation_failed");
    });

    it("the unknown group differs between levels", async () => {
      const previous = await withPrevious();
      mock.faults.unknownDelta = { level: "field", year: 2021, delta: 3 };
      expect((await runTrendSnapshotJob(options())).status).toBe("validation_failed");
      await failed(previous.id, "classified_unclassified_reconcile");
    });

    it("a taxonomy level that does not add up to its topics", async () => {
      const previous = await withPrevious();
      mock.faults.taxonomyDelta = { level: "subfield", year: 2019, unit: "1102", delta: 1 };
      expect((await runTrendSnapshotJob(options())).status).toBe("validation_failed");
      await failed(previous.id, "taxonomy_levels_reconcile");
    });

    it("a missing cursor page", async () => {
      const previous = await withPrevious();
      mock.faults.skipPage = { level: "topic", year: 2018, pageIndex: 0 };
      expect((await runTrendSnapshotJob(options())).status).toBe("validation_failed");
      await failed(previous.id, "groups_reconcile_with_meta_count");
    });

    it("a duplicated cursor page is rejected during collection (no silent overwrite)", async () => {
      const previous = await withPrevious();
      mock.faults.duplicatePage = { level: "field", year: 2022, pageIndex: 0 };
      const outcome = await runTrendSnapshotJob(options());
      expect(outcome).toMatchObject({ status: "failed", reason: "DUPLICATE_GROUP" });
      expect((await failed(previous.id, "")).status).toBe("failed");
    });

    it("a cursor that does not advance", async () => {
      const previous = await withPrevious();
      mock.faults.duplicatePage = { level: "topic", year: 2017, pageIndex: 1 };
      expect(await runTrendSnapshotJob(options())).toMatchObject({ status: "failed", reason: "CURSOR_DID_NOT_ADVANCE" });
      await failed(previous.id, "");
    });
  });

  describe("atomic activation", () => {
    it("a failure inside the activation transaction publishes nothing; a rerun activates once", async () => {
      await runTrendSnapshotJob(options({ now: () => new Date(Date.now() - DAY) }));
      const [previous] = await snapshots();
      await expect(runTrendSnapshotJob(options({ hooks: { beforeActivationCommit: () => { throw new Error("boom"); } } }))).rejects.toThrow("boom");
      const today = (await snapshots()).find((s) => s.id !== previous!.id)!;
      expect(today).toMatchObject({ status: "validated", isActive: false, leaseOwnerId: null });
      expect(await db.trendSnapshotResult.count({ where: { snapshotId: today.id } })).toBe(0);
      expect((await getActiveTrendSnapshot())!.id).toBe(previous!.id);

      const requestsBefore = worksRequests();
      expect((await runTrendSnapshotJob(options())).status).toBe("activated");
      expect(worksRequests()).toBe(requestsBefore); // validated data is not refetched
      expect(await db.trendSnapshotResult.count({ where: { snapshotId: today.id } })).toBe(4 * mock.dataset.topics.length);
      const all = await snapshots();
      expect(all.find((s) => s.id === previous!.id)).toMatchObject({ isActive: false, status: "superseded" });
      expect(await db.trendSnapshot.count({ where: { isActive: true } })).toBe(1);
    });

    it("the database itself refuses two active snapshots of one scope", async () => {
      await runTrendSnapshotJob(options({ now: () => new Date(Date.now() - DAY) }));
      await runTrendSnapshotJob(options());
      const [older] = await snapshots();
      await expect(db.trendSnapshot.update({ where: { id: older!.id }, data: { isActive: true, status: "active" } })).rejects.toThrow();
    });
  });
});
