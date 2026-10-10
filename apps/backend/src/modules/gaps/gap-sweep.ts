import { gapsQueue, hasLiveJob } from "../../infrastructure/queue.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { gapsService } from "./gaps.service.js";

/** Analyses stuck in "analyzing" longer than this are orphans of a dead worker. */
export const STUCK_ANALYZING_MS = 5 * 60_000;
/** Analyses stuck in "queued" longer than this may have lost their job (never picked up). */
export const STUCK_QUEUED_MS = 30 * 60_000;

export interface GapSweepDeps {
  /** True when the analysis' BullMQ job is still waiting or will be retried. */
  isLive: (analysisId: string) => Promise<boolean>;
  now: () => number;
}

const defaultDeps: GapSweepDeps = { isLive: (analysisId) => hasLiveJob(gapsQueue, analysisId), now: Date.now };

/**
 * Startup sweep: a hard-killed worker leaves analyses frozen in "analyzing", and a lost job leaves one in "queued"
 * forever. Fail them through markAnalysisFailed so the credits are refunded, but skip any analysis whose BullMQ job
 * is still waiting or will be retried — that one is slow, not lost. Returns how many analyses were failed.
 */
export async function sweepStuckGapAnalyses(deps: GapSweepDeps = defaultDeps): Promise<number> {
  const now = deps.now();
  const stuck = await getPrisma().gapAnalysis.findMany({
    where: { OR: [
      { status: "analyzing", updatedAt: { lt: new Date(now - STUCK_ANALYZING_MS) } },
      { status: "queued", updatedAt: { lt: new Date(now - STUCK_QUEUED_MS) } },
    ] },
    select: { id: true, status: true },
  });
  let swept = 0;
  for (const analysis of stuck) {
    if (await deps.isLive(analysis.id)) continue;
    await gapsService.markAnalysisFailed(analysis.id, analysis.status === "queued"
      ? "Gap analysis was stuck in queue (worker restarted). Please try again."
      : "Gap analysis was interrupted (worker restarted). Please try again.");
    swept += 1;
  }
  return swept;
}
