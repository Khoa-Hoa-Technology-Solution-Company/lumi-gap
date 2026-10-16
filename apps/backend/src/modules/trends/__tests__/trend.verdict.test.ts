import { describe, expect, it } from "vitest";
import type { TrendClassification, TrendingTopic } from "@trend/shared-types";
import {
  HIGH_CONFIDENCE_MIN_YEARS,
  HIGH_CONFIDENCE_P,
  MIN_PAPERS,
  MIN_YEARS,
  SIGNIFICANCE_LEVEL,
  buildRecommendedComparisons,
  classifyTrend,
  compareByTotal,
  compareByTrend,
  shareTrendStatistics,
  type ShareTrendStatistics,
} from "../trend.verdict.js";

function stats(overrides: Partial<ShareTrendStatistics> & { s?: number; pValue?: number } = {}): ShareTrendStatistics {
  const { s = 20, pValue = 0.001, ...rest } = overrides;
  return {
    yearsUsed: 10,
    totalPapers: 500,
    mannKendall: { s, z: s > 0 ? 3 : s < 0 ? -3 : 0, tau: s / 45, pValue },
    senSlope: 0.1,
    senSlopeCi95: [0.05, 0.15],
    relativeChangePct: 5,
    ...rest,
  };
}

describe("constants", () => {
  it("are the spec values", () => {
    expect(SIGNIFICANCE_LEVEL).toBe(0.05);
    expect(MIN_YEARS).toBe(5);
    expect(MIN_PAPERS).toBe(30);
    expect(HIGH_CONFIDENCE_P).toBe(0.01);
    expect(HIGH_CONFIDENCE_MIN_YEARS).toBe(8);
  });
});

describe("classifyTrend (spec §4.1)", () => {
  it("row 1: local source is insufficient (LOCAL_CORPUS) and keeps the numbers", () => {
    const result = classifyTrend({ ...stats(), source: "local", qValue: 0.001 });
    expect(result.verdict).toBe("insufficient");
    expect(result.confidence).toBeNull();
    expect(result.reasons).toEqual(["LOCAL_CORPUS"]);
    expect(result.senSlope).toBe(0.1);
    expect(result.mannKendall!.pValue).toBe(0.001);
    expect(result.qValue).toBe(0.001);
  });

  it("row 2: n = 4 is insufficient (TOO_FEW_YEARS)", () => {
    const result = classifyTrend({ ...stats({ yearsUsed: 4 }), source: "openalex" });
    expect(result.verdict).toBe("insufficient");
    expect(result.reasons).toEqual(["TOO_FEW_YEARS"]);
  });

  it("row 2: n = 5 passes the year gate", () => {
    expect(classifyTrend({ ...stats({ yearsUsed: 5, pValue: 0.028 }), source: "openalex" }).verdict).toBe("rising");
  });

  it("row 3: fewer than 30 papers is insufficient (TOO_FEW_PAPERS)", () => {
    const result = classifyTrend({ ...stats({ totalPapers: 29 }), source: "openalex" });
    expect(result.verdict).toBe("insufficient");
    expect(result.reasons).toEqual(["TOO_FEW_PAPERS"]);
    expect(classifyTrend({ ...stats({ totalPapers: 30 }), source: "openalex" }).verdict).toBe("rising");
  });

  it("lists every failed data gate", () => {
    const result = classifyTrend({ ...stats({ yearsUsed: 2, totalPapers: 3 }), source: "local" });
    expect(result.reasons).toEqual(["LOCAL_CORPUS", "TOO_FEW_YEARS", "TOO_FEW_PAPERS"]);
  });

  it("row 4: p* < α and S > 0 is rising", () => {
    const result = classifyTrend({ ...stats({ s: 20, pValue: 0.02 }), source: "openalex" });
    expect(result.verdict).toBe("rising");
    expect(result.reasons).toEqual(["SIGNIFICANT_INCREASE"]);
  });

  it("row 5: p* < α and S < 0 is declining", () => {
    const result = classifyTrend({ ...stats({ s: -20, pValue: 0.02 }), source: "openalex" });
    expect(result.verdict).toBe("declining");
    expect(result.reasons).toEqual(["SIGNIFICANT_DECREASE"]);
  });

  it("row 6: no significant trend is stable", () => {
    const result = classifyTrend({ ...stats({ pValue: 0.2 }), source: "openalex" });
    expect(result.verdict).toBe("stable");
    expect(result.confidence).toBeNull();
    expect(result.reasons).toEqual(["NO_SIGNIFICANT_TREND"]);
    expect(classifyTrend({ ...stats({ pValue: 0.05 }), source: "openalex" }).verdict).toBe("stable");
    expect(classifyTrend({ ...stats({ mannKendall: null }), source: "openalex" }).verdict).toBe("stable");
  });

  it("uses the q-value instead of the p-value when given", () => {
    expect(classifyTrend({ ...stats({ pValue: 0.01 }), source: "openalex", qValue: 0.08 }).verdict).toBe("stable");
    const result = classifyTrend({ ...stats({ pValue: 0.04 }), source: "openalex", qValue: 0.045 });
    expect(result.verdict).toBe("rising");
    expect(result.qValue).toBe(0.045);
    expect(classifyTrend({ ...stats(), source: "openalex" }).qValue).toBeNull();
  });

  it("confidence: high needs p* < 0.01 and n ≥ 8, otherwise medium", () => {
    expect(classifyTrend({ ...stats({ pValue: 0.009, yearsUsed: 8 }), source: "openalex" }).confidence).toBe("high");
    expect(classifyTrend({ ...stats({ s: -20, pValue: 0.009, yearsUsed: 10 }), source: "openalex" }).confidence).toBe("high");
    expect(classifyTrend({ ...stats({ pValue: 0.009, yearsUsed: 7 }), source: "openalex" }).confidence).toBe("medium");
    expect(classifyTrend({ ...stats({ pValue: 0.01, yearsUsed: 10 }), source: "openalex" }).confidence).toBe("medium");
    expect(classifyTrend({ ...stats({ pValue: 0.001, yearsUsed: 10 }), source: "openalex", qValue: 0.02 }).confidence).toBe("medium");
  });
});

