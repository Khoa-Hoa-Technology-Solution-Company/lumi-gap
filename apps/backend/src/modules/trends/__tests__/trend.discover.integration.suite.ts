import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TrendsDiscoverResponse } from "@trend/shared-types";

/**
 * P2.2 Discover API against a real snapshot: PostgreSQL + Redis, the snapshot
 * built by the unchanged P2.1 worker from a mock OpenAlex dataset designed to
 * contain every case the acceptance list names. HTTP through createApp().
 * Not a *.test.ts file on purpose: trend.snapshot.integration.test.ts imports it,
 * so the two suites, which both delete and activate snapshots of the default
 * scope, run in one file and so one after the other (vitest runs files in
 * parallel). Never run against the database holding the live-canary snapshot.
 */
vi.hoisted(() => {
  process.env.OPENALEX_API_KEY = "test-key-not-real";
});

import { createApp } from "../../../app.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { resetOpenAlexBudgetLockForTests } from "../trend.openalex-client.js";
import { runTrendSnapshotJob } from "../trend.snapshot.service.js";
import { startMockOpenAlex, type MockDataset, type MockOpenAlex } from "./helpers/mock-openalex-server.js";

const enabled = process.env.TRENDS_INTEGRATION === "1";
if (enabled && /lumigap_p1_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("This suite deletes snapshots: do not run it on the live-canary database");
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use an isolated _test database");

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const series = (f: (i: number) => number) => Object.fromEntries(YEARS.map((y, i) => [y, Math.round(f(i))])) as Record<number, number>;
const T = (id: string, subfield: string, field: string, domain: string) => ({ id, name: `Topic ${id}`, subfield, field, domain });
/** field 11 = {1101: T1 T2 T3, 1102: T4 alone}; field 12 = {1201: T5 T6 T7}; field 22 = {2201: T8 T9 T10}. */
function dataset(): MockDataset {
  const topics = [T("T10001", "1101", "11", "1"), T("T10002", "1101", "11", "1"), T("T10003", "1101", "11", "1"), T("T10004", "1102", "11", "1"), T("T10005", "1201", "12", "1"), T("T10006", "1201", "12", "1"), T("T10007", "1201", "12", "1"), T("T10008", "2201", "22", "2"), T("T10009", "2201", "22", "2"), T("T10010", "2201", "22", "2")];
  const per: Record<string, Record<number, number>> = {
    T10001: series((i) => 60 * 1.25 ** i), // strong rise, ≥ 50 every year
    T10002: series((i) => 100 + 30 * i), // rise
    T10003: series((i) => 400 - 25 * i), // fall
    T10004: series((i) => 200 + (i % 2) * 10), // sole member of subfield 1102
    T10005: series((i) => 100 + 30 * i),
    T10006: series((i) => 300 + (i % 2 ? 7 : -7)),
    T10007: series((i) => [0, 0, 1, 0, 2, 1, 0, 3, 2, 1][i]!), // < 30 papers: insufficient
    T10008: series((i) => 20 + 10 * i), // rises but < 50 papers in early years
    T10009: series((i) => 500 + 80 * i),
    T10010: series(() => 2000),
  };
  const counts: MockDataset["counts"] = {};
  for (const year of YEARS) counts[year] = Object.fromEntries(topics.map((t) => [t.id, per[t.id]![year]!]));
  return { topics, counts, unknown: Object.fromEntries(YEARS.map((y) => [y, 50])) };
}

describe.skipIf(!enabled).sequential("Discover Trends API (P2.2) on a real snapshot", () => {
  const db = getPrisma();
  let mock: MockOpenAlex;
  let server: Server;
  let base: string;
  const get = async (q: string): Promise<TrendsDiscoverResponse> => {
    const res = await fetch(`${base}/trends/discover?${q}`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: TrendsDiscoverResponse }).data;
  };

  beforeAll(async () => {
    await db.trendSnapshot.deleteMany({});
    resetOpenAlexBudgetLockForTests();
    mock = await startMockOpenAlex({ dataset: dataset(), pageSize: 4 });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.on("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  });
  afterAll(async () => {
    await mock.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.trendSnapshot.deleteMany({});
  });

  it("8. without an active snapshot: a truthful unavailable state, no local fallback", async () => {
    const res = await get("collection=trending");
    expect(res).toMatchObject({ status: "unavailable", unavailableReason: "NO_ACTIVE_SNAPSHOT", provenance: null, items: [], total: 0 });
  });

  it("9. a validated but not yet activated (incomplete publication) snapshot is never served", async () => {
    await expect(runTrendSnapshotJob({ workerId: "w", baseUrl: mock.baseUrl, currentYear: 2026, pageDelayMs: 0, hooks: { beforeActivationCommit: () => { throw new Error("stop before activation"); } } })).rejects.toThrow();
    expect((await db.trendSnapshot.findFirstOrThrow()).status).toBe("validated");
    expect((await get("collection=trending")).status).toBe("unavailable");
    // Activate it for the rest of the suite.
    expect((await runTrendSnapshotJob({ workerId: "w", baseUrl: mock.baseUrl, currentYear: 2026, pageDelayMs: 0 })).status).toBe("activated");
  });

  it("1–2. every item carries the provenance of the one active snapshot (one data source)", async () => {
    const snapshot = await db.trendSnapshot.findFirstOrThrow({ where: { isActive: true } });
    for (const collection of ["trending", "fastest_growing", "by_field"]) {
      const res = await get(`collection=${collection}`);
      expect(res.status).toBe("available");
      expect(res.provenance).toMatchObject({ source: "openalex", snapshotId: snapshot.id, snapshotStatus: "active", yearFrom: 2016, lastCompleteYear: 2025, collectionVersion: snapshot.collectionVersion, analyticsVersion: snapshot.analyticsVersion, corpus: "core", historicalCountsMayChange: true });
      expect(res.provenance!.workTypes).toEqual(["article", "review", "preprint", "conference-paper", "book-chapter"]);
      expect(res.provenance!.firstFetchedAt).toBe(snapshot.firstFetchedAt!.toISOString());
      const items = [...res.items, ...(res.fields ?? []).flatMap((f) => f.topics)];
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.provenance).toEqual(res.provenance);
        expect(item.qFamilyKey).toBe(`${res.baselineLevel}:${item.baselineUnit.id}`);
      }
    }
  });

  it("5. Trending = exactly the stored rising topics with p and q, in the documented order", async () => {
    for (const baseline of ["global", "domain", "field", "subfield"] as const) {
      const res = await get(`collection=trending&baseline=${baseline}&pageSize=100`);
      const snapshot = await db.trendSnapshot.findFirstOrThrow({ where: { isActive: true } });
      const rising = await db.trendSnapshotResult.findMany({ where: { snapshotId: snapshot.id, baselineLevel: baseline, verdict: "rising" } });
      expect(res.total).toBe(rising.length);
      expect(res.items.map((i) => i.topicId).sort()).toEqual(rising.map((r) => r.topicId).sort());
      for (const item of res.items) expect(item).toMatchObject({ verdict: "rising", assessability: "assessable", baselineUnit: { level: baseline } });
      for (let k = 1; k < res.items.length; k++) {
        const a = res.items[k - 1]!, b = res.items[k]!;
        const ok = (a.relativeChangePct ?? -Infinity) > (b.relativeChangePct ?? -Infinity) || (a.relativeChangePct === b.relativeChangePct && (a.qValue! < b.qValue! || (a.qValue === b.qValue && a.topicId < b.topicId)));
        expect(ok).toBe(true);
        expect(b.rank).toBe(a.rank + 1);
      }
    }
    expect((await get("collection=trending&baseline=field&pageSize=100")).total).toBeGreaterThanOrEqual(3);
  });

  it("3–4. page size and paging never change a topic's verdict, p, q or BH family", async () => {
    const full = await get("collection=trending&baseline=global&pageSize=100");
    const byId = new Map(full.items.map((i) => [i.topicId, i]));
    for (const size of [1, 2, 3]) {
      const seen: string[] = [];
      for (let page = 1; page <= Math.ceil(full.total / size); page++) {
        const res = await get(`collection=trending&baseline=global&pageSize=${size}&page=${page}`);
        expect(res.total).toBe(full.total);
        for (const item of res.items) {
          const ref = byId.get(item.topicId)!;
          expect({ verdict: item.verdict, p: item.mannKendall?.pValue, q: item.qValue, key: item.qFamilyKey, size: item.qFamilySize, rank: item.rank }).toEqual({ verdict: ref.verdict, p: ref.mannKendall?.pValue, q: ref.qValue, key: ref.qFamilyKey, size: ref.qFamilySize, rank: ref.rank });
          seen.push(item.topicId);
        }
      }
      expect(seen).toEqual(full.items.map((i) => i.topicId));
    }
    // The global family is every topic with a p-value, whatever the page.
    const withP = await db.trendSnapshotResult.count({ where: { baselineLevel: "global", pValue: { not: null } } });
    expect(full.items.every((i) => i.qFamilySize === withP)).toBe(true);
  });

  it("6. Fastest Growing: rising + both Nelis conditions + mean GGT ± SEM, ordered by mean GGT", async () => {
    const trending = await get("collection=trending&baseline=field&pageSize=100");
    const res = await get("collection=fastest_growing&baseline=field&pageSize=100");
    const rising = new Set(trending.items.map((i) => i.topicId));
    expect(res.items.length).toBeGreaterThan(0);
    for (const item of res.items) {
      expect(rising.has(item.topicId)).toBe(true);
      expect(item.ggt).toMatchObject({ conditionsMet: true, stabilityChecked: false });
      expect(item.ggt.meanPct).not.toBeNull();
      expect(item.ggt.semPct).not.toBeNull();
    }
    for (let k = 1; k < res.items.length; k++) expect(res.items[k - 1]!.ggt.meanPct!).toBeGreaterThanOrEqual(res.items[k]!.ggt.meanPct!);
    // T10008 rises but has < 50 papers in its first years: never "fastest growing".
    expect(res.items.some((i) => i.topicId === "T10008")).toBe(false);
    expect(res.excluded.ggtConditionsNotMet).toBe(trending.total - res.total);
  });

  it("7. Trending by Field: real field taxonomy, field baseline, full field families", async () => {
    const res = await get("collection=by_field&baseline=global");
    expect(res.baselineLevel).toBe("field"); // forced
    expect(res.fields!.map((f) => f.fieldId)).toEqual(["11", "12", "22"]);
    for (const f of res.fields!) {
      const inField = mock.dataset.topics.filter((t) => t.field === f.fieldId);
      const stored = await db.trendSnapshotResult.findMany({ where: { baselineLevel: "field", baselineUnit: f.fieldId } });
      expect(f.topicsInField).toBe(stored.length);
      expect(f.qFamilySize).toBe(stored.filter((r) => r.pValue !== null).length);
      expect(stored.every((r) => inField.some((t) => t.id === r.topicId))).toBe(true);
      for (const item of f.topics) expect(item).toMatchObject({ verdict: "rising", baselineUnit: { level: "field", id: f.fieldId }, taxonomy: { fieldId: f.fieldId }, qFamilyKey: `field:${f.fieldId}`, qFamilySize: f.qFamilySize });
    }
    // One field, paged through: same statistics as in the grouped view.
    const one = await get("collection=by_field&fieldId=11&pageSize=1&page=1");
    expect(one.fields).toHaveLength(1);
    expect(one.items[0]).toEqual(res.fields!.find((f) => f.fieldId === "11")!.topics[0]);
  });

  it("12. a sole member of its subfield is never ranked and is reported as not assessable", async () => {
    const stored = await db.trendSnapshotResult.findFirstOrThrow({ where: { baselineLevel: "subfield", topicId: "T10004" } });
    // Stored legacy values kept for compatibility: share 100%, no p, verdict "stable".
    expect(stored).toMatchObject({ pValue: null, qValue: null, verdict: "stable" });
    const res = await get("collection=trending&baseline=subfield&pageSize=100");
    expect(res.items.some((i) => i.topicId === "T10004")).toBe(false);
    expect(res.excluded.notAssessable).toBeGreaterThanOrEqual(1);
    const { assessabilityOf } = await import("../trend.discover.service.js");
    expect(assessabilityOf(stored)).toBe("not_assessable_sole_member");
  });

  it("13. items carry the OpenAlex topic id and name the detail page needs", async () => {
    const res = await get("collection=trending&baseline=field&pageSize=100");
    for (const item of res.items) {
      expect(item.topicId).toMatch(/^T\d+$/);
      expect(item.topicName).toBe(mock.dataset.topics.find((t) => t.id === item.topicId)!.name);
    }
  });

  it("rejects invalid query values", async () => {
    expect((await fetch(`${base}/trends/discover?collection=hot_right_now`)).status).toBe(400);
    expect((await fetch(`${base}/trends/discover?pageSize=1000`)).status).toBe(400);
  });

  it("14. existing trends routes still answer (the topic route is not shadowed)", async () => {
    const res = await fetch(`${base}/trends/topic-candidates?q=ai`);
    expect(res.status).not.toBe(404);
  });
});
