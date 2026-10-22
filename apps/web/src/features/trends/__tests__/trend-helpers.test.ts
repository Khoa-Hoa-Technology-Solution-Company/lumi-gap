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

function shift(z: number, qValue: number, logOddsRatio = 1, papersB = 40): KeywordShift {
  return {
    term: "x", papersA: 10, papersB, logOddsRatio, z, pValue: qValue, qValue,
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
  it("is significant only for a positive shift with q below 0.05 and enough papers in period B", () => {
    expect(isShiftSignificant(shift(3, 0.01))).toBe(true);
    expect(isShiftSignificant(shift(3, 0.2))).toBe(false);
    expect(isShiftSignificant(shift(-3, 0.01))).toBe(false);
    // P0.5: below KEYWORD_SHIFT_MIN_PAPERS (30) in period B it is not a finding.
    expect(isShiftSignificant(shift(3, 0.01, 1, 12))).toBe(false);
  });

  it("formats q and the A to B counts", () => {
    expect(formatQValue(0.0002)).toBe("q < 0.001");
    expect(formatQValue(0.0123)).toBe("q = 0.012");
    expect(formatShiftCounts(shift(2, 0.5))).toBe("10 → 40");
  });

  it("picks the significant keyword with the largest effect size, ignoring raw growth", () => {
    const keywords = [
      { keyword: "hot but noisy", totalPapers: 5, growthRatePct: 900, yearlyBreakdown: [], shift: shift(1.2, 0.4, 3) },
      { keyword: "frequent", totalPapers: 9000, growthRatePct: 10, yearlyBreakdown: [], shift: shift(40, 0.0001, 0.2) },
      { keyword: "solid", totalPapers: 200, growthRatePct: 30, yearlyBreakdown: [], shift: shift(6, 0.001, 1.5) },
    ];
    // Not the largest z ("frequent"), not the largest raw growth ("hot but noisy").
    expect(getFastestKeyword(keywords)?.keyword).toBe("solid");
  });

  it("never picks a keyword without the shift test (raw growth only)", () => {
    const untested = [{ keyword: "hot", totalPapers: 5, growthRatePct: 900, yearlyBreakdown: [] }];
    expect(getFastestKeyword(untested)).toBeNull();
  });
});
