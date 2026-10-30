import type {
  TopicBackfillRequestResult, TopicBackfillRun, TopicBackfillState, TopicBackfillTargetKind, TopicBackfillTrigger,
} from "@trend/shared-types";
import { UnrecoverableError } from "bullmq";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import {
  embeddingQueue, hasLiveJob, paperAnalysisQueue, topicBackfillQueue,
} from "../../infrastructure/queue.js";
import { fetchOpenAlexPage, OPENALEX_MAX_PER_PAGE } from "../api-sync/providers/openalex.client.js";
import { ingestOpenAlexWorks } from "../api-sync/sync.service.js";
import { auditService } from "../audit/audit.service.js";
import { openAlexId, presentInCorpus } from "../gaps/gap-literature.js";
import { tagAssignmentService } from "../tags/tag-assignment.service.js";
import { taxonomyBackfillService } from "../taxonomy/taxonomy-backfill.service.js";
import type { ListBackfillRunsQuery } from "./dto/topic-backfill.schema.js";
import { loadBackfillTarget, type BackfillTarget } from "./topic-backfill.queries.js";

export const TOPIC_BACKFILL_JOB = "topic-backfill";
export interface TopicBackfillJobData { runId: string }
export const topicBackfillJobId = (runId: string) => `topic-backfill-${runId}`;

type PrismaClientLike = ReturnType<typeof getPrisma>;
type RunRow = NonNullable<Awaited<ReturnType<PrismaClientLike["topicBackfillRun"]["findUnique"]>>>;

const LIVE_STATES = ["queued", "running"];
const DAY_MS = 24 * 3600_000;
const HOUR_MS = 3600_000;
/** A row younger than this may simply not have reached the queue yet, so the startup sweep leaves it alone. */
const ORPHAN_GRACE_MS = 60_000;
const ERROR_MESSAGE_MAX = 500;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function toRun(row: RunRow, isAdmin: boolean): TopicBackfillRun {
  return {
    id: row.id,
    targetKind: row.targetKind as TopicBackfillTargetKind,
    targetId: row.targetId,
    targetName: row.targetName,
    state: row.state as TopicBackfillState,
    trigger: row.trigger as TopicBackfillTrigger,
    maxNewPapers: row.maxNewPapers,
    paperCountBefore: row.paperCountBefore,
    fetchedCount: row.fetchedCount,
    insertedCount: row.insertedCount,
    skippedCount: row.skippedCount,
    rejectedCount: row.rejectedCount,
    pagesFetched: row.pagesFetched,
    // The message can quote provider responses, so only admins see it.
    errorMessage: isAdmin ? row.errorMessage ?? null : null,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "P2002");
}

/** OpenAlex URLs in provider errors can carry the API key and the contact address: never store or log them. */
export function scrubErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/api_key=[^&\s]+/gi, "api_key=[redacted]")
    .replace(/mailto=[^&\s]+/gi, "mailto=[redacted]")
    .slice(0, ERROR_MESSAGE_MAX);
}

async function findLiveRun(kind: string, targetId: string) {
  return getPrisma().topicBackfillRun.findFirst({
    where: { targetKind: kind, targetId, state: { in: LIVE_STATES } },
    orderBy: { createdAt: "desc" },
  });
}

