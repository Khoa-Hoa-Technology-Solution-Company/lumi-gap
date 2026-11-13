import crypto from "node:crypto";
import { UnrecoverableError } from "bullmq";
import type { TopicBackfillTargetKind, TopicWatch, TopicWatchList, TopicWatchPhase, TopicWatchUpsertResult } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { apiSyncQueue } from "../../infrastructure/queue.js";
import { fetchOpenAlexPage, isNonRetryableOpenAlexError, OPENALEX_MAX_PER_PAGE } from "../api-sync/providers/openalex.client.js";
import { ingestOpenAlexWorks } from "../api-sync/sync.service.js";
import { auditService } from "../audit/audit.service.js";
import { openAlexId, presentInCorpus } from "../gaps/gap-literature.js";
import { filterOnlyExpression, loadBackfillTarget } from "../topic-backfill/topic-backfill.queries.js";
import { runImportFollowUps } from "../topic-backfill/topic-backfill.service.js";
import type { ListTopicWatchesQuery, UpdateTopicWatchInput, UpsertTopicWatchInput } from "./dto/topic-watch.schema.js";
import {
  afterPage, fairShare, openWindow, pageBudget, pageRequest, restartQueries, settleBacklog, toDay, TOPIC_WATCH_RUN_JOB,
  type WatchPosition,
} from "./topic-watch.rules.js";

type WatchRow = NonNullable<Awaited<ReturnType<ReturnType<typeof getPrisma>["topicWatch"]["findUnique"]>>>;

export interface TopicWatchRunSummary {
  watches: number;
  inserted: number;
  skipped: number;
  pages: number;
}

const dayOrNull = (value: Date | null): string | null => (value ? toDay(value) : null);
const dateOrNull = (value: string | null): Date | null => (value ? new Date(`${value}T00:00:00.000Z`) : null);

function insertedToday(row: WatchRow, today: string): number {
  return row.quotaDay && toDay(row.quotaDay) === today ? row.insertedOnQuotaDay : 0;
}

