import type { ScreeningAdjudicationPacket } from "@trend/shared-types";
import type { ScreeningRound } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import type { WorkspaceContext } from "./workspace-access.js";
import { effectiveMentorAccess } from "./mentor-access.service.js";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { effectiveAssignments, screeningPeople } from "./screening-assignments.js";
import { differingExclusionReasons } from "./screening.calculator.js";

const phase = z.enum(["TITLE_ABSTRACT", "FULL_TEXT"]);
const discussionReviewIds = z.array(z.string().uuid()).min(2).max(10);
const discussionSchema = z.object({ id: z.string().uuid(), comment: z.string().min(3).max(2000), createdAt: z.string().datetime(), actorName: z.string().optional() }).strict();
const packetSchema = z.object({
  protocol: z.object({ version: z.number().int().min(0), workflowVersion: z.number().int().nullable(), stages: z.array(phase), allowConservativeFullText: z.boolean() }).strict().optional(),
  consensusAttempts: z.array(z.object({ id: z.string().uuid(), action: z.string(), actorName: z.string(), createdAt: z.string().datetime(), decision: z.string().optional(), reason: z.string().optional() }).strict()).max(20).optional(),
  discussion: z.array(discussionSchema).max(20).optional(),
  roundId: z.string().uuid(), paperId: z.string().uuid(), phase, roundVersion: z.number().int().positive(),
  paper: z.object({ title: z.string(), abstractText: z.string().nullable(), doi: z.string().nullable(), publicationYear: z.number().int() }).strict(),
  inclusionCriteria: z.array(z.string()), exclusionCriteria: z.array(z.string()), researchQuestions: z.array(z.string()),
  reviews: z.array(z.object({ id: z.string().uuid(), decision: z.enum(["INCLUDE", "EXCLUDE", "UNSURE"]), exclusionReason: z.string(), comment: z.string(), revision: z.number().int().positive(), scope: phase.nullable(), fullTextReference: z.string().nullable() }).strict()).min(2).max(10),
}).strict();

export const adjudicationSection = (id: string) => `screening:${id}`;
export async function adjudicationThread(c: WorkspaceContext, row: ScreeningRound) {
  if (!row.finalizerId) return [];
  const assignment = await c.tx.screeningAudit.findFirst({ where: { projectId: c.project.id, roundId: row.id, type: "FINALIZER_ASSIGNED", details: { path: ["finalizerId"], equals: row.finalizerId } }, orderBy: { createdAt: "desc" } });
  if (!assignment) return [];
  const messages = await c.tx.screeningAudit.findMany({ where: { projectId: c.project.id, roundId: row.id, type: "DISCUSSION", details: { path: ["adjudicationAssignmentId"], equals: assignment.id } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 });
  const people = await c.tx.user.findMany({ where: { id: { in: messages.map(m => m.actorId) } }, select: { id: true, fullName: true } });
  return messages.map(m => ({ id: m.id, comment: String((m.details as { comment: string }).comment), actorName: people.find(p => p.id === m.actorId)?.fullName || "Thành viên", createdAt: m.createdAt.toISOString() }));
}
/** Departure is grounds for independent adjudication, never substitute consent. */
export async function screeningEscalationReady(c: WorkspaceContext, row: ScreeningRound) {
  if (await screeningDiscussionReady(c, row)) return true;
  const assignments = await effectiveAssignments(c, row.id);
  const live = new Set((await screeningPeople(c)).map(p => p.id));
  if (!row.unblindedAt || assignments.length !== 2 || assignments.some(a => !a.submittedAt) || assignments.every(a => live.has(a.reviewerId))) return false;
  if (c.role === "OWNER") return true;
  return assignments.some(a => a.reviewerId === c.actorId && live.has(a.reviewerId)) && Boolean(await c.tx.screeningAudit.findFirst({ where: { projectId: c.project.id, roundId: row.id, type: "DISCUSSION", actorId: c.actorId } }));
}
export async function screeningDiscussionReady(c: WorkspaceContext, row: ScreeningRound) {
  const assignments = await c.tx.screeningAssignment.findMany({ where: { roundId: row.id, projectId: c.project.id, active: true, submittedAt: { not: null } } });
  if (assignments.length < 2 || !row.unblindedAt) return false;
  const after = new Date(Math.max(...assignments.map(a => a.submittedAt!.getTime())));
  const reviews = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: assignments.map(a => ({ assignmentId: a.id, revision: a.revision })) }, select: { id: true, decision: true, exclusionReason: true } });
  const reviewIds = reviews.map(r => r.id).sort();
  const comments = await c.tx.screeningAudit.findMany({ where: { projectId: c.project.id, roundId: row.id, type: "DISCUSSION", actorId: { in: assignments.map(a => a.reviewerId) } }, select: { actorId: true, details: true, createdAt: true } });
  const participants = new Set(comments.filter(comment => {
    const details = comment.details as { reviewIds?: unknown } | null;
    // Snapshot IDs follow the project lock order; PostgreSQL now() timestamps
    // can precede the last submission when a transaction waited for that lock.
    if (details?.reviewIds !== undefined) {
      const parsed = discussionReviewIds.safeParse(details.reviewIds);
      return parsed.success && isDeepStrictEqual([...parsed.data].sort(), reviewIds);
    }
    return comment.createdAt >= after; // Historical discussion without a ballot snapshot.
  }).map(a => a.actorId));
  if (participants.size < 2) return false;
  const positions = new Set(reviews.map(r => r.decision));
  return positions.size > 1 || positions.has("UNSURE") ||
    (row.phase === "FULL_TEXT" && ((row.settings as { workflowVersion?: number }).workflowVersion ?? 0) >= 6 && differingExclusionReasons(reviews));
}
export async function screeningAdjudicatorPool(c: WorkspaceContext) {
  const [members, policies] = await Promise.all([
    c.tx.projectMember.findMany({ where: { projectId: c.project.id, status: "ACTIVE", role: { notIn: ["MENTOR", "ADVISOR"] } }, select: { userId: true } }),
    c.tx.mentorAccess.findMany({ where: { projectId: c.project.id, revokedAt: null, permissions: { hasEvery: ["PAPERS_VIEW", "PAPERS_COMMENT"] } } }),
  ]);
  const mentors = new Set<string>();
  for (const policy of policies) if (await effectiveMentorAccess(c.tx, policy)) mentors.add(policy.mentorUserId);
  const team = new Set([c.project.ownerId, ...members.map(m => m.userId)]);
  const users = await c.tx.user.findMany({ where: { id: { in: [...team, ...mentors] }, isActive: true, accountStatus: "ACTIVE", emailVerifiedAt: { not: null } }, select: { id: true, fullName: true } });
  return users.map(u => ({ id: u.id, name: u.fullName || "Thành viên", mentor: !team.has(u.id) }));
}
export async function screeningAdjudicators(c: WorkspaceContext, row: ScreeningRound) {
  const [pool, assignments, link] = await Promise.all([
    screeningAdjudicatorPool(c),
    c.tx.screeningAssignment.findMany({ where: { roundId: row.id, active: true }, select: { reviewerId: true } }),
    c.tx.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: c.project.id, paperId: row.paperId } }, select: { addedById: true } }),
  ]);
  const reviewers = new Set(assignments.map(a => a.reviewerId));
  const authorized = (row.settings as { authorizedAdjudicatorIds?: string[] }).authorizedAdjudicatorIds;
  return pool.filter(u => !reviewers.has(u.id) && (!authorized?.length || authorized.includes(u.id))).map(u => ({ ...u, proposer: u.id === link.addedById }));
}

