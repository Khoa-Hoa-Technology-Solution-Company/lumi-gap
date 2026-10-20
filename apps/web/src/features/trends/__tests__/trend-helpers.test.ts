import { describe, expect, it } from "vitest";
import type { YearlyCitationMetric } from "@trend/shared-types";
import { aggregatePpTop10, averageCitations, resolveMetricMode, sumCitations } from "../trend-impact";
import { formatQValue, formatShiftCounts, isShiftSignificant, type KeywordShift } from "../trend-source";
import { getFastestKeyword } from "../../../pages/trends.insights";

const openAlexTrend: YearlyCitationMetric[] = [
  { year: 2023, count: 100, totalCitations: null, avgCitations: null, topCitedCount: 12, ppTop10Pct: 12 },
  { year: 2024, count: 300, totalCitations: null, avgCitations: null, topCitedCount: 24, ppTop10Pct: 8 },
];
const localTrend: YearlyCitationMetric[] = [
  { year: 2023, count: 4, totalCitations: 20, avgCitations: 5 },
  { year: 2024, count: 6, totalCitations: 10, avgCitations: 10 / 6 },
];

function shift(z: number, qValue: number): KeywordShift {
  return {
    term: "x", papersA: 10, papersB: 40, logOddsRatio: 1, z, pValue: qValue, qValue,
    periodA: { yearFrom: 2016, yearTo: 2020 }, periodB: { yearFrom: 2021, yearTo: 2025 },
  };
}

describe("trend impact helpers", () => {
  it("never turns null citation totals into zero", () => {
    expect(sumCitations(openAlexTrend)).toBeNull();
    expect(averageCitations(openAlexTrend)).toBeNull();
    expect(sumCitations(localTrend)).toBe(30);
    expect(averageCitations(localTrend)).toBe(3);
  });

  it("aggregates PP(top 10%) as top works over all works", () => {
    expect(aggregatePpTop10(openAlexTrend)).toBeCloseTo(9, 5);
    expect(aggregatePpTop10(localTrend)).toBeNull();
  });

  it("prefers PP(top 10%) over citation sums and falls back to papers without either", () => {
    expect(resolveMetricMode("citations_total", openAlexTrend)).toBe("pp_top10");
    expect(resolveMetricMode("pp_top10", localTrend)).toBe("citations_total");
    expect(resolveMetricMode("citations_avg", [])).toBe("papers");
    expect(resolveMetricMode("papers", openAlexTrend)).toBe("papers");
  });
});

describe("keyword shift helpers", () => {
  it("is significant only for a positive shift with q below 0.05", () => {
    expect(isShiftSignificant(shift(3, 0.01))).toBe(true);
    expect(isShiftSignificant(shift(3, 0.2))).toBe(false);
    expect(isShiftSignificant(shift(-3, 0.01))).toBe(false);
  });

  it("formats q and the A to B counts", () => {
    expect(formatQValue(0.0002)).toBe("q < 0.001");
    expect(formatQValue(0.0123)).toBe("q = 0.012");
    expect(formatShiftCounts(shift(2, 0.5))).toBe("10 → 40");
  });

  it("picks the keyword with the largest significant z, ignoring raw growth", () => {
    const keywords = [
      { keyword: "hot but noisy", totalPapers: 5, growthRatePct: 900, yearlyBreakdown: [], shift: shift(1.2, 0.4) },
      { keyword: "solid", totalPapers: 200, growthRatePct: 30, yearlyBreakdown: [], shift: shift(6, 0.001) },
    ];
    expect(getFastestKeyword(keywords)?.keyword).toBe("solid");
    expect(getFastestKeyword(keywords.map(({ shift: _s, ...k }) => k))?.keyword).toBe("hot but noisy");
  });
});
