import { createHash } from "node:crypto";
import { resolveTrendWindow } from "@trend/shared-types";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import {
  isOpenAlexBudgetAvailable,
  OPENALEX_CORPUS,
  OpenAlexBudgetError,
  openAlexGetLive,
  openAlexRateLimitStatus,
  shortId,
} from "./trend.openalex-client.js";
import { DEFAULT_WORK_TYPES, DEFAULT_WORK_TYPES_CLAUSE } from "./trend.openalex-scope.js";
import { CollectionBudgetTracker } from "./trend.snapshot-budget.js";

/**
 * P2.1 collection of one trend snapshot: yearly works per topic, domain, field
 * and subfield (group_by + cursor paging, every page, unknown group included)
 * and the topic catalogue. Strategy measured in P2.0: one collection of the
 * default scope, 10 years × 4 levels + catalogue ≈ 333 credits (3.3% of a free
 * key's day). Never one request per topic.
 *
 * Checkpoints: one transaction per page writes the page's rows, the page log and
 * the unit's next cursor, guarded by the lease and the unit's checkpoint
 * version. A crash therefore loses at most the page in flight (refetched, 1
 * credit) and can never write a page twice.
 */
export const TREND_SNAPSHOT_COLLECTION_VERSION = "p2.1-collect-v1";
export const COUNT_LEVELS = ["topic", "domain", "field", "subfield"] as const;
export type CountLevel = (typeof COUNT_LEVELS)[number];
export const GROUP_BY: Record<CountLevel, string> = {
  topic: "primary_topic.id:include_unknown",
  domain: "primary_topic.domain.id:include_unknown",
  field: "primary_topic.field.id:include_unknown",
  subfield: "primary_topic.subfield.id:include_unknown",
};
/** [QUY ƯỚC] A cursor older than this is not trusted any more; the unit restarts. */
export const CURSOR_MAX_AGE_MS = 60 * 60 * 1000;
/**
 * [QUY ƯỚC] The 4 levels of one year are reconciled against each other exactly,
 * so they must be fetched close in time (OpenAlex counts move by hundreds of
 * works a day, P2.0 §14). A partly collected year older than this is refetched.
 */
export const YEAR_GROUP_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** [QUY ƯỚC] An unfinished snapshot older than this is abandoned, not resumed. */
export const MAX_RESUME_AGE_MS = 72 * 60 * 60 * 1000;
/** Guard against a cursor loop: ≈ 23 pages are expected for 4 516 topics. */
export const MAX_PAGES_PER_UNIT = 200;

export interface SnapshotScope {
  /** OpenAlex filter without publication_year. */
  filter: string;
  workTypes: string[];
  corpus: string;
}

export const DEFAULT_SNAPSHOT_SCOPE: SnapshotScope = { filter: DEFAULT_WORK_TYPES_CLAUSE, workTypes: [...DEFAULT_WORK_TYPES], corpus: OPENALEX_CORPUS };

export function scopeHash(scope: SnapshotScope): string {
  return createHash("sha256").update(JSON.stringify({ filter: scope.filter, corpus: scope.corpus })).digest("hex").slice(0, 16);
}

export interface CollectorHooks {
  /** Test seam: runs after each committed page (e.g. to simulate a crash). */
  afterPageCommit?: (info: { level: string; year: number; pageIndex: number }) => void | Promise<void>;
  /** Test seam: runs inside the activation transaction before it commits. */
  beforeActivationCommit?: () => void | Promise<void>;
}

export interface CollectorOptions {
  workerId: string;
  scope?: SnapshotScope;
  now?: () => Date;
  currentYear?: number;
  baseUrl?: string;
  leaseMs?: number;
  pageDelayMs?: number;
  collectionFraction?: number;
  hooks?: CollectorHooks;
}

