import { describe, expect, it } from "vitest";
import { buildTopicEda } from "../trend.eda.js";

const row = (year: number, sharePct: number, count = 10) => ({ year, count, total: 1000, sharePct });

describe("buildTopicEda", () => {
  it("fits the line, flags the anomalous year and describes the series", () => {
    // Share 1..8 on a straight line except 2016, which jumps to 20.
    // Pairwise slopes: the 21 pairs without 2016 give 1, 2 pairs are below and 5 above → the median of all 28 is 1.
    // Offsets y − x: 2016 gives 20 − 2016, the others 1 − 2011 = −2010 → median −2010 → fitted(year) = year − 2010.
    // Residuals: 0 everywhere except 2016: 20 − 6 = 14. MAD of the residuals is 0 (7 of 8 are 0), so no score is defined.
    const series = [row(2011, 1), row(2012, 2), row(2013, 3), row(2014, 4), row(2015, 5), row(2016, 20), row(2017, 7), row(2018, 8)];
    const eda = buildTopicEda({ shareSeries: series, yearFrom: 2011, yearTo: 2019, lastCompleteYear: 2018 });

    expect(eda.trendLine!.slope).toBeCloseTo(1, 10);
    expect(eda.trendLine!.intercept).toBeCloseTo(-2010, 8);
    expect(eda.years.find((year) => year.year === 2016)!.residual).toBeCloseTo(14, 8);
    expect(eda.years.find((year) => year.year === 2014)!.residual).toBeCloseTo(0, 8);
    expect(eda.residualMad).toBe(0);
    expect(eda.outlierYears).toEqual([]);
    expect(eda.share).toMatchObject({ n: 8, min: 1, max: 20, range: 19 });
    expect(eda.papers).toMatchObject({ n: 8, mean: 10, variance: 0 });
    expect(eda.recentWindow).toEqual({ yearFrom: 2014, yearTo: 2018 });
    expect(eda.excludedYears).toEqual([{ year: 2019, reason: "incomplete" }]);
  });

  it("flags a year whose residual is a MAD outlier", () => {
    // Noisy line: residuals are small and non-zero, 2015 is far above.
    const shares = [1.0, 2.1, 2.9, 4.2, 12.0, 5.9, 7.1, 8.0, 8.8];
    const eda = buildTopicEda({ shareSeries: shares.map((share, index) => row(2011 + index, share)), yearFrom: 2011, yearTo: 2019, lastCompleteYear: 2019 });
    expect(eda.outlierYears).toEqual([2015]);
    const flagged = eda.years.find((year) => year.year === 2015)!;
    expect(flagged.outlier).toBe(true);
    expect(flagged.outlierScore!).toBeGreaterThan(2.5);
    expect(eda.years.filter((year) => year.outlier)).toHaveLength(1);
    expect(eda.residualMad!).toBeGreaterThan(0);
  });

  it("reports years without a population and years without topic papers", () => {
    const eda = buildTopicEda({ shareSeries: [row(2012, 0, 0), row(2014, 1), row(2013, 0.5)], yearFrom: 2011, yearTo: 2015, lastCompleteYear: 2014 });
    expect(eda.excludedYears).toEqual([
      { year: 2011, reason: "no_population" },
      { year: 2015, reason: "incomplete" },
    ]);
    expect(eda.zeroCountYears).toEqual([2012]);
    expect(eda.years.map((year) => year.year)).toEqual([2012, 2013, 2014]);
  });

  it("handles an empty series", () => {
    const eda = buildTopicEda({ shareSeries: [], yearFrom: 2020, yearTo: 2021, lastCompleteYear: 2020 });
    expect(eda).toMatchObject({ share: null, papers: null, trendLine: null, years: [], residualMad: null, outlierYears: [], recentWindow: null });
    expect(eda.excludedYears).toEqual([
      { year: 2020, reason: "no_population" },
      { year: 2021, reason: "incomplete" },
    ]);
  });

  it("gives no line or scores for a single year", () => {
    const eda = buildTopicEda({ shareSeries: [row(2020, 3)], yearFrom: 2020, yearTo: 2020, lastCompleteYear: 2020 });
    expect(eda.trendLine).toBeNull();
    expect(eda.years).toEqual([{ year: 2020, sharePct: 3, fitted: null, residual: null, outlierScore: null, outlier: false }]);
  });
});
