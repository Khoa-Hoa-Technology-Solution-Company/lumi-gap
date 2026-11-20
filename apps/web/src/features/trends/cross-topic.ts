import { TREND_SIZE_BANDS, type TrendCrossTopicAnalysis, type TrendCrossTopicPoint, type TrendSizeBand, type TrendTukeyFences, type TrendVerdict } from "@trend/shared-types";

/** Pure helpers of the cross-topic section (spec 2026-11-14 §7.1); kept out of the components so they can be tested. */

export type { TrendSizeBand };

export function isSizeBand(value: string): value is TrendSizeBand {
  return (TREND_SIZE_BANDS as readonly string[]).includes(value);
}

/** `?sizeBands=small,large` -> ["small", "large"]; unknown values and duplicates are dropped, order follows small, medium, large. */
export function parseSizeBands(raw: string | null | undefined): TrendSizeBand[] {
  if (!raw) return [];
  const wanted = new Set(raw.split(",").map((item) => item.trim()).filter(isSizeBand));
  return TREND_SIZE_BANDS.filter((band) => wanted.has(band));
}

/** Verdict colours of the charts; they follow the tones of the verdict badges. */
export const VERDICT_COLORS: Record<TrendVerdict, string> = {
  rising: "#059669",
  saturated: "#0284c7",
  stable: "#94a3b8",
  past_peak: "#ea580c",
  declining: "#dc2626",
  insufficient: "#d97706",
};

/** Type-7 quantile of an ascending list (the same definition the backend uses). */
export function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (h - lo);
}

export interface HistogramBin {
  /** "under"/"over": everything outside the clipped range, drawn as one bin at each end. */
  kind: "under" | "normal" | "over";
  from: number;
  to: number;
  total: number;
  counts: Partial<Record<TrendVerdict, number>>;
}

export interface RHistogram {
  bins: HistogramBin[];
  /** Range of the regular bins: the 2nd to the 98th percentile of r. */
  lo: number;
  hi: number;
  clippedLow: number;
  clippedHigh: number;
}

/**
 * Histogram of r with the range clipped at the 2nd and 98th percentile, so one
 * extreme topic (r of several hundred) cannot squash every other bar. What lies
 * outside is counted in an underflow and an overflow bin.
 */
export function buildRHistogram(points: Array<Pick<TrendCrossTopicPoint, "r" | "verdict">>, binCount = 20): RHistogram {
  const sorted = points.map((point) => point.r).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return { bins: [], lo: 0, hi: 0, clippedLow: 0, clippedHigh: 0 };
  let lo = quantileSorted(sorted, 0.02);
  let hi = quantileSorted(sorted, 0.98);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const width = (hi - lo) / binCount;
  const empty = (kind: HistogramBin["kind"], from: number, to: number): HistogramBin => ({ kind, from, to, total: 0, counts: {} });
  const normal = Array.from({ length: binCount }, (_, i) => empty("normal", lo + i * width, lo + (i + 1) * width));
  const under = empty("under", sorted[0]!, lo);
  const over = empty("over", hi, sorted[sorted.length - 1]!);
  for (const point of points) {
    if (!Number.isFinite(point.r)) continue;
    const bin = point.r < lo ? under : point.r > hi ? over : normal[Math.min(binCount - 1, Math.floor((point.r - lo) / width))]!;
    bin.total += 1;
    bin.counts[point.verdict] = (bin.counts[point.verdict] ?? 0) + 1;
  }
  return {
    bins: [...(under.total > 0 ? [under] : []), ...normal, ...(over.total > 0 ? [over] : [])],
    lo,
    hi,
    clippedLow: under.total,
    clippedHigh: over.total,
  };
}

/** Symmetric log: linear near 0, logarithmic far away, so r from -45 to +427 fits one axis. */
export function symlog(value: number, scale = 10): number {
  return Math.sign(value) * Math.log10(1 + Math.abs(value) / scale);
}

/** Round tick values inside [min, max]; 0 is always there. */
export function symlogTicks(min: number, max: number): number[] {
  return [-100, -40, -10, 0, 10, 40, 100, 400, 1000].filter((tick) => tick === 0 || (tick >= min && tick <= max));
}

export interface BandBox {
  band: TrendSizeBand;
  n: number;
  q1: number;
  median: number;
  q3: number;
  /** Most extreme r still inside the fences. */
  whiskerLow: number;
  whiskerHigh: number;
  fences: TrendTukeyFences | null;
  outliers: TrendCrossTopicPoint[];
}

/** One box per size band: quartiles, whiskers at the most extreme value inside the Tukey fences, anomalous topics as dots. */
export function buildBandBoxes(analysis: TrendCrossTopicAnalysis): BandBox[] {
  return TREND_SIZE_BANDS.flatMap((band) => {
    const stats = analysis.rStats[band];
    if (!stats) return [];
    const fences = analysis.fences[band];
    const inBand = analysis.points.filter((point) => point.sizeBand === band);
    const inside = inBand.filter((point) => !fences || (point.r >= fences.lower && point.r <= fences.upper)).map((point) => point.r);
    return [{
      band,
      n: stats.n,
      q1: stats.q1,
      median: stats.median,
      q3: stats.q3,
      whiskerLow: inside.length > 0 ? Math.min(...inside) : stats.min,
      whiskerHigh: inside.length > 0 ? Math.max(...inside) : stats.max,
      fences,
      outliers: inBand.filter((point) => point.outlier),
    }];
  });
}

/** Clear topics split by direction, the strongest change first. */
export function splitClearTopics(points: TrendCrossTopicPoint[]): { rising: TrendCrossTopicPoint[]; declining: TrendCrossTopicPoint[] } {
  const clear = points.filter((point) => point.clear);
  return {
    rising: clear.filter((point) => point.r > 0).sort((a, b) => b.r - a.r),
    declining: clear.filter((point) => point.r <= 0).sort((a, b) => a.r - b.r),
  };
}

export function bandCutoffText(band: TrendSizeBand, cutoffs: { smallMax: number; mediumMax: number }, format: (n: number) => string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (band === "small") return t("Small: ≤ {{max}} papers in the window", { max: format(cutoffs.smallMax) });
  if (band === "medium") return t("Medium: {{min}} to {{max}} papers in the window", { min: format(cutoffs.smallMax), max: format(cutoffs.mediumMax) });
  return t("Large: > {{min}} papers in the window", { min: format(cutoffs.mediumMax) });
}

/** The cross-topic section is shown only for an overview that carries the analysis (the local corpus fallback does not). */
export function hasCrossTopic(analysis: TrendCrossTopicAnalysis | null | undefined): analysis is TrendCrossTopicAnalysis {
  return Boolean(analysis) && analysis!.points.length > 0;
}
