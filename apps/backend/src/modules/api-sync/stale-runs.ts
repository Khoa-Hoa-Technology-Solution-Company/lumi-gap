import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { auditService } from "../audit/audit.service.js";

/**
 * A sync run still "running" after this long was interrupted: the worker stopped before it could record the outcome.
 * Real runs take minutes (at most 50 pages of 100 works). The pipeline page uses the same limit for its warning.
 */
export const STALE_SYNC_RUN_MS = 2 * 60 * 60_000;

export const INTERRUPTED_RUN_MESSAGE = "Interrupted: the worker stopped before this run finished";

/**
 * Marks interrupted runs as failed, so they stop showing as running. Only runs older than STALE_SYNC_RUN_MS are
 * touched, never one a live worker (this one or another replica) may still be writing. Returns how many were closed.
 */
export async function failStaleSyncRuns(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - STALE_SYNC_RUN_MS);
  const { count } = await getPrisma().apiSyncRun.updateMany({
    where: { runStatus: "running", startedAt: { lt: before } },
    data: { runStatus: "failed", errorMessage: INTERRUPTED_RUN_MESSAGE, finishedAt: now },
  });
  if (count > 0) {
    logger.warn({ count }, "closed interrupted sync runs");
    await auditService.log("sync.interrupted_runs_closed", { targetTableName: "api_sync_runs", details: { count, startedBefore: before.toISOString() } });
  }
  return count;
}

/** Best effort: a failed cleanup must never stop a sync from running. */
export async function failStaleSyncRunsSafely(now = new Date()): Promise<number> {
  try {
    return await failStaleSyncRuns(now);
  } catch (error) {
    logger.warn({ err: error }, "could not close interrupted sync runs");
    return 0;
  }
}
