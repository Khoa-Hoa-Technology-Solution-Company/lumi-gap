import { mentorPresets, type MentorAccessPolicy, type MentorPermission, type MentorPolicyInput, type MentorResourceKind, type MentorShareInput, type MentorAccessWorkspace } from "@trend/shared-types";
import type { z } from "zod";
import type { MentorshipRequest } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, jsonSnapshot, expectWorkspaceVersion, type WorkspaceContext, type WorkspaceDb } from "./workspace-access.js";
import type * as schemas from "./dto/mentor-access.schema.js";
import { isVerifiedLecturer } from "./academic-relationship-access.js";
import { researchLedgerService } from "../audit/research-ledger.service.js";

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
  const [relationship, user, profile] = await Promise.all([
    tx.mentorRelationship.count({ where: { id: row.relationshipId, projectId: row.projectId, mentorUserId: row.mentorUserId, status: "ACTIVE" } }),
    tx.user.findUnique({ where: { id: row.mentorUserId }, select: { isActive: true, accountStatus: true, emailVerifiedAt: true } }),
    tx.academicProfile.findUnique({ where: { userId: row.mentorUserId }, select: { academicRole: true, roleVerificationStatus: true, positionStatus: true } }),
  ]);
  return Boolean(relationship) && isVerifiedLecturer(user, profile);
}
export async function mentorPolicyDto(tx: WorkspaceDb, row: Access): Promise<MentorAccessPolicy> {
  return { id: row.id, requestId: row.requestId, relationshipId: row.relationshipId, version: row.version, preset: row.preset as MentorAccessPolicy["preset"], permissions: row.permissions as MentorPermission[], expiresAt: row.expiresAt?.toISOString() ?? null, revokedAt: row.revokedAt?.toISOString() ?? null, effective: await effectiveMentorAccess(tx, row) };
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
const shareDto = (row: Awaited<ReturnType<WorkspaceDb["mentorResourceShare"]["findMany"]>>[number]) => ({ id: row.id, kind: row.kind as MentorResourceKind, resourceId: row.resourceId, sectionKey: row.sectionKey, title: row.title, content: row.content, createdAt: row.createdAt.toISOString(), revokedAt: row.revokedAt?.toISOString() ?? null });

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
  const settings = input ?? { preset: "ADVISOR", permissions: [...mentorPresets.ADVISOR], expiresAt: null };
  validateMentorPermissions(settings.permissions); validateExpiry(settings.expiresAt);
  const row = await tx.mentorAccess.create({ data: { projectId: request.projectId, requestId: request.id, mentorUserId: request.mentorUserId, configuredById: ownerId, preset: settings.preset, permissions: settings.permissions, expiresAt: settings.expiresAt ? new Date(settings.expiresAt) : null } });
  await mentorAccessEvent(tx, row, request.requestedBy, "ACCESS_PROPOSED", { preset: row.preset, permissions: row.permissions, expiresAt: row.expiresAt, initialInput: input ?? null });
  for (const share of settings.shares ?? []) await publishMentorShare(tx, row, ownerId, share);
  return row;
}

