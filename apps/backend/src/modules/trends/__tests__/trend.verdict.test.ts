import { describe, expect, it } from "vitest";
import type { TrendClassification, TrendingTopic } from "@trend/shared-types";
import {
  FLAT_PCT,
  FULL_WINDOW_YEARS,
  HIGH_CONFIDENCE_MIN_YEARS,
  HIGH_CONFIDENCE_P,
  LIFECYCLE_MIN_YEARS,
  MIN_PAPERS,
  MIN_YEARS,
  NEAR_PEAK,
  PAST_PEAK,
  RECENT_WINDOW_YEARS,
  SIGNIFICANCE_LEVEL,
  buildRecommendedComparisons,
  classifyTrend,
  compareByTotal,
  compareByTrend,
  countVerdicts,
  plateauStatistics,
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
    recentRelativeChangePct: 6,
    peakRatio: 0.95,
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
    expect(FULL_WINDOW_YEARS).toBe(15);
    expect(RECENT_WINDOW_YEARS).toBe(5);
    expect(FLAT_PCT).toBe(2);
    expect(NEAR_PEAK).toBe(0.85);
    expect(PAST_PEAK).toBe(0.5);
    expect(LIFECYCLE_MIN_YEARS).toBe(10);
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

describe("classifyTrend lifecycle (spec 2026-11-14 §5.3)", () => {
  const flat = { recentRelativeChangePct: 1, peakRatio: 0.95 };

  it("saturated: a significant increase that is flat near its peak", () => {
    const result = classifyTrend({ ...stats(flat), source: "openalex" });
    expect(result.verdict).toBe("saturated");
    expect(result.reasons).toEqual(["PLATEAU_AFTER_INCREASE"]);
    expect(result.confidence).toBe("high");
    expect(result.recentRelativeChangePct).toBe(1);
    expect(result.peakRatio).toBe(0.95);
    expect(classifyTrend({ ...stats({ recentRelativeChangePct: -1.9, peakRatio: 0.85 }), source: "openalex" }).verdict).toBe("saturated");
  });

  it("stays rising when the recent change is not flat or the share is not near its peak", () => {
    expect(classifyTrend({ ...stats({ recentRelativeChangePct: 2, peakRatio: 0.95 }), source: "openalex" }).verdict).toBe("rising");
    expect(classifyTrend({ ...stats({ recentRelativeChangePct: -2, peakRatio: 0.95 }), source: "openalex" }).verdict).toBe("rising");
    expect(classifyTrend({ ...stats({ recentRelativeChangePct: 1, peakRatio: 0.84 }), source: "openalex" }).verdict).toBe("rising");
    expect(classifyTrend({ ...stats({ recentRelativeChangePct: null, peakRatio: 0.95 }), source: "openalex" }).verdict).toBe("rising");
    expect(classifyTrend({ ...stats({ recentRelativeChangePct: 1, peakRatio: null }), source: "openalex" }).verdict).toBe("rising");
  });

  it("past_peak: a significant increase whose share ended under half of its peak", () => {
    const result = classifyTrend({ ...stats({ recentRelativeChangePct: -60, peakRatio: 0.15 }), source: "openalex" });
    expect(result.verdict).toBe("past_peak");
    expect(result.reasons).toEqual(["DECLINE_AFTER_PEAK"]);
    expect(result.confidence).toBe("high");
    expect(classifyTrend({ ...stats({ recentRelativeChangePct: 0, peakRatio: 0.49 }), source: "openalex" }).verdict).toBe("past_peak");
    expect(classifyTrend({ ...stats({ recentRelativeChangePct: -30, peakRatio: 0.5 }), source: "openalex" }).verdict).toBe("rising");
  });

  it("n < 10 is never saturated or past_peak", () => {
    expect(classifyTrend({ ...stats({ ...flat, yearsUsed: 9 }), source: "openalex" }).verdict).toBe("rising");
    expect(classifyTrend({ ...stats({ peakRatio: 0.1, yearsUsed: 9 }), source: "openalex" }).verdict).toBe("rising");
  });

  it("only relabels a significant increase", () => {
    expect(classifyTrend({ ...stats({ ...flat, s: -20 }), source: "openalex" }).verdict).toBe("declining");
    expect(classifyTrend({ ...stats({ peakRatio: 0.1, s: -20 }), source: "openalex" }).verdict).toBe("declining");
    expect(classifyTrend({ ...stats({ ...flat, pValue: 0.2 }), source: "openalex" }).verdict).toBe("stable");
    expect(classifyTrend({ ...stats({ ...flat, totalPapers: 10 }), source: "openalex" }).verdict).toBe("insufficient");
    expect(classifyTrend({ ...stats(flat), source: "local" }).verdict).toBe("insufficient");
  });

  it("takes other thresholds when given", () => {
    const input = { ...stats({ recentRelativeChangePct: 2.5, peakRatio: 0.8 }), source: "openalex" as const };
    expect(classifyTrend(input).verdict).toBe("rising");
    expect(classifyTrend(input, { flatPct: 3, nearPeak: 0.8, pastPeak: 0.5 }).verdict).toBe("saturated");
    expect(classifyTrend(input, { flatPct: 3, nearPeak: 0.8, pastPeak: 0.9 }).verdict).toBe("past_peak");
  });
});

describe("plateauStatistics", () => {
  const series = (shares: number[]) => shares.map((sharePct, i) => ({ year: 2011 + i, count: 10, sharePct }));

  it("computes r_R over the last 5 years and the peak ratio of the last 3", () => {
    // R = [8, 9, 10, 10, 10]: pairwise slopes 1, 1, 2/3, 1/2, 1, 1/2, 1/3, 0, 0, 0 → median (1/2 + 1/2) / 2 = 0.5
    // median(R) = 10 → r_R = 0.5 / 10 · 100 = 5; last 3 years median 10, peak 10 → 1
    const result = plateauStatistics(series([1, 2, 4, 6, 8, 9, 10, 10, 10]));
    expect(result.recentRelativeChangePct).toBeCloseTo(5, 10);
    expect(result.peakRatio).toBe(1);
  });

  it("a share that fell back has a low peak ratio and a negative recent change", () => {
    // R = [20, 10, 4, 3, 2]; last 3 median 3, peak 20 → 0.15
    const result = plateauStatistics(series([1, 2, 20, 10, 4, 3, 2]).reverse());
    expect(result.peakRatio).toBeCloseTo(0.15, 10);
    expect(result.recentRelativeChangePct!).toBeLessThan(0);
  });

  it("is null without data or with a zero share", () => {
    expect(plateauStatistics([])).toEqual({ recentRelativeChangePct: null, peakRatio: null });
    expect(plateauStatistics(series([0, 0, 0, 0, 0]))).toEqual({ recentRelativeChangePct: null, peakRatio: null });
    expect(plateauStatistics(series([3])).recentRelativeChangePct).toBeNull();
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
    // last 3 shares 2, 6, 7 → median 6; peak 7
    expect(result.peakRatio).toBeCloseTo(6 / 7, 10);
    expect(result.recentRelativeChangePct).not.toBeNull();
  });

  it("handles an empty series", () => {
    expect(shareTrendStatistics([])).toEqual({
      yearsUsed: 0,
      totalPapers: 0,
      mannKendall: null,
      senSlope: null,
      senSlopeCi95: null,
      relativeChangePct: null,
      recentRelativeChangePct: null,
      peakRatio: null,
    });
  });
});

function topic(name: string, verdict: TrendClassification["verdict"], relativeChangePct: number | null, totalPapers: number): TrendingTopic {
  return {
    topic: name,
    totalPapers,
    yearlyBreakdown: [],
    classification: {
      verdict,
      confidence: verdict === "stable" || verdict === "insufficient" ? null : "medium",
      yearsUsed: 10,
      totalPapers,
      mannKendall: null,
      qValue: null,
      senSlope: null,
      senSlopeCi95: null,
      relativeChangePct,
      recentRelativeChangePct: null,
      peakRatio: null,
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
    topic("past peak", "past_peak", 40, 700),
    topic("saturated small", "saturated", 9, 20),
    topic("saturated big", "saturated", 1, 600),
  ];

  it("groups by verdict and orders inside each group", () => {
    expect([...topics].sort(compareByTrend).map((row) => row.topic)).toEqual([
      "rising fast",
      "rising slow",
      "rising null",
      "saturated big",
      "saturated small",
      "stable big",
      "stable small",
      "past peak",
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

describe("countVerdicts", () => {
  it("counts every verdict, 0 when none", () => {
    expect(countVerdicts([topic("a", "saturated", 1, 10), topic("b", "past_peak", 1, 10), topic("c", "rising", 1, 10)])).toEqual({
      rising: 1,
      saturated: 1,
      past_peak: 1,
      declining: 0,
      stable: 0,
      insufficient: 0,
    });
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
