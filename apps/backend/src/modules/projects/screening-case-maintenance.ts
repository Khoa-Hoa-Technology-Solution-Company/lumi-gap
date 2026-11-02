import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { notificationService } from "../notifications/notification.service.js";
import { withWorkspace } from "./workspace-access.js";
import { screeningRound } from "./screening-context.js";
import { caseAudit, ensureAssignment, notifyCaseCoordinators } from "./screening-case-context.js";

/** Keyset batches avoid starving expired packets behind older pending cases. */
export async function maintainScreeningCases(caseId?: string) {
  const db = getPrisma();
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.screeningAdjudicationCase.findMany({ where: { active: true, ...(caseId ? { id: caseId } : {}) }, orderBy: { id: "asc" }, take: 50, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!rows.length) break;
    for (const initial of rows) {
      try {
        const project = await db.project.findUnique({ where: { id: initial.projectId }, select: { ownerId: true } });
        if (!project) continue;
        await withWorkspace(initial.projectId, project.ownerId, {}, async c => {
          const row = await c.tx.screeningAdjudicationCase.findUniqueOrThrow({ where: { id: initial.id } });
          const round = await screeningRound(c, row.roundId);
          if (!row.active || !round.active || ["ARCHIVED", "COMPLETED"].includes(c.project.status)) return;
          const next = await ensureAssignment(c, round, row, true);
          const assignment = await c.tx.screeningAdjudicationInvitation.findFirst({ where: { caseId: next.id, status: "ASSIGNED" } });
          if (!assignment || !next.lockedAt) return;
          const policy = round.settings as { adjudicationReminderHours?: number; adjudicationReassignHours?: number };
          const age = Date.now() - Math.max(next.lockedAt.getTime(), assignment.createdAt.getTime());
          if (age >= (policy.adjudicationReminderHours ?? 72) * 3600000) {
            const eventKey = `SCREENING:CASE:${next.id}:REMINDER:${assignment.id}`;
            if (!await c.tx.notification.findUnique({ where: { eventKey } })) {
              await notificationService.create({ userId: assignment.userId, type: "SCREENING_ADJUDICATION_ASSIGNED", title: "Nhắc xử lý hồ sơ phân xử", message: "Đọc hồ sơ và ghi kết luận có căn cứ khi đủ thông tin.", targetKind: "project", targetId: c.project.id, emailPayload: { screeningRoundId: row.roundId }, eventKey, emailStatus: "SKIPPED" }, c.tx);
              await caseAudit(c, next, "ADJUDICATION_REMINDER", { automated: true, userId: assignment.userId });
            }
          }
          if (age >= (policy.adjudicationReassignHours ?? 168) * 3600000) {
            // Escalate, without replacing a person or choosing arbitrarily on a timer.
            const eventKey = `FOLLOWUP:${assignment.id}`;
            await notifyCaseCoordinators(c, round, next, eventKey, "Hồ sơ cần kiểm tra tiến độ hoặc phân công lại", [assignment.userId]);
          }
        });
      } catch (error) { logger.warn({ err: error, caseId: initial.id }, "Screening case maintenance will retry"); }
    }
    cursor = rows[rows.length - 1]!.id;
  }
}
