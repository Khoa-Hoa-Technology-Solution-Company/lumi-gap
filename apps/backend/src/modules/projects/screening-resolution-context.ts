import type { ScreeningRound } from "../../generated/prisma/client.js";
import type { WorkspaceContext } from "./workspace-access.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { effectiveAssignments, screeningPeople } from "./screening-assignments.js";
import { classifyScreeningPair } from "./screening.calculator.js";
import { notificationService } from "../notifications/notification.service.js";

export async function screeningClassification(c: WorkspaceContext, row: ScreeningRound) {
  if (row.legacyNeedsAudit || !row.unblindedAt) return null;
  const assignments = await effectiveAssignments(c, row.id);
  if (assignments.length !== 2 || assignments.some(a => !a.submittedAt)) return null;
  const reviews = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: assignments.map(a => ({ assignmentId: a.id, revision: a.revision })) } });
  if (reviews.some(r => r.scope && r.scope !== row.phase)) return null;
  return classifyScreeningPair(reviews.map(r => ({ ...r, roundId: row.id, reviewerId: assignments.find(a => a.id === r.assignmentId)!.reviewerId })), row.phase, ((row.settings as { workflowVersion?: number }).workflowVersion ?? 0) >= 6);
}

/** Resolve against the immutable stage protocol, never client supplied criteria. */
export function validateResolutionEvidence(row: ScreeningRound, input: { decision: string; exclusionReason?: string; sourceMaterial?: string; retrieveFullText?: boolean }) {
  const settings = row.settings as { workflowVersion?: number; reviewMode?: string; exclusionCriteria?: string[]; stages?: string[]; allowConservativeFullText?: boolean };
  if (input.retrieveFullText && (input.decision !== "NEEDS_MORE_INFO" || row.phase !== "TITLE_ABSTRACT" || !settings.stages?.includes("FULL_TEXT") || !settings.allowConservativeFullText)) throw AppError.badRequest("Quy trình không cho phép chuyển đọc toàn văn từ kết quả này");
  if ((settings.workflowVersion ?? 0) < 7 || settings.reviewMode !== "INDEPENDENT") return;
  if (!input.sourceMaterial?.trim() || input.sourceMaterial.trim().length < 3) throw AppError.badRequest("Ghi phạm vi và nguồn tài liệu đã xem xét");
  if (input.decision === "EXCLUDED") {
    const reason = input.exclusionReason?.trim();
    if (!reason || reason.length < 3) throw AppError.badRequest("Chọn hoặc ghi lý do loại chính thức");
    if (settings.exclusionCriteria?.length && !settings.exclusionCriteria.includes(reason)) throw AppError.badRequest("Lý do loại phải thuộc tiêu chí đã lưu của vòng");
  }
}

export async function notifyScreeningParticipants(c: WorkspaceContext, row: ScreeningRound, event: string, title: string, version: number, extraIds: string[] = []) {
  const live = new Set((await screeningPeople(c)).map(p => p.id));
  const assignments = await effectiveAssignments(c, row.id);
  for (const userId of new Set([...assignments.filter(a => a.submittedAt).map(a => a.reviewerId), ...extraIds])) {
    if (!live.has(userId)) continue;
    await notificationService.create({ userId, type: "SCREENING_ACTION_REQUIRED", paperId: row.paperId, title,
      message: "Mở đúng bài và giai đoạn để xem tiến độ, lý do và lịch sử đánh giá.", targetKind: "project", targetId: c.project.id,
      eventKey: `SCREENING:${row.id}:${event}:${version}:${userId}`, emailPayload: { screeningRoundId: row.id }, emailStatus: "SKIPPED" }, c.tx);
  }
}
