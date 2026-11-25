import { describe, expect, it, vi } from "vitest";
import type { TrendCrossTopicAnalysis, TrendCrossTopicPoint } from "@trend/shared-types";
import { buildBandBoxes, buildRHistogram, hasCrossTopic, parseSizeBands, splitClearTopics, symlog } from "../cross-topic";

vi.mock("@/services/api-client", () => ({ api: { get: vi.fn() } }));

const point = (over: Partial<TrendCrossTopicPoint>): TrendCrossTopicPoint => ({ topic: "t", totalPapers: 100, r: 0, verdict: "stable", sizeBand: "small", outlier: false, clear: false, ...over });

describe("parseSizeBands", () => {
  it("keeps valid bands once, in size order, and drops the rest", () => {
    expect(parseSizeBands("large,small,small,huge")).toEqual(["small", "large"]);
    expect(parseSizeBands("")).toEqual([]);
    expect(parseSizeBands(null)).toEqual([]);
  });
});

describe("trendsApi.overview", () => {
  it("serialises sizeBands as a comma separated list and leaves an empty list out", async () => {
    const { api } = await import("@/services/api-client");
    const { trendsApi } = await import("../api/trends.api");
    vi.mocked(api.get).mockResolvedValue({ data: { data: {} } });
    await trendsApi.overview({ sizeBands: ["small", "large"] });
    await trendsApi.overview({ sizeBands: [] });
    const calls = vi.mocked(api.get).mock.calls;
    const serialize = (calls[0]![1] as { paramsSerializer: { serialize: (p: unknown) => string } }).paramsSerializer.serialize;
    expect(decodeURIComponent(serialize((calls[0]![1] as { params: unknown }).params))).toBe("sizeBands=small,large");
    expect(serialize((calls[1]![1] as { params: unknown }).params)).toBe("");
  });
});

describe("buildRHistogram", () => {
  it("clips an extreme value into an overflow bin instead of stretching the range", () => {
    const points = [...Array.from({ length: 99 }, (_, i) => point({ r: i - 40, verdict: i % 2 ? "rising" : "declining" })), point({ r: 427, verdict: "past_peak" })];
    const h = buildRHistogram(points, 10);
    expect(h.hi).toBeLessThan(100);
    expect(h.clippedHigh).toBeGreaterThan(0);
    expect(h.bins[h.bins.length - 1]!.kind).toBe("over");
    expect(h.bins.reduce((sum, bin) => sum + bin.total, 0)).toBe(100);
    expect(h.bins.find((bin) => bin.kind === "over")!.counts.past_peak).toBe(1);
  });

  it("splits counts by verdict and handles empty and constant input", () => {
    expect(buildRHistogram([]).bins).toEqual([]);
    const h = buildRHistogram([point({ r: 5 }), point({ r: 5 })], 4);
    expect(h.bins.reduce((sum, bin) => sum + bin.total, 0)).toBe(2);
    expect(h.clippedLow + h.clippedHigh).toBe(0);
  });
});

describe("symlog", () => {
  it("is odd, zero at zero and compresses large values", () => {
    expect(symlog(0)).toBe(0);
    expect(symlog(-30)).toBeCloseTo(-symlog(30));
    expect(symlog(427)).toBeLessThan(2);
  });
});

const analysis: TrendCrossTopicAnalysis = {
  population: 6,
  bandCutoffs: { smallMax: 10, mediumMax: 20 },
  rStats: { all: null, small: { n: 6, mean: 0, median: 0, q1: -1, q3: 1, variance: 1, standardDeviation: 1, min: -2, max: 30, range: 32, coefficientOfVariation: null, skewness: null, kurtosis: null }, medium: null, large: null },
  fences: { small: { q1: -1, q3: 1, iqr: 2, lower: -4, upper: 4 }, medium: null, large: null },
  points: [point({ r: -2 }), point({ r: 1 }), point({ r: 30, outlier: true, clear: true, verdict: "rising" }), point({ r: -9, outlier: true, clear: true, verdict: "declining" }), point({ r: 0 })],
};

describe("band boxes and clear topics", () => {
  it("draws whiskers at the last value inside the fences and lists anomalous topics", () => {
    const [box] = buildBandBoxes(analysis);
    expect(buildBandBoxes(analysis)).toHaveLength(1);
    expect(box!.whiskerLow).toBe(-2);
    expect(box!.whiskerHigh).toBe(1);
    expect(box!.outliers.map((p) => p.r).sort((a, b) => a - b)).toEqual([-9, 30]);
  });

  it("splits clear topics by direction, strongest first", () => {
    const { rising, declining } = splitClearTopics(analysis.points);
    expect(rising.map((p) => p.r)).toEqual([30]);
    expect(declining.map((p) => p.r)).toEqual([-9]);
  });

  it("reports an absent or empty analysis so the section can hide", () => {
    expect(hasCrossTopic(null)).toBe(false);
    expect(hasCrossTopic(undefined)).toBe(false);
    expect(hasCrossTopic({ ...analysis, points: [] })).toBe(false);
    expect(hasCrossTopic(analysis)).toBe(true);
  });
});
