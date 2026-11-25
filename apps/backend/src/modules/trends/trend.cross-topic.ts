/**
 * Comparison of the topics with each other (spec 2026-11-14 §7.1). Pure
 * functions, no I/O.
 *
 * - Size bands: tertiles of total papers in the window (type-7 quantiles,
 *   Hyndman & Fan 1996) among the topics that have r.
 * - Anomalous topics: r outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR] of the size band
 *   (Tukey 1977, Exploratory Data Analysis, Addison-Wesley, §2).
 * - "Clear": a rising topic above the upper fence of its band, or a declining
 *   one below the lower fence.
 *
 * r is classification.relativeChangePct (% per year). The analysis is
 * descriptive: it never changes a verdict.
 */
import type {
  TrendClassification,
  TrendCrossTopicAnalysis,
  TrendCrossTopicPoint,
  TrendSizeBand,
  TrendTopicCrossLabels,
  TrendTukeyFences,
} from "@trend/shared-types";
import { describe, quantile } from "./trend.descriptive.js";

/** Tukey's multiplier of the interquartile range. */
export const TUKEY_K = 1.5;
/** Fewer topics than this in a band: no fences (the quartiles of 3 values are not meaningful). */
export const MIN_BAND_TOPICS = 4;
/** Fewer topics with r than this in the whole population: no analysis. */
export const MIN_POPULATION = 9;

interface CrossTopicInput {
  topic: string;
  totalPapers: number;
  classification: TrendClassification;
}

export interface CrossTopicResult {
  analysis: TrendCrossTopicAnalysis;
  /** Labels of any topic by name (also topics without r, which only get a size band). */
  labelsOf: (topic: { totalPapers: number; classification: TrendClassification }) => TrendTopicCrossLabels;
}

/** Tukey fences of an array of values; null when there are fewer than MIN_BAND_TOPICS. */
export function tukeyFences(values: number[], k: number = TUKEY_K): TrendTukeyFences | null {
  if (values.length < MIN_BAND_TOPICS) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  return { q1, q3, iqr, lower: q1 - k * iqr, upper: q3 + k * iqr };
}

function hasR(topic: CrossTopicInput): topic is CrossTopicInput & { classification: TrendClassification & { relativeChangePct: number } } {
  return topic.classification.verdict !== "insufficient" && typeof topic.classification.relativeChangePct === "number" && Number.isFinite(topic.classification.relativeChangePct);
}

/**
 * Cross-topic analysis of `population` (every topic of the scope; those
 * without r are left out of the statistics). Null when fewer than
 * MIN_POPULATION topics have r.
 */
export function analyseCrossTopics(population: CrossTopicInput[]): CrossTopicResult | null {
  const withR = population.filter(hasR);
  if (withR.length < MIN_POPULATION) return null;

  const totals = withR.map((topic) => topic.totalPapers).sort((a, b) => a - b);
  const bandCutoffs = { smallMax: quantile(totals, 1 / 3), mediumMax: quantile(totals, 2 / 3) };
  const bandOf = (totalPapers: number): TrendSizeBand =>
    totalPapers <= bandCutoffs.smallMax ? "small" : totalPapers <= bandCutoffs.mediumMax ? "medium" : "large";

  const rByBand: Record<TrendSizeBand, number[]> = { small: [], medium: [], large: [] };
  for (const topic of withR) rByBand[bandOf(topic.totalPapers)].push(topic.classification.relativeChangePct);
  const fences: Record<TrendSizeBand, TrendTukeyFences | null> = {
    small: tukeyFences(rByBand.small),
    medium: tukeyFences(rByBand.medium),
    large: tukeyFences(rByBand.large),
  };

  const labelsOf = ({ totalPapers, classification }: { totalPapers: number; classification: TrendClassification }): TrendTopicCrossLabels => {
    const sizeBand = bandOf(totalPapers);
    const fence = fences[sizeBand];
    const r = classification.verdict === "insufficient" ? null : classification.relativeChangePct;
    if (fence === null || r === null || !Number.isFinite(r)) return { sizeBand, outlier: false, clear: false };
    const outlier = r < fence.lower || r > fence.upper;
    const clear = (classification.verdict === "rising" && r > fence.upper) || (classification.verdict === "declining" && r < fence.lower);
    return { sizeBand, outlier, clear };
  };

  const points: TrendCrossTopicPoint[] = withR.map((topic) => ({
    topic: topic.topic,
    totalPapers: topic.totalPapers,
    r: topic.classification.relativeChangePct,
    verdict: topic.classification.verdict,
    ...labelsOf(topic),
  }));

  return {
    analysis: {
      population: withR.length,
      bandCutoffs,
      rStats: {
        all: describe(withR.map((topic) => topic.classification.relativeChangePct)),
        small: describe(rByBand.small),
        medium: describe(rByBand.medium),
        large: describe(rByBand.large),
      },
      fences,
      points,
    },
    labelsOf,
  };
}
