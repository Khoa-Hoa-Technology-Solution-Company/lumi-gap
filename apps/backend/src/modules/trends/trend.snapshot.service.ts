import type { TrendBaselineLevel } from "@trend/shared-types";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { computeSnapshotAnalytics, TREND_SNAPSHOT_ANALYTICS_VERSION, type TopicTaxonomyIds } from "./trend.snapshot-analytics.js";
import { collectSnapshot, DEFAULT_SNAPSHOT_SCOPE, releaseLease, scopeHash, type CollectOutcome, type CollectorOptions, type SnapshotScope } from "./trend.snapshot-collector.js";
import { validateSnapshot, type SnapshotValidation } from "./trend.snapshot-validation.js";

/**
 * One trend snapshot job (P2.1): collect (resumable), validate, precompute the
 * P1 analytics and activate, all under one lease. A snapshot becomes visible to
 * the application only through activation, in one transaction that also
 * deactivates the previous snapshot of the scope; anything that fails before
 * that commit leaves the previous active snapshot untouched.
 */
export type SnapshotJobOutcome =
  | Exclude<CollectOutcome, { status: "collected" } | { status: "ready" }>
  | { status: "validation_failed"; snapshotId: string; validation: SnapshotValidation }
  | { status: "activated"; snapshotId: string; results: number; previousActiveId: string | null };

const RESULT_INSERT_CHUNK = 2000;

export async function runTrendSnapshotJob(options: CollectorOptions): Promise<SnapshotJobOutcome> {
  const collected = await collectSnapshot(options);
  if (collected.status !== "collected" && collected.status !== "ready") return collected;
  const { snapshotId } = collected;
  try {
    const db = getPrisma();
    if (collected.status === "collected") {
      const validation = await validateSnapshot(snapshotId);
      if (!validation.ok) {
        await db.trendSnapshot.updateMany({
          where: { id: snapshotId, leaseOwnerId: options.workerId },
          data: { status: "validation_failed", validation: validation as never, failureReason: `VALIDATION: ${validation.checks.filter((c) => !c.ok).map((c) => c.name).join(", ")}` },
        });
        logger.error({ snapshotId, failed: validation.checks.filter((c) => !c.ok) }, "trend snapshot failed validation; the previous active snapshot stays active");
        return { status: "validation_failed", snapshotId, validation };
      }
      const marked = await db.trendSnapshot.updateMany({ where: { id: snapshotId, leaseOwnerId: options.workerId, status: "collecting" }, data: { status: "validated", validation: validation as never, validatedAt: new Date() } });
      if (marked.count !== 1) return { status: "lease_lost", snapshotId };
    }
    return await activateSnapshot(snapshotId, options);
  } finally {
    await releaseLease(snapshotId, options.workerId);
  }
}

