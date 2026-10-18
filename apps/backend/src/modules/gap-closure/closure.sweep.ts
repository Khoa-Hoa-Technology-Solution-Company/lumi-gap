import { gapsQueue, hasLiveJob } from "../../infrastructure/queue.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { markClosureCheckFailed } from "./closure.runner.js";

/** Checks stuck in SEARCHING longer than this are orphans of a dead worker (the log is written after every query). */
export const STUCK_SEARCHING_MS = 10 * 60_000;
/** Checks stuck in QUEUED longer than this may have lost their job (never picked up). */
export const STUCK_QUEUED_MS = 30 * 60_000;

export interface ClosureSweepDeps {
  /** True when the check's BullMQ job (id = check id) is still waiting or will be retried. */
  isLive: (checkId: string) => Promise<boolean>;
  now: () => number;
}

const defaultDeps: ClosureSweepDeps = { isLive: (checkId) => hasLiveJob(gapsQueue, checkId), now: Date.now };

/**
 * Startup sweep: a hard-killed worker leaves closure checks frozen in SEARCHING, and a lost job leaves one in QUEUED
 * forever. Fail them through markClosureCheckFailed (which refunds once), but skip any check whose BullMQ job is still
 * live - that one is slow, not lost. SCREENING checks are waiting for a person and are never swept.
 * Returns how many checks were failed.
 */
export async function sweepStuckClosureChecks(deps: ClosureSweepDeps = defaultDeps): Promise<number> {
  const now = deps.now();
  const stuck = await getPrisma().gapClosureCheck.findMany({
    where: { OR: [
      { status: "SEARCHING", updatedAt: { lt: new Date(now - STUCK_SEARCHING_MS) } },
      { status: "QUEUED", updatedAt: { lt: new Date(now - STUCK_QUEUED_MS) } },
    ] },
    select: { id: true, status: true },
  });
  let swept = 0;
  for (const check of stuck) {
    if (await deps.isLive(check.id)) continue;
    await markClosureCheckFailed(check.id, check.status === "QUEUED"
      ? "Gap closure check was stuck in queue (worker restarted). Please try again."
      : "Gap closure check was interrupted (worker restarted). Please try again.");
    swept += 1;
  }
  return swept;
}
