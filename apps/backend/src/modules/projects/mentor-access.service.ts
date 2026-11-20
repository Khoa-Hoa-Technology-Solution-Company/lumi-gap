import { mentorDefaultPermissions, type MentorAssignedTask, type MentorAccessPage, type MentorAccessPolicy, type MentorPermission, type MentorPolicyInput, type MentorResourceKind, type MentorShareInput, type MentorAccessWorkspace } from "@trend/shared-types";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { workspaceId } from "./workspace-access.js";
import { notificationService } from "../notifications/notification.service.js";
import { dispatchMentorshipNotifications } from "./mentorship-notifications.js";
import type { z } from "zod";
import type { MentorshipRequest } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, jsonSnapshot, expectWorkspaceVersion, type WorkspaceContext, type WorkspaceDb } from "./workspace-access.js";
import type * as schemas from "./dto/mentor-access.schema.js";
import { isVerifiedLecturer } from "./academic-relationship-access.js";
import { researchLedgerService } from "../audit/research-ledger.service.js";
import { closeAcceptedApplication, syncApplicationRequest } from "./mentorship-application-context.js";

export const mentorViewPermission: Record<MentorResourceKind, MentorPermission> = { OVERVIEW: "OVERVIEW_VIEW", PAPER: "PAPERS_VIEW", GAP: "GAPS_VIEW", TASK: "TASKS_VIEW", MILESTONE: "TASKS_VIEW", MANUSCRIPT: "MANUSCRIPTS_VIEW", SUBMISSION: "SUBMISSIONS_VIEW", CONTRIBUTION: "CONTRIBUTIONS_VIEW" };
type Access = NonNullable<Awaited<ReturnType<WorkspaceDb["mentorAccess"]["findUnique"]>>>;
type Page = z.infer<typeof schemas.mentorAccessPageSchema>;
const paging = (page: number) => ({ skip: (page - 1) * 20, take: 20 });
const pageResult = <T>(items: T[], total: number, page: number) => ({ items, total, page, pageSize: 20, hasNext: page * 20 < total });
const writable = (c: WorkspaceContext) => { if (["ARCHIVED", "COMPLETED"].includes(c.project.status)) throw AppError.conflict("Dự án hiện chỉ được xem"); };
const manager = (c: WorkspaceContext) => { if (c.role !== "OWNER") throw AppError.forbidden("Chỉ chủ dự án được quản lý quyền cố vấn"); };
export async function mentorAccessEvent(tx: WorkspaceDb, access: Access, actorId: string, type: string, details: unknown = {}) {
  await tx.mentorAccessEvent.create({ data: { projectId: access.projectId, accessId: access.id, actorId, type, details: jsonSnapshot(details) } });
}
export async function effectiveMentorAccess(tx: WorkspaceDb, row: Access) {
  if (row.revokedAt || row.expiresAt && row.expiresAt <= new Date() || !row.relationshipId) return false;
  const [relationship, user, profile, invitation] = await Promise.all([
    tx.mentorRelationship.count({ where: { id: row.relationshipId, projectId: row.projectId, mentorUserId: row.mentorUserId, status: "ACTIVE" } }),
    tx.user.findUnique({ where: { id: row.mentorUserId }, select: { isActive: true, accountStatus: true, emailVerifiedAt: true } }),
    tx.academicProfile.findUnique({ where: { userId: row.mentorUserId }, select: { academicRole: true, roleVerificationStatus: true, positionStatus: true } }),
    tx.mentorshipRequest.count({ where: { id: row.requestId, projectId: row.projectId, mentorUserId: row.mentorUserId, status: "ACCEPTED" } }),
  ]);
  return Boolean(relationship && invitation) && isVerifiedLecturer(user, profile);
}
export async function mentorPolicyDto(tx: WorkspaceDb, row: Access, knownEffective?: boolean): Promise<MentorAccessPolicy> {
  return { id: row.id, requestId: row.requestId, relationshipId: row.relationshipId, version: row.version, preset: row.preset as MentorAccessPolicy["preset"], permissions: row.permissions as MentorPermission[], expiresAt: row.expiresAt?.toISOString() ?? null, revokedAt: row.revokedAt?.toISOString() ?? null, effective: knownEffective ?? await effectiveMentorAccess(tx, row) };
}
const policyDto = mentorPolicyDto;
export function validateMentorPermissions(permissions: readonly MentorPermission[]) {
  const set = new Set(permissions);
  for (const [prefix, view] of [["PAPERS_", "PAPERS_VIEW"], ["GAPS_", "GAPS_VIEW"], ["TASKS_", "TASKS_VIEW"], ["MANUSCRIPTS_", "MANUSCRIPTS_VIEW"]] as const) {
    if (permissions.some(p => p.startsWith(prefix)) && !set.has(view)) throw AppError.badRequest("Quyền nhận xét hoặc đề xuất cần có quyền xem cùng mục");
  }
}
function validateExpiry(value: string | null) { if (value && new Date(value) <= new Date()) throw AppError.badRequest("Hạn truy cập phải nằm trong tương lai"); }
async function scopedAccess(c: WorkspaceContext, id: string, write = false) {
  const row = await c.tx.mentorAccess.findFirst({ where: { id, projectId: c.project.id } });
  if (!row || !c.role && (row.mentorUserId !== c.actorId || !await effectiveMentorAccess(c.tx, row))) throw AppError.notFound("Không có quyền truy cập cố vấn này");
  if (write) writable(c);
  return row;
}
async function configurable(c: WorkspaceContext, row: Access) {
  if (row.revokedAt) throw AppError.conflict("Quyền đã bị thu hồi. Cần lời mời mới để cấp lại");
  const request = await c.tx.mentorshipRequest.findUniqueOrThrow({ where: { id: row.requestId } });
  if (!["PENDING", "ACCEPTED"].includes(request.status) || request.status === "PENDING" && request.expiresAt && request.expiresAt <= new Date()) throw AppError.conflict("Lời mời đã đóng hoặc hết hạn. Cần lời mời mới");
}
const requirePermission = (c: WorkspaceContext, row: Access, permission: MentorPermission) => { if (!c.role && !row.permissions.includes(permission)) throw AppError.forbidden("Chưa được cấp quyền cho thao tác này"); };
const shareDto = (row: Awaited<ReturnType<WorkspaceDb["mentorResourceShare"]["findMany"]>>[number]) => ({ id: row.id, kind: row.kind as MentorResourceKind, resourceId: row.resourceId, sectionKey: row.sectionKey, title: row.title, content: row.content, createdAt: row.createdAt.toISOString(), revokedAt: row.revokedAt?.toISOString() ?? null, hasPdf: Boolean(row.sourceFileId), accessMode: row.accessMode as "VIEW" | "COMMENT" | null });

