/**
 * Thresholds shown on the trend documentation. They mirror the exported
 * constants of the backend trend module; change both together:
 * - trend.verdict.ts / trend.statistics.ts: SIGNIFICANCE_LEVEL, MIN_YEARS,
 *   MIN_PAPERS, HIGH_CONFIDENCE_P, HIGH_CONFIDENCE_MIN_YEARS, FULL_WINDOW_YEARS,
 *   RECENT_WINDOW_YEARS, PEAK_TAIL_YEARS, FLAT_PCT, NEAR_PEAK, PAST_PEAK,
 *   LIFECYCLE_MIN_YEARS
 * - trend.outliers.ts: MAD_CUTOFF, MAD_SCALE
 * - trend.scope.ts: IT_SCOPE, IT_SCOPE_VERSION
 * Specs: docs/superpowers/specs/2026-10-16-trend-methodology-design.md §4 and
 * 2026-11-14-trend-eda-lifecycle-design.md §2, §5.
 */
export const TREND_DOC_CONSTANTS = {
  /** α, conventional significance level (published standard). */
  alpha: 0.05,
  /** Smallest n for which Mann–Kendall can reach p < 0.05 (derived). */
  minYears: 5,
  /** Project convention. */
  minPapers: 30,
  /** Project convention for "high" confidence. */
  highConfidenceP: 0.01,
  /** Project convention for "high" confidence. */
  highConfidenceMinYears: 8,
  /** Default analysis window W in complete years (project convention). */
  defaultWindowYears: 15,
  /** Recent window R: the last complete years of W (project convention). */
  recentWindowYears: 5,
  /** Years at the end of W whose median is compared with the peak. */
  peakTailYears: 3,
  /** Saturated: |r_R| below this, % per year (project convention, calibrated 2026-11-14). */
  flatPct: 2,
  /** Saturated: peak ratio at or above this (project convention, calibrated 2026-11-14). */
  nearPeak: 0.85,
  /** Past its peak: peak ratio below this (project convention). */
  pastPeak: 0.5,
  /** Saturated and past-peak verdicts need at least this many complete years (project convention). */
  lifecycleMinYears: 10,
  /** A residual is an outlier beyond this many MADs (Leys et al. 2013). */
  madCutoff: 2.5,
  /** Scale that makes the MAD comparable with a standard deviation. */
  madScale: 1.4826,
  /** Version of the IT scope; verdicts of two versions are not comparable. */
  scopeVersion: "it-v1",
  /** OpenAlex topics of the scope when it was defined (2026-11-14). */
  scopeTopics: 331,
} as const;

/** The subfields of the IT scope, as in the backend IT_SCOPE (ids are OpenAlex subfield ids). */
export const TREND_DOC_SCOPE: ReadonlyArray<{ id: string; name: string; layer: "core" | "related" }> = [
  { id: "1702", name: "Artificial Intelligence", layer: "core" },
  { id: "1703", name: "Computational Theory and Mathematics", layer: "core" },
  { id: "1704", name: "Computer Graphics and Computer-Aided Design", layer: "core" },
  { id: "1705", name: "Computer Networks and Communications", layer: "core" },
  { id: "1706", name: "Computer Science Applications", layer: "core" },
  { id: "1707", name: "Computer Vision and Pattern Recognition", layer: "core" },
  { id: "1708", name: "Hardware and Architecture", layer: "core" },
  { id: "1709", name: "Human-Computer Interaction", layer: "core" },
  { id: "1710", name: "Information Systems", layer: "core" },
  { id: "1711", name: "Signal Processing", layer: "core" },
  { id: "1712", name: "Software", layer: "core" },
  { id: "2207", name: "Control and Systems Engineering", layer: "related" },
  { id: "1802", name: "Information Systems and Management", layer: "related" },
  { id: "2214", name: "Media Technology", layer: "related" },
  { id: "2611", name: "Modeling and Simulation", layer: "related" },
  { id: "2614", name: "Theoretical Computer Science", layer: "related" },
];

/** Format a number with a decimal comma (vi) or point (en). */
export function formatDocNumber(value: number, language: "vi" | "en"): string {
  const text = String(value);
  return language === "vi" ? text.replace(".", ",") : text;
}
