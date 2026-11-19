import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { withWorkspace } from "./workspace-access.js";
import { maintainProjectConsensus } from "./screening-consensus.js";
import { reconcileScreeningObligations } from "./screening-obligations.js";

/** Existing notification-worker schedule also enforces consensus deadlines without browser activity. */
export async function maintainScreeningCases(caseId?: string) {
  const db = getPrisma();
  const legacy = caseId ? await db.screeningAdjudicationCase.findUnique({ where: { id: caseId }, select: { projectId: true } }) : null;
  if (caseId && !legacy) return;
  const now = new Date();
  const candidates = legacy ? [legacy] : (await Promise.all([
    db.screeningRound.findMany({ where: { active: true, status: { in: ["CONSENSUS_REQUIRED", "CONSENSUS_IN_PROGRESS"] }, consensusDeadline: { lte: new Date(now.getTime() + 6 * 3600000) } }, distinct: ["projectId"], select: { projectId: true } }),
    db.screeningObligation.findMany({ where: { endedAt: null, dueAt: { lte: now } }, distinct: ["projectId"], select: { projectId: true } }),
    db.screeningAdjudicationCase.findMany({ where: { active: true }, distinct: ["projectId"], select: { projectId: true } }),
  ])).flat();
  const projectIds = [...new Set(candidates.map(row => row.projectId))];
  if (!projectIds.length) return;
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.project.findMany({ where: { status: { notIn: ["ARCHIVED", "COMPLETED"] }, id: { in: projectIds } },
      select: { id: true, ownerId: true }, orderBy: { id: "asc" }, take: 50, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!rows.length) break;
    for (const row of rows) {
      try { await withWorkspace(row.id, row.ownerId, {}, async c => {
        await maintainProjectConsensus(c);
        await reconcileScreeningObligations(c);
      }); } catch (error) { logger.warn({ err: error, projectId: row.id }, "Consensus deadline maintenance will retry"); }
    }
    cursor = rows[rows.length - 1]!.id;
  }
  if (!caseId) {
    const projects = await db.screeningObligation.findMany({ where: { endedAt: null }, distinct: ["projectId"], select: { projectId: true } });
    for (const row of projects) {
      try {
        const project = await db.project.findUnique({ where: { id: row.projectId }, select: { ownerId: true } });
        if (project) await withWorkspace(row.projectId, project.ownerId, {}, reconcileScreeningObligations);
      } catch (error) { logger.warn({ err: error, projectId: row.projectId }, "Screening obligation reconciliation will retry"); }
    }
  }
}