export function canReadMentorShare(row: Pick<Access, "permissions">, share: { kind: string; accessMode?: string | null }) {
  return share.kind === "PAPER" && ["VIEW", "COMMENT"].includes(share.accessMode ?? "") || row.permissions.includes(mentorViewPermission[share.kind as MentorResourceKind]);
}
export function canCommentMentorShare(row: Pick<Access, "permissions">, share: { kind: string; accessMode?: string | null }) {
  return share.kind === "PAPER" && (share.accessMode ? share.accessMode === "COMMENT" : row.permissions.includes("PAPERS_COMMENT"));
}

async function assertResource(tx: WorkspaceDb, projectId: string, input: MentorShareInput) {
  const { kind, resourceId } = input;
  let found: unknown;
  if (kind === "OVERVIEW") found = resourceId === projectId;
  if (kind === "PAPER") found = await tx.projectPaper.findUnique({ where: { projectId_paperId: { projectId, paperId: resourceId } }, select: { id: true } });
  if (kind === "GAP") found = await tx.researchGap.findFirst({ where: { id: resourceId, projectId }, select: { id: true } });
  if (kind === "TASK") found = await tx.projectTask.findFirst({ where: { id: resourceId, projectId, deletedAt: null }, select: { id: true } });
  if (kind === "MILESTONE") found = await tx.projectMilestone.findFirst({ where: { id: resourceId, projectId }, select: { id: true } });
  if (kind === "MANUSCRIPT") found = await tx.draftWorkspace.findFirst({ where: { id: resourceId, projectId, deletedAt: null }, select: { id: true } });
  if (kind === "SUBMISSION") found = await tx.submission.findFirst({ where: { id: resourceId, projectId }, select: { id: true } });
  if (kind === "CONTRIBUTION") found = await tx.researchContribution.findFirst({ where: { id: resourceId, projectId }, select: { id: true } }) ?? await tx.projectContributionProposal.findFirst({ where: { id: resourceId, projectId }, select: { id: true } });
  if (!found) throw AppError.badRequest("Tài nguyên không thuộc dự án hoặc không còn khả dụng");
  if (kind === "MANUSCRIPT" && /(?:\\(?:documentclass|usepackage|input|include|includegraphics|write|openout)\b|\\begin\s*\{document\})/i.test(input.content)) throw AppError.badRequest("Chỉ chia sẻ nội dung hiển thị đã duyệt, không chia sẻ mã nguồn LaTeX");
}
export async function publishMentorShare(tx: WorkspaceDb, row: Access, actorId: string, input: MentorShareInput) {
  await assertResource(tx, row.projectId, input);
  const current = await tx.mentorResourceShare.findFirst({ where: { accessId: row.id, kind: input.kind, resourceId: input.resourceId, sectionKey: input.sectionKey, revokedAt: null } });
  if (!current && await tx.mentorResourceShare.count({ where: { accessId: row.id, revokedAt: null } }) >= 100) throw AppError.conflict("Tối đa 100 nội dung đang chia sẻ cho mỗi cố vấn. Ngừng chia sẻ mục cũ trước khi thêm");
  await tx.mentorResourceShare.updateMany({ where: { accessId: row.id, kind: input.kind, resourceId: input.resourceId, sectionKey: input.sectionKey, revokedAt: null }, data: { revokedAt: new Date() } });
  const share = await tx.mentorResourceShare.create({ data: { projectId: row.projectId, accessId: row.id, sharedById: actorId, ...input } });
  await mentorAccessEvent(tx, row, actorId, "RESOURCE_SHARED", { shareId: share.id, kind: input.kind, resourceId: input.resourceId, sectionKey: input.sectionKey });
  return shareDto(share);
}
export async function initializeMentorAccess(tx: WorkspaceDb, request: MentorshipRequest, ownerId: string, input?: MentorPolicyInput) {
  const settings = input ?? { preset: "ADVISOR", permissions: [...mentorDefaultPermissions], expiresAt: null };
  validateMentorPermissions(settings.permissions); validateExpiry(settings.expiresAt);
  const row = await tx.mentorAccess.create({ data: { projectId: request.projectId, requestId: request.id, mentorUserId: request.mentorUserId, configuredById: ownerId, preset: settings.preset, permissions: settings.permissions, expiresAt: settings.expiresAt ? new Date(settings.expiresAt) : null } });
  await mentorAccessEvent(tx, row, request.requestedBy, "ACCESS_PROPOSED", { preset: row.preset, permissions: row.permissions, expiresAt: row.expiresAt, initialInput: input ?? null });
  for (const share of settings.shares ?? []) await publishMentorShare(tx, row, ownerId, share);
  return row;
}

