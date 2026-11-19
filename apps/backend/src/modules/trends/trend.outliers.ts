/**
 * Robust outlier detection for short residual series. Pure functions, no DB or I/O.
 *
 * The method comes from a peer-reviewed source, named on the function. The
 * docs page shows MAD_CUTOFF; change both together.
 */

/** Consistency constant that makes the MAD estimate the standard deviation of a normal distribution. */
export const MAD_SCALE = 1.4826;
/** |score| above this flags an outlier ("moderately conservative" choice of Leys et al. 2013). */
export const MAD_CUTOFF = 2.5;

export interface MadOutlier {
  /** Position in the input array. */
  index: number;
  value: number;
  /** (value − median) / MAD, signed. */
  score: number;
}

export interface MadOutlierResult {
  median: number;
  /** MAD_SCALE · median(|x_i − median(x)|). */
  mad: number;
  /** Values with |score| > cutoff, in input order. Empty when mad is 0. */
  outliers: MadOutlier[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Median-absolute-deviation outlier rule.
 *
 *   M = median(x)
 *   MAD = 1.4826 · median(|x_i − M|)
 *   x_i is an outlier when |x_i − M| / MAD > cutoff (strictly greater)
 *
 * When MAD = 0 (more than half of the values are identical) no score is
 * defined, so no value is flagged. Returns null for fewer than 3 values.
 * Does not mutate the input.
 *
 * Source: Leys, C., Ley, C., Klein, O., Bernard, P., & Licata, L. (2013).
 * Detecting outliers: Do not use standard deviation around the mean, use
 * absolute deviation around the median. Journal of Experimental Social
 * Psychology 49(4):764–766, doi:10.1016/j.jesp.2013.03.013.
 */
export function madOutliers(values: number[], cutoff: number = MAD_CUTOFF): MadOutlierResult | null {
  if (values.length < 3) return null;

  const med = median(values);
  const mad = MAD_SCALE * median(values.map((v) => Math.abs(v - med)));
  if (mad === 0) return { median: med, mad: 0, outliers: [] };

  const outliers: MadOutlier[] = [];
  values.forEach((value, index) => {
    const score = (value - med) / mad;
    if (Math.abs(score) > cutoff) outliers.push({ index, value, score });
  });
  return { median: med, mad, outliers };
}
