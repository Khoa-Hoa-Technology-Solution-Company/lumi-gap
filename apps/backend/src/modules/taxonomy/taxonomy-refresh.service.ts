import type { TaxonomySyncStatus } from "@trend/shared-types";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { taggingQueue } from "../../infrastructure/queue.js";
import { taxonomyBackfillService } from "./taxonomy-backfill.service.js";
import { taxonomySyncService } from "./taxonomy-sync.service.js";

export const SYNC_TAXONOMY_JOB = "sync-taxonomy";

const LIVE_STATES = ["waiting", "active", "delayed", "prioritized"] as const;
/** How far back to look for this job among the queue's failed jobs. */
const FAILED_JOBS_SCANNED = 50;

async function isLive(): Promise<boolean> {
  const jobs = await taggingQueue.getJobs([...LIVE_STATES]);
  return jobs.some((job) => job.name === SYNC_TAXONOMY_JOB);
}

/** Nodes from OpenAlex carry syncedAt; nodes the backfill derived from papers do not, and are only part of the tree. */
async function lastSyncedAt(): Promise<Date | null> {
  const result = await getPrisma().researchTopic.aggregate({ _max: { syncedAt: true } });
  return result._max.syncedAt ?? null;
}

export const taxonomyRefreshService = {
  async status(): Promise<TaxonomySyncStatus> {
    const [synced, running, failed] = await Promise.all([
      lastSyncedAt(),
      isLive(),
      taggingQueue.getJobs(["failed"], 0, FAILED_JOBS_SCANNED - 1, false),
    ]);
    const lastFailure = failed
      .filter((job) => job.name === SYNC_TAXONOMY_JOB && (!synced || job.timestamp > synced.getTime()))
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    return {
      loaded: synced !== null,
      running,
      lastSyncedAt: synced?.toISOString() ?? null,
      lastError: running ? null : lastFailure?.failedReason ?? null,
    };
  },

  /** False when a load is already waiting or running. */
  async requestSync(): Promise<{ queued: boolean }> {
    if (await isLive()) return { queued: false };
    await taggingQueue.add(SYNC_TAXONOMY_JOB, {});
    return { queued: true };
  },

  /** On worker start: a new database gets its catalogue without anyone having to remember a command. */
  async ensureLoaded(): Promise<void> {
    if (await lastSyncedAt()) return;
    const { queued } = await this.requestSync();
    logger.info({ queued }, "taxonomy catalogue is empty; loading it from OpenAlex");
  },

  /** Same steps as `pnpm taxonomy:sync`. Safe to repeat: nodes are upserted and links recomputed. */
  async run() {
    const synced = await taxonomySyncService.syncAll();
    const backfill = await taxonomyBackfillService.backfillAll();
    return { synced, backfill };
  },
};
