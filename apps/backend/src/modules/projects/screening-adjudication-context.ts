import type { ScreeningAdjudicationPacket } from "@trend/shared-types";
import type { ScreeningRound } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import type { WorkspaceContext } from "./workspace-access.js";
import { effectiveMentorAccess } from "./mentor-access.service.js";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { effectiveAssignments } from "./screening-assignments.js";

const phase = z.enum(["TITLE_ABSTRACT", "FULL_TEXT"]);
const discussionSchema = z.object({ id: z.string().uuid(), comment: z.string().min(3).max(2000), createdAt: z.string().datetime() }).strict();
const packetSchema = z.object({
  discussion: z.array(discussionSchema).max(20).optional(),
  roundId: z.string().uuid(), paperId: z.string().uuid(), phase, roundVersion: z.number().int().positive(),
  paper: z.object({ title: z.string(), abstractText: z.string().nullable(), doi: z.string().nullable(), publicationYear: z.number().int() }).strict(),
  inclusionCriteria: z.array(z.string()), exclusionCriteria: z.array(z.string()), researchQuestions: z.array(z.string()),
  reviews: z.array(z.object({ id: z.string().uuid(), decision: z.enum(["INCLUDE", "EXCLUDE", "UNSURE"]), exclusionReason: z.string(), comment: z.string(), revision: z.number().int().positive(), scope: phase.nullable(), fullTextReference: z.string().nullable() }).strict()).min(2).max(10),
}).strict();

export const adjudicationSection = (id: string) => `screening:${id}`;
export async function screeningDiscussionReady(c: WorkspaceContext, row: ScreeningRound) {
  const assignments = await c.tx.screeningAssignment.findMany({ where: { roundId: row.id, projectId: c.project.id, active: true, submittedAt: { not: null } } });
  if (assignments.length < 2 || !row.unblindedAt) return false;
  const after = new Date(Math.max(...assignments.map(a => a.submittedAt!.getTime())));
  const comments = await c.tx.screeningAudit.findMany({ where: { projectId: c.project.id, roundId: row.id, type: "DISCUSSION", actorId: { in: assignments.map(a => a.reviewerId) }, createdAt: { gte: after } }, select: { actorId: true } });
  const participants = new Set(comments.map(a => a.actorId));
  if (participants.size < 2) return false;
  const reviews = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: assignments.filter(a => participants.has(a.reviewerId)).map(a => ({ assignmentId: a.id, revision: a.revision })) }, select: { decision: true } });
  const positions = new Set(reviews.map(r => r.decision));
  return positions.size > 1 || positions.has("UNSURE");
}
export async function screeningAdjudicatorPool(c: WorkspaceContext) {
  const [members, policies] = await Promise.all([
    c.tx.projectMember.findMany({ where: { projectId: c.project.id, status: "ACTIVE" }, select: { userId: true } }),
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
  const items = comments.flatMap(item => {
    const details = item.details as { comment?: unknown };
    return typeof details.comment === "string" ? [{ id: item.id, comment: details.comment, createdAt: item.createdAt.toISOString() }] : [];
  });
  if (ids && (ids.length !== new Set(ids).size || items.length !== ids.length)) throw AppError.badRequest("Chỉ chia sẻ thảo luận thuộc đúng vòng đang phân xử");
  return items;
}
export async function adjudicationPacket(c: WorkspaceContext, row: ScreeningRound, discussionIds: string[] = []): Promise<ScreeningAdjudicationPacket> {
  if (!row.unblindedAt || !["NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "ADJUDICATING", "INCLUDED", "EXCLUDED", "BACKGROUND"].includes(row.status)) throw AppError.conflict("Chỉ chia sẻ gói sau khi đủ phiếu và có bất đồng");
  const paper = await c.tx.paper.findUniqueOrThrow({ where: { id: row.paperId }, select: { title: true, abstractText: true, doi: true, publicationYear: true } });
  const assignments = await effectiveAssignments(c, row.id);
  const settings = row.settings as { inclusionCriteria: string[]; exclusionCriteria: string[]; researchQuestions: string[]; requiredReviewers: number };
  if (assignments.length < settings.requiredReviewers || assignments.some(a => !a.submittedAt)) throw AppError.conflict("Chờ tất cả reviewer hoàn thành");
  const reviews = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: assignments.map(a => ({ assignmentId: a.id, revision: a.revision })) }, select: { id: true, decision: true, exclusionReason: true, comment: true, revision: true, scope: true, fullTextReference: true }, orderBy: { id: "asc" } });
  return { ...(discussionIds.length ? { discussion: await adjudicationDiscussion(c, row, discussionIds) } : {}), roundId: row.id, paperId: row.paperId, phase: row.phase as ScreeningAdjudicationPacket["phase"], roundVersion: row.version, paper,
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
      const approval = await c.tx.screeningAudit.findFirst({ where: { projectId: c.project.id, roundId: row.id, type: "FINALIZER_ASSIGNED", details: { path: ["shareId"], equals: share.id } } });
      if (!approval) continue;
      let parsed;
      try { parsed = packetSchema.safeParse(JSON.parse(share.content)); } catch { continue; }
      if (!parsed.success) continue;
      const packet = parsed.data;
      if (packet.roundId !== row.id || packet.paperId !== row.paperId || packet.phase !== row.phase) continue;
      const approvedIds = (approval.details as { discussionIds?: string[] }).discussionIds ?? [];
      if (!isDeepStrictEqual([...(packet.discussion ?? [])].map(d => d.id).sort(), [...approvedIds].sort())) continue;
      if (packet.discussion?.length && !isDeepStrictEqual(packet.discussion, await adjudicationDiscussion(c, row, approvedIds))) continue;
      // A changed/reopened vote must never be adjudicated using an older shared packet.
      const assignments = await effectiveAssignments(c, row.id);
      const current = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: assignments.filter(a => a.submittedAt).map(a => ({ assignmentId: a.id, revision: a.revision })) }, select: { id: true, decision: true, exclusionReason: true, comment: true, revision: true, scope: true, fullTextReference: true }, orderBy: { id: "asc" } });
      const settings = row.settings as Record<string, unknown>;
      if (assignments.some(a => !a.submittedAt) || !isDeepStrictEqual(current, packet.reviews) || ["inclusionCriteria", "exclusionCriteria", "researchQuestions"].some(key => !isDeepStrictEqual(settings[key], packet[key as keyof ScreeningAdjudicationPacket]))) throw AppError.conflict("Phiếu đã thay đổi. Chủ dự án cần duyệt và chia sẻ lại gói phân xử");
      return packet;
    }
  }
  throw AppError.notFound("Gói phân xử chưa được chia sẻ hoặc quyền đã hết hiệu lực");
}
