/**
 * Descriptive statistics of a short series. Pure functions, no DB or I/O.
 *
 * Sample skewness and kurtosis follow Joanes & Gill (1998), Comparing measures
 * of sample skewness and kurtosis, The Statistician 47(1):183–189,
 * doi:10.1111/1467-9884.00122. The robust line follows Sen (1968), JASA
 * 63(324):1379–1389, doi:10.1080/01621459.1968.10480934.
 */
import type { DescriptiveStats } from "@trend/shared-types";
import { senSlope } from "./trend.statistics.js";

export type { DescriptiveStats };

/**
 * Quantile of an ASCENDING array by linear interpolation between order
 * statistics: position h = (n − 1)·p, value = x_⌊h⌋ + (h − ⌊h⌋)(x_⌊h⌋+1 − x_⌊h⌋).
 * This is the "type 7" definition used by R and NumPy. p in [0, 1]. Throws
 * nothing; the caller guarantees a non-empty array.
 *
 * Source: Hyndman & Fan (1996), The American Statistician 50(4):361–365,
 * doi:10.1080/00031305.1996.10473566.
 */
export function quantile(sortedAscending: number[], p: number): number {
  const h = (sortedAscending.length - 1) * p;
  const low = Math.floor(h);
  const lower = sortedAscending[low]!;
  const upper = sortedAscending[Math.min(low + 1, sortedAscending.length - 1)]!;
  return lower + (h - low) * (upper - lower);
}

/**
 * Descriptive statistics of a series. Returns null for an empty array. Does
 * not mutate the input.
 *
 *   s² = Σ (x_i − mean)² / (n − 1),  s = √s²,  CV = s / mean
 *   m_k = (1/n) Σ (x_i − mean)^k
 *   g1 = m3 / m2^(3/2),       G1 = g1 · √(n(n − 1)) / (n − 2)
 *   g2 = m4 / m2² − 3,        G2 = (n − 1) / ((n − 2)(n − 3)) · ((n + 1)·g2 + 6)
 *
 * G1 and G2 are the adjusted estimators of Joanes & Gill (1998), The
 * Statistician 47(1):183–189, doi:10.1111/1467-9884.00122. A constant series
 * (m2 = 0) has no defined skewness or kurtosis.
 */
export function describe(values: number[]): DescriptiveStats | null {
  const n = values.length;
  if (n === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const min = sorted[0]!;
  const max = sorted[n - 1]!;

  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  for (const v of values) {
    const d = v - mean;
    s2 += d * d;
    s3 += d * d * d;
    s4 += d * d * d * d;
  }
  const m2 = s2 / n;
  const m3 = s3 / n;
  const m4 = s4 / n;

  const variance = n >= 2 ? s2 / (n - 1) : null;
  const standardDeviation = variance === null ? null : Math.sqrt(variance);
  const coefficientOfVariation = standardDeviation === null || mean === 0 ? null : standardDeviation / mean;

  let skewness: number | null = null;
  if (n >= 3 && m2 !== 0) {
    const g1 = m3 / Math.pow(m2, 1.5);
    skewness = (g1 * Math.sqrt(n * (n - 1))) / (n - 2);
  }
  let kurtosis: number | null = null;
  if (n >= 4 && m2 !== 0) {
    const g2 = m4 / (m2 * m2) - 3;
    kurtosis = ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * g2 + 6);
  }

  return {
    n,
    mean,
    median: quantile(sorted, 0.5),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    variance,
    standardDeviation,
    min,
    max,
    range: max - min,
    coefficientOfVariation,
    skewness,
    kurtosis,
  };
}

export interface TheilSenLine {
  slope: number;
  intercept: number;
}

/**
 * Theil–Sen line: slope = Sen's slope (median of pairwise slopes), intercept =
 * median(y_i − slope · x_i). Robust to outliers. Null when Sen's slope is not
 * defined (fewer than 2 distinct x).
 *
 * Source: Sen (1968), JASA 63(324):1379–1389, doi:10.1080/01621459.1968.10480934.
 */
export function theilSenLine(points: Array<{ x: number; y: number }>): TheilSenLine | null {
  const slope = senSlope(points);
  if (slope === null) return null;
  const offsets = points.map((point) => point.y - slope * point.x).sort((a, b) => a - b);
  return { slope, intercept: quantile(offsets, 0.5) };
}

/**
 * Residuals of a fitted line, in input order: fitted = intercept + slope · x,
 * residual = y − fitted.
 */
export function residuals(
  points: Array<{ x: number; y: number }>,
  line: TheilSenLine,
): Array<{ x: number; y: number; fitted: number; residual: number }> {
  return points.map((point) => {
    const fitted = line.intercept + line.slope * point.x;
    return { x: point.x, y: point.y, fitted, residual: point.y - fitted };
  });
}