describe("shareTrendStatistics", () => {
  it("computes Mann–Kendall, Sen's slope, its CI and the relative change of the share", () => {
    const series = [0, 1, 3, 2, 6, 7].map((sharePct, i) => ({ year: 2016 + i, count: 10, sharePct }));
    const result = shareTrendStatistics([...series].reverse());
    expect(result.yearsUsed).toBe(6);
    expect(result.totalPapers).toBe(60);
    expect(result.mannKendall!.s).toBe(13);
    expect(result.senSlope).toBe(1.5);
    expect(result.senSlopeCi95![0]).toBeCloseTo(0.547275, 5);
    // median share = (2 + 3) / 2 = 2.5 → r = 1.5 / 2.5 · 100 = 60 %/year
    expect(result.relativeChangePct).toBeCloseTo(60, 10);
  });

  it("handles an empty series", () => {
    expect(shareTrendStatistics([])).toEqual({
      yearsUsed: 0,
      totalPapers: 0,
      mannKendall: null,
      senSlope: null,
      senSlopeCi95: null,
      relativeChangePct: null,
    });
  });
});

function topic(name: string, verdict: TrendClassification["verdict"], relativeChangePct: number | null, totalPapers: number): TrendingTopic {
  return {
    topic: name,
    totalPapers,
    yearlyBreakdown: [],
    growthRatePct: 0,
    cagr3yPct: null,
    momentum: 0,
    classification: {
      verdict,
      confidence: verdict === "rising" || verdict === "declining" ? "medium" : null,
      yearsUsed: 10,
      totalPapers,
      mannKendall: null,
      qValue: null,
      senSlope: null,
      senSlopeCi95: null,
      relativeChangePct,
      reasons: [],
    },
  };
}

describe("compareByTrend (spec §5)", () => {
  const topics = [
    topic("insufficient big", "insufficient", 99, 9000),
    topic("declining slow", "declining", -2, 100),
    topic("stable small", "stable", 1, 50),
    topic("rising slow", "rising", 3, 5000),
    topic("declining fast", "declining", -10, 100),
    topic("rising null", "rising", null, 9000),
    topic("stable big", "stable", -1, 800),
    topic("rising fast", "rising", 12, 10),
    topic("insufficient small", "insufficient", null, 5),
  ];

  it("groups by verdict and orders inside each group", () => {
    expect([...topics].sort(compareByTrend).map((row) => row.topic)).toEqual([
      "rising fast",
      "rising slow",
      "rising null",
      "stable big",
      "stable small",
      "declining fast",
      "declining slow",
      "insufficient big",
      "insufficient small",
    ]);
  });

  it("sorts by total papers for sortBy = total", () => {
    expect([...topics].sort(compareByTotal).map((row) => row.topic).slice(0, 3)).toEqual(["insufficient big", "rising null", "rising slow"]);
  });
});

describe("buildRecommendedComparisons", () => {
  it("takes the first three rising topics in trend order", () => {
    const list = [
      topic("stable", "stable", 0, 900),
      topic("r1", "rising", 5, 10),
      topic("r2", "rising", 9, 10),
      topic("r3", "rising", 1, 10),
      topic("r4", "rising", 0.5, 10),
    ];
    const [recommendation] = buildRecommendedComparisons(list);
    expect(recommendation!.topics).toEqual(["r2", "r1", "r3"]);
    expect(recommendation!.metrics[0]).toMatchObject({ topic: "r2", relativeChangePct: 9 });
  });

  it("recommends nothing with fewer than two rising topics", () => {
    expect(buildRecommendedComparisons([topic("r1", "rising", 5, 10), topic("s", "stable", 0, 10)])).toEqual([]);
  });
});