export type CollectOutcome =
  | { status: "collected"; snapshotId: string }
  | { status: "ready"; snapshotId: string }
  | { status: "already_active"; snapshotId: string }
  | { status: "locked"; snapshotId: string }
  | { status: "paused_budget"; snapshotId: string; reason: string; resumeAfter: Date | null }
  | { status: "failed"; snapshotId: string; reason: string }
  | { status: "lease_lost"; snapshotId: string };

class LeaseLostError extends Error {}
class DataError extends Error {
  constructor(readonly code: string, readonly details: Record<string, unknown>) {
    super(code);
  }
}

type UnitRow = { id: string; level: string; year: number; status: string; cursor: string | null; pagesFetched: number; checkpointVersion: number; completedAt: Date | null };
type Snapshot = Awaited<ReturnType<typeof findOrCreateSnapshot>>;

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

export function snapshotWindow(currentYear: number) {
  const { yearFrom, lastCompleteYear } = resolveTrendWindow({}, currentYear);
  return { yearFrom, yearTo: lastCompleteYear, lastCompleteYear };
}

/** The unfinished snapshot of this scope/window to resume, or the snapshot of today. */
async function findOrCreateSnapshot(scope: SnapshotScope, now: Date, currentYear: number) {
  const db = getPrisma();
  const hash = scopeHash(scope);
  const window = snapshotWindow(currentYear);
  const same = { scopeHash: hash, yearFrom: window.yearFrom, lastCompleteYear: window.lastCompleteYear, collectionVersion: TREND_SNAPSHOT_COLLECTION_VERSION };

  const unfinished = await db.trendSnapshot.findFirst({ where: { ...same, status: { in: ["collecting", "paused_budget"] } }, orderBy: { createdAt: "desc" } });
  if (unfinished && now.getTime() - unfinished.createdAt.getTime() <= MAX_RESUME_AGE_MS) return unfinished;
  if (unfinished) {
    await db.trendSnapshot.updateMany({ where: { id: unfinished.id, status: { in: ["collecting", "paused_budget"] } }, data: { status: "failed", failureReason: "STALE_UNFINISHED: not completed within the resume window", leaseOwnerId: null, leaseExpiresAt: null } });
  }

  const snapshotKey = [hash, `${window.yearFrom}-${window.lastCompleteYear}`, TREND_SNAPSHOT_COLLECTION_VERSION, utcDay(now)].join(":");
  const existing = await db.trendSnapshot.findUnique({ where: { snapshotKey } });
  if (existing) return existing;
  try {
    return await db.trendSnapshot.create({
      data: { snapshotKey, ...same, scopeFilter: scope.filter, workTypes: scope.workTypes, corpus: scope.corpus, yearTo: window.yearTo, collectionDay: utcDay(now) },
    });
  } catch (error) {
    // Two workers creating the same snapshot: the loser reads the winner's row.
    if ((error as { code?: string }).code === "P2002") return db.trendSnapshot.findUniqueOrThrow({ where: { snapshotKey } });
    throw error;
  }
}

