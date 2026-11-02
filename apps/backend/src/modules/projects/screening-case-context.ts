import type { ScreeningAdjudicationPacket, ScreeningDisputeCase } from "@trend/shared-types";
import type { ScreeningAdjudicationCase, ScreeningRound } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { jsonSnapshot, type WorkspaceContext } from "./workspace-access.js";
import { adjudicationPacket, screeningAdjudicators } from "./screening-adjudication-context.js";
import { effectiveAssignments } from "./screening-assignments.js";
import { notificationService } from "../notifications/notification.service.js";

export async function caseAudit(c: WorkspaceContext, row: ScreeningAdjudicationCase, type: string, details: unknown) {
  await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: row.roundId, actorId: c.actorId, type, details: jsonSnapshot({ caseId: row.id, ...details as object }) } });
}
export async function casePacket(c: WorkspaceContext, round: ScreeningRound): Promise<ScreeningAdjudicationPacket> {
  const packet = await adjudicationPacket(c, round);
  const assignments = await effectiveAssignments(c, round.id);
  const [reviews, people, discussion, files] = await Promise.all([
    c.tx.screeningReview.findMany({ where: { projectId: c.project.id, assignmentId: { in: assignments.map(a => a.id) } }, orderBy: [{ assignmentId: "asc" }, { revision: "asc" }] }),
    c.tx.user.findMany({ where: { id: { in: assignments.map(a => a.reviewerId) } }, select: { id: true, fullName: true } }),
    c.tx.screeningAudit.findMany({ where: { projectId: c.project.id, roundId: round.id, type: "DISCUSSION" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    c.tx.projectPaperFile.findMany({ where: { projectId: c.project.id, paperId: round.paperId }, select: { id: true, sha256: true, byteSize: true } }),
  ]);
  const reviewer = (assignmentId: string) => assignments.find(a => a.id === assignmentId)!.reviewerId;
  return { ...packet, sources: files, reviews: packet.reviews.map(r => ({ ...r, reviewerId: reviewer(reviews.find(v => v.id === r.id)!.assignmentId), reviewerName: people.find(p => p.id === reviewer(reviews.find(v => v.id === r.id)!.assignmentId))?.fullName || "Reviewer" })),
    allReviews: reviews.map(r => ({ id: r.id, reviewerId: reviewer(r.assignmentId), revision: r.revision, decision: r.decision as "INCLUDE" | "EXCLUDE" | "UNSURE", comment: r.comment, exclusionReason: r.exclusionReason, phaseMarker: r.revision === 1 ? "INDEPENDENT_INITIAL" : "POST_DISCUSSION_REVISION", submittedAt: r.submittedAt.toISOString() })),
    discussion: discussion.filter(e => !((e.details as Record<string, unknown>)?.adjudicationAssignmentId)).map(e => ({ id: e.id, comment: String((e.details as Record<string, unknown>).comment ?? ""), actorName: people.find(p => p.id === e.actorId)?.fullName || "Thành viên", createdAt: e.createdAt.toISOString() })) };
}
export async function latestCase(c: WorkspaceContext, roundId: string) {
  return c.tx.screeningAdjudicationCase.findFirst({ where: { projectId: c.project.id, roundId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
}
export async function rankedCandidates(c: WorkspaceContext, round: ScreeningRound, row: ScreeningAdjudicationCase) {
  const policy = round.settings as { preferredAdjudicatorId?: string; authorizedAdjudicatorIds?: string[] };
  const [pool, invitations, accesses] = await Promise.all([
    screeningAdjudicators(c, round), c.tx.screeningAdjudicationInvitation.findMany({ where: { caseId: row.id } }),
    c.tx.mentorAccess.findMany({ where: { projectId: c.project.id, revokedAt: null }, select: { mentorUserId: true, requestId: true } }),
  ]);
  const requests = await c.tx.mentorshipRequest.findMany({ where: { id: { in: accesses.map(a => a.requestId) }, status: "ACCEPTED", projectId: c.project.id }, select: { id: true, mentorRole: true } });
  const tried = new Set(invitations.map(i => i.userId));
  const preferred = policy.preferredAdjudicatorId ?? (policy.authorizedAdjudicatorIds?.length === 1 ? policy.authorizedAdjudicatorIds[0] : undefined);
  // Proposing the paper is a declared conflict. Owner privileges never remove it.
  const candidates = pool.filter(p => !p.proposer && !tried.has(p.id)).map(p => {
    const mentorRole = requests.find(r => accesses.some(a => a.mentorUserId === p.id && a.requestId === r.id))?.mentorRole;
    const priority = p.id === preferred ? 1 : p.mentor ? mentorRole === "PRIMARY" ? 2 : 3 : p.id === c.project.ownerId ? 5 : 4;
    return { ...p, priority, role: priority === 1 ? "PREDESIGNATED" : p.mentor ? mentorRole === "PRIMARY" ? "PRIMARY_MENTOR" : "SECONDARY_MENTOR" : p.id === c.project.ownerId ? "OWNER" : "MEMBER" };
  });
  const rank = Math.min(...candidates.map(p => p.priority));
  return candidates.filter(p => p.priority === rank).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
export async function caseCoordinator(c: WorkspaceContext, round: ScreeningRound, row: ScreeningAdjudicationCase) {
  if (!c.role || row.reviewerIds.includes(c.actorId)) return false;
  const policy = round.settings as { adjudicationCoordinatorIds?: string[] };
  const link = await c.tx.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: c.project.id, paperId: round.paperId } } });
  return link.addedById !== c.actorId && (c.role === "OWNER" || Boolean(policy.adjudicationCoordinatorIds?.includes(c.actorId)));
}
export async function caseNotify(c: WorkspaceContext, row: ScreeningAdjudicationCase, userIds: string[], event: string, title: string) {
  for (const userId of new Set(userIds)) await notificationService.create({ userId, type: "SCREENING_ADJUDICATION_ASSIGNED", title, message: "Mở hồ sơ phân xử để xem nhiệm vụ và trạng thái hiện tại.", targetKind: "project", targetId: c.project.id, emailPayload: { screeningRoundId: row.roundId }, eventKey: `SCREENING:CASE:${row.id}:${event}:${event.startsWith("FOLLOWUP:") ? "POLICY" : row.version}:${userId}`, emailStatus: "SKIPPED" }, c.tx);
}
export async function notifyCaseCoordinators(c: WorkspaceContext, round: ScreeningRound, row: ScreeningAdjudicationCase, event: string, title: string, excluded: string[] = []) {
  const policy = round.settings as { adjudicationCoordinatorIds?: string[] };
  const ids = [c.project.ownerId, ...policy.adjudicationCoordinatorIds ?? []];
  const [link, members, users] = await Promise.all([
    c.tx.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: c.project.id, paperId: round.paperId } } }),
    c.tx.projectMember.findMany({ where: { projectId: c.project.id, status: "ACTIVE", role: { notIn: ["MENTOR", "ADVISOR"] }, userId: { in: ids } }, select: { userId: true } }),
    c.tx.user.findMany({ where: { id: { in: ids }, isActive: true, accountStatus: "ACTIVE", emailVerifiedAt: { not: null } }, select: { id: true } }),
  ]);
  await caseNotify(c, row, ids.filter(id => !row.reviewerIds.includes(id) && !excluded.includes(id) && id !== link.addedById && users.some(u => u.id === id) && (id === c.project.ownerId || members.some(m => m.userId === id))), event, title);
}
/** Assignment is direct and only runs under the project lock, after sealing the packet. */
export async function assignCandidate(c: WorkspaceContext, round: ScreeningRound, row: ScreeningAdjudicationCase, candidate: { id: string; role: string }, automated = false) {
  if (!row.lockedAt) throw AppError.conflict("Hồ sơ chưa khóa");
  const assignment = await c.tx.screeningAdjudicationInvitation.create({ data: { projectId: c.project.id, caseId: row.id, userId: candidate.id, role: candidate.role, status: "ASSIGNED" } });
  const next = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { status: "ASSIGNED", version: { increment: 1 } } });
  await c.tx.screeningRound.update({ where: { id: round.id }, data: { finalizerId: candidate.id, version: { increment: 1 } } });
  await caseAudit(c, next, "ADJUDICATION_DIRECT_ASSIGNED", { assignmentId: assignment.id, userId: candidate.id, role: candidate.role, automated });
  await caseNotify(c, next, [candidate.id, ...row.reviewerIds], "ASSIGNED", "Đã phân công người phân xử bài báo");
  return next;
}
export async function caseReady(c: WorkspaceContext, row: ScreeningAdjudicationCase) {
  if (row.lockedAt || row.deadline <= new Date()) return true;
  const submitted = await c.tx.screeningAdjudicationStatement.groupBy({ by: ["reviewerId"], where: { caseId: row.id, packetVersion: row.packetVersion, reviewerId: { in: row.reviewerIds } } });
  return submitted.length === row.reviewerIds.length;
}
/** Called under the project transaction lock; never selects a winner from a tie. */
export async function ensureAssignment(c: WorkspaceContext, round: ScreeningRound, initial: ScreeningAdjudicationCase, automated = false) {
  if (!initial.active || !round.active || ["ARCHIVED", "COMPLETED"].includes(c.project.status)) return initial;
  let row = initial;
  if (!row.lockedAt) {
    if (!await caseReady(c, row)) {
      if (round.finalizerId) await c.tx.screeningRound.update({ where: { id: round.id }, data: { finalizerId: null, version: { increment: 1 } } });
      if (row.status !== "COLLECTING" && row.status !== "COI_REVIEW") row = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { status: "COLLECTING", version: { increment: 1 } } });
      return row;
    }
    row = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { lockedAt: new Date(), status: row.status === "COI_REVIEW" ? "COI_REVIEW" : "WAITING_ASSIGNMENT", version: { increment: 1 } } });
    await caseAudit(c, row, "ADJUDICATION_CASE_LOCKED", { deadline: row.deadline, packetVersion: row.packetVersion, automated });
  }
  const assignment = await c.tx.screeningAdjudicationInvitation.findFirst({ where: { caseId: row.id, status: { in: ["SENT", "ACCEPTED", "ASSIGNED"] } } });
  if (assignment) {
    if ((await screeningAdjudicators(c, round)).some(p => p.id === assignment.userId && !p.proposer)) {
      // Transition an existing invitation without fabricating an acceptance response.
      if (assignment.status !== "ASSIGNED") {
        await c.tx.screeningAdjudicationInvitation.update({ where: { id: assignment.id }, data: { status: "ASSIGNED" } });
        row = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { status: row.status === "COI_REVIEW" ? "COI_REVIEW" : "ASSIGNED", version: { increment: 1 } } });
        await c.tx.screeningRound.update({ where: { id: round.id }, data: { finalizerId: assignment.userId, version: { increment: 1 } } });
        await caseAudit(c, row, "ADJUDICATION_DIRECT_ASSIGNED", { assignmentId: assignment.id, userId: assignment.userId, migrated: true, automated });
        await caseNotify(c, row, [assignment.userId, ...row.reviewerIds], "ASSIGNED", "Đã phân công người phân xử bài báo");
      }
      return row;
    }
    await c.tx.screeningAdjudicationInvitation.update({ where: { id: assignment.id }, data: { status: "REVOKED", respondedAt: new Date() } });
    await c.tx.screeningAdjudicationConflict.updateMany({ where: { caseId: row.id, invitationId: assignment.id, resolvedAt: null }, data: { resolvedAt: new Date(), resolution: "Quyền ứng viên không còn hiệu lực", upheld: true } });
    row = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { status: "WAITING_ASSIGNMENT", version: { increment: 1 } } });
    await c.tx.screeningRound.update({ where: { id: round.id }, data: { finalizerId: null, version: { increment: 1 } } });
    await caseAudit(c, row, "ADJUDICATION_ACCESS_REVOKED", { userId: assignment.userId, automated });
  }
  if (row.status === "COI_REVIEW") return row;
  const candidates = await rankedCandidates(c, round, row);
  if (candidates.length === 1) return assignCandidate(c, round, row, candidates[0]!, automated);
  if (row.status !== "WAITING_ASSIGNMENT") row = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { status: "WAITING_ASSIGNMENT", version: { increment: 1 } } });
  await notifyCaseCoordinators(c, round, row, "WAITING", "Hồ sơ chờ phân công người phân xử");
  return row;
}
export async function caseView(c: WorkspaceContext, round: ScreeningRound, row: ScreeningAdjudicationCase): Promise<ScreeningDisputeCase> {
  const [invitations, statements, conflicts, eligible] = await Promise.all([
    c.tx.screeningAdjudicationInvitation.findMany({ where: { caseId: row.id }, orderBy: { createdAt: "asc" } }),
    c.tx.screeningAdjudicationStatement.findMany({ where: { caseId: row.id }, orderBy: { revision: "desc" } }),
    c.tx.screeningAdjudicationConflict.findMany({ where: { caseId: row.id }, orderBy: { createdAt: "asc" } }),
    screeningAdjudicators(c, round),
  ]);
  const current = row.lockedAt || !row.active ? invitations.find(i => ["ASSIGNED", "ACCEPTED"].includes(i.status)) : undefined;
  const isEligible = Boolean(current && eligible.some(p => p.id === current.userId && !p.proposer));
  const isReviewer = row.reviewerIds.includes(c.actorId);
  const coordinator = await caseCoordinator(c, round, row);
  const isAssignee = current?.userId === c.actorId && isEligible;
  // Completed assignees retain this case only while their underlying membership remains valid.
  if (!isReviewer && !coordinator && !isAssignee) throw AppError.notFound("Bạn không được cấp quyền xem hồ sơ này");
  const latest = row.reviewerIds.map(id => statements.find(s => s.reviewerId === id && s.packetVersion === row.packetVersion));
  const ready = Boolean(row.lockedAt) || latest.every(Boolean) || row.deadline <= new Date();
  const names = await c.tx.user.findMany({ where: { id: { in: [...row.reviewerIds, ...invitations.map(i => i.userId)] } }, select: { id: true, fullName: true } });
  const name = (id: string) => names.find(p => p.id === id)?.fullName || "Thành viên";
  const invitationViews = invitations.map(i => ({ id: i.id, userId: i.userId, name: name(i.userId), role: i.role, status: i.status, responseReason: i.responseReason ?? null, createdAt: i.createdAt.toISOString(), respondedAt: i.respondedAt?.toISOString() ?? null }));
  const writable = row.active && round.active && !["ARCHIVED", "COMPLETED"].includes(c.project.status);
  const canResolve = writable && ready && isAssignee && current?.status === "ASSIGNED" && row.status !== "COI_REVIEW";
  return { lockedAt: row.lockedAt?.toISOString() ?? null, canStart: canResolve && row.status === "ASSIGNED", canReassign: writable && coordinator && current?.userId !== c.actorId && Boolean(current) && row.status !== "COI_REVIEW", myReviewerId: isReviewer ? c.actorId : null, id: row.id, status: row.status, version: row.version, packetVersion: row.packetVersion, active: row.active, deadline: row.deadline.toISOString(), ready, createdAt: row.createdAt.toISOString(), requestedByIds: row.requestedByIds,
    invitation: invitationViews.find(i => i.id === current?.id) ?? null, invitations: invitationViews,
    statements: row.reviewerIds.map((id, index) => {
      const own = id === c.actorId, visible = own || ready && (!isAssignee || ["ASSIGNED", "ACCEPTED"].includes(current?.status ?? ""));
      const statement = latest[index];
      return { reviewerId: id, name: name(id), completed: Boolean(statement), hidden: !visible, revision: own ? statements.find(s => s.reviewerId === id)?.revision ?? 0 : visible ? statement?.revision ?? 0 : 0,
        ...(visible && statement ? { useExisting: statement.useExisting, text: statement.text, submittedAt: statement.createdAt.toISOString() } : {}),
        ...(visible ? { history: statements.filter(s => s.reviewerId === id).map(s => ({ revision: s.revision, packetVersion: s.packetVersion, useExisting: s.useExisting, text: s.text, createdAt: s.createdAt.toISOString() })) } : {}) };
    }),
    candidates: writable && coordinator && row.lockedAt && !current ? (await rankedCandidates(c, round, row)).map(p => ({ id: p.id, name: p.name, role: p.role })) : [],
    conflicts: conflicts.map(r => ({ id: r.id, reason: r.reason, resolvedAt: r.resolvedAt?.toISOString() ?? null, resolution: r.resolution, upheld: r.upheld })),
    canRespond: false, canStatement: writable && isReviewer && !ready && !row.lockedAt && row.deadline > new Date(), canCoordinate: writable && coordinator && current?.userId !== c.actorId,
    canReport: writable && isReviewer && Boolean(current), canResolve };
}
export async function closeCase(c: WorkspaceContext, roundId: string, status: "COMPLETED" | "NEEDS_MORE_INFO" | "CANCELLED_AS_RESOLVED" | "CANCELLED_REOPENED", finalDecisionId?: string) {
  const row = await latestCase(c, roundId);
  if (!row?.active) return;
  const next = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { active: false, status, finalDecisionId, completedAt: new Date(), version: { increment: 1 } } });
  if (!["COMPLETED", "NEEDS_MORE_INFO"].includes(status)) await c.tx.screeningAdjudicationInvitation.updateMany({ where: { caseId: row.id, status: { in: ["SENT", "ACCEPTED", "ASSIGNED"] } }, data: { status: "REVOKED", respondedAt: new Date() } });
  await caseAudit(c, next, "ADJUDICATION_CASE_CLOSED", { status, finalDecisionId });
  await caseNotify(c, next, row.reviewerIds, status, status === "CANCELLED_AS_RESOLVED" ? "Hai phiếu đã thống nhất, hồ sơ phân xử đã đóng" : status === "COMPLETED" ? "Hồ sơ đã có quyết định phân xử" : status === "NEEDS_MORE_INFO" ? "Người phân xử yêu cầu bổ sung thông tin" : "Vòng được mở lại, hồ sơ cũ được lưu trong lịch sử");
}
export async function refreshCasePacket(c: WorkspaceContext, round: ScreeningRound) {
  const row = await latestCase(c, round.id);
  if (!row?.active) return;
  if (await caseReady(c, row)) throw AppError.conflict("Hồ sơ đã khóa. Cần mở lại có lý do trước khi sửa phiếu");
  const settings = round.settings as { statementWindowHours?: number };
  const next = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { packet: jsonSnapshot(await casePacket(c, round)), packetVersion: { increment: 1 }, version: { increment: 1 }, deadline: new Date(Date.now() + (settings.statementWindowHours ?? 48) * 3600000) } });
  await caseAudit(c, next, "ADJUDICATION_PACKET_REVISED", { packetVersion: next.packetVersion, previousPacket: row.packet, packet: next.packet });
  const invitation = await c.tx.screeningAdjudicationInvitation.findFirst({ where: { caseId: row.id, status: "ACCEPTED" } });
  await caseNotify(c, next, [...row.reviewerIds, ...invitation ? [invitation.userId] : []], "PACKET_REVISED", "Phiếu đã đổi, cần đọc lại hồ sơ và bổ sung quan điểm");
}
