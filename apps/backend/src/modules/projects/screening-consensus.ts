import type { ScreeningConsensusView, ScreeningSettings } from "@trend/shared-types";
import type { ScreeningRound } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { jsonSnapshot, type WorkspaceContext } from "./workspace-access.js";
import { effectiveAssignments } from "./screening-assignments.js";
import { closeCase } from "./screening-case-context.js";
import { projectScreeningStatus } from "./screening-context.js";
import { notifyScreeningParticipants } from "./screening-resolution-context.js";
import { notificationService } from "../notifications/notification.service.js";

export const consensusPending = (status: string) => ["CONSENSUS_REQUIRED", "CONSENSUS_IN_PROGRESS"].includes(status);
export const usesTwoReviewerConsensus = (settings: unknown) =>
  (settings as Partial<ScreeningSettings>).reviewMode === "INDEPENDENT";
export const noConsensusMessage = "Hai Reviewer không thống nhất được kết quả trong thời gian quy định. Bài báo đã được kết luận Không phù hợp và đóng quy trình đánh giá.";

/** Append-only personal confirmations are scoped to this discussion, never to another reviewer. */
async function confirmations(c: WorkspaceContext, row: ScreeningRound) {
  if (!row.consensusStartedAt) return [];
  return c.tx.screeningAudit.findMany({ where: { projectId: c.project.id, roundId: row.id,
    type: "CONSENSUS_CONFIRMED", details: { path: ["startedAt"], equals: row.consensusStartedAt.toISOString() } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

export async function beginConsensus(c: WorkspaceContext, row: ScreeningRound) {
  if (row.consensusDeadline) return row;
  const settings = row.settings as unknown as ScreeningSettings;
  const now = new Date();
  const hours = Math.min(336, Math.max(1, settings.consensusWindowHours ?? 48));
  const next = await c.tx.screeningRound.update({ where: { id: row.id }, data: {
    status: "CONSENSUS_REQUIRED", finalizerId: null, consensusStartedAt: now,
    consensusDeadline: new Date(now.getTime() + hours * 3600000), unblindedAt: row.unblindedAt ?? now,
    version: { increment: 1 },
  } });
  const assignments = await effectiveAssignments(c, row.id);
  const reviews = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id,
    OR: assignments.map(a => ({ assignmentId: a.id, revision: a.revision })) } });
  await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: row.id, actorId: c.actorId,
    type: "CONSENSUS_STARTED", details: jsonSnapshot({ startedAt: now.toISOString(), deadline: next.consensusDeadline!.toISOString(),
      reviewerIds: assignments.map(a => a.reviewerId), reviewIds: reviews.map(r => r.id) }) } });
  await closeCase(c, row.id, "CANCELLED_AS_RESOLVED");
  await projectScreeningStatus(c, next, next.status);
  await notifyScreeningParticipants(c, next, "CONSENSUS_REQUIRED", "Hai Reviewer chưa thống nhất đánh giá", next.version);
  return next;
}

/** Caller holds withWorkspace's project lock. Expiry and confirmations commit atomically. */
export async function settleConsensus(c: WorkspaceContext, row: ScreeningRound, now = new Date()) {
  if (["ARCHIVED", "COMPLETED"].includes(c.project.status)) return row;
  if (!row.active || !consensusPending(row.status) || !row.consensusDeadline) return row;
  await closeCase(c, row.id, "CANCELLED_AS_RESOLVED");
  const assignments = await effectiveAssignments(c, row.id);
  const reviews = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id,
    OR: assignments.filter(a => a.submittedAt).map(a => ({ assignmentId: a.id, revision: a.revision })) } });
  const pair = assignments.length === 2 && assignments.every(a => a.submittedAt)
    ? assignments.map(a => reviews.find(r => r.assignmentId === a.id)) : [];
  const choices = pair.map(v => v?.decision);
  const matching = pair.length === 2 && pair.every(v => v && v.submittedAt < row.consensusDeadline! && (!v.scope || v.scope === row.phase))
    && choices.every(d => d === choices[0]) && ["INCLUDE", "EXCLUDE"].includes(choices[0] ?? "");
  if (!matching && row.consensusDeadline > now) return row;
  const decision = matching && choices[0] === "INCLUDE" ? "INCLUDED" : "EXCLUDED";
  const reason = matching ? `Hai phiếu hiện hành thống nhất ${decision === "INCLUDED" ? "phù hợp" : "không phù hợp"} sau thảo luận.` : noConsensusMessage;
  const next = await c.tx.screeningRound.update({ where: { id: row.id }, data: { status: decision, finalizerId: null, version: { increment: 1 } } });
  await c.tx.screeningFinalDecision.create({ data: { projectId: c.project.id, roundId: row.id,
    roundVersion: next.version, decision, source: "CONSENSUS", reason,
    resolutionType: matching ? "CONSENSUS_AFTER_DISCUSSION" : "CONSENSUS_NOT_REACHED",
    reviewIds: reviews.map(r => r.id), sourceMaterial: reviews.map(r => r.comment || r.exclusionReason).filter(Boolean).join("\n") } });
  await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: row.id, actorId: c.actorId,
    type: matching ? "CONSENSUS_RESOLVED" : "CONSENSUS_EXPIRED", details: { decision, reason, startedAt: row.consensusStartedAt!.toISOString() } } });
  await projectScreeningStatus(c, next, decision, reason);
  await notifyScreeningParticipants(c, next, "CONSENSUS_FINAL", matching ? "Đã ghi kết quả thống nhất của hai reviewer" : "Đã loại: không đạt đồng thuận trong thời hạn", next.version, [c.project.ownerId]);
  return next;
}