function toTopicWatch(row: WatchRow, today: string): TopicWatch {
  return {
    id: row.id,
    targetKind: row.targetKind as TopicBackfillTargetKind,
    targetId: row.targetId,
    targetName: row.targetName,
    enabled: row.enabled,
    phase: row.phase as TopicWatchPhase,
    dailyMaxNewPapers: row.dailyMaxNewPapers,
    backlogTargetPapers: row.backlogTargetPapers,
    backlogInserted: row.backlogInserted,
    insertedToday: insertedToday(row, today),
    totalInserted: row.totalInserted,
    totalSkipped: row.totalSkipped,
    lastWindowCompletedOn: dayOrNull(row.lastWindowCompletedOn),
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPosition(row: WatchRow): WatchPosition {
  return {
    phase: row.phase as TopicWatchPhase,
    queryIndex: row.queryIndex,
    cursor: row.cursor,
    backlogInserted: row.backlogInserted,
    backlogTargetPapers: row.backlogTargetPapers,
    windowFrom: dayOrNull(row.windowFrom),
    windowStartedOn: dayOrNull(row.windowStartedOn),
    lastWindowCompletedOn: dayOrNull(row.lastWindowCompletedOn),
  };
}

function positionData(position: WatchPosition) {
  return {
    phase: position.phase,
    queryIndex: position.queryIndex,
    cursor: position.cursor,
    backlogInserted: position.backlogInserted,
    windowFrom: dateOrNull(position.windowFrom),
    windowStartedOn: dateOrNull(position.windowStartedOn),
    lastWindowCompletedOn: dateOrNull(position.lastWindowCompletedOn),
  };
}

function dailyBudget(): number {
  return Math.min(env.TOPIC_WATCH_DAILY_MAX_PAPERS, env.EMBED_MAX_PAPERS_PER_RUN);
}

async function usedOn(today: string): Promise<number> {
  const result = await getPrisma().topicWatch.aggregate({
    where: { quotaDay: dateOrNull(today) },
    _sum: { insertedOnQuotaDay: true },
  });
  return result._sum.insertedOnQuotaDay ?? 0;
}

/**
 * Reads pages for one watch from where it stopped, until its budget or pages run out or there is nothing left today.
 * The position is written after every page, so a crash loses at most one page, and works the corpus already has are
 * left untouched. An error ends this watch only: the job carries on with the others.
 */
async function runWatch(watch: WatchRow, providerId: string, budget: number, pages: number, today: string) {
  const prisma = getPrisma();
  const totals = { inserted: 0, skipped: 0, pages: 0 };

  const target = await loadBackfillTarget(watch.targetKind as TopicBackfillTargetKind, watch.targetId);
  if (!target?.queries.length) {
    await prisma.topicWatch.update({
      where: { id: watch.id },
      data: { lastRunAt: new Date(), lastError: target ? "This entry has nothing OpenAlex can be asked about" : "This entry was removed or deactivated" },
    });
    return totals;
  }
  const queries = [...new Set(target.queries.map(filterOnlyExpression))];
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(queries)).digest("hex");

  let position = settleBacklog(toPosition(watch));
  if (watch.queryFingerprint && watch.queryFingerprint !== fingerprint) position = restartQueries(position);

  const run = await prisma.apiSyncRun.create({
    data: { providerId, runStatus: "running", searchText: `[watch] ${target.name}`, startedAt: new Date() },
  });
  const usedBefore = insertedToday(watch, today);
  let budgetLeft = budget;
  let pagesLeft = pages;
  let failure: string | null = null;

  try {
    while (budgetLeft > 0 && pagesLeft > 0) {
      const opened = openWindow(position, today, toDay(watch.createdAt), env.TOPIC_WATCH_OVERLAP_DAYS);
      if (!opened) break;
      position = opened;

      const page = await fetchOpenAlexPage({ ...pageRequest(position, queries), perPage: OPENALEX_MAX_PER_PAGE });
      pagesLeft--;
      const works = page.results.filter((work) => openAlexId(work));
      const present = await presentInCorpus(works.map(openAlexId));
      const missing = works.filter((work) => !present.has(openAlexId(work)));
      const toImport = missing.slice(0, pageBudget(position, budgetLeft));
      const result = toImport.length
        ? await ingestOpenAlexWorks(toImport, providerId, { origin: { source: "topic-watch", detail: `${watch.targetKind}: ${target.name}` } })
        : null;

      const inserted = result?.insertedCount ?? 0;
      const skipped = present.size + (result?.updatedCount ?? 0);
      totals.inserted += inserted;
      totals.skipped += skipped;
      totals.pages++;
      budgetLeft -= inserted;
      position = afterPage(position, {
        inserted,
        nextCursor: page.nextCursor,
        isEmpty: page.results.length === 0,
        cutShort: toImport.length < missing.length,
      }, queries.length);

      await prisma.$transaction([
        prisma.topicWatch.update({
          where: { id: watch.id },
          data: {
            ...positionData(position),
            queryFingerprint: fingerprint,
            targetName: target.name,
            quotaDay: dateOrNull(today),
            insertedOnQuotaDay: usedBefore + totals.inserted,
            totalInserted: { increment: inserted },
            totalSkipped: { increment: skipped },
            lastRunAt: new Date(),
            lastError: null,
          },
        }),
        prisma.apiSyncRun.update({
          where: { id: run.id },
          data: {
            totalFetched: { increment: page.results.length },
            totalInserted: { increment: inserted },
            totalUpdated: { increment: result?.updatedCount ?? 0 },
            totalDuplicates: { increment: skipped },
          },
        }),
      ]);
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    logger.warn({ watchId: watch.id, message: failure }, "topic watch run failed");
    // OpenAlex refuses a cursor it no longer accepts the same way every time, so the query restarts from its first
    // page; works already imported are found in the corpus and skipped.
    const dropCursor = isNonRetryableOpenAlexError(error) ? { cursor: null } : {};
    await prisma.topicWatch.update({ where: { id: watch.id }, data: { ...dropCursor, lastRunAt: new Date(), lastError: failure } });
  }

  await prisma.apiSyncRun.update({
    where: { id: run.id },
    data: { runStatus: failure ? "failed" : "succeeded", errorMessage: failure, finishedAt: new Date() },
  });
  // A run that read nothing (already caught up today) still counts as this watch's turn.
  if (!totals.pages && !failure) await prisma.topicWatch.update({ where: { id: watch.id }, data: { lastRunAt: new Date() } });
  return totals;
}

export const topicWatchService = {
  async list(query: ListTopicWatchesQuery): Promise<TopicWatchList> {
    const today = toDay(new Date());
    const [rows, usedToday] = await Promise.all([
      getPrisma().topicWatch.findMany({
        where: { targetKind: query.targetKind, targetId: query.targetId },
        orderBy: [{ enabled: "desc" }, { createdAt: "desc" }],
      }),
      usedOn(today),
    ]);
    return { watches: rows.map((row) => toTopicWatch(row, today)), dailyBudget: dailyBudget(), usedToday };
  },

  /** Turns following on. Asking again for an entry already watched turns it back on and keeps its position. */
  async upsert(userId: string | undefined, input: UpsertTopicWatchInput): Promise<TopicWatchUpsertResult> {
    const target = await loadBackfillTarget(input.targetKind, input.targetId);
    if (!target) throw AppError.notFound("Entry not found or not active");
    if (!target.queries.length) {
      throw new AppError(409, "WATCH_TARGET_NOT_SEARCHABLE", "This entry has nothing OpenAlex can be asked about");
    }
    const prisma = getPrisma();
    const key = { targetKind: input.targetKind, targetId: input.targetId };
    const existing = await prisma.topicWatch.findUnique({ where: { targetKind_targetId: key }, select: { id: true } });
    const row = await prisma.topicWatch.upsert({
      where: { targetKind_targetId: key },
      create: {
        ...key,
        targetName: target.name,
        dailyMaxNewPapers: input.dailyMaxNewPapers ?? null,
        backlogTargetPapers: input.backlogTargetPapers ?? env.TOPIC_WATCH_DEFAULT_BACKLOG_PAPERS,
        createdById: userId,
      },
      update: {
        enabled: true,
        targetName: target.name,
        dailyMaxNewPapers: input.dailyMaxNewPapers,
        backlogTargetPapers: input.backlogTargetPapers,
      },
    });
    await auditService.log("topic_watch.enabled", {
      userId, targetTableName: "topic_watches", targetRecordId: row.id, details: { ...key, name: target.name },
    });
    return { watch: toTopicWatch(row, toDay(new Date())), created: !existing };
  },

  async update(userId: string | undefined, id: string, input: UpdateTopicWatchInput): Promise<TopicWatch> {
    const prisma = getPrisma();
    if (!await prisma.topicWatch.findUnique({ where: { id }, select: { id: true } })) throw AppError.notFound("Topic watch not found");
    const row = await prisma.topicWatch.update({ where: { id }, data: input });
    await auditService.log("topic_watch.updated", { userId, targetTableName: "topic_watches", targetRecordId: id, details: input });
    return toTopicWatch(row, toDay(new Date()));
  },

  async remove(userId: string | undefined, id: string): Promise<void> {
    const prisma = getPrisma();
    const row = await prisma.topicWatch.findUnique({ where: { id }, select: { targetKind: true, targetId: true, targetName: true } });
    if (!row) throw AppError.notFound("Topic watch not found");
    await prisma.topicWatch.delete({ where: { id } });
    await auditService.log("topic_watch.removed", { userId, targetTableName: "topic_watches", targetRecordId: id, details: row });
  },

  /** Runs the same job as the cron now, within the same daily budget. False when one is already waiting or running. */
  async requestRun(): Promise<{ queued: boolean }> {
    const enabled = await getPrisma().topicWatch.count({ where: { enabled: true } });
    if (!enabled) throw new AppError(409, "NO_ENABLED_TOPIC_WATCHES", "No entry is being followed yet");
    const live = await apiSyncQueue.getJobs(["waiting", "active", "prioritized"]);
    if (live.some((job) => job.name === TOPIC_WATCH_RUN_JOB)) return { queued: false };
    await apiSyncQueue.add(TOPIC_WATCH_RUN_JOB, {});
    return { queued: true };
  },

  /** One pass over the enabled watches. Least recently run goes first, so a small budget still reaches each in turn. */
  async runDaily(now = new Date()): Promise<TopicWatchRunSummary> {
    const prisma = getPrisma();
    const provider = await prisma.apiProvider.findUnique({ where: { providerName: "openalex" } });
    if (!provider) throw new UnrecoverableError("openalex provider not seeded — run seed:providers first");

    const today = toDay(now);
    const watches = await prisma.topicWatch.findMany({
      where: { enabled: true },
      orderBy: [{ lastRunAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    });
    const summary: TopicWatchRunSummary = { watches: 0, inserted: 0, skipped: 0, pages: 0 };
    let budgetLeft = dailyBudget() - await usedOn(today);
    let pagesLeft = env.SYNC_MAX_PAGES_PER_RUN;

    for (const [index, watch] of watches.entries()) {
      if (budgetLeft <= 0 || pagesLeft <= 0) break;
      const entriesLeft = watches.length - index;
      const ownLeft = watch.dailyMaxNewPapers === null ? Infinity : watch.dailyMaxNewPapers - insertedToday(watch, today);
      const budget = Math.min(fairShare(budgetLeft, entriesLeft), ownLeft);
      if (budget <= 0) continue;

      const result = await runWatch(watch, provider.id, budget, fairShare(pagesLeft, entriesLeft), today);
      summary.watches++;
      summary.inserted += result.inserted;
      summary.skipped += result.skipped;
      summary.pages += result.pages;
      budgetLeft -= result.inserted;
      pagesLeft -= result.pages;
    }

    if (summary.inserted > 0) await runImportFollowUps({ job: "topic-watch" });
    await auditService.log("topic_watch.daily_run", { targetTableName: "topic_watches", details: { ...summary } });
    logger.info({ ...summary, budgetLeft, pagesLeft }, "topic watch run finished");
    return summary;
  },
};
