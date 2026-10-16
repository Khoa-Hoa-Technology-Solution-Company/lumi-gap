/**
 * Statistical trend tests. Pure functions, no DB or I/O.
 *
 * Every method here comes from a peer-reviewed source; the source is named on
 * the function and listed with its DOI in the web methodology panel
 * (apps/web/src/features/trends/trend-methodology.ts). Change both together.
 */

/** Conventional significance level used to label results. */
export const SIGNIFICANCE_LEVEL = 0.05;

export interface MannKendallResult {
  n: number;
  /** S = Σ_{i<j} sgn(x_j − x_i). */
  s: number;
  /** Var(S) with the tie correction. */
  variance: number;
  /** Continuity-corrected standard normal score. */
  z: number;
  /** Two-sided p-value from the normal approximation. */
  pValue: number;
  /** Kendall's τ = S / (n(n−1)/2). */
  tau: number;
}

/**
 * Mann–Kendall test for a monotonic trend.
 *
 *   S = Σ_{i<j} sgn(x_j − x_i)
 *   Var(S) = [n(n−1)(2n+5) − Σ_p t_p(t_p−1)(2t_p+5)] / 18
 *   Z = (S − 1)/√Var(S) if S > 0,  0 if S = 0,  (S + 1)/√Var(S) if S < 0
 *
 * Sources: Mann (1945), Econometrica 13(3):245–259, doi:10.2307/1907187;
 * Kendall (1975), Rank Correlation Methods, 4th ed.
 */
export function mannKendall(values: number[]): MannKendallResult | null {
  const n = values.length;
  if (n < 3) return null;

  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) s += Math.sign(values[j]! - values[i]!);
  }

  const tieGroups = new Map<number, number>();
  for (const v of values) tieGroups.set(v, (tieGroups.get(v) ?? 0) + 1);
  let tieTerm = 0;
  for (const t of tieGroups.values()) if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);

  const variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  if (!(variance > 0)) return null;
  const z = s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0;
  return {
    n,
    s,
    variance,
    z,
    pValue: clampProbability(2 * (1 - normalCdf(Math.abs(z)))),
    tau: s / ((n * (n - 1)) / 2),
  };
}

/**
 * Sen's slope: the median of all pairwise slopes (y_j − y_i)/(x_j − x_i), i < j.
 * Robust to outliers. Source: Sen (1968), JASA 63(324):1379–1389,
 * doi:10.1080/01621459.1968.10480934.
 */
export function senSlope(points: Array<{ x: number; y: number }>): number | null {
  const slopes: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j]!.x - points[i]!.x;
      if (dx !== 0) slopes.push((points[j]!.y - points[i]!.y) / dx);
    }
  }
  if (slopes.length === 0) return null;
  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  return slopes.length % 2 === 1 ? slopes[mid]! : (slopes[mid - 1]! + slopes[mid]!) / 2;
}

/**
 * Two-sided (1 − α) confidence interval of Sen's slope, rank method.
 *
 *   N' = number of pairwise slopes, sorted ascending
 *   C  = z_{1−α/2} · √Var(S)          (Var(S): Mann–Kendall, tie-corrected)
 *   M1 = (N' − C) / 2,   M2 = (N' + C) / 2
 *   lower = M1-th slope,  upper = (M2 + 1)-th slope   (1-based ranks,
 *   linear interpolation between neighbours when a rank is not an integer)
 *
 * Sources: Helsel, Hirsch, Ryberg, Archfield & Gilroy (2020), Statistical
 * Methods in Water Resources, USGS Techniques and Methods 4-A3,
 * doi:10.3133/tm4A3; Gilbert (1987), Statistical Methods for Environmental
 * Pollution Monitoring, Van Nostrand Reinhold, §16.5.
 *
 * Returns null when the interval is not computable: fewer than 3 points, a
 * constant series (Var(S) = 0), or a series too short for the ranks to fall
 * inside 1..N'.
 */
