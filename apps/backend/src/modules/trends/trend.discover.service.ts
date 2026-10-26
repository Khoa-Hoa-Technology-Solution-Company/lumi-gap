import type {
  TrendAssessability,
  TrendBaselineLevel,
  TrendDiscoverFieldGroup,
  TrendDiscoverItem,
  TrendGgtClass,
  TrendShareYear,
  TrendSnapshotProvenance,
  TrendsDiscoverResponse,
} from "@trend/shared-types";
import type { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { GLOBAL_BASELINE_LABEL } from "./trend.baseline.js";
import { DEFAULT_SNAPSHOT_SCOPE, scopeHash } from "./trend.snapshot-collector.js";
import type { TrendsDiscoverQuery } from "./dto/trends.schema.js";

/**
 * Discover Trends (P2.2): read-only views of the ACTIVE precomputed OpenAlex
 * snapshot (P2.1). No OpenAlex request, no recomputation: verdicts, p, q (BH
 * over the full baseline family of the snapshot) and GGT are the stored
 * values, so `limit`/paging can never change a topic's statistics. Ranking and
 * paging happen in SQL over the whole snapshot, then the page is cut.
 *
 * No local fallback on purpose: without an active snapshot the response says
 * "unavailable" instead of showing library counts as research trends.
 */
export const DISCOVER_RANKING_RULES = {
  trending:
    "Topics whose stored verdict is rising (Mann–Kendall on the share of the reference population, BH q < 0.05 within the full baseline family of the snapshot). Ordered by relative change (Sen slope / median share, %/year) descending, then q ascending, then topic id.",
  fastest_growing:
    "Trending topics that also meet both Nelis conditions (every annual GGT < 100%, ≥ 50 papers in every year) and have a mean GGT ± SEM. Ordered by mean GGT descending, then q ascending, then topic id. Descriptive: the Nelis stability rule is not checked.",
  by_field:
    "Field baseline. Per OpenAlex field, its rising topics ordered by the Trending rule (BH family = all topics of that field). Fields ordered by name.",
} as const;

type ResultRow = Prisma.TrendSnapshotResultGetPayload<object>;
type Snapshot = Prisma.TrendSnapshotGetPayload<object>;

function unavailable(query: TrendsDiscoverQuery, baselineLevel: TrendBaselineLevel, reason: NonNullable<TrendsDiscoverResponse["unavailableReason"]>): TrendsDiscoverResponse {
  return { status: "unavailable", unavailableReason: reason, collection: query.collection, baselineLevel, provenance: null, rankingRule: DISCOVER_RANKING_RULES[query.collection], page: query.page, pageSize: query.pageSize, total: 0, items: [], excluded: { insufficientData: 0, notAssessable: 0 } };
}

function provenanceOf(snapshot: Snapshot, baselineLevel: TrendBaselineLevel): TrendSnapshotProvenance {
  return {
    source: "openalex",
    snapshotId: snapshot.id,
    snapshotStatus: "active",
    scopeFilter: snapshot.scopeFilter,
    workTypes: snapshot.workTypes as string[],
    corpus: snapshot.corpus,
    baselineLevel,
    yearFrom: snapshot.yearFrom,
    yearTo: snapshot.yearTo,
    lastCompleteYear: snapshot.lastCompleteYear,
    firstFetchedAt: snapshot.firstFetchedAt?.toISOString() ?? null,
    lastFetchedAt: snapshot.lastFetchedAt?.toISOString() ?? null,
    activatedAt: snapshot.activatedAt?.toISOString() ?? null,
    collectionVersion: snapshot.collectionVersion,
    analyticsVersion: snapshot.analyticsVersion ?? "",
    historicalCountsMayChange: true,
  };
}

/**
 * Assessability from the stored numbers only (the stored verdict is kept as is
 * for compatibility). A topic that is its whole reference population has a
 * share of 100% every year: Mann–Kendall is undefined (p and q null) and the
 * legacy verdict "stable" is not evidence of stability.
 */
export function assessabilityOf(row: { verdict: string; pValue: number | null; shareSeries: unknown }): TrendAssessability {
  if (row.verdict === "insufficient") return "insufficient_data";
  if (row.pValue !== null) return "assessable";
  const shares = (row.shareSeries as Array<{ count: number; total: number }> | null) ?? [];
  return shares.length > 0 && shares.every((year) => year.count === year.total) ? "not_assessable_sole_member" : "not_assessable_constant_share";
}

/** Only an active snapshot of the default Data Scope is ever read. Null when there is none or the store does not exist yet. */
async function activeSnapshot(): Promise<Snapshot | null | "store_unavailable"> {
  try {
    return await getPrisma().trendSnapshot.findFirst({ where: { scopeHash: scopeHash(DEFAULT_SNAPSHOT_SCOPE), isActive: true, status: "active" } });
  } catch (error) {
    // The P2.1 migration may not be applied in this environment (table missing).
    const code = (error as { code?: string }).code;
    if (code === "P2021" || code === "42P01") {
      logger.warn("trend snapshot tables are missing; Discover Trends is unavailable");
      return "store_unavailable";
    }
    throw error;
  }
}

const TRENDING_ORDER: Prisma.TrendSnapshotResultOrderByWithRelationInput[] = [{ relativeChangePct: { sort: "desc", nulls: "last" } }, { qValue: "asc" }, { topicId: "asc" }];
const FASTEST_ORDER: Prisma.TrendSnapshotResultOrderByWithRelationInput[] = [{ ggtMeanPct: "desc" }, { qValue: "asc" }, { topicId: "asc" }];

function risingWhere(snapshotId: string, baselineLevel: string): Prisma.TrendSnapshotResultWhereInput {
  return { snapshotId, baselineLevel, verdict: "rising", pValue: { not: null }, qValue: { not: null } };
}

function fastestWhere(snapshotId: string, baselineLevel: string): Prisma.TrendSnapshotResultWhereInput {
  return { ...risingWhere(snapshotId, baselineLevel), ggtConditionsMet: true, ggtMeanPct: { not: null }, ggtSemPct: { not: null } };
}

async function toItems(snapshot: Snapshot, baselineLevel: TrendBaselineLevel, rows: ResultRow[], firstRank: number): Promise<TrendDiscoverItem[]> {
  const topics = await getPrisma().trendSnapshotTopic.findMany({ where: { snapshotId: snapshot.id, topicId: { in: rows.map((r) => r.topicId) } } });
  const byId = new Map(topics.map((t) => [t.topicId, t]));
  const provenance = provenanceOf(snapshot, baselineLevel);
  return rows.map((row, index) => {
    const t = byId.get(row.topicId);
    const taxonomy = { domainId: t?.domainId ?? "", domainName: t?.domainName ?? "", fieldId: t?.fieldId ?? "", fieldName: t?.fieldName ?? "", subfieldId: t?.subfieldId ?? "", subfieldName: t?.subfieldName ?? "" };
    const unitName = baselineLevel === "global" ? GLOBAL_BASELINE_LABEL : baselineLevel === "domain" ? taxonomy.domainName : baselineLevel === "field" ? taxonomy.fieldName : taxonomy.subfieldName;
    const mk = row.mannKendall as TrendDiscoverItem["mannKendall"];
    return {
      rank: firstRank + index,
      topicId: row.topicId,
      topicName: t?.topicName ?? row.topicId,
      taxonomy,
      baselineUnit: { level: baselineLevel, id: row.baselineUnit, name: unitName },
      totalPapers: row.totalPapers,
      yearsUsed: row.yearsUsed,
      // Stored ShareRow + the snapshot's corpus (same shape as the topic page's share series).
      shareSeries: (row.shareSeries as unknown as Array<Omit<TrendShareYear, "corpus">>).map((year) => ({ ...year, corpus: snapshot.corpus === "core" ? "core" : null })),
      verdict: row.verdict as TrendDiscoverItem["verdict"],
      confidence: row.confidence as TrendDiscoverItem["confidence"],
      assessability: assessabilityOf(row),
      mannKendall: mk ? { s: mk.s, z: mk.z, tau: mk.tau, pValue: mk.pValue, pValueMethod: mk.pValueMethod } : null,
      qValue: row.qValue,
      qFamilyKey: row.qFamilyKey,
      qFamilySize: row.qFamilySize,
      senSlopePctPoints: row.senSlope,
      senSlopeCi95: (row.senSlopeCi95 as [number, number] | null) ?? null,
      relativeChangePct: row.relativeChangePct,
      ggt: { meanPct: row.ggtMeanPct, semPct: row.ggtSemPct, years: row.ggtYears, conditionsMet: row.ggtConditionsMet, nelisThresholdGroup: row.nelisThresholdGroup as TrendGgtClass | null, stabilityChecked: false },
      provenance,
    };
  });
}

async function excludedCounts(snapshotId: string, baselineLevel: string) {
  const db = getPrisma();
  const [insufficientData, notAssessable] = await Promise.all([
    db.trendSnapshotResult.count({ where: { snapshotId, baselineLevel, verdict: "insufficient" } }),
    db.trendSnapshotResult.count({ where: { snapshotId, baselineLevel, pValue: null, verdict: { not: "insufficient" } } }),
  ]);
  return { insufficientData, notAssessable };
}

export async function getTrendsDiscover(query: TrendsDiscoverQuery): Promise<TrendsDiscoverResponse> {
  const baselineLevel: TrendBaselineLevel = query.collection === "by_field" ? "field" : query.baseline;
  const snapshot = await activeSnapshot();
  if (snapshot === "store_unavailable") return unavailable(query, baselineLevel, "SNAPSHOT_STORE_UNAVAILABLE");
  if (!snapshot) return unavailable(query, baselineLevel, "NO_ACTIVE_SNAPSHOT");
  const db = getPrisma();
  const base = { status: "available" as const, collection: query.collection, baselineLevel, provenance: provenanceOf(snapshot, baselineLevel), rankingRule: DISCOVER_RANKING_RULES[query.collection], page: query.page, pageSize: query.pageSize };
  const skip = (query.page - 1) * query.pageSize;
  const excluded = await excludedCounts(snapshot.id, baselineLevel);

  if (query.collection === "trending" || query.collection === "fastest_growing") {
    const where = query.collection === "trending" ? risingWhere(snapshot.id, baselineLevel) : fastestWhere(snapshot.id, baselineLevel);
    const [total, rows] = await Promise.all([
      db.trendSnapshotResult.count({ where }),
      db.trendSnapshotResult.findMany({ where, orderBy: query.collection === "trending" ? TRENDING_ORDER : FASTEST_ORDER, skip, take: query.pageSize }),
    ]);
    const ggtConditionsNotMet = query.collection === "fastest_growing" ? (await db.trendSnapshotResult.count({ where: risingWhere(snapshot.id, baselineLevel) })) - total : undefined;
    return { ...base, total, items: await toItems(snapshot, baselineLevel, rows, skip + 1), excluded: { ...excluded, ...(ggtConditionsNotMet !== undefined ? { ggtConditionsNotMet } : {}) } };
  }

  // by_field: every field of the snapshot catalogue, with its family size and top rising topics.
  const fieldRows = await db.trendSnapshotTopic.groupBy({ by: ["fieldId", "fieldName"], where: { snapshotId: snapshot.id } });
  const [perField, familySizes, risingPerField] = await Promise.all([
    db.trendSnapshotResult.groupBy({ by: ["baselineUnit"], where: { snapshotId: snapshot.id, baselineLevel: "field" }, _count: { _all: true } }),
    db.trendSnapshotResult.groupBy({ by: ["baselineUnit"], where: { snapshotId: snapshot.id, baselineLevel: "field" }, _max: { qFamilySize: true } }),
    db.trendSnapshotResult.groupBy({ by: ["baselineUnit"], where: risingWhere(snapshot.id, "field"), _count: { _all: true } }),
  ]);
  const countOf = (rows: Array<{ baselineUnit: string; _count: { _all: number } }>, id: string) => rows.find((r) => r.baselineUnit === id)?._count._all ?? 0;
  const fields = fieldRows
    .filter((f) => !query.fieldId || f.fieldId === query.fieldId)
    .sort((a, b) => a.fieldName.localeCompare(b.fieldName) || a.fieldId.localeCompare(b.fieldId));

  const groups: TrendDiscoverFieldGroup[] = [];
  for (const f of fields) {
    // One field asked for: page through its full ranking. All fields: the top perField of each.
    const take = query.fieldId ? query.pageSize : query.perField;
    const rows = await db.trendSnapshotResult.findMany({ where: { ...risingWhere(snapshot.id, "field"), baselineUnit: f.fieldId }, orderBy: TRENDING_ORDER, skip: query.fieldId ? skip : 0, take });
    groups.push({
      fieldId: f.fieldId,
      fieldName: f.fieldName,
      topicsInField: countOf(perField, f.fieldId),
      qFamilySize: familySizes.find((r) => r.baselineUnit === f.fieldId)?._max.qFamilySize ?? 0,
      risingTopics: countOf(risingPerField, f.fieldId),
      topics: await toItems(snapshot, "field", rows, (query.fieldId ? skip : 0) + 1),
    });
  }
  const total = query.fieldId ? groups[0]?.risingTopics ?? 0 : groups.length;
  return { ...base, total, items: query.fieldId ? groups[0]?.topics ?? [] : [], fields: groups, excluded };
}