const scoped = <T>(project: string, actor: string, write: boolean, run: (c: WorkspaceContext) => Promise<T>) => withWorkspace(project, actor, { write, mentor: true, mentorScope: "SHARED_RESOURCES" }, run);
export const mentorAccessService = {
  async sharePaper(project: string, actor: string, id: string, input: z.infer<typeof schemas.mentorPaperShareSchema>) {
    const result = await scoped(project, actor, true, async c => {
      if (!c.role) throw AppError.forbidden("Chỉ thành viên nhóm được chia sẻ tài liệu");
      writable(c); const row = await scopedAccess(c, id);
      if (!await effectiveMentorAccess(c.tx, row)) throw AppError.conflict("Chọn cố vấn đã chấp nhận và đang hướng dẫn");
      await assertResource(c.tx, c.project.id, { kind: "PAPER", resourceId: input.resourceId, sectionKey: "", title: "Paper", content: "Paper" });
      const current = await c.tx.mentorResourceShare.findFirst({ where: { accessId: id, projectId: c.project.id, kind: "PAPER", resourceId: input.resourceId, sectionKey: "", revokedAt: null } });
      if (current?.accessMode === input.accessMode) return shareDto(current);
      expectWorkspaceVersion(row.version, input.expectedVersion);
      const paper = await c.tx.paper.findUniqueOrThrow({ where: { id: input.resourceId }, select: { title: true, abstractText: true, doi: true } });
      if (!current && await c.tx.mentorResourceShare.count({ where: { accessId: id, revokedAt: null } }) >= 100) throw AppError.conflict("Tối đa 100 tài liệu đang chia sẻ cho mỗi cố vấn");
      const data = { title: paper.title.slice(0,240), content: [paper.abstractText, paper.doi].filter(Boolean).join("\n\n").slice(0,50000) || paper.title.slice(0,50000), accessMode: input.accessMode };
      const sourceFile = current ? null : await c.tx.projectPaperFile.findFirst({ where: { projectId: c.project.id, paperId: input.resourceId }, orderBy: [{createdAt:"desc"},{id:"desc"}], select:{id:true} });
      const share = current ? await c.tx.mentorResourceShare.update({ where: { id: current.id }, data: { accessMode: input.accessMode } }) : await c.tx.mentorResourceShare.create({ data: { projectId: c.project.id, accessId: id, kind: "PAPER", resourceId: input.resourceId, sectionKey: "", sharedById: c.actorId, sourceFileId: sourceFile?.id ?? null, ...data } });
      await c.tx.mentorAccess.update({ where: { id }, data: { version: { increment: 1 } } });
      await mentorAccessEvent(c.tx, row, c.actorId, current ? "PERMISSION_CHANGED" : "RESOURCE_SHARED", { shareId: share.id, kind: "PAPER", resourceId: input.resourceId, previous: current?.accessMode ?? null, next: input.accessMode });
      await notificationService.create({ userId: row.mentorUserId, type: "MENTOR_RESOURCE_SHARED", title: "Tài liệu được chia sẻ", message: "Nhóm đã chia sẻ một bài báo. Mở Tài liệu đã chia sẻ để xem.", targetKind: "project", targetId: c.project.id, eventKey: "MENTORSHIP_RESOURCE:" + share.id + ":" + (row.version + 1), emailStatus: "SKIPPED" }, c.tx);
      return shareDto(share);
    });
    await dispatchMentorshipNotifications(); return result;
  },
  async inbox(actor: string, page = 1) {
    const db = getPrisma(), person = await db.user.findUnique({ where: workspaceId(actor), select: { id: true, isActive: true, accountStatus: true, emailVerifiedAt: true } });
    const profile = person ? await db.academicProfile.findUnique({ where: { userId: person.id }, select: { academicRole: true, roleVerificationStatus: true, positionStatus: true } }) : null;
    if (!person || !isVerifiedLecturer(person, profile)) throw AppError.forbidden("Cần tài khoản giảng viên đã xác minh");
    const relations = await db.mentorRelationship.findMany({ where: { mentorUserId: person.id, status: "ACTIVE" }, select: { id: true, projectId: true } });
    const projects = await db.project.findMany({ where: { id: { in: relations.map(r => r.projectId) }, deletedAt: null }, select: { id: true, title: true } });
    const accepted = await db.mentorshipRequest.findMany({ where: { projectId: { in: projects.map(p => p.id) }, mentorUserId: person.id, status: "ACCEPTED" }, select: { id: true } });
    const policies = await db.mentorAccess.findMany({ where: { requestId: { in: accepted.map(r => r.id) }, mentorUserId: person.id, projectId: { in: projects.map(p => p.id) }, relationshipId: { in: relations.map(r => r.id) }, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    const where = { revokedAt: null, OR: policies.map(policy => ({ accessId: policy.id, OR: [{ kind: { in: (Object.keys(mentorViewPermission) as MentorResourceKind[]).filter(kind => policy.permissions.includes(mentorViewPermission[kind])) } }, { kind: "PAPER", accessMode: { in: ["VIEW", "COMMENT"] } }] })) };
    const [rows,total] = await Promise.all([db.mentorResourceShare.findMany({ where, ...paging(page), orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, projectId: true, accessId: true, kind: true, resourceId: true, sectionKey: true, title: true, accessMode: true, createdAt: true, revokedAt: true } }), db.mentorResourceShare.count({where})]);
    const items = rows.map(share => ({ id: share.id, projectId: share.projectId, projectTitle: projects.find(p => p.id === share.projectId)!.title, accessId: share.accessId, resource: { id: share.id, kind: share.kind as MentorResourceKind, resourceId: share.resourceId, sectionKey: share.sectionKey, title: share.title, accessMode: share.accessMode as "VIEW" | "COMMENT" | null, createdAt: share.createdAt.toISOString(), revokedAt: share.revokedAt?.toISOString() ?? null, canComment: canCommentMentorShare(policies.find(p => p.id === share.accessId)!, share) } }));
    return pageResult(items, total, page);
  },
  async tasks(project: string, actor: string, page = 1): Promise<MentorAccessPage<MentorAssignedTask>> {
    return scoped(project, actor, false, async c => {
      const policies = await c.tx.mentorAccess.findMany({ where: { projectId: c.project.id, mentorUserId: c.actorId, revokedAt: null } });
      const permissions = new Set<string>();
      let hasEffectivePolicy = false;
      for (const policy of policies) if (await effectiveMentorAccess(c.tx, policy)) {
        hasEffectivePolicy = true;
        for (const permission of policy.permissions) permissions.add(permission);
      }
      // A live mentorship and direct assignment permit reading one's own task.
      // TASKS_VIEW still controls shared project resources, not this personal list.
      if (!hasEffectivePolicy) throw AppError.notFound("Không có quyền truy cập công việc cố vấn");
      const where = { projectId: c.project.id, assigneeId: c.actorId, deletedAt: null };
      const [rows, total] = await Promise.all([
        c.tx.projectTask.findMany({ where, ...paging(page), orderBy: [{ updatedAt: "desc" }, { id: "desc" }], select: { id: true, title: true, description: true, status: true, dueAt: true, blockedReason: true, targetKind: true, targetId: true } }),
        c.tx.projectTask.count({ where }),
      ]);
      return pageResult(rows.map(row => ({ id: row.id, title: row.title, description: row.description, status: row.status as MentorAssignedTask["status"], dueAt: row.dueAt?.toISOString() ?? null, blockedReason: row.blockedReason,
        submissionId: permissions.has("SUBMISSIONS_VIEW") && row.targetKind?.toLowerCase() === "submission" ? row.targetId : null })), total, page);
    });
  },
  async workspace(project: string, actor: string, page = 1, activeOnly = false): Promise<MentorAccessWorkspace> {
    return scoped(project, actor, false, async c => {
      const activeRelations = activeOnly ? await c.tx.mentorRelationship.findMany({where:{projectId:c.project.id,status:"ACTIVE"},select:{id:true}}) : null;
      const where = { projectId: c.project.id, ...(activeRelations ? {relationshipId:{in:activeRelations.map(r=>r.id)},revokedAt:null} : {}), ...(c.role ? {} : { mentorUserId: c.actorId, relationshipId: { not: null }, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }) };
      const [rows, total] = await Promise.all([c.tx.mentorAccess.findMany({ where, ...paging(page), orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), c.tx.mentorAccess.count({ where })]);
      const policies: MentorAccessWorkspace["policies"] = [];
      const assignmentGrants = await c.tx.reviewerAssignment.findMany({ where: { mentorAccessId: { in: rows.map(r => r.id) }, status: { in: ["assigned", "accepted", "completed"] } } });
      const requests = await c.tx.reviewRequest.findMany({ where: { id: { in: assignmentGrants.flatMap(a => a.reviewRequestId ? [a.reviewRequestId] : []) }, projectId: c.project.id, origin: "MENTOR_GUIDANCE", status: { in: ["REQUESTED", "ACCEPTED", "IN_REVIEW", "RESUBMITTED", "REVISION_REQUESTED", "COMPLETED"] } }, orderBy: { createdAt: "desc" } });
      const submissionIds = requests.map(r => r.submissionId);
      const [submitted, revisions] = await Promise.all([c.tx.submission.findMany({ where: { id: { in: submissionIds }, projectId: c.project.id }, select: { id: true, title: true } }), c.tx.submissionRevision.findMany({ where: { id: { in: requests.map(r => r.artifactRevisionId) }, submissionId: { in: submissionIds } }, select: { id: true, revisionNumber: true } })]);
      for (const row of rows) {
        const effective = await effectiveMentorAccess(c.tx, row);
        if (!c.role && !effective) continue;
        const [person, request, shares] = await Promise.all([c.tx.user.findUniqueOrThrow({ where: { id: row.mentorUserId }, select: { fullName: true, institution: true, avatarUrl: true } }), c.tx.mentorshipRequest.findUniqueOrThrow({ where: { id: row.requestId }, select: { status: true } }), c.tx.mentorResourceShare.findMany({ where: { accessId: row.id, revokedAt: null, ...(!c.role ? { OR: [{ kind: { in: (Object.keys(mentorViewPermission) as MentorResourceKind[]).filter(k => row.permissions.includes(mentorViewPermission[k])) } }, { kind: "PAPER", accessMode: { in: ["VIEW", "COMMENT"] } }] } : {}) }, orderBy: { createdAt: "desc" }, select: { id: true, sharedById: true, kind: true, resourceId: true, sectionKey: true, title: true, accessMode: true, createdAt: true, revokedAt: true } })]);
        const invitationState = request.status === "DECLINED" ? "REJECTED" : ["CANCELLED", "CANCELED_BY_PROJECT", "CLOSED_CAPACITY_REACHED"].includes(request.status) ? "CANCELLED" : request.status as "PENDING" | "ACCEPTED" | "EXPIRED";
        const reviewResources = effective ? requests.flatMap(r => {
          const grant = assignmentGrants.find(a => a.mentorAccessId === row.id && a.reviewerId === row.mentorUserId && a.reviewRequestId === r.id && a.artifactRevisionId === r.artifactRevisionId);
          const s = submitted.find(s => s.id === r.submissionId), v = revisions.find(v => v.id === r.artifactRevisionId);
          return grant && s && v && !(r.status === "REQUESTED" && r.expiresAt && r.expiresAt <= new Date()) ? [{ id: r.id, submissionId: s.id, title: s.title, revisionId: v.id, revisionNumber: v.revisionNumber, status: r.status, createdAt: r.createdAt.toISOString() }] : [];
        }) : [];
        const role = row.relationshipId ? await c.tx.mentorRelationship.findUnique({ where: { id: row.relationshipId }, select: { mentorRole: true, startedAt: true } }) : null;
        policies.push({ mentorRole: role?.mentorRole, startedAt: role?.startedAt.toISOString(), mentorInstitution: person.institution, mentorAvatarUrl: person.avatarUrl, reviewResources, policy: await policyDto(c.tx, row, effective), mentorId: row.mentorUserId, mentorName: person.fullName, invitationState, shares: shares.map(({sharedById, ...s}) => ({ ...s, canUnshare: c.role === "OWNER" || Boolean(c.role) && sharedById === c.actorId, kind: s.kind as MentorResourceKind, accessMode: s.accessMode as "VIEW" | "COMMENT" | null, canComment: !["ARCHIVED", "COMPLETED"].includes(c.project.status) && canCommentMentorShare(row, s), createdAt: s.createdAt.toISOString(), revokedAt: s.revokedAt?.toISOString() ?? null })) });
      }
      // Basic collaboration context for accepted mentors; never expose the private plan or description.
      const members = await c.tx.projectMember.findMany({ where: { projectId: c.project.id, status: "ACTIVE" }, select: { userId: true } });
      const people = await c.tx.user.findMany({ where: { id: { in: [...new Set([c.project.ownerId, ...members.map(m => m.userId)])] }, isActive: true, accountStatus: "ACTIVE" }, select: { id: true, fullName: true }, orderBy: [{ fullName: "asc" }, { id: "asc" }] });
      const basics: NonNullable<MentorAccessWorkspace["basics"]> = {
        summary: c.project.mentorshipSummary || c.project.publicSummary || null,
        researchField: c.project.researchField,
        status: c.project.status,
        team: people.map(p => ({ id: p.id, name: p.fullName, role: p.id === c.project.ownerId ? "OWNER" : "MEMBER" })),
      };
      return { viewerId: c.actorId, projectId: c.project.id, title: c.project.title, basics, canManage: c.role === "OWNER", readOnly: ["ARCHIVED", "COMPLETED"].includes(c.project.status), ...pageResult([], total, page), policies };
    });
  },
  async paperPdf(project: string, actor: string, id: string, shareId: string) {
    return scoped(project, actor, false, async c => { const policy=await scopedAccess(c,id); const share=await c.tx.mentorResourceShare.findFirst({where:{id:shareId,accessId:id,projectId:c.project.id,revokedAt:null,kind:"PAPER"}}); if(!share?.sourceFileId||!c.role&&!canReadMentorShare(policy,share)) throw AppError.notFound("PDF chưa được chia sẻ hoặc đã thu hồi"); const file=await c.tx.projectPaperFile.findFirst({where:{id:share.sourceFileId,projectId:c.project.id,paperId:share.resourceId},select:{content:true}}); if(!file) throw AppError.notFound("PDF không còn khả dụng"); return file; });
  },
  async resource(project: string, actor: string, id: string, shareId: string) {
    return scoped(project, actor, false, async c => {
      const row = await scopedAccess(c, id);
      const share = await c.tx.mentorResourceShare.findFirst({ where: { id: shareId, accessId: id, projectId: c.project.id, ...(!c.role ? { revokedAt: null } : {}) } });
      if (!share) throw AppError.notFound("Nội dung chưa được chia sẻ hoặc đã thu hồi");
      if (!c.role && !canReadMentorShare(row, share)) throw AppError.forbidden("Nội dung chưa được chia sẻ");
      return { ...shareDto(share), canComment: !["ARCHIVED", "COMPLETED"].includes(c.project.status) && canCommentMentorShare(row, share) };
    });
  },
  async configure(project: string, actor: string, id: string, input: z.infer<typeof schemas.configureMentorAccessSchema>) {
    return scoped(project, actor, true, async c => {
      manager(c); writable(c); const row = await scopedAccess(c, id); expectWorkspaceVersion(row.version, input.expectedVersion);
      await configurable(c, row);
      validateMentorPermissions(input.permissions); validateExpiry(input.expiresAt);
      const updated = await c.tx.mentorAccess.update({ where: { id }, data: { preset: input.preset, permissions: input.permissions, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, configuredById: c.actorId, version: { increment: 1 } } });
      await mentorAccessEvent(c.tx, row, c.actorId, "PERMISSIONS_CHANGED", { before: { preset: row.preset, permissions: row.permissions, expiresAt: row.expiresAt }, after: { preset: updated.preset, permissions: updated.permissions, expiresAt: updated.expiresAt }, reason: input.reason });
      for (const share of input.shares ?? []) await publishMentorShare(c.tx, row, c.actorId, share);
      return policyDto(c.tx, updated);
    });
  },
  async revoke(project: string, actor: string, id: string, input: z.infer<typeof schemas.mentorAccessActionSchema>) {
    return scoped(project, actor, false, async c => {
      manager(c); const row = await scopedAccess(c, id); expectWorkspaceVersion(row.version, input.expectedVersion);
      if (row.revokedAt) throw AppError.conflict("Quyền đã được thu hồi");
      const now = new Date();
      const updated = await c.tx.mentorAccess.update({ where: { id }, data: { revokedAt: now, version: { increment: 1 } } });
      if (row.relationshipId) await c.tx.mentorRelationship.updateMany({ where: { id: row.relationshipId, status: "ACTIVE" }, data: { status: "ENDED", endedAt: now, endedById: c.actorId, endReason: input.reason } });
      else await c.tx.mentorshipRequest.updateMany({ where: { id: row.requestId, status: "PENDING" }, data: { status: "CANCELED_BY_PROJECT", respondedAt: now, responseNote: input.reason } });
      const request = await c.tx.mentorshipRequest.findUniqueOrThrow({ where: { id: row.requestId } });
      if (row.relationshipId) await closeAcceptedApplication(c.tx, request, c.actorId, row.relationshipId);
      else await syncApplicationRequest(c.tx, request, c.actorId);
      await mentorAccessEvent(c.tx, row, c.actorId, "ACCESS_REVOKED", { reason: input.reason }); return policyDto(c.tx, updated);
    });
  },
  async share(project: string, actor: string, id: string, input: (MentorShareInput & { expectedVersion: number }) | z.infer<typeof schemas.mentorPaperShareSchema>) {
    if ("accessMode" in input) return this.sharePaper(project, actor, id, input);
    return scoped(project, actor, true, async c => { manager(c); writable(c); const row = await scopedAccess(c, id); expectWorkspaceVersion(row.version, input.expectedVersion); await configurable(c, row); const { expectedVersion: _, ...data } = input; const share = await publishMentorShare(c.tx, row, c.actorId, data); await c.tx.mentorAccess.update({ where: { id }, data: { version: { increment: 1 } } }); return share; });
  },
  async unshare(project: string, actor: string, id: string, shareId: string, input: z.infer<typeof schemas.mentorAccessActionSchema>) {
    return scoped(project, actor, false, async c => {
      if (!c.role) throw AppError.forbidden("Chỉ thành viên nhóm được ngừng chia sẻ"); const row = await scopedAccess(c, id);
      const share = await c.tx.mentorResourceShare.findFirst({ where: { id: shareId, accessId: id, projectId: c.project.id } }); if (!share) throw AppError.notFound("Không tìm thấy bản chia sẻ");
      if (c.role !== "OWNER" && share.sharedById !== c.actorId) throw AppError.forbidden("Chỉ người chia sẻ hoặc chủ dự án được ngừng chia sẻ");
      if (share.revokedAt) return { id: shareId };
      expectWorkspaceVersion(row.version, input.expectedVersion);
      await c.tx.mentorResourceShare.update({ where: { id: shareId }, data: { revokedAt: share.revokedAt ?? new Date() } }); await c.tx.mentorAccess.update({ where: { id }, data: { version: { increment: 1 } } }); await mentorAccessEvent(c.tx, row, c.actorId, "RESOURCE_REVOKED", { shareId, reason: input.reason }); return { id: shareId };
    });
  },
  async catalog(project: string, actor: string, query: Page) {
    return withWorkspace(project, actor, { owner: true }, async c => {
      manager(c); const kind = query.kind ?? "PAPER", search = { contains: query.q, mode: "insensitive" as const }, common = { projectId: c.project.id };
      let items: { resourceId: string; title: string; content: string }[] = [], total = 0;
      if (kind === "OVERVIEW") { total = 1; if (query.page === 1) items = [{ resourceId: c.project.id, title: c.project.title, content: [c.project.mentorshipSummary, c.project.mentorshipNeeds].filter(Boolean).join("\n\n") }]; }
      if (kind === "PAPER") {
        const ids = (await c.tx.projectPaper.findMany({ where: common, select: { paperId: true } })).map(p => p.paperId), where = { id: { in: ids }, title: search };
        total = await c.tx.paper.count({ where }); items = (await c.tx.paper.findMany({ where, ...paging(query.page), orderBy: { title: "asc" }, select: { id: true, title: true, abstractText: true, doi: true } })).map(p => ({ resourceId: p.id, title: p.title, content: [p.abstractText, p.doi].filter(Boolean).join("\n\n") || p.title }));
      }
      if (kind === "GAP") { const where = { ...common, title: search }; total = await c.tx.researchGap.count({ where }); items = (await c.tx.researchGap.findMany({ where, ...paging(query.page), orderBy: { id: "asc" } })).map(p => ({ resourceId: p.id, title: p.title, content: [p.description, p.suggestedResearchQuestion].filter(Boolean).join("\n\n") || p.title })); }
      if (kind === "TASK") { const where = { ...common, title: search, deletedAt: null }; total = await c.tx.projectTask.count({ where }); items = (await c.tx.projectTask.findMany({ where, ...paging(query.page), orderBy: { id: "asc" } })).map(p => ({ resourceId: p.id, title: p.title, content: [p.description, p.status].join("\n\n") })); }
      if (kind === "MILESTONE") { const where = { ...common, title: search }; total = await c.tx.projectMilestone.count({ where }); items = (await c.tx.projectMilestone.findMany({ where, ...paging(query.page), orderBy: { id: "asc" } })).map(p => ({ resourceId: p.id, title: p.title, content: [p.description, p.status].join("\n\n") })); }
      if (kind === "MANUSCRIPT") { const where = { ...common, name: search, deletedAt: null }; total = await c.tx.draftWorkspace.count({ where }); items = (await c.tx.draftWorkspace.findMany({ where, ...paging(query.page), orderBy: { id: "asc" }, select: { id: true, name: true } })).map(p => ({ resourceId: p.id, title: p.name, content: "" })); }
      if (kind === "SUBMISSION") { const where = { ...common, title: search }; total = await c.tx.submission.count({ where }); items = (await c.tx.submission.findMany({ where, ...paging(query.page), orderBy: { id: "asc" }, select: { id: true, title: true, status: true } })).map(p => ({ resourceId: p.id, title: p.title, content: p.status })); }
      if (kind === "CONTRIBUTION") {
        const proposals = await c.tx.projectContributionProposal.findMany({ where: { ...common, status: { not: "DRAFT" }, ...(query.q ? { title: search } : {}) }, ...paging(query.page), orderBy: { createdAt: "desc" } });
        const legacy = proposals.length < 20 ? await c.tx.researchContribution.findMany({ where: common, take: 20 - proposals.length, orderBy: { id: "asc" } }) : [];
        total = (await c.tx.projectContributionProposal.count({ where: { ...common, status: { not: "DRAFT" }, ...(query.q ? { title: search } : {}) } })) + (await c.tx.researchContribution.count({ where: common }));
        items = [
          ...proposals.map(p => ({ resourceId: p.id, title: p.title || "Đóng góp nghiên cứu", content: JSON.stringify({ title: p.title, category: p.category, description: p.description, status: p.status }) })),
          ...legacy.map(p => ({ resourceId: p.id, title: "Đóng góp nghiên cứu", content: JSON.stringify({ description: p.description, contributionType: p.contributionType }) })),
        ];
      }
      return pageResult(items.map(item => ({ ...item, kind, sectionKey: "" })), total, query.page);
    });
  },
  async feedback(project: string, actor: string, id: string, page = 1, shareId?: string) {
    return scoped(project, actor, false, async c => {
      const row = await scopedAccess(c, id), shares = await c.tx.mentorResourceShare.findMany({ where: { accessId: id, revokedAt: null } });
      const readable = shares.filter(s => canReadMentorShare(row, s)).map(s => s.id);
      if (shareId && (!shares.some(share => share.id === shareId) || !c.role && !readable.includes(shareId))) throw AppError.notFound("Nội dung chưa được chia sẻ hoặc đã thu hồi");
      const where = { accessId: id, projectId: c.project.id, ...(shareId ? { shareId } : {}), ...(!c.role ? { OR: [...(row.permissions.includes("MENTOR_CHAT") ? [{ shareId: null }] : []), { shareId: { in: readable } }] } : {}) };
      const [rows, total] = await Promise.all([c.tx.mentorFeedback.findMany({ where, ...paging(page), orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), c.tx.mentorFeedback.count({ where })]);
      const people = await c.tx.user.findMany({ where: { id: { in: [...new Set(rows.flatMap(r => [r.authorId, ...(r.handledById ? [r.handledById] : [])]))] } }, select: { id: true, fullName: true } });
      const names = new Map(people.map(p => [p.id, p.fullName]));
      return pageResult(rows.map(r => ({ ...r, authorName: names.get(r.authorId) ?? "Thành viên", handledByName: r.handledById ? names.get(r.handledById) : undefined, mentor: r.authorId === row.mentorUserId, createdAt: r.createdAt.toISOString(), handledAt: r.handledAt?.toISOString() ?? null })), total, page);
    });
  },
  async comment(project: string, actor: string, id: string, input: z.infer<typeof schemas.mentorFeedbackSchema>) {
    return scoped(project, actor, true, async c => {
      const row = await scopedAccess(c, id, true);
      if (!await effectiveMentorAccess(c.tx, row)) throw AppError.conflict("Quan hệ cố vấn chưa hoạt động hoặc đã hết quyền truy cập");
      if (input.shareId) {
        const share = await c.tx.mentorResourceShare.findFirst({ where: { id: input.shareId, projectId: c.project.id, accessId: id, revokedAt: null } }); if (!share) throw AppError.notFound("Nội dung chưa được chia sẻ");
        const kind = share.kind as MentorResourceKind; if (!c.role && !canReadMentorShare(row, share)) throw AppError.forbidden("Nội dung chưa được chia sẻ");
        const permission: MentorPermission | undefined = input.kind === "REVIEW" ? kind === "MANUSCRIPT" ? "MANUSCRIPTS_REVIEW" : undefined : kind === "PAPER" ? input.kind === "SUGGESTION" ? "PAPERS_SUGGEST" : "PAPERS_COMMENT" : kind === "GAP" ? input.kind === "SUGGESTION" ? "GAPS_RECOMMEND" : "GAPS_COMMENT" : kind === "MANUSCRIPT" ? input.kind === "SUGGESTION" ? "MANUSCRIPTS_SUGGEST" : "MANUSCRIPTS_COMMENT" : ["TASK", "MILESTONE"].includes(kind) && input.kind === "SUGGESTION" ? "TASKS_SUGGEST" : undefined;
        if (!permission || input.kind === "MESSAGE") throw AppError.badRequest("Loại phản hồi chưa phù hợp với tài nguyên");
        if (!c.role && share.accessMode && kind === "PAPER") { if (share.accessMode !== "COMMENT" || input.kind !== "COMMENT") throw AppError.forbidden("Bài báo này chỉ cho phép thao tác đã được nhóm chia sẻ"); }
        else requirePermission(c, row, permission);
      } else { if (input.kind !== "MESSAGE") throw AppError.badRequest("Chọn tài nguyên cho nhận xét hoặc đề xuất"); requirePermission(c, row, "MENTOR_CHAT"); }
      if (input.replyToId) { const parent = await c.tx.mentorFeedback.findFirst({ where: { id: input.replyToId, accessId: id, shareId: input.shareId } }); if (!parent) throw AppError.badRequest("Phản hồi gốc không thuộc cuộc trao đổi này"); }
      const previous = await c.tx.mentorFeedback.findUnique({ where: { accessId_authorId_clientKey: { accessId: id, authorId: c.actorId, clientKey: input.clientKey } } });
      if (previous) { if (previous.body !== input.body || previous.kind !== input.kind || previous.shareId !== input.shareId || previous.replyToId !== input.replyToId || JSON.stringify(previous.creditRoles) !== JSON.stringify(input.creditRoles)) throw AppError.conflict("Mã gửi đã được dùng cho nội dung khác"); return { id: previous.id }; }
      const feedback = await c.tx.mentorFeedback.create({ data: { projectId: c.project.id, accessId: id, authorId: c.actorId, ...input } });
      await mentorAccessEvent(c.tx, row, c.actorId, "FEEDBACK_CREATED", { feedbackId: feedback.id, shareId: input.shareId, kind: input.kind, creditRoles: input.creditRoles }); return { id: feedback.id };
    });
  },
  async handle(project: string, actor: string, id: string, feedbackId: string, input: z.infer<typeof schemas.mentorFeedbackStatusSchema>) {
    return scoped(project, actor, true, async c => {
      if (!c.role) throw AppError.forbidden("Chỉ nhóm dự án được xử lý phản hồi"); const row = await scopedAccess(c, id, true);
      const feedback = await c.tx.mentorFeedback.findFirst({ where: { id: feedbackId, accessId: id } }); if (!feedback) throw AppError.notFound("Không tìm thấy phản hồi"); expectWorkspaceVersion(feedback.version, input.expectedVersion);
      if (["REJECTED", "RESOLVED"].includes(feedback.status) || feedback.status === "ACCEPTED" && input.status !== "RESOLVED") throw AppError.conflict("Phản hồi đã được xử lý. Phản hồi được chấp nhận chỉ có thể chuyển sang đã giải quyết");
      await c.tx.mentorFeedback.update({ where: { id: feedbackId }, data: { status: input.status, response: input.response, ...(input.resultingRevisionRef !== undefined ? { resultingRevisionRef: input.resultingRevisionRef || null } : {}), handledById: c.actorId, handledAt: new Date(), version: { increment: 1 } } });
      await mentorAccessEvent(c.tx, row, c.actorId, "FEEDBACK_HANDLED", { feedbackId, previousStatus: feedback.status, ...input });
      await researchLedgerService.record({ tx: c.tx, projectId: c.project.id, actorId: c.actorId, eventType: "MENTOR_FEEDBACK_HANDLED", resourceKind: "MENTOR_FEEDBACK", resourceId: feedbackId, currentVersionRef: input.resultingRevisionRef ?? null, visibility: "PROJECT_TEAM", retentionClass: "RESEARCH_EVIDENCE", metadata: { mentorUserId: row.mentorUserId, status: input.status, creditRoles: feedback.creditRoles } });
      return { id: feedbackId };
    });
  },
  async history(project: string, actor: string, id: string, page = 1) {
    return scoped(project, actor, false, async c => {
      await scopedAccess(c, id); const where = { accessId: id };
      const [items, total] = await Promise.all([c.tx.mentorAccessEvent.findMany({ where, ...paging(page), orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), c.tx.mentorAccessEvent.count({ where })]);
      const people = await c.tx.user.findMany({ where: { id: { in: [...new Set(items.map(e => e.actorId))] } }, select: { id: true, fullName: true } });
      const names = new Map(people.map(p => [p.id, p.fullName]));
      return pageResult(items.map(e => ({ id: e.id, actorId: e.actorId, actorName: names.get(e.actorId) ?? "Thành viên", type: e.type, createdAt: e.createdAt.toISOString(), details: c.role ? e.details : {} })), total, page);
    });
  },
  async agreements(project: string, actor: string, id: string, page = 1) {
    return scoped(project, actor, false, async c => { await scopedAccess(c, id); const where = { accessId: id }; const [items, total] = await Promise.all([c.tx.mentorAgreement.findMany({ where, ...paging(page), orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), c.tx.mentorAgreement.count({ where })]); return pageResult(items.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), respondedAt: r.respondedAt?.toISOString() ?? null })), total, page); });
  },
  async proposeAgreement(project: string, actor: string, id: string, input: z.infer<typeof schemas.mentorAgreementSchema>) {
    return scoped(project, actor, true, async c => {
      const row = await scopedAccess(c, id, true); if (c.role && c.role !== "OWNER") throw AppError.forbidden("Chỉ chủ dự án được đề xuất thỏa thuận của nhóm"); if (!await effectiveMentorAccess(c.tx, row)) throw AppError.conflict("Cần quan hệ cố vấn đang hoạt động");
      const previous = await c.tx.mentorAgreement.findUnique({ where: { accessId_proposedById_clientKey: { accessId: id, proposedById: c.actorId, clientKey: input.clientKey } } }); if (previous) { if (previous.acknowledgement !== input.acknowledgement || previous.note !== input.note || JSON.stringify(previous.creditRoles) !== JSON.stringify(input.creditRoles)) throw AppError.conflict("Mã thỏa thuận đã được dùng"); return { id: previous.id }; }
      const agreement = await c.tx.mentorAgreement.create({ data: { projectId: c.project.id, accessId: id, proposedById: c.actorId, ...input } }); await mentorAccessEvent(c.tx, row, c.actorId, "AGREEMENT_PROPOSED", { agreementId: agreement.id, ...input }); return { id: agreement.id };
    });
  },
  async respondAgreement(project: string, actor: string, id: string, agreementId: string, status: "ACCEPTED" | "REJECTED" | "WITHDRAWN") {
    return scoped(project, actor, true, async c => {
      const row = await scopedAccess(c, id, true); if (c.role && c.role !== "OWNER") throw AppError.forbidden("Chỉ chủ dự án được xác nhận thay nhóm"); if (!await effectiveMentorAccess(c.tx, row)) throw AppError.conflict("Cần quan hệ cố vấn đang hoạt động");
      const proposal = await c.tx.mentorAgreement.findFirst({ where: { id: agreementId, accessId: id } }); if (!proposal) throw AppError.notFound("Không tìm thấy thỏa thuận"); if (proposal.status !== "PROPOSED") throw AppError.conflict("Thỏa thuận đã được xử lý");
      if ((status === "WITHDRAWN") !== (proposal.proposedById === c.actorId)) throw AppError.forbidden("Chỉ bên còn lại được chấp nhận hoặc từ chối; người đề xuất được rút lại");
      await c.tx.mentorAgreement.update({ where: { id: agreementId }, data: { status, respondedById: c.actorId, respondedAt: new Date() } }); await mentorAccessEvent(c.tx, row, c.actorId, "AGREEMENT_RESPONDED", { agreementId, status }); return { id: agreementId };
    });
  },
};
