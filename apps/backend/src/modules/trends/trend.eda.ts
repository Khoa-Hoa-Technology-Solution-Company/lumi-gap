import type { TopicEda, TrendShareYear } from "@trend/shared-types";
import { describe, residuals, theilSenLine } from "./trend.descriptive.js";
import { MAD_CUTOFF, madOutliers } from "./trend.outliers.js";
import { RECENT_WINDOW_YEARS } from "./trend.verdict.js";
import { range } from "./trend.utils.js";

/**
 * Exploratory data analysis of one topic's yearly share, in the order the page
 * shows it (spec docs/superpowers/specs/2026-11-14-trend-eda-lifecycle-design.md §4).
 * Pure function, no DB or I/O. It only describes the series: the verdict is
 * decided by classifyTrend and no value computed here changes it.
 *
 *   4.1 data check   years left out (still running, or N_t = 0), years with n_t = 0
 *   4.2 description  describe() of the share s_t and of the paper count n_t
 *   4.3 trend line   Theil–Sen line of the share and its residuals e_t = s_t − ŝ_t
 *   4.4 anomalies    years whose residual is a MAD outlier (cut-off 2.5)
 *
 * `shareSeries` holds the used years only (complete, N_t > 0), in any order.
 * `yearFrom..yearTo` is the requested window.
 */
export function buildTopicEda(input: { shareSeries: TrendShareYear[]; yearFrom: number; yearTo: number; lastCompleteYear: number }): TopicEda {
  const series = [...input.shareSeries].sort((a, b) => a.year - b.year);
  const used = new Set(series.map((row) => row.year));
  const excludedYears = range(input.yearFrom, input.yearTo)
    .filter((year) => !used.has(year))
    .map((year) => ({ year, reason: year > input.lastCompleteYear ? ("incomplete" as const) : ("no_population" as const) }));

  const points = series.map((row) => ({ x: row.year, y: row.sharePct }));
  const line = theilSenLine(points);
  const fitted = line ? residuals(points, line) : [];
  const anomalies = line ? madOutliers(fitted.map((row) => row.residual), MAD_CUTOFF) : null;
  const outlierIndexes = new Set((anomalies?.outliers ?? []).map((outlier) => outlier.index));
  const recent = series.slice(-RECENT_WINDOW_YEARS);

  return {
    excludedYears,
    zeroCountYears: series.filter((row) => row.count === 0).map((row) => row.year),
    share: describe(series.map((row) => row.sharePct)),
    papers: describe(series.map((row) => row.count)),
    trendLine: line,
    years: series.map((row, index) => {
      const fit = fitted[index];
      return {
        year: row.year,
        sharePct: row.sharePct,
        fitted: fit ? fit.fitted : null,
        residual: fit ? fit.residual : null,
        outlierScore: fit && anomalies && anomalies.mad > 0 ? (fit.residual - anomalies.median) / anomalies.mad : null,
        outlier: outlierIndexes.has(index),
      };
    }),
    residualMad: anomalies ? anomalies.mad : null,
    outlierYears: series.filter((_row, index) => outlierIndexes.has(index)).map((row) => row.year),
    recentWindow: recent.length ? { yearFrom: recent[0]!.year, yearTo: recent.at(-1)!.year } : null,
  };
}