async function claimLease(snapshotId: string, workerId: string, now: Date, leaseMs: number): Promise<boolean> {
  const claimed = await getPrisma().trendSnapshot.updateMany({
    where: { id: snapshotId, status: { in: ["collecting", "paused_budget", "validated"] }, OR: [{ leaseOwnerId: null }, { leaseExpiresAt: { lt: now } }, { leaseOwnerId: workerId }] },
    data: { leaseOwnerId: workerId, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
  });
  return claimed.count === 1;
}

export async function releaseLease(snapshotId: string, workerId: string): Promise<void> {
  await getPrisma().trendSnapshot.updateMany({ where: { id: snapshotId, leaseOwnerId: workerId }, data: { leaseOwnerId: null, leaseExpiresAt: null } });
}

async function ensureUnits(snapshotId: string, yearFrom: number, lastCompleteYear: number): Promise<void> {
  const data = [{ snapshotId, level: "catalogue", year: 0 }];
  for (let year = yearFrom; year <= lastCompleteYear; year++) for (const level of COUNT_LEVELS) data.push({ snapshotId, level, year });
  await getPrisma().trendSnapshotUnit.createMany({ data, skipDuplicates: true });
}

/** Units in collection order: catalogue, then year by year (all 4 levels of a year together). */
async function loadUnits(snapshotId: string): Promise<UnitRow[]> {
  const units = await getPrisma().trendSnapshotUnit.findMany({ where: { snapshotId } });
  const order = (unit: UnitRow) => (unit.level === "catalogue" ? -1 : unit.year * 10 + COUNT_LEVELS.indexOf(unit.level as CountLevel));
  return units.sort((a, b) => order(a) - order(b));
}

async function resetUnits(snapshotId: string, units: UnitRow[], reason: string): Promise<void> {
  if (!units.length) return;
  logger.info({ snapshotId, units: units.map((u) => `${u.level}:${u.year}`), reason }, "trend snapshot: refetching units");
  await getPrisma().$transaction(async (tx) => {
    for (const unit of units) {
      if (unit.level === "catalogue") await tx.trendSnapshotTopic.deleteMany({ where: { snapshotId } });
      else await tx.trendSnapshotCount.deleteMany({ where: { snapshotId, level: unit.level, year: unit.year } });
      await tx.trendSnapshotPage.deleteMany({ where: { unitId: unit.id } });
      await tx.trendSnapshotUnit.update({ where: { id: unit.id }, data: { status: "pending", cursor: "*", pagesFetched: 0, groupsFetched: 0, metaCount: null, completedAt: null, checkpointVersion: { increment: 1 } } });
    }
  });
}

/** Freshness rules before resuming (see CURSOR_MAX_AGE_MS, YEAR_GROUP_MAX_AGE_MS). */
async function refreshStaleUnits(snapshotId: string, now: Date): Promise<void> {
  const units = await loadUnits(snapshotId);
  const lastPage = new Map(
    (await getPrisma().trendSnapshotPage.groupBy({ by: ["unitId"], where: { snapshotId }, _max: { fetchedAt: true } })).map((row) => [row.unitId, row._max.fetchedAt]),
  );
  const stale: UnitRow[] = [];
  for (const unit of units) {
    const last = lastPage.get(unit.id);
    if (unit.status === "pending" && unit.cursor !== "*" && last && now.getTime() - last.getTime() > CURSOR_MAX_AGE_MS) stale.push(unit);
  }
  const years = new Set(units.filter((u) => u.level !== "catalogue").map((u) => u.year));
  for (const year of years) {
    const group = units.filter((u) => u.year === year && u.level !== "catalogue");
    const complete = group.filter((u) => u.status === "complete");
    if (complete.length === group.length || complete.length === 0) continue;
    if (complete.some((u) => u.completedAt && now.getTime() - u.completedAt.getTime() > YEAR_GROUP_MAX_AGE_MS)) {
      for (const unit of group) if (!stale.includes(unit)) stale.push(unit);
    }
  }
  await resetUnits(snapshotId, stale, "stale cursor or partly collected year older than the freshness limit");
}

interface ParsedPage {
  rows: Array<{ key: string; name: string; count: number }> | null;
  topics: Array<{ topicId: string; topicName: string; subfieldId: string; subfieldName: string; fieldId: string; fieldName: string; domainId: string; domainName: string }> | null;
  nextCursor: string | null;
  metaCount: number | null;
  contentHash: string;
}

type GroupByBody = { meta?: { count?: number; next_cursor?: string | null }; group_by?: Array<{ key: string; key_display_name?: string; count: number }> };
type TopicsBody = { meta?: { count?: number; next_cursor?: string | null }; results?: Array<{ id: string; display_name: string; subfield: { id: string; display_name: string }; field: { id: string; display_name: string }; domain: { id: string; display_name: string } }> };

async function fetchPage(unit: UnitRow, scope: SnapshotScope, baseUrl: string | undefined) {
  if (unit.level === "catalogue") {
    const res = await openAlexGetLive<TopicsBody>("topics", { per_page: "200", cursor: unit.cursor!, select: "id,display_name,subfield,field,domain" }, { baseUrl });
    const results = res.body.results ?? [];
    const topics = results.map((t) => ({
      topicId: shortId(t.id), topicName: t.display_name,
      subfieldId: shortId(t.subfield.id), subfieldName: t.subfield.display_name,
      fieldId: shortId(t.field.id), fieldName: t.field.display_name,
      domainId: shortId(t.domain.id), domainName: t.domain.display_name,
    }));
    const parsed: ParsedPage = { rows: null, topics, nextCursor: res.body.meta?.next_cursor ?? null, metaCount: res.body.meta?.count ?? null, contentHash: hash(topics) };
    return { parsed, res };
  }
  const filter = `${scope.filter},publication_year:${unit.year}`;
  const res = await openAlexGetLive<GroupByBody>("works", { filter, group_by: GROUP_BY[unit.level as CountLevel], per_page: "200", cursor: unit.cursor! }, { baseUrl });
  const rows = (res.body.group_by ?? []).map((g) => ({ key: shortId(String(g.key)), name: String(g.key_display_name ?? g.key), count: Number(g.count) || 0 }));
  const parsed: ParsedPage = { rows, topics: null, nextCursor: res.body.meta?.next_cursor ?? null, metaCount: res.body.meta?.count ?? null, contentHash: hash(rows) };
  return { parsed, res };
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Commits one page: rows + page log + cursor advance, or nothing. */
async function commitPage(snapshot: Snapshot, unit: UnitRow, workerId: string, leaseMs: number, page: ParsedPage, rateLimit: { creditsUsed: number | null; remaining: number | null }, fetchedAt: Date): Promise<UnitRow> {
  const credits = rateLimit.creditsUsed ?? 1;
  const groupCount = page.rows?.length ?? page.topics?.length ?? 0;
  const keys = page.rows?.map((r) => r.key) ?? page.topics?.map((t) => t.topicId) ?? [];
  const done = page.nextCursor === null;
  return getPrisma().$transaction(async (tx) => {
    const leased = await tx.$executeRaw`
      UPDATE "trend_snapshots"
         SET "lease_expires_at" = ${new Date(Date.now() + leaseMs)}, "requests" = "requests" + 1, "credits_used" = "credits_used" + ${credits},
             "first_fetched_at" = COALESCE("first_fetched_at", ${fetchedAt}), "last_fetched_at" = ${fetchedAt}, "updated_at" = now()
       WHERE "id" = ${snapshot.id}::uuid AND "lease_owner_id" = ${workerId} AND "status" = 'collecting'`;
    if (leased !== 1) throw new LeaseLostError();
    const advanced = await tx.trendSnapshotUnit.updateMany({
      where: { id: unit.id, checkpointVersion: unit.checkpointVersion, cursor: unit.cursor, status: "pending" },
      data: {
        cursor: done ? null : page.nextCursor,
        status: done ? "complete" : "pending",
        completedAt: done ? fetchedAt : null,
        pagesFetched: { increment: 1 },
        groupsFetched: { increment: groupCount },
        checkpointVersion: { increment: 1 },
        ...(unit.pagesFetched === 0 ? { metaCount: page.metaCount } : {}),
      },
    });
    if (advanced.count !== 1) throw new LeaseLostError();
    await tx.trendSnapshotPage.create({
      data: { snapshotId: snapshot.id, unitId: unit.id, pageIndex: unit.pagesFetched, cursorIn: unit.cursor!, cursorOut: page.nextCursor, groupCount, firstKey: keys[0] ?? null, lastKey: keys.at(-1) ?? null, metaCount: page.metaCount, responseHash: page.contentHash, creditsUsed: credits, remaining: rateLimit.remaining, fetchedAt },
    });
    if (page.rows?.length) {
      // No skipDuplicates: a group already stored for this unit means a duplicated or overlapping page.
      await tx.trendSnapshotCount.createMany({ data: page.rows.map((r) => ({ snapshotId: snapshot.id, level: unit.level, unitKey: r.key, year: unit.year, count: r.count, displayName: r.name })) });
    }
    if (page.topics?.length) await tx.trendSnapshotTopic.createMany({ data: page.topics.map((t) => ({ snapshotId: snapshot.id, ...t })) });
    return { ...unit, cursor: done ? null : page.nextCursor, status: done ? "complete" : "pending", pagesFetched: unit.pagesFetched + 1, checkpointVersion: unit.checkpointVersion + 1, completedAt: done ? fetchedAt : null };
  });
}

async function pause(snapshotId: string, workerId: string, reason: string, resumeAfter: Date | null): Promise<CollectOutcome> {
  await getPrisma().trendSnapshot.updateMany({ where: { id: snapshotId, leaseOwnerId: workerId }, data: { status: "paused_budget", pausedReason: reason, resumeAfter, leaseOwnerId: null, leaseExpiresAt: null } });
  logger.warn({ snapshotId, reason, resumeAfter }, "trend snapshot collection paused; it resumes from its checkpoint");
  return { status: "paused_budget", snapshotId, reason, resumeAfter };
}

async function fail(snapshotId: string, workerId: string, code: string, details: Record<string, unknown>): Promise<CollectOutcome> {
  await getPrisma().trendSnapshot.updateMany({
    where: { id: snapshotId, leaseOwnerId: workerId },
    data: { status: "failed", failureReason: code, validation: { ok: false, failedDuringCollection: { code, ...details } } as never, leaseOwnerId: null, leaseExpiresAt: null },
  });
  logger.error({ snapshotId, code, details }, "trend snapshot collection failed; the previous active snapshot stays active");
  return { status: "failed", snapshotId, reason: code };
}

/** Credits trend collection spent since 00:00 UTC, over every snapshot. */
async function collectionCreditsToday(now: Date): Promise<number> {
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const row = await getPrisma().trendSnapshotPage.aggregate({ where: { fetchedAt: { gte: midnight } }, _sum: { creditsUsed: true } });
  return row._sum.creditsUsed ?? 0;
}

/**
 * Claims the snapshot and collects every pending unit. Returns with the lease
 * still held when collection is complete ("collected"), so the caller can
 * validate and activate under the same lease; releases it otherwise.
 */
export async function collectSnapshot(options: CollectorOptions): Promise<CollectOutcome & { snapshot?: Snapshot }> {
  const now = options.now ?? (() => new Date());
  const scope = options.scope ?? DEFAULT_SNAPSHOT_SCOPE;
  const currentYear = options.currentYear ?? now().getUTCFullYear();
  const leaseMs = options.leaseMs ?? 5 * 60 * 1000;
  const snapshot = await findOrCreateSnapshot(scope, now(), currentYear);

  if (snapshot.status === "active" || snapshot.status === "superseded") return { status: "already_active", snapshotId: snapshot.id };
  if (snapshot.status === "failed" || snapshot.status === "validation_failed") return { status: "failed", snapshotId: snapshot.id, reason: snapshot.failureReason ?? snapshot.status };
  if (snapshot.status === "paused_budget" && snapshot.resumeAfter && snapshot.resumeAfter > now()) {
    return { status: "paused_budget", snapshotId: snapshot.id, reason: snapshot.pausedReason ?? "paused", resumeAfter: snapshot.resumeAfter };
  }
  if (!(await claimLease(snapshot.id, options.workerId, now(), leaseMs))) return { status: "locked", snapshotId: snapshot.id };
  if (snapshot.status === "validated") return { status: "ready", snapshotId: snapshot.id, snapshot };
  await getPrisma().trendSnapshot.update({ where: { id: snapshot.id }, data: { status: "collecting", pausedReason: null, resumeAfter: null } });

  let keepLease = false;
  try {
    await ensureUnits(snapshot.id, snapshot.yearFrom, snapshot.lastCompleteYear);
    await refreshStaleUnits(snapshot.id, now());

    const status = await openAlexRateLimitStatus({ baseUrl: options.baseUrl });
    if (!status) return await pause(snapshot.id, options.workerId, "RATE_LIMIT_STATUS_UNAVAILABLE: cannot read the key's real usage", new Date(now().getTime() + 3600_000));
    const budget = new CollectionBudgetTracker({
      creditsLimit: status.creditsLimit,
      creditsRemaining: status.creditsRemaining,
      collectionCreditsToday: await collectionCreditsToday(now()),
      collectionFraction: options.collectionFraction ?? 0.3,
    });
    const resetAt = status.resetsAt ? new Date(status.resetsAt) : nextUtcMidnight(now());

    for (let unit of await loadUnits(snapshot.id)) {
      while (unit.status === "pending") {
        if (!isOpenAlexBudgetAvailable()) return await pause(snapshot.id, options.workerId, "KEY_RESERVE_LOCK: the OpenAlex client locked the key below its 20% reserve", resetAt);
        if (!budget.canSpend()) {
          const b = budget.current();
          const reason = b.limitedBy === "collection_cap"
            ? `COLLECTION_CAP: trend collection already spent its ${b.collectionCap}-credit daily cap`
            : `KEY_RESERVE: the key would drop below its ${b.reserve}-credit reserve`;
          return await pause(snapshot.id, options.workerId, reason, b.limitedBy === "collection_cap" ? nextUtcMidnight(now()) : resetAt);
        }
        if (unit.pagesFetched >= MAX_PAGES_PER_UNIT) return await fail(snapshot.id, options.workerId, "TOO_MANY_PAGES", { level: unit.level, year: unit.year });

        let fetched;
        try {
          fetched = await fetchPage(unit, scope, options.baseUrl);
        } catch (error) {
          if (error instanceof OpenAlexBudgetError) return await pause(snapshot.id, options.workerId, `QUOTA_429: ${error.message}`, resetAt);
          throw error;
        }
        budget.record(fetched.res.rateLimit.creditsUsed, fetched.res.rateLimit.remaining);
        if (fetched.parsed.nextCursor !== null && fetched.parsed.nextCursor === unit.cursor) {
          return await fail(snapshot.id, options.workerId, "CURSOR_DID_NOT_ADVANCE", { level: unit.level, year: unit.year, pageIndex: unit.pagesFetched });
        }
        try {
          unit = await commitPage(snapshot, unit, options.workerId, leaseMs, fetched.parsed, fetched.res.rateLimit, new Date(fetched.res.fetchedAt));
        } catch (error) {
          if (error instanceof LeaseLostError) return { status: "lease_lost", snapshotId: snapshot.id };
          if ((error as { code?: string }).code === "P2002") {
            throw new DataError("DUPLICATE_GROUP", { level: unit.level, year: unit.year, pageIndex: unit.pagesFetched, cursor: unit.cursor, firstKey: fetched.parsed.rows?.[0]?.key ?? fetched.parsed.topics?.[0]?.topicId ?? null });
          }
          throw error;
        }
        await options.hooks?.afterPageCommit?.({ level: unit.level, year: unit.year, pageIndex: unit.pagesFetched - 1 });
        if (options.pageDelayMs ?? 100) await new Promise((resolve) => setTimeout(resolve, options.pageDelayMs ?? 100));
      }
    }
    await getPrisma().trendSnapshot.update({ where: { id: snapshot.id }, data: { collectedAt: now() } });
    keepLease = true;
    return { status: "collected", snapshotId: snapshot.id, snapshot };
  } catch (error) {
    if (error instanceof DataError) return await fail(snapshot.id, options.workerId, error.code, error.details);
    throw error;
  } finally {
    if (!keepLease) await releaseLease(snapshot.id, options.workerId);
  }
}