/** Papers a search-triggered import may still add today: finished runs count what they imported, live ones their budget. */
async function searchPapersToday(): Promise<number> {
  const rows = await getPrisma().topicBackfillRun.findMany({
    where: { trigger: "search", createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    select: { state: true, insertedCount: true, maxNewPapers: true },
  });
  return rows.reduce(
    (sum, row) => sum + (LIVE_STATES.includes(row.state) ? row.maxNewPapers : row.insertedCount),
    0,
  );
}

/** Insert the run, then queue it. A concurrent request for the same target loses the unique index and joins the winner. */
async function createAndEnqueue(
  userId: string, target: BackfillTarget, trigger: TopicBackfillTrigger, maxNewPapers: number, isAdmin: boolean,
): Promise<TopicBackfillRequestResult> {
  const prisma = getPrisma();
  let row: RunRow;
  try {
    row = await prisma.topicBackfillRun.create({
      data: {
        targetKind: target.kind,
        targetId: target.id,
        targetName: target.name,
        state: "queued",
        trigger,
        requestedById: UUID_RE.test(userId) ? userId : null,
        maxNewPapers,
        paperCountBefore: target.paperCount,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const live = await findLiveRun(target.kind, target.id);
      if (live) return { run: toRun(live, isAdmin), created: false };
    }
    throw error;
  }

  try {
    await topicBackfillQueue.add(
      TOPIC_BACKFILL_JOB,
      { runId: row.id } satisfies TopicBackfillJobData,
      { jobId: topicBackfillJobId(row.id), attempts: 3 },
    );
  } catch (error) {
    // Without a job the row would stay queued and block the target for ever.
    logger.error({ runId: row.id, message: scrubErrorMessage(error) }, "could not enqueue topic backfill job");
    await topicBackfillService.markFailed(row.id, error);
    throw AppError.serviceUnavailable("Could not queue the import; try again shortly");
  }

  await auditService.log("topic_backfill.requested", {
    userId,
    targetTableName: "topic_backfill_runs",
    targetRecordId: row.id,
    details: { targetKind: target.kind, targetId: target.id, trigger, maxNewPapers },
  });
  return { run: toRun(row, isAdmin), created: true };
}

async function loadRequestTarget(kind: TopicBackfillTargetKind, id: string): Promise<BackfillTarget> {
  const target = await loadBackfillTarget(kind, id);
  if (!target) throw AppError.notFound("Nothing to import for this entry");
  return target;
}

function assertHasQueries(target: BackfillTarget): void {
  if (target.queries.length) return;
  if (target.kind === "tag") {
    throw new AppError(409, "TAG_HAS_NO_INCLUDE_RULES", "This tag has no include rule that OpenAlex can search");
  }
  throw new AppError(409, "TOPIC_NOT_BACKFILLABLE", "This entry cannot be searched in OpenAlex");
}

/**
 * Best-effort follow-up of anything that imported papers; one failing step never fails the import.
 * Re-tags only `tagId` when the import was for one tag, every active tag otherwise.
 */
export async function runImportFollowUps(context: Record<string, unknown>, tagId?: string): Promise<void> {
  const step = async (name: string, action: () => Promise<unknown>) => {
    try { await action(); } catch (error) {
      logger.warn({ ...context, step: name, message: scrubErrorMessage(error) }, "import follow-up failed");
    }
  };
  // Search results show tag counts from these columns, which an import leaves stale.
  await step("refreshCounts", () => taxonomyBackfillService.refreshCounts());
  await step("embeddings", () => embeddingQueue.add("manual-embedding", {}));
  await step("paper-analysis", () => paperAnalysisQueue.add("synced-paper-knowledge", {}));
  await step("retag", () => (tagId ? tagAssignmentService.enqueueApplyTag(tagId) : tagAssignmentService.enqueueApplyAll()));
}

export const topicBackfillService = {
  /** A signed-in user asked from a thin search result. Cheap guards first, the daily cap last. */
  async requestFromSearch(userId: string, input: { targetKind: TopicBackfillTargetKind; targetId: string }): Promise<TopicBackfillRequestResult> {
    if (!env.TOPIC_BACKFILL_SEARCH_ENABLED) {
      throw new AppError(403, "TOPIC_BACKFILL_DISABLED", "Importing papers from search is turned off");
    }
    const target = await loadRequestTarget(input.targetKind, input.targetId);
    // Keeps the endpoint from being a way to start arbitrary large imports.
    if (target.paperCount >= env.TOPIC_BACKFILL_THIN_MAX_PAPERS) {
      throw new AppError(409, "TOPIC_NOT_THIN", "The corpus already has enough papers for this entry");
    }
    assertHasQueries(target);

    const live = await findLiveRun(target.kind, target.id);
    if (live) return { run: toRun(live, false), created: false };

    if (env.TOPIC_BACKFILL_COOLDOWN_HOURS > 0) {
      const recent = await getPrisma().topicBackfillRun.findFirst({
        where: {
          targetKind: target.kind,
          targetId: target.id,
          state: "completed",
          finishedAt: { gte: new Date(Date.now() - env.TOPIC_BACKFILL_COOLDOWN_HOURS * HOUR_MS) },
        },
        orderBy: { finishedAt: "desc" },
      });
      if (recent) return { run: toRun(recent, false), created: false };
    }

    if (await searchPapersToday() >= env.TOPIC_BACKFILL_DAILY_MAX_PAPERS) {
      throw new AppError(429, "TOPIC_BACKFILL_DAILY_LIMIT", "Today's import allowance is used up; try again tomorrow");
    }
    return createAndEnqueue(userId, target, "search", env.TOPIC_BACKFILL_DEFAULT_NEW_PAPERS, false);
  },

  /** An admin asked from the catalogue: any kind, a bigger budget, and no thin check, cooldown or daily cap. */
  async requestFromAdmin(
    userId: string,
    input: { targetKind: TopicBackfillTargetKind; targetId: string; maxNewPapers?: number },
  ): Promise<TopicBackfillRequestResult> {
    const maxNewPapers = input.maxNewPapers ?? env.TOPIC_BACKFILL_DEFAULT_NEW_PAPERS;
    if (maxNewPapers < 1 || maxNewPapers > env.TOPIC_BACKFILL_MAX_NEW_PAPERS) {
      throw AppError.badRequest(`maxNewPapers must be between 1 and ${env.TOPIC_BACKFILL_MAX_NEW_PAPERS}`);
    }
    const target = await loadRequestTarget(input.targetKind, input.targetId);
    assertHasQueries(target);

    const live = await findLiveRun(target.kind, target.id);
    if (live) return { run: toRun(live, true), created: false };
    return createAndEnqueue(userId, target, "admin", maxNewPapers, true);
  },

  /**
   * Worker body. Imports the works the corpus lacks, page by page, within the run's paper budget and the per-attempt
   * page limit. Progress is written after every page. A retry restarts from the first page, but works already imported
   * are found in the corpus and skipped, so it only continues the job.
   */
  async runBackfill(runId: string): Promise<{ insertedCount: number; skippedCount: number; pagesFetched: number }> {
    const prisma = getPrisma();
    const run = await prisma.topicBackfillRun.findUnique({ where: { id: runId } });
    if (!run) throw new UnrecoverableError("Topic backfill run not found");
    if (run.state === "completed" || run.state === "failed") {
      return { insertedCount: run.insertedCount, skippedCount: run.skippedCount, pagesFetched: run.pagesFetched };
    }
    await prisma.topicBackfillRun.update({
      where: { id: runId }, data: { state: "running", startedAt: run.startedAt ?? new Date() },
    });

    const provider = await prisma.apiProvider.findUnique({ where: { providerName: "openalex" } });
    if (!provider) throw new UnrecoverableError("openalex provider not seeded — run seed:providers first");
    const target = await loadBackfillTarget(run.targetKind as TopicBackfillTargetKind, run.targetId);
    if (!target) throw new UnrecoverableError("The entry was removed or deactivated after the import was requested");
    if (!target.queries.length) throw new UnrecoverableError("The entry has nothing OpenAlex can be asked about");

    let inserted = run.insertedCount;
    let skipped = run.skippedCount;
    let pages = run.pagesFetched;
    let pagesLeft = env.TOPIC_BACKFILL_MAX_PAGES;

    for (let index = 0; index < target.queries.length && inserted < run.maxNewPapers && pagesLeft > 0; index++) {
      const query = target.queries[index]!;
      // Fair share: a query that ends early hands its unused pages to the ones after it.
      const share = Math.max(1, Math.floor(pagesLeft / (target.queries.length - index)));
      let cursor = "*";
      for (let used = 0; used < share && pagesLeft > 0 && inserted < run.maxNewPapers; used++) {
        const page = await fetchOpenAlexPage({
          filterExpression: query.filterExpression,
          searchText: query.searchText,
          sort: query.sort,
          cursor,
          perPage: OPENALEX_MAX_PER_PAGE,
        });
        pagesLeft--;

        const works = page.results.filter((work) => openAlexId(work));
        const present = await presentInCorpus(works.map(openAlexId));
        const missing = works.filter((work) => !present.has(openAlexId(work)));
        const toImport = missing.slice(0, run.maxNewPapers - inserted);
        const result = toImport.length ? await ingestOpenAlexWorks(toImport, provider.id) : null;

        const newlyInserted = result?.insertedCount ?? 0;
        // A work that raced into the corpus between the check and the import comes back as an update, not an insert.
        const newlySkipped = present.size + (result?.updatedCount ?? 0);
        inserted += newlyInserted;
        skipped += newlySkipped;
        pages++;
        await prisma.topicBackfillRun.update({
          where: { id: runId },
          data: {
            fetchedCount: { increment: page.results.length },
            insertedCount: { increment: newlyInserted },
            skippedCount: { increment: newlySkipped },
            rejectedCount: { increment: (result?.rejectedCount ?? 0) + (page.results.length - works.length) },
            pagesFetched: { increment: 1 },
          },
        });

        if (!page.nextCursor || !page.results.length) break;
        cursor = page.nextCursor;
      }
    }

    // Completed means the counts and the re-tagging are queued, so a search that polls this run sees fresh numbers.
    // Cumulative, so a retry that only found what an earlier attempt imported still does the follow-up.
    if (inserted > 0) await runImportFollowUps({ runId: run.id }, run.targetKind === "tag" ? run.targetId : undefined);
    await prisma.topicBackfillRun.update({
      where: { id: runId }, data: { state: "completed", finishedAt: new Date(), errorMessage: null },
    });
    logger.info({ runId, targetKind: run.targetKind, inserted, skipped, pages }, "topic backfill completed");
    return { insertedCount: inserted, skippedCount: skipped, pagesFetched: pages };
  },

  /** Ends a queued or running run; a run that already finished is left alone. */
  async markFailed(runId: string, error: unknown): Promise<void> {
    const message = scrubErrorMessage(error);
    logger.warn({ runId, message }, "topic backfill failed");
    await getPrisma().topicBackfillRun.updateMany({
      where: { id: runId, state: { in: LIVE_STATES } },
      data: { state: "failed", finishedAt: new Date(), errorMessage: message },
    });
  },

  /**
   * Worker startup: a queued/running row whose job is gone (Redis flushed, job removed) would hold the partial unique
   * index and block its target for ever. Rows younger than a minute may not have been queued yet and are left alone.
   */
  async failOrphanedRuns(): Promise<number> {
    const rows = await getPrisma().topicBackfillRun.findMany({
      where: { state: { in: LIVE_STATES }, createdAt: { lt: new Date(Date.now() - ORPHAN_GRACE_MS) } },
      select: { id: true },
    });
    let failed = 0;
    for (const { id } of rows) {
      if (await hasLiveJob(topicBackfillQueue, topicBackfillJobId(id))) continue;
      await topicBackfillService.markFailed(id, new Error("The import was interrupted before it finished; request it again"));
      failed++;
    }
    return failed;
  },

  async getRun(id: string, options: { isAdmin: boolean }): Promise<TopicBackfillRun> {
    const row = await getPrisma().topicBackfillRun.findUnique({ where: { id } });
    if (!row) throw AppError.notFound("Import not found");
    return toRun(row, options.isAdmin);
  },

  async listRuns(query: ListBackfillRunsQuery) {
    const prisma = getPrisma();
    const where = {
      ...(query.targetKind ? { targetKind: query.targetKind } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.state ? { state: query.state } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.topicBackfillRun.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.topicBackfillRun.count({ where }),
    ]);
    return {
      data: rows.map((row) => toRun(row, true)),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  },
};