export async function consensusView(c: WorkspaceContext, row: ScreeningRound): Promise<ScreeningConsensusView | null> {
  if (!row.consensusStartedAt || !row.consensusDeadline) return null;
  const assignments = await effectiveAssignments(c, row.id);
  const votes = await confirmations(c, row);
  const own = assignments.some(a => a.reviewerId === c.actorId && a.submittedAt);
  return { startedAt: row.consensusStartedAt.toISOString(), deadline: row.consensusDeadline.toISOString(),
    status: consensusPending(row.status) ? row.status as "CONSENSUS_REQUIRED" | "CONSENSUS_IN_PROGRESS" : row.status === "INCLUDED" ? "ACCEPTED" : "REJECTED",
    canConfirm: false,
    canUpdate: own && row.active && !row.legacyNeedsAudit && consensusPending(row.status) && row.consensusDeadline > new Date()
      && !["ARCHIVED", "COMPLETED"].includes(c.project.status),
    confirmations: votes.map(v => { const value = v.details as { decision: "INCLUDE" | "EXCLUDE"; reason: string };
      return { reviewerId: v.actorId, decision: value.decision, reason: value.reason, confirmedAt: v.createdAt.toISOString() }; }),
  };
}

export async function updateConsensusEvaluation(c: WorkspaceContext, row: ScreeningRound, input: {
  decision: string; reason: string; expectedRevision?: number; exclusionReason?: string;
}) {
  const assignments = await effectiveAssignments(c, row.id);
  const own = assignments.find(a => a.reviewerId === c.actorId && a.submittedAt);
  if (!own) throw AppError.forbidden("Chỉ reviewer được phân công được cập nhật phiếu của chính mình");
  if (row.consensusDeadline && row.consensusDeadline <= new Date())
    return { next: await settleConsensus(c, row), expired: true, assignmentId: own.id, reviewId: undefined, revision: own.revision };
  if (!row.active || row.legacyNeedsAudit || !consensusPending(row.status) || !row.consensusDeadline || assignments.length !== 2 || assignments.some(a => !a.submittedAt))
    throw AppError.conflict("Vòng không còn thảo luận hoặc đã có kết quả. Không thể sửa phiếu đã chốt");
  if (!["INCLUDE", "EXCLUDE"].includes(input.decision)) throw AppError.badRequest("Chọn Phù hợp hoặc Không phù hợp");
  if (input.expectedRevision === undefined || input.expectedRevision !== own.revision)
    throw AppError.conflict("Phiếu của bạn đã thay đổi. Xem phiên bản hiện tại trước khi cập nhật");
  const current = await c.tx.screeningReview.findUniqueOrThrow({ where: { assignmentId_revision: { assignmentId: own.id, revision: own.revision } } });
  const at = new Date();
  if (at >= row.consensusDeadline) return { next: await settleConsensus(c, row), expired: true, assignmentId: own.id, reviewId: undefined, revision: own.revision };
  const review = await c.tx.screeningReview.create({ data: { projectId: c.project.id, assignmentId: own.id,
    revision: own.revision + 1, decision: input.decision, comment: input.reason,
    exclusionReason: input.decision === "EXCLUDE" ? input.exclusionReason || input.reason.slice(0, 500) : "",
    scope: current.scope, fullTextReference: current.fullTextReference, researchQuestions: jsonSnapshot(current.researchQuestions ?? []), submittedAt: at } });
  await c.tx.screeningAssignment.update({ where: { id: own.id }, data: { revision: review.revision, submittedAt: at } });
  const updated = await c.tx.screeningRound.update({ where: { id: row.id }, data: { status: "CONSENSUS_IN_PROGRESS", version: { increment: 1 } } });
  await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: row.id, actorId: c.actorId,
    type: "EVALUATION_UPDATED", details: { assignmentId: own.id, reviewId: review.id, previousReviewId: current.id,
      revision: review.revision, previousDecision: current.decision, decision: input.decision, reason: input.reason } } });
  const peer = assignments.find(a => a.reviewerId !== c.actorId)!;
  await notificationService.create({ userId: peer.reviewerId, type: "SCREENING_ACTION_REQUIRED", paperId: row.paperId,
    title: "Reviewer còn lại đã cập nhật đánh giá", message: "Mở bài báo để xem đánh giá mới và căn cứ trong cuộc thảo luận.",
    targetKind: "project", targetId: c.project.id, eventKey: `SCREENING:${row.id}:EVALUATION_UPDATED:${review.id}:${peer.reviewerId}`,
    emailPayload: { screeningRoundId: row.id }, emailStatus: "SKIPPED" }, c.tx);
  return { next: await settleConsensus(c, updated), expired: false, assignmentId: own.id, reviewId: review.id, revision: review.revision };
}

export async function maintainProjectConsensus(c: WorkspaceContext) {
  const rows = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, active: true,
    status: { in: ["CONSENSUS_REQUIRED", "CONSENSUS_IN_PROGRESS"] } } });
  for (const row of rows) {
    const next = await settleConsensus(c, row);
    if (!consensusPending(next.status) || !next.consensusStartedAt || !next.consensusDeadline || ["ARCHIVED", "COMPLETED"].includes(c.project.status)) continue;
    const window = next.consensusDeadline.getTime() - next.consensusStartedAt.getTime();
    const remaining = next.consensusDeadline.getTime() - Date.now();
    if (remaining > 0 && remaining <= Math.min(6 * 3600000, window / 4))
      await notifyScreeningParticipants(c, next, "DISCUSSION_DEADLINE", "Sắp hết hạn thảo luận đánh giá", next.consensusStartedAt.getTime());
  }
}