/** Precomputes the analytics of a validated snapshot and activates it atomically. */
async function activateSnapshot(snapshotId: string, options: CollectorOptions): Promise<SnapshotJobOutcome> {
  const db = getPrisma();
  const snapshot = await db.trendSnapshot.findUniqueOrThrow({ where: { id: snapshotId } });
  const [counts, topics] = await Promise.all([db.trendSnapshotCount.findMany({ where: { snapshotId } }), db.trendSnapshotTopic.findMany({ where: { snapshotId } })]);

  const topicCounts = new Map<string, Map<number, number>>();
  const levelCounts = { domain: new Map<string, Map<number, number>>(), field: new Map<string, Map<number, number>>(), subfield: new Map<string, Map<number, number>>() };
  for (const c of counts) {
    if (c.unitKey === "unknown") continue;
    const target = c.level === "topic" ? topicCounts : levelCounts[c.level as keyof typeof levelCounts];
    const years = target.get(c.unitKey) ?? new Map<number, number>();
    years.set(c.year, c.count);
    target.set(c.unitKey, years);
  }
  const catalogue = new Map<string, TopicTaxonomyIds>(topics.map((t) => [t.topicId, { domainId: t.domainId, fieldId: t.fieldId, subfieldId: t.subfieldId }]));
  const results = computeSnapshotAnalytics({ yearFrom: snapshot.yearFrom, lastCompleteYear: snapshot.lastCompleteYear, topicCounts, levelCounts, catalogue });

  const rows = results.map((r) => ({
    snapshotId,
    baselineLevel: r.baselineLevel,
    topicId: r.topicId,
    baselineUnit: r.baselineUnit,
    totalPapers: r.classification.totalPapers,
    yearsUsed: r.classification.yearsUsed,
    shareSeries: r.shareSeries as never,
    mannKendall: (r.classification.mannKendall ?? undefined) as never,
    senSlope: r.classification.senSlope,
    senSlopeCi95: (r.classification.senSlopeCi95 ?? undefined) as never,
    relativeChangePct: r.classification.relativeChangePct,
    pValue: r.classification.mannKendall?.pValue ?? null,
    qValue: r.classification.qValue,
    qFamilyKey: r.qFamilyKey,
    qFamilySize: r.qFamilySize,
    verdict: r.classification.verdict,
    confidence: r.classification.confidence,
    reasons: r.classification.reasons as never,
    ggt: r.ggt as never,
    ggtMeanPct: r.ggt.meanPct,
    ggtSemPct: r.ggt.semPct,
    ggtYears: r.ggt.n,
    ggtConditionsMet: r.ggt.conditions.allAnnualBelow100Pct === true && r.ggt.conditions.atLeast50PapersEveryYear === true,
    nelisThresholdGroup: r.ggt.nelisClass,
    stabilityChecked: false,
  }));

  let previousActiveId: string | null = null;
  await db.$transaction(async (tx) => {
    const current = await tx.trendSnapshot.findUniqueOrThrow({ where: { id: snapshotId } });
    if (current.status !== "validated" || current.leaseOwnerId !== options.workerId) throw new Error("snapshot is no longer validated under this worker's lease");
    await tx.trendSnapshotResult.deleteMany({ where: { snapshotId } });
    for (let i = 0; i < rows.length; i += RESULT_INSERT_CHUNK) await tx.trendSnapshotResult.createMany({ data: rows.slice(i, i + RESULT_INSERT_CHUNK) });
    const previous = await tx.trendSnapshot.findFirst({ where: { scopeHash: snapshot.scopeHash, isActive: true, id: { not: snapshotId } } });
    previousActiveId = previous?.id ?? null;
    if (previous) await tx.trendSnapshot.update({ where: { id: previous.id }, data: { isActive: false, status: "superseded" } });
    await tx.trendSnapshot.update({ where: { id: snapshotId }, data: { status: "active", isActive: true, analyticsVersion: TREND_SNAPSHOT_ANALYTICS_VERSION, activatedAt: new Date() } });
    await options.hooks?.beforeActivationCommit?.();
  }, { timeout: 120_000, maxWait: 10_000 });
  logger.info({ snapshotId, results: rows.length, previousActiveId }, "trend snapshot activated");
  return { status: "activated", snapshotId, results: rows.length, previousActiveId };
}

/** The active (validated, complete) snapshot of a scope, or null. The only snapshot the app may read. */
export async function getActiveTrendSnapshot(scope: SnapshotScope = DEFAULT_SNAPSHOT_SCOPE) {
  return getPrisma().trendSnapshot.findFirst({ where: { scopeHash: scopeHash(scope), isActive: true } });
}

/** Precomputed results of the active snapshot for one baseline (empty when none is active). */
export async function getActiveSnapshotResults(baselineLevel: TrendBaselineLevel, scope: SnapshotScope = DEFAULT_SNAPSHOT_SCOPE) {
  const active = await getActiveTrendSnapshot(scope);
  if (!active) return { snapshot: null, results: [] };
  const results = await getPrisma().trendSnapshotResult.findMany({ where: { snapshotId: active.id, baselineLevel } });
  return { snapshot: active, results };
}
