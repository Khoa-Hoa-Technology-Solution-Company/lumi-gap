import { DEFAULT_TREND_BASELINE, type TrendBaseline, type TrendBaselineLevel } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { shortId } from "./trend.openalex-client.js";
import { withScope } from "./trend.openalex-scope.js";

/**
 * The reference population N_t of a topic share (P1.1), one definition for
 * every path (OpenAlex/local × overview/topic page):
 *
 *   N_t = works of the request's Data Scope WITHOUT its taxonomy clauses,
 *         published in year t, whose PRIMARY topic is in the same unit as the
 *         topic at the chosen level (domain / field / subfield), or that have
 *         any primary topic (global).
 *
 * The topic count n_t only ever counts primary topics, so works without a
 * topic are outside N_t too (OpenAlex `primary_topic.id:!null`; local
 * `paper_topics.is_primary`). Default level: field, the P0 behaviour.
 */

type TaxonomyIds = {
  domainId?: string | null;
  domainName?: string | null;
  fieldId?: string | null;
  fieldName?: string | null;
  subfieldId?: string | null;
  subfieldName?: string | null;
};

const LEVEL_KEYS = {
  domain: { id: "domainId", name: "domainName", openalex: "primary_topic.domain.id", column: "domain_id" },
  field: { id: "fieldId", name: "fieldName", openalex: "primary_topic.field.id", column: "field_id" },
  subfield: { id: "subfieldId", name: "subfieldName", openalex: "primary_topic.subfield.id", column: "subfield_id" },
} as const;

export const GLOBAL_BASELINE_LABEL = "All works with a primary topic";

/** The baseline a topic uses at the requested level. When the topic has no id
 *  at that level, the global baseline is used and `fallbackFrom` says so. */
export function resolveBaseline(level: TrendBaselineLevel = DEFAULT_TREND_BASELINE, taxonomy?: TaxonomyIds): TrendBaseline {
  if (level === "global") return { level: "global", label: GLOBAL_BASELINE_LABEL };
  const keys = LEVEL_KEYS[level];
  const rawId = taxonomy?.[keys.id];
  if (!rawId) return { level: "global", fallbackFrom: level, label: GLOBAL_BASELINE_LABEL };
  const id = shortId(rawId);
  return { level, id, label: taxonomy?.[keys.name] || id };
}

/** Stable key, so topics that share a baseline share one population request. */
export function baselineKey(baseline: TrendBaseline): string {
  return `${baseline.level}:${baseline.id ?? ""}`;
}

/** OpenAlex filter clause selecting the baseline's works (without years and scope). */
export function openAlexBaselineClause(baseline: TrendBaseline): string {
  if (baseline.level === "global" || baseline.level === "corpus" || !baseline.id) return "primary_topic.id:!null";
  return `${LEVEL_KEYS[baseline.level].openalex}:${baseline.id}`;
}

/** Full OpenAlex filter of N_t for one request. */
export function openAlexBaselineFilter(nonTaxonomyFilter: string, baseline: TrendBaseline, years: string): string {
  return withScope(nonTaxonomyFilter, openAlexBaselineClause(baseline), years);
}

/** Local SQL predicate on a primary `paper_topics` row (alias `pt`). */
function localBaselinePredicate(baseline: TrendBaseline): Prisma.Sql {
  if (baseline.level === "global" || baseline.level === "corpus" || !baseline.id) return Prisma.sql`TRUE`;
  const column = Prisma.raw(`pt.${LEVEL_KEYS[baseline.level].column}`);
  // Ids may be stored short ("17") or as OpenAlex URLs.
  return Prisma.sql`(${column} = ${baseline.id} OR ${column} LIKE ${`%/${baseline.id}`})`;
}

/**
 * N_t per year in the local corpus for each distinct baseline.
 * `scopeWhere` is the paper predicate (alias `p`) of the Data Scope WITHOUT
 * taxonomy clauses, including the publication year range.
 */
export async function localBaselineYearCounts(scopeWhere: Prisma.Sql, baselines: TrendBaseline[]): Promise<Map<string, Map<number, number>>> {
  const unique = new Map(baselines.map((baseline) => [baselineKey(baseline), baseline]));
  const out = new Map<string, Map<number, number>>();
  for (const [key, baseline] of unique) {
    const rows = await getPrisma().$queryRaw<Array<{ year: number; count: number }>>(Prisma.sql`
      SELECT p.publication_year AS year, COUNT(DISTINCT p.id)::int AS count
      FROM papers p
      JOIN paper_topics pt ON pt.paper_id = p.id AND pt.is_primary = TRUE
      WHERE ${scopeWhere} AND ${localBaselinePredicate(baseline)}
      GROUP BY p.publication_year
    `);
    out.set(key, new Map(rows.map((row) => [Number(row.year), Number(row.count)])));
  }
  return out;
}

/** Local works of the scope (no taxonomy clauses) per year: with and without a primary topic. */
export async function localClassifiedSplit(scopeWhere: Prisma.Sql): Promise<{ classified: Map<number, number>; unclassified: Map<number, number> }> {
  const rows = await getPrisma().$queryRaw<Array<{ year: number; classified: number; unclassified: number }>>(Prisma.sql`
    SELECT p.publication_year AS year,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM paper_topics c WHERE c.paper_id = p.id AND c.is_primary = TRUE))::int AS classified,
      COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM paper_topics c WHERE c.paper_id = p.id AND c.is_primary = TRUE))::int AS unclassified
    FROM papers p
    WHERE ${scopeWhere}
    GROUP BY p.publication_year
  `);
  return {
    classified: new Map(rows.map((row) => [Number(row.year), Number(row.classified)])),
    unclassified: new Map(rows.map((row) => [Number(row.year), Number(row.unclassified)])),
  };
}

/** Share (%) of works without a primary topic over the given years; null when the scope is empty. */
export function unclassifiedSharePct(classified: Map<number, number>, unclassified: Map<number, number>, years: number[]): number | null {
  let without = 0;
  let total = 0;
  for (const year of years) {
    const u = unclassified.get(year) ?? 0;
    without += u;
    total += u + (classified.get(year) ?? 0);
  }
  return total > 0 ? (without / total) * 100 : null;
}

const UNIT_RANK: Record<"global" | "domain" | "field" | "subfield" | "topic", number> = { global: 0, domain: 1, field: 2, subfield: 3, topic: 4 };

/**
 * A baseline must contain the unit it is compared with (a subfield cannot be
 * the reference of a field). Every level contains a topic, the only unit until
 * the multi-level resolver of P3, so this only rejects future misuse.
 */
export function assertBaselineContainsUnit(unitLevel: "domain" | "field" | "subfield" | "topic", baseline: TrendBaselineLevel): void {
  if (UNIT_RANK[baseline] >= UNIT_RANK[unitLevel]) {
    throw AppError.badRequest(`baseline "${baseline}" does not contain a ${unitLevel}; use a coarser level`);
  }
}