export function senSlopeCi95(points: Array<{ x: number; y: number }>, alpha = SIGNIFICANCE_LEVEL): [number, number] | null {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const mk = mannKendall(sorted.map((point) => point.y));
  if (!mk) return null;

  const slopes: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const dx = sorted[j]!.x - sorted[i]!.x;
      if (dx !== 0) slopes.push((sorted[j]!.y - sorted[i]!.y) / dx);
    }
  }
  const total = slopes.length;
  if (total === 0) return null;
  slopes.sort((a, b) => a - b);

  const c = normalQuantile(1 - alpha / 2) * Math.sqrt(mk.variance);
  const lowerRank = (total - c) / 2;
  const upperRank = (total + c) / 2 + 1;
  if (lowerRank < 1 || upperRank > total) return null;
  return [orderStatistic(slopes, lowerRank), orderStatistic(slopes, upperRank)];
}

/** Value at a 1-based, possibly fractional rank of an ascending array. */
function orderStatistic(sorted: number[], rank: number): number {
  const low = Math.floor(rank);
  const fraction = rank - low;
  const below = sorted[low - 1]!;
  if (fraction === 0 || low >= sorted.length) return below;
  return below + fraction * (sorted[low]! - below);
}

/**
 * Benjamini–Hochberg adjusted p-values (q-values). Rejecting every hypothesis
 * with q ≤ α is the BH step-up procedure, which controls the false discovery
 * rate at α. Null inputs stay null and are not counted in m.
 *
 *   q_(i) = min_{j ≥ i} ( m · p_(j) / j ),  capped at 1
 *
 * Source: Benjamini & Hochberg (1995), JRSS B 57(1):289–300,
 * doi:10.1111/j.2517-6161.1995.tb02031.x.
 */
export function benjaminiHochberg(pValues: Array<number | null>): Array<number | null> {
  const indexed = pValues
    .map((p, index) => ({ p, index }))
    .filter((row): row is { p: number; index: number } => row.p !== null && Number.isFinite(row.p));
  const m = indexed.length;
  const out: Array<number | null> = pValues.map(() => null);
  indexed.sort((a, b) => a.p - b.p);
  let running = 1;
  for (let rank = m; rank >= 1; rank--) {
    const row = indexed[rank - 1]!;
    running = Math.min(running, (m * row.p) / rank);
    out[row.index] = clampProbability(running);
  }
  return out;
}

export interface LogOddsRatioResult {
  /** log[(a·d)/(b·c)] with 0.5 added to every cell. */
  logOddsRatio: number;
  standardError: number;
  /** logOddsRatio / standardError. Positive = more frequent in period B. */
  z: number;
  pValue: number;
}

/**
 * Log odds ratio of a 2×2 table: papers with / without a keyword in the later
 * period B versus the earlier period A.
 *
 *            with    without
 *   B         a       b = n_B − a
 *   A         c       d = n_A − c
 *
 *   log OR = log[(a + ½)(d + ½) / ((b + ½)(c + ½))]                     (Haldane 1956)
 *   SE = √(1/(a + ½) + 1/(b + ½) + 1/(c + ½) + 1/(d + ½))               (Woolf 1955)
 *   z = log OR / SE, two-sided p from the standard normal distribution
 *
 * Sources: Woolf (1955), Annals of Human Genetics 19(4):251–253,
 * doi:10.1111/j.1469-1809.1955.tb01348.x; Haldane (1956), Annals of Human
 * Genetics 20:309–311, doi:10.1111/j.1469-1809.1955.tb01285.x.
 */
export function logOddsRatio2x2(input: { withB: number; totalB: number; withA: number; totalA: number }): LogOddsRatioResult | null {
  const { withB, totalB, withA, totalA } = input;
  if (totalA <= 0 || totalB <= 0 || withB < 0 || withA < 0 || withB > totalB || withA > totalA) return null;
  const a = withB + 0.5;
  const b = totalB - withB + 0.5;
  const c = withA + 0.5;
  const d = totalA - withA + 0.5;
  const logOddsRatio = Math.log((a * d) / (b * c));
  const standardError = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
  const z = logOddsRatio / standardError;
  return { logOddsRatio, standardError, z, pValue: clampProbability(2 * (1 - normalCdf(Math.abs(z)))) };
}

// ---------------------------------------------------------------------------
// Distribution functions (numerical routines, not trend methods)
// ---------------------------------------------------------------------------

/** Standard normal CDF via erf (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** Inverse of normalCdf by bisection (p in (0, 1)). */
export function normalQuantile(p: number): number {
  let lo = -40;
  let hi = 40;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function clampProbability(p: number): number {
  if (!Number.isFinite(p)) return 1;
  return Math.min(1, Math.max(0, p));
}
