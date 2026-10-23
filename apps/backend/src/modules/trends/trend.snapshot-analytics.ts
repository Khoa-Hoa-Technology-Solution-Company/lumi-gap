import type { TrendBaselineLevel, TrendClassification, TrendGgt } from "@trend/shared-types";
import { computeGgt } from "./trend.ggt.js";
import { buildShareRows, type ShareRow } from "./trend.series.js";
import { benjaminiHochberg } from "./trend.statistics.js";
import { classifyTrend, shareTrendStatistics } from "./trend.verdict.js";

/**
 * Precomputed analytics of a validated snapshot (P2.1). Pure, no I/O, and no
 * new formula: share rows, Mann–Kendall, Sen, BH, the verdict and GGT all come
 * from the P1 functions the interactive trends pages use.
 *
 * BH family [QUY ƯỚC, plan §P2.1 "BH family = toàn bộ topic của field"]: every
 * topic with a Mann–Kendall p-value in the same baseline unit (the same field
 * for the field baseline; all topics for global), computed once over the whole
 * snapshot, never per page or per listing.
 */
export const TREND_SNAPSHOT_ANALYTICS_VERSION = "p2.1-analytics-v1";
export const SNAPSHOT_BASELINE_LEVELS: TrendBaselineLevel[] = ["global", "domain", "field", "subfield"];

export interface TopicTaxonomyIds {
  domainId: string;
  fieldId: string;
  subfieldId: string;
}

export interface SnapshotAnalyticsInput {
  yearFrom: number;
  lastCompleteYear: number;
  /** topic id → year → works. */
  topicCounts: Map<string, Map<number, number>>;
  /** level → unit id → year → works (classified only, no "unknown"). */
  levelCounts: Record<"domain" | "field" | "subfield", Map<string, Map<number, number>>>;
  catalogue: Map<string, TopicTaxonomyIds>;
}

export interface SnapshotTopicResult {
  baselineLevel: TrendBaselineLevel;
  topicId: string;
  baselineUnit: string;
  shareSeries: ShareRow[];
  classification: TrendClassification;
  qFamilyKey: string;
  qFamilySize: number;
  ggt: TrendGgt;
}

/** N_t of the global baseline: classified works of the scope = Σ topic counts per year. */
export function globalPopulation(topicCounts: Map<string, Map<number, number>>): Map<number, number> {
  const total = new Map<number, number>();
  for (const years of topicCounts.values()) for (const [year, count] of years) total.set(year, (total.get(year) ?? 0) + count);
  return total;
}

export function computeSnapshotAnalytics(input: SnapshotAnalyticsInput): SnapshotTopicResult[] {
  const global = globalPopulation(input.topicCounts);
  // Topics with at least one work in the window; the others have no series.
  const topics = [...input.topicCounts.keys()]
    .filter((id) => {
      const years = input.topicCounts.get(id)!;
      for (let year = input.yearFrom; year <= input.lastCompleteYear; year++) if ((years.get(year) ?? 0) > 0) return true;
      return false;
    })
    .sort();

  const results: SnapshotTopicResult[] = [];
  for (const baselineLevel of SNAPSHOT_BASELINE_LEVELS) {
    const rows = topics.map((topicId) => {
      const taxonomy = input.catalogue.get(topicId);
      const unit = baselineLevel === "global" ? "all" : taxonomy ? taxonomy[`${baselineLevel}Id` as keyof TopicTaxonomyIds] : null;
      if (unit === null) throw new Error(`topic ${topicId} has no ${baselineLevel} in the snapshot catalogue`);
      const population = baselineLevel === "global" ? global : input.levelCounts[baselineLevel].get(unit) ?? new Map<number, number>();
      const shareSeries = buildShareRows(input.topicCounts.get(topicId)!, population, input.yearFrom, input.lastCompleteYear);
      return { topicId, unit, shareSeries, stats: shareTrendStatistics(shareSeries) };
    });

    // BH once per family (baseline unit) over the whole snapshot.
    const families = new Map<string, number[]>();
    rows.forEach((row, index) => {
      const members = families.get(row.unit) ?? [];
      members.push(index);
      families.set(row.unit, members);
    });
    const qValues = new Array<number | null>(rows.length).fill(null);
    const familySize = new Array<number>(rows.length).fill(0);
    for (const members of families.values()) {
      const p = members.map((index) => rows[index]!.stats.mannKendall?.pValue ?? null);
      const q = benjaminiHochberg(p);
      const size = p.filter((value) => value !== null).length;
      members.forEach((index, position) => {
        qValues[index] = q[position] ?? null;
        familySize[index] = size;
      });
    }

    rows.forEach((row, index) => {
      results.push({
        baselineLevel,
        topicId: row.topicId,
        baselineUnit: row.unit,
        shareSeries: row.shareSeries,
        classification: classifyTrend({ ...row.stats, source: "openalex", qValue: qValues[index] ?? null, qFamilySize: familySize[index] }),
        qFamilyKey: `${baselineLevel}:${row.unit}`,
        qFamilySize: familySize[index]!,
        ggt: computeGgt(row.shareSeries),
      });
    });
  }
  return results;
}
