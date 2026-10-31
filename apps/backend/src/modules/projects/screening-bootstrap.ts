import { AppError } from "../../common/exceptions/app-error.js";
import { notificationService } from "../notifications/notification.service.js";
import { balancedReviewers } from "./screening.calculator.js";
import { screeningPeople } from "./screening-assignments.js";
import { settingsForNewScreening, projectScreeningStatus } from "./screening-context.js";
import { meaningfulLegacyScreening } from "./screening-review-context.js";
import { jsonSnapshot, type WorkspaceContext } from "./workspace-access.js";

/** Called under the existing project write lock; never invoked by a GET or for duplicates. */
export async function initializePaperScreening(c: WorkspaceContext, paperId: string, confirmRescreen = false) {
  if (["ARCHIVED", "COMPLETED"].includes(c.project.status)) throw AppError.conflict("Dự án chỉ được xem");
  const settings = await settingsForNewScreening(c);
  if (settings.reviewMode === "COLLABORATIVE") return null;
  const previous = await c.tx.screeningRound.findFirst({ where: { projectId: c.project.id, paperId }, orderBy: { number: "desc" } });
  if (previous) return previous; // No implicit re-screening or rewriting of historical rules.
  const link = await c.tx.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: c.project.id, paperId } } });
  if (meaningfulLegacyScreening({ ...link, status: link.screeningStatus })) {
    if (!confirmRescreen) throw AppError.conflict("Bài có đánh giá cũ. Xác nhận mở quy trình mới; lịch sử vẫn được giữ");
    await c.tx.screeningLegacyRecord.upsert({ where: { projectId_paperId: { projectId: c.project.id, paperId } }, create: { projectId: c.project.id, paperId, snapshot: jsonSnapshot({ provenance: "PRE_PROTOCOL_STATUS", ...link, status: link.screeningStatus }) }, update: {} });
  }
  const people = await screeningPeople(c);
  const activeRounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, active: true }, select: { id: true } });
  const pending = await c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, active: true, roundId: { in: activeRounds.map(r => r.id) } }, select: { reviewerId: true, submittedAt: true } });
  const loads = new Map<string, { pending: number; total: number }>();
  for (const a of pending) { const load = loads.get(a.reviewerId) ?? { pending: 0, total: 0 }; load.total++; if (!a.submittedAt) load.pending++; loads.set(a.reviewerId, load); }
  const selected = balancedReviewers(people.map(p => p.id), [], settings.requiredReviewers, loads, link.addedById);
  const row = await c.tx.screeningRound.create({ data: { projectId: c.project.id, paperId, number: 1, phase: settings.stages?.[0] ?? "TITLE_ABSTRACT", settings: jsonSnapshot(settings), createdById: c.actorId } });
  await c.tx.screeningAssignment.createMany({ data: selected.map(reviewerId => ({ projectId: c.project.id, roundId: row.id, reviewerId })) });
  await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: row.id, actorId: c.actorId, type: "AUTO_ASSIGNED", details: { reviewerIds: selected, requiredReviewers: settings.requiredReviewers, unfilledSlots: Math.max(0, settings.requiredReviewers - selected.length), ruleVersion: settings.version, workflowVersion: settings.workflowVersion } } });
  await c.tx.project.update({ where: { id: c.project.id }, data: { screeningMode: "INDEPENDENT", screeningBlinded: true } });
  await projectScreeningStatus(c, row, "NOT_REVIEWED");
  for (const reviewerId of selected.filter(id => id !== c.actorId)) await notificationService.create({ userId: reviewerId, type: "SCREENING_REVIEW_ASSIGNED", paperId, title: "Bài báo đang chờ bạn đánh giá", message: "Bạn được phân công đánh giá độc lập trong thư viện dự án.", targetKind: "project", targetId: c.project.id, eventKey: `SCREENING:${row.id}:ASSIGNED:${reviewerId}`, emailStatus: "SKIPPED" }, c.tx);
  return row;
}
