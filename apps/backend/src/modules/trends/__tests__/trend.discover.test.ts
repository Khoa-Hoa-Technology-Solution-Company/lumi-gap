import { beforeEach, describe, expect, it, vi } from "vitest";

/** P2.2 Discover: behaviour that needs no database (store missing, assessability). */
const prisma = vi.hoisted(() => ({ trendSnapshot: { findFirst: vi.fn() } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => prisma }));

import { TrendsDiscoverQuerySchema } from "../dto/trends.schema.js";
import { assessabilityOf, DISCOVER_RANKING_RULES, getTrendsDiscover } from "../trend.discover.service.js";

beforeEach(() => vi.clearAllMocks());

describe("Discover Trends without a snapshot store (P2.2)", () => {
  it("says the store is unavailable when the P2.1 tables do not exist (no 500, no local fallback)", async () => {
    prisma.trendSnapshot.findFirst.mockRejectedValue(Object.assign(new Error("relation does not exist"), { code: "P2021" }));
    const res = await getTrendsDiscover(TrendsDiscoverQuerySchema.parse({}));
    expect(res).toMatchObject({ status: "unavailable", unavailableReason: "SNAPSHOT_STORE_UNAVAILABLE", provenance: null, items: [], total: 0, collection: "trending", baselineLevel: "field" });
  });

  it("rethrows other database errors", async () => {
    prisma.trendSnapshot.findFirst.mockRejectedValue(Object.assign(new Error("connection refused"), { code: "P1001" }));
    await expect(getTrendsDiscover(TrendsDiscoverQuerySchema.parse({}))).rejects.toThrow("connection refused");
  });

  it("only ever reads an active snapshot of the default scope", async () => {
    prisma.trendSnapshot.findFirst.mockResolvedValue(null);
    const res = await getTrendsDiscover(TrendsDiscoverQuerySchema.parse({ collection: "by_field", baseline: "global" }));
    expect(res).toMatchObject({ status: "unavailable", unavailableReason: "NO_ACTIVE_SNAPSHOT", baselineLevel: "field" });
    expect(prisma.trendSnapshot.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ isActive: true, status: "active" }) });
  });
});

describe("assessability", () => {
  const share = (rows: Array<[number, number]>) => rows.map(([count, total], i) => ({ year: 2016 + i, count, total, sharePct: (count / total) * 100 }));
  it("a topic that is its whole reference population is not assessable, whatever its legacy verdict", () => {
    expect(assessabilityOf({ verdict: "stable", pValue: null, shareSeries: share([[5, 5], [7, 7], [9, 9]]) })).toBe("not_assessable_sole_member");
  });
  it("a constant share below 100% is not assessable either", () => {
    expect(assessabilityOf({ verdict: "stable", pValue: null, shareSeries: share([[1, 2], [2, 4], [3, 6]]) })).toBe("not_assessable_constant_share");
  });
  it("insufficient data and tested series", () => {
    expect(assessabilityOf({ verdict: "insufficient", pValue: 0.5, shareSeries: [] })).toBe("insufficient_data");
    expect(assessabilityOf({ verdict: "stable", pValue: 0.4, shareSeries: share([[1, 10], [2, 10]]) })).toBe("assessable");
  });
  it("documents a ranking rule per collection, with no burst or emerging collection", () => {
    expect(Object.keys(DISCOVER_RANKING_RULES)).toEqual(["trending", "fastest_growing", "by_field"]);
    expect(() => TrendsDiscoverQuerySchema.parse({ collection: "emerging" })).toThrow();
    expect(DISCOVER_RANKING_RULES.fastest_growing).toMatch(/stability rule is not checked/);
  });
});
