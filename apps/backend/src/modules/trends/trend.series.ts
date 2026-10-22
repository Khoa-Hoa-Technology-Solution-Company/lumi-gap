import { range } from "./trend.utils.js";

/** One complete year of a topic and its reference population. */
export interface ShareRow {
  year: number;
  /** n_t: papers whose primary topic is the topic. */
  count: number;
  /** N_t: papers of the reference population (trend.baseline.ts). */
  total: number;
  /** n_t / N_t · 100. */
  sharePct: number;
}

/**
 * The share series every path tests (overview and topic page, OpenAlex and
 * local): complete years yearFrom…lastCompleteYear with N_t > 0. N_t is never
 * smaller than n_t (a topic cannot exceed its own population; this only guards
 * against counts fetched a moment apart).
 */
export function buildShareRows(topic: Map<number, number>, population: Map<number, number>, yearFrom: number, lastCompleteYear: number): ShareRow[] {
  return range(yearFrom, lastCompleteYear)
    .filter((year) => (population.get(year) ?? 0) > 0)
    .map((year) => {
      const count = topic.get(year) ?? 0;
      const total = Math.max(population.get(year) ?? 0, count);
      return { year, count, total, sharePct: (count / total) * 100 };
    });
}
