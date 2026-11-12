import type { ScreeningAdjudicationPacket, ScreeningDisputeCase } from "@trend/shared-types";
import type { ScreeningAdjudicationCase, ScreeningRound } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { jsonSnapshot, type WorkspaceContext } from "./workspace-access.js";
import { adjudicationPacket, screeningAdjudicators, adjudicationTeamRequirement } from "./screening-adjudication-context.js";
import { effectiveAssignments } from "./screening-assignments.js";

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
export async function caseCoordinator(c: WorkspaceContext, round: ScreeningRound, row: ScreeningAdjudicationCase) {
  if (!c.role || row.reviewerIds.includes(c.actorId)) return false;
  const policy = round.settings as { adjudicationCoordinatorIds?: string[] };
  const link = await c.tx.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: c.project.id, paperId: round.paperId } } });
  return link.addedById !== c.actorId && (c.role === "OWNER" || Boolean(policy.adjudicationCoordinatorIds?.includes(c.actorId)));
}
export async function caseReady(c: WorkspaceContext, row: ScreeningAdjudicationCase) {
  if (row.lockedAt || row.deadline <= new Date()) return true;
  const submitted = await c.tx.screeningAdjudicationStatement.groupBy({ by: ["reviewerId"], where: { caseId: row.id, packetVersion: row.packetVersion, reviewerId: { in: row.reviewerIds } } });
  return submitted.length === row.reviewerIds.length;
}
/** Close retired active cases without creating assignments or notifications. */
export async function ensureAssignment(c: WorkspaceContext, round: ScreeningRound, initial: ScreeningAdjudicationCase, _automated = false) {
  // The retired workflow is read-only. Keep packets, statements and invitation history.
  if (initial.active) await closeCase(c, round.id, "CANCELLED_AS_RESOLVED");
  return c.tx.screeningAdjudicationCase.findUniqueOrThrow({ where: { id: initial.id } });
}
export async function caseView(c: WorkspaceContext, round: ScreeningRound, row: ScreeningAdjudicationCase): Promise<ScreeningDisputeCase> {
  const [invitations, statements, conflicts, eligible] = await Promise.all([
    c.tx.screeningAdjudicationInvitation.findMany({ where: { caseId: row.id }, orderBy: { createdAt: "asc" } }),
    c.tx.screeningAdjudicationStatement.findMany({ where: { caseId: row.id }, orderBy: { revision: "desc" } }),
    c.tx.screeningAdjudicationConflict.findMany({ where: { caseId: row.id }, orderBy: { createdAt: "asc" } }),
    screeningAdjudicators(c, round),
  ]);
  const current = invitations.find(i => ["ASSIGNED", "ACCEPTED"].includes(i.status));
  const isEligible = Boolean(current && !row.reviewerIds.includes(current.userId) && eligible.some(p => p.id === current.userId && !p.proposer));
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
  const writable = false; // Retired arbitration is historical read-only data.
  const adjudicationBlockedReason = row.active ? await adjudicationTeamRequirement(c) : null;
  const canResolve = writable && !adjudicationBlockedReason && Boolean(row.lockedAt) && ready && isAssignee && current?.status === "ASSIGNED" && row.status !== "COI_REVIEW";
  return { adjudicationBlockedReason, lockedAt: row.lockedAt?.toISOString() ?? null, canStart: canResolve && row.status === "ASSIGNED", canReassign: writable && !adjudicationBlockedReason && coordinator && current?.userId !== c.actorId && Boolean(current) && row.status !== "COI_REVIEW", myReviewerId: isReviewer ? c.actorId : null, id: row.id, status: row.status, version: row.version, packetVersion: row.packetVersion, active: row.active, deadline: row.deadline.toISOString(), ready, createdAt: row.createdAt.toISOString(), requestedByIds: row.requestedByIds,
    invitation: invitationViews.find(i => i.id === current?.id) ?? null, invitations: invitationViews,
    statements: row.reviewerIds.map((id, index) => {
      const statement = latest[index];
      // Each reviewer writes independently. Other participants see supplements only once sealed.
      const own = id === c.actorId, visible = own || ready;
      return { reviewerId: id, name: name(id), completed: Boolean(statement), hidden: !visible, revision: own ? statements.find(s => s.reviewerId === id)?.revision ?? 0 : visible ? statement?.revision ?? 0 : 0,
        ...(visible && statement ? { useExisting: statement.useExisting, text: statement.text, submittedAt: statement.createdAt.toISOString() } : {}),
        ...(visible ? { history: statements.filter(s => s.reviewerId === id).map(s => ({ revision: s.revision, packetVersion: s.packetVersion, useExisting: s.useExisting, text: s.text, createdAt: s.createdAt.toISOString() })) } : {}) };
    }),
    candidates: [],
    conflicts: conflicts.map(r => ({ id: r.id, reason: r.reason, resolvedAt: r.resolvedAt?.toISOString() ?? null, resolution: r.resolution, upheld: r.upheld })),
    canRespond: false, canStatement: writable && !adjudicationBlockedReason && isReviewer && !ready && !row.lockedAt && row.deadline > new Date(), canCoordinate: writable && coordinator && current?.userId !== c.actorId,
    canReport: writable && isReviewer && Boolean(current), canResolve };
}
export async function closeCase(c: WorkspaceContext, roundId: string, status: "COMPLETED" | "NEEDS_MORE_INFO" | "CANCELLED_AS_RESOLVED" | "CANCELLED_REOPENED", finalDecisionId?: string) {
  const row = await latestCase(c, roundId);
  if (!row?.active) return;
  const next = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { active: false, status, finalDecisionId, completedAt: new Date(), version: { increment: 1 } } });
  if (!["COMPLETED", "NEEDS_MORE_INFO"].includes(status)) await c.tx.screeningAdjudicationInvitation.updateMany({ where: { caseId: row.id, status: { in: ["SENT", "ACCEPTED", "ASSIGNED"] } }, data: { status: "REVOKED", respondedAt: new Date() } });
  await caseAudit(c, next, "ADJUDICATION_CASE_CLOSED", { status, finalDecisionId });

}