export async function adjudicationDiscussion(c: WorkspaceContext, row: ScreeningRound, ids?: string[]) {
  const comments = await c.tx.screeningAudit.findMany({ where: { projectId: c.project.id, roundId: row.id, type: "DISCUSSION", ...(ids ? { id: { in: ids } } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: ids ? 20 : 50 });
  const names = await c.tx.user.findMany({ where: { id: { in: comments.map(a => a.actorId) } }, select: { id: true, fullName: true } });
  const items = comments.flatMap(item => {
    const details = item.details as { comment?: unknown };
    return typeof details.comment === "string" ? [{ id: item.id, comment: details.comment, createdAt: item.createdAt.toISOString(), actorName: names.find(p => p.id === item.actorId)?.fullName || "Thành viên" }] : [];
  });
  if (ids && (ids.length !== new Set(ids).size || items.length !== ids.length)) throw AppError.badRequest("Chỉ chia sẻ thảo luận thuộc đúng vòng đang phân xử");
  return items;
}
function packetProtocol(row: ScreeningRound): NonNullable<ScreeningAdjudicationPacket["protocol"]> {
  const settings = row.settings as { version: number; workflowVersion?: number; stages?: Array<"TITLE_ABSTRACT" | "FULL_TEXT">; allowConservativeFullText?: boolean };
  return { version: settings.version, workflowVersion: settings.workflowVersion ?? null, stages: settings.stages ?? [], allowConservativeFullText: Boolean(settings.allowConservativeFullText) };
}
async function consensusAttempts(c: WorkspaceContext, row: ScreeningRound) {
  const events = await c.tx.screeningAudit.findMany({ where: { projectId: c.project.id, roundId: row.id, type: { in: ["AGREEMENT_PROPOSED", "AGREEMENT_DECLINED", "AGREEMENT_CONFIRMED"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 });
  const names = await c.tx.user.findMany({ where: { id: { in: events.map(e => e.actorId) } }, select: { id: true, fullName: true } });
  return events.reverse().map(event => {
    const details = event.details as { decision?: string; reason?: string };
    return { id: event.id, action: event.type, actorName: names.find(p => p.id === event.actorId)?.fullName || "Thành viên", createdAt: event.createdAt.toISOString(), ...(details.decision ? { decision: details.decision } : {}), ...(details.reason ? { reason: details.reason } : {}) };
  });
}
export async function adjudicationPacket(c: WorkspaceContext, row: ScreeningRound, discussionIds: string[] = []): Promise<ScreeningAdjudicationPacket> {
  if (!row.unblindedAt || !["NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "ADJUDICATING", "INCLUDED", "EXCLUDED", "BACKGROUND"].includes(row.status)) throw AppError.conflict("Chỉ chia sẻ gói sau khi đủ phiếu và có bất đồng");
  const paper = await c.tx.paper.findUniqueOrThrow({ where: { id: row.paperId }, select: { title: true, abstractText: true, doi: true, publicationYear: true } });
  const assignments = await effectiveAssignments(c, row.id);
  const settings = row.settings as { inclusionCriteria: string[]; exclusionCriteria: string[]; researchQuestions: string[]; requiredReviewers: number };
  if (assignments.length < settings.requiredReviewers || assignments.some(a => !a.submittedAt)) throw AppError.conflict("Chờ tất cả reviewer hoàn thành");
  const reviews = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: assignments.map(a => ({ assignmentId: a.id, revision: a.revision })) }, select: { id: true, decision: true, exclusionReason: true, comment: true, revision: true, scope: true, fullTextReference: true }, orderBy: { id: "asc" } });
  return { protocol: packetProtocol(row), consensusAttempts: await consensusAttempts(c, row), ...(discussionIds.length ? { discussion: await adjudicationDiscussion(c, row, discussionIds) } : {}), roundId: row.id, paperId: row.paperId, phase: row.phase as ScreeningAdjudicationPacket["phase"], roundVersion: row.version, paper,
    inclusionCriteria: settings.inclusionCriteria, exclusionCriteria: settings.exclusionCriteria, researchQuestions: settings.researchQuestions,
    reviews: reviews as ScreeningAdjudicationPacket["reviews"] };
}
export async function sharedAdjudicationPacket(c: WorkspaceContext, row: ScreeningRound): Promise<ScreeningAdjudicationPacket> {
  if (row.finalizerId !== c.actorId) throw AppError.notFound("Bạn không được giao phân xử vòng này");
  const policies = await c.tx.mentorAccess.findMany({ where: { projectId: c.project.id, mentorUserId: c.actorId, revokedAt: null, permissions: { hasEvery: ["PAPERS_VIEW", "PAPERS_COMMENT"] } } });
  for (const policy of policies) {
    if (!await effectiveMentorAccess(c.tx, policy)) continue;
    const share = await c.tx.mentorResourceShare.findFirst({ where: { projectId: c.project.id, accessId: policy.id, kind: "PAPER", resourceId: row.paperId, sectionKey: adjudicationSection(row.id), revokedAt: null }, orderBy: { createdAt: "desc" } });
    if (share) {
      // Generic resource shares cannot impersonate an owner-approved adjudication packet.
      const approval = await c.tx.screeningAudit.findFirst({ where: { projectId: c.project.id, roundId: row.id, type: { in: ["FINALIZER_ASSIGNED", "ADJUDICATION_REQUESTED"] }, details: { path: ["shareId"], equals: share.id } } });
      if (!approval) continue;
      let parsed;
      try { parsed = packetSchema.safeParse(JSON.parse(share.content)); } catch { continue; }
      if (!parsed.success) continue;
      const packet = parsed.data;
      if (packet.roundId !== row.id || packet.paperId !== row.paperId || packet.phase !== row.phase) continue;
      if (packet.protocol && !isDeepStrictEqual(packet.protocol, packetProtocol(row))) continue;
      if (packet.consensusAttempts && !isDeepStrictEqual(packet.consensusAttempts.map(({ actorName: _name, ...item }) => item), (await consensusAttempts(c, row)).map(({ actorName: _name, ...item }) => item))) continue;
      const approvedIds = (approval.details as { discussionIds?: string[] }).discussionIds ?? [];
      if (!isDeepStrictEqual([...(packet.discussion ?? [])].map(d => d.id).sort(), [...approvedIds].sort())) continue;
      if (packet.discussion?.length) {
        const currentDiscussion = await adjudicationDiscussion(c, row, approvedIds);
        if (!isDeepStrictEqual(packet.discussion.map(({ actorName: _name, ...d }) => d), currentDiscussion.map(({ actorName: _name, ...d }) => d))) continue;
      }
      // A changed/reopened vote must never be adjudicated using an older shared packet.
      const assignments = await effectiveAssignments(c, row.id);
      const current = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: assignments.filter(a => a.submittedAt).map(a => ({ assignmentId: a.id, revision: a.revision })) }, select: { id: true, decision: true, exclusionReason: true, comment: true, revision: true, scope: true, fullTextReference: true }, orderBy: { id: "asc" } });
      const settings = row.settings as Record<string, unknown>;
      if (assignments.some(a => !a.submittedAt) || !isDeepStrictEqual(current, packet.reviews) || ["inclusionCriteria", "exclusionCriteria", "researchQuestions"].some(key => !isDeepStrictEqual(settings[key], packet[key as "inclusionCriteria" | "exclusionCriteria" | "researchQuestions"]))) throw AppError.conflict("Phiếu đã thay đổi. Chủ dự án cần duyệt và chia sẻ lại gói phân xử");
      return packet;
    }
  }
  throw AppError.notFound("Gói phân xử chưa được chia sẻ hoặc quyền đã hết hiệu lực");
}
