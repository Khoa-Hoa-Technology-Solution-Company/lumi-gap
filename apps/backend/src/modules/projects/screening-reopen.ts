import { AppError } from "../../common/exceptions/app-error.js";
import type { ScreeningRound } from "../../generated/prisma/client.js";
import type { WorkspaceContext } from "./workspace-access.js";
import { closeCase } from "./screening-case-context.js";

/** Follow audited stage dependencies, preserving ballots/results while revoking their current authority. */
export async function invalidateDependentStages(c: WorkspaceContext, parent: ScreeningRound, reason: string) {
  const advances = await c.tx.screeningAudit.findMany({ where: { projectId: c.project.id, type: "STAGE_ADVANCED" } });
  const descendants = new Set<string>();
  const queue = [parent.id];
  while (queue.length) {
    const previous = queue.shift()!;
    for (const audit of advances) {
      const details = audit.details as { previousRoundId?: string } | null;
      if (details?.previousRoundId === previous && audit.roundId && !descendants.has(audit.roundId)) {
        descendants.add(audit.roundId); queue.push(audit.roundId);
      }
    }
  }
  if (!parent.active) {
    const active = await c.tx.screeningRound.findFirst({ where: { projectId: c.project.id, paperId: parent.paperId, active: true } });
    if (!active || !descendants.has(active.id)) throw AppError.conflict("Vòng đã được thay bằng quy trình mới. Mở lại vòng đang hiệu lực");
  }
  if (descendants.size && c.role !== "OWNER") throw AppError.forbidden("Chỉ chủ dự án được mở lại vòng có bước phụ thuộc");
  for (const id of descendants) {
    await closeCase(c, id, "CANCELLED_REOPENED");
    await c.tx.screeningAssignment.updateMany({ where: { projectId: c.project.id, roundId: id, active: true, submittedAt: null }, data: { active: false } });
    await c.tx.screeningRound.update({ where: { id }, data: { active: false, version: { increment: 1 } } });
    await c.tx.mentorResourceShare.updateMany({ where: { projectId: c.project.id, sectionKey: `screening:${id}`, revokedAt: null }, data: { revokedAt: new Date() } });
    await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: id, actorId: c.actorId, type: "DEPENDENCY_INVALIDATED", details: { parentRoundId: parent.id, reason, retainedHistory: true } } });
  }
}