const scoped = <T>(project: string, actor: string, write: boolean, run: (c: WorkspaceContext) => Promise<T>) => withWorkspace(project, actor, { write, mentor: true, mentorScope: "SHARED_RESOURCES" }, run);
export const mentorAccessService = {
  async workspace(project: string, actor: string, page = 1): Promise<MentorAccessWorkspace> {
    return scoped(project, actor, false, async c => {
      const where = { projectId: c.project.id, ...(c.role ? {} : { mentorUserId: c.actorId, relationshipId: { not: null }, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }) };
      const [rows, total] = await Promise.all([c.tx.mentorAccess.findMany({ where, ...paging(page), orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), c.tx.mentorAccess.count({ where })]);
      const policies: MentorAccessWorkspace["policies"] = [];
      for (const row of rows) {
        if (!c.role && !await effectiveMentorAccess(c.tx, row)) continue;
        const [person, request, shares] = await Promise.all([c.tx.user.findUniqueOrThrow({ where: { id: row.mentorUserId }, select: { fullName: true } }), c.tx.mentorshipRequest.findUniqueOrThrow({ where: { id: row.requestId }, select: { status: true } }), c.tx.mentorResourceShare.findMany({ where: { accessId: row.id, revokedAt: null, ...(!c.role ? { kind: { in: (Object.keys(mentorViewPermission) as MentorResourceKind[]).filter(k => row.permissions.includes(mentorViewPermission[k])) } } : {}) }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, resourceId: true, sectionKey: true, title: true, createdAt: true, revokedAt: true } })]);
        const invitationState = request.status === "DECLINED" ? "REJECTED" : ["CANCELLED", "CANCELED_BY_PROJECT", "CLOSED_CAPACITY_REACHED"].includes(request.status) ? "CANCELLED" : request.status as "PENDING" | "ACCEPTED" | "EXPIRED";
        policies.push({ policy: await policyDto(c.tx, row), mentorId: row.mentorUserId, mentorName: person.fullName, invitationState, shares: shares.map(s => ({ ...s, kind: s.kind as MentorResourceKind, createdAt: s.createdAt.toISOString(), revokedAt: s.revokedAt?.toISOString() ?? null })) });
      }
      return { viewerId: c.actorId, projectId: c.project.id, title: c.project.title, canManage: c.role === "OWNER", readOnly: ["ARCHIVED", "COMPLETED"].includes(c.project.status), ...pageResult([], total, page), policies };
    });
  },
  async resource(project: string, actor: string, id: string, shareId: string) {
    return scoped(project, actor, false, async c => {
      const row = await scopedAccess(c, id);
      const share = await c.tx.mentorResourceShare.findFirst({ where: { id: shareId, accessId: id, projectId: c.project.id, ...(!c.role ? { revokedAt: null } : {}) } });
      if (!share) throw AppError.notFound("Nội dung chưa được chia sẻ hoặc đã thu hồi");
      requirePermission(c, row, mentorViewPermission[share.kind as MentorResourceKind]);
      return shareDto(share);
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
      await mentorAccessEvent(c.tx, row, c.actorId, "ACCESS_REVOKED", { reason: input.reason }); return policyDto(c.tx, updated);
    });
  },
  async share(project: string, actor: string, id: string, input: MentorShareInput & { expectedVersion: number }) {
    return scoped(project, actor, true, async c => { manager(c); writable(c); const row = await scopedAccess(c, id); expectWorkspaceVersion(row.version, input.expectedVersion); await configurable(c, row); const { expectedVersion: _, ...data } = input; const share = await publishMentorShare(c.tx, row, c.actorId, data); await c.tx.mentorAccess.update({ where: { id }, data: { version: { increment: 1 } } }); return share; });
  },
  async unshare(project: string, actor: string, id: string, shareId: string, input: z.infer<typeof schemas.mentorAccessActionSchema>) {
    return scoped(project, actor, false, async c => {
      manager(c); const row = await scopedAccess(c, id); expectWorkspaceVersion(row.version, input.expectedVersion);
      const share = await c.tx.mentorResourceShare.findFirst({ where: { id: shareId, accessId: id, projectId: c.project.id } }); if (!share) throw AppError.notFound("Không tìm thấy bản chia sẻ");
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
  async feedback(project: string, actor: string, id: string, page = 1) {
    return scoped(project, actor, false, async c => {
      const row = await scopedAccess(c, id), shares = await c.tx.mentorResourceShare.findMany({ where: { accessId: id, revokedAt: null } });
      const readable = shares.filter(s => row.permissions.includes(mentorViewPermission[s.kind as MentorResourceKind])).map(s => s.id);
      const where = { accessId: id, projectId: c.project.id, ...(!c.role ? { OR: [...(row.permissions.includes("MENTOR_CHAT") ? [{ shareId: null }] : []), { shareId: { in: readable } }] } : {}) };
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
        const kind = share.kind as MentorResourceKind; requirePermission(c, row, mentorViewPermission[kind]);
        const permission: MentorPermission | undefined = input.kind === "REVIEW" ? kind === "MANUSCRIPT" ? "MANUSCRIPTS_REVIEW" : undefined : kind === "PAPER" ? input.kind === "SUGGESTION" ? "PAPERS_SUGGEST" : "PAPERS_COMMENT" : kind === "GAP" ? input.kind === "SUGGESTION" ? "GAPS_RECOMMEND" : "GAPS_COMMENT" : kind === "MANUSCRIPT" ? input.kind === "SUGGESTION" ? "MANUSCRIPTS_SUGGEST" : "MANUSCRIPTS_COMMENT" : ["TASK", "MILESTONE"].includes(kind) && input.kind === "SUGGESTION" ? "TASKS_SUGGEST" : undefined;
        if (!permission || input.kind === "MESSAGE") throw AppError.badRequest("Loại phản hồi chưa phù hợp với tài nguyên"); requirePermission(c, row, permission);
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
