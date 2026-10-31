import type { MentorPlanCommand, MentorRecruitmentPlan, MentorRole } from "@trend/shared-types";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { assertAcceptingNewMentorships } from "./academic-relationship-access.js";
import { mentorPositions } from "./mentorship-positions.js";

type Db = Prisma.TransactionClient;
function key(input: string) {
  const id = parseDatabaseId(input);
  if (!id) throw AppError.badRequest("Định danh không hợp lệ");
  return id.kind === "uuid" ? { id: id.value } : { legacyMongoId: id.value };
}
export async function ensureMentorPlan(tx: Db, projectId: string, ownerId: string) {
  return await tx.mentorInvitationPlan.findFirst({ where: { projectId, status: "ACTIVE" } }) ??
    tx.mentorInvitationPlan.create({ data: { projectId, createdById: ownerId } });
}
export async function checkCandidate(tx: Db, projectId: string, ownerId: string, mentorId: string) {
  await assertAcceptingNewMentorships(tx, mentorId);
  if (ownerId === mentorId || await tx.projectMember.count({ where: { projectId, userId: mentorId, status: "ACTIVE" } }))
    throw AppError.conflict("Thành viên dự án không thể đồng thời làm mentor");
  if (await tx.mentorRelationship.count({ where: { projectId, mentorUserId: mentorId, status: "ACTIVE" } }))
    throw AppError.conflict("Giảng viên đã là mentor của dự án");
}
export async function prepareMentorCandidate(tx: Db, projectId: string, ownerId: string, mentorId: string, role: MentorRole, candidateId?: string, expectedVersion?: number) {
  const plan = await ensureMentorPlan(tx, projectId, ownerId);
  if (expectedVersion !== undefined && plan.version !== expectedVersion) throw AppError.conflict("Kế hoạch đã thay đổi. Tải lại trước khi gửi");
  if (plan.closedRoles.includes(role)) throw AppError.conflict("Vai trò đã dừng tuyển. Chủ dự án cần mở đợt mời mới");
  if (role === "SECONDARY" && !plan.parallelInvitations && !await tx.mentorRelationship.count({ where: { projectId, mentorRole: "PRIMARY", status: "ACTIVE" } }))
    throw AppError.conflict("Bật mời song song hoặc chờ Mentor chính chấp nhận trước khi mời Mentor phụ");
  let candidate = candidateId ? await tx.mentorCandidate.findFirst({ where: { id: candidateId, planId: plan.id } }) :
    await tx.mentorCandidate.findFirst({ where: { planId: plan.id, mentorUserId: mentorId, status: { not: "REMOVED" } } });
  if (candidateId && !candidate) throw AppError.notFound("Ứng viên không thuộc kế hoạch hiện tại");
  if (!candidate) {
    if (await tx.mentorCandidate.count({ where: { planId: plan.id, status: { not: "REMOVED" } } }) >= 4) throw AppError.conflict("Kế hoạch có tối đa 4 ứng viên");
    const last = await tx.mentorCandidate.aggregate({ where: { planId: plan.id, mentorRole: role }, _max: { priority: true } });
    candidate = await tx.mentorCandidate.create({ data: { planId: plan.id, mentorUserId: mentorId, mentorRole: role, priority: (last._max.priority ?? 0) + 1 } });
  }
  if (candidate.status !== "PLANNED" || candidate.mentorUserId !== mentorId || candidate.mentorRole !== role) throw AppError.conflict("Ứng viên hoặc vai trò đã thay đổi. Không thể gửi lời mời này");
  const first = await tx.mentorCandidate.findFirst({ where: { planId: plan.id, mentorRole: role, status: "PLANNED" }, orderBy: [{ priority: "asc" }, { id: "asc" }] });
  if (first?.id !== candidate.id) throw AppError.conflict("Cần mời ứng viên đứng trước hoặc điều chỉnh thứ tự kế hoạch");
  return candidate;
}

export const mentorPlanService = {
  async read(projectInput: string, actorInput: string): Promise<MentorRecruitmentPlan> {
    const db = getPrisma(), [p, actor] = await Promise.all([db.project.findUnique({ where: key(projectInput) }), db.user.findUnique({ where: key(actorInput) })]);
    if (!p || !actor?.isActive || actor.accountStatus !== "ACTIVE" || !actor.emailVerifiedAt || p.ownerId !== actor.id) throw AppError.forbidden("Chỉ chủ dự án được xem kế hoạch ứng viên riêng tư");
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id=${p.id}::uuid FOR SHARE`;
      const live = await tx.project.findUniqueOrThrow({ where: { id: p.id } });
      if (live.ownerId !== actor.id) throw AppError.forbidden();
      const plan = await tx.mentorInvitationPlan.findFirst({ where: { projectId: p.id, status: "ACTIVE" } });
      const positions = await mentorPositions(p.id, tx);
      const candidates = plan ? await tx.mentorCandidate.findMany({ where: { planId: plan.id, status: { not: "REMOVED" } }, orderBy: [{ mentorRole: "asc" }, { priority: "asc" }, { id: "asc" }] }) : [];
      const active = await tx.mentorRelationship.findMany({ where: { projectId: p.id, status: "ACTIVE" } });
      const pending = await tx.mentorshipRequest.findMany({ where: { projectId: p.id, status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
      const people = await tx.user.findMany({ where: { id: { in: [...candidates, ...active, ...pending].map(c => c.mentorUserId) } }, select: { id: true, legacyMongoId: true, fullName: true } });
      const requests = await tx.mentorshipRequest.findMany({ where: { candidateId: { in: candidates.map(c => c.id) } }, select: { candidateId: true, status: true, id: true } });
      const unavailable = new Map<string, string>();
      for (const c of candidates.filter(c => c.status === "PLANNED")) {
        try { await checkCandidate(tx, p.id, live.ownerId, c.mentorUserId); }
        catch (error) { if (error instanceof AppError && [403, 409].includes(error.statusCode)) unavailable.set(c.id, error.message); else throw error; }
      }
      return { id: plan?.id, version: plan?.version ?? 0, parallelInvitations: plan?.parallelInvitations ?? false, autoSend: false,
        currentMentors: active.map(r => ({ mentorRole: r.mentorRole as MentorRole, fullName: people.find(u => u.id === r.mentorUserId)!.fullName })),
        currentInvitations: pending.map(r => ({ mentorRole: r.mentorRole as MentorRole, fullName: people.find(u => u.id === r.mentorUserId)!.fullName, expiresAt: r.expiresAt?.toISOString() })),
        closedRoles: (plan?.closedRoles ?? []) as MentorRole[], canManage: !["ARCHIVED", "COMPLETED"].includes(live.status), positions,
        candidates: candidates.map(c => { const u = people.find(u => u.id === c.mentorUserId)!, request = requests.find(r => r.candidateId === c.id);
          const role = c.mentorRole as MentorRole;
          const first = candidates.find(other => other.mentorRole === role && other.status === "PLANNED");
          const ready = c.status === "PLANNED" && !unavailable.has(c.id) && first?.id === c.id && positions[role].status === "VACANT" && !plan?.closedRoles.includes(role) &&
            (role === "PRIMARY" || plan?.parallelInvitations || positions.PRIMARY.status === "ASSIGNED");
          return { id: c.id, mentorUserId: publicDatabaseId(u), fullName: u.fullName, mentorRole: role, priority: c.priority,
            status: request?.status ?? (unavailable.has(c.id) ? "INELIGIBLE" : ready ? "READY" : "PLANNED"), unavailableReason: unavailable.has(c.id) ? "Giảng viên hiện không đủ điều kiện nhận hướng dẫn. Hãy kiểm tra hồ sơ, đổi thứ tự hoặc bỏ khỏi kế hoạch." : undefined, requestId: request?.id, canSend: Boolean(ready && !["ARCHIVED", "COMPLETED"].includes(live.status)) };
        }) };
    }, { maxWait: 10_000, timeout: 15_000 });
  },
  async change(projectInput: string, actorInput: string, input: MentorPlanCommand) {
    const db = getPrisma(), [p, actor, lecturer] = await Promise.all([db.project.findUnique({ where: key(projectInput) }), db.user.findUnique({ where: key(actorInput) }), input.action === "add" ? db.user.findUnique({ where: key(input.mentorUserId) }) : null]);
    if (!p || !actor) throw AppError.forbidden();
    await db.$transaction(async tx => {
      const ids = [...new Set([actor.id, ...(lecturer ? [lecturer.id] : [])])].sort();
      await tx.$queryRaw`SELECT id FROM users WHERE id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR NO KEY UPDATE`;
      await tx.$queryRaw`SELECT id FROM projects WHERE id=${p.id}::uuid FOR UPDATE`;
      const [live, user] = await Promise.all([tx.project.findUniqueOrThrow({ where: { id: p.id } }), tx.user.findUniqueOrThrow({ where: { id: actor.id } })]);
      if (live.ownerId !== actor.id || !user.isActive || user.accountStatus !== "ACTIVE" || !user.emailVerifiedAt) throw AppError.forbidden("Chỉ chủ dự án được quản lý kế hoạch mời");
      if (["ARCHIVED", "COMPLETED"].includes(live.status)) throw AppError.conflict("Dự án chỉ cho phép xem");
      let plan = await tx.mentorInvitationPlan.findFirst({ where: { projectId: p.id, status: "ACTIVE" } });
      if ((plan?.version ?? 0) !== input.expectedVersion) throw AppError.conflict("Kế hoạch đã thay đổi. Tải lại và thử lại");
      plan ??= await ensureMentorPlan(tx, p.id, actor.id);
      if (input.action === "restart") {
        if (await tx.mentorshipRequest.count({ where: { projectId: p.id, status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })) throw AppError.conflict("Xử lý các lời mời đang chờ trước khi mở đợt mới");
        await tx.mentorInvitationPlan.update({ where: { id: plan.id }, data: { status: "CLOSED", version: { increment: 1 } } });
        await ensureMentorPlan(tx, p.id, actor.id);
      } else if (input.action === "configure") {
        await tx.mentorInvitationPlan.update({ where: { id: plan.id }, data: { parallelInvitations: input.parallelInvitations } });
      } else if (input.action === "add") {
        if (!lecturer) throw AppError.notFound("Không tìm thấy giảng viên");
        if (plan.closedRoles.includes(input.mentorRole)) throw AppError.conflict("Vai trò đã dừng tuyển. Mở đợt mời mới trước khi thêm ứng viên");
        if ((await mentorPositions(p.id, tx))[input.mentorRole].status === "ASSIGNED") throw AppError.conflict("Vai trò đã có người hướng dẫn. Không cần thêm ứng viên cho vị trí này");
        await checkCandidate(tx, p.id, actor.id, lecturer.id);
        if (await tx.mentorCandidate.count({ where: { planId: plan.id, status: { not: "REMOVED" } } }) >= 4) throw AppError.conflict("Kế hoạch có tối đa 4 ứng viên");
        if (await tx.mentorCandidate.count({ where: { planId: plan.id, mentorUserId: lecturer.id, status: { not: "REMOVED" } } })) throw AppError.conflict("Giảng viên đã có trong kế hoạch");
        if (await tx.mentorshipRequest.count({ where: { projectId: p.id, mentorUserId: lecturer.id, status: "PENDING" } })) throw AppError.conflict("Giảng viên đã nhận lời mời đang chờ");
        const last = await tx.mentorCandidate.aggregate({ where: { planId: plan.id, mentorRole: input.mentorRole }, _max: { priority: true } });
        await tx.mentorCandidate.create({ data: { planId: plan.id, mentorUserId: lecturer.id, mentorRole: input.mentorRole, priority: (last._max.priority ?? 0) + 1 } });
      } else {
        const candidate = await tx.mentorCandidate.findFirst({ where: { id: input.candidateId, planId: plan.id, status: "PLANNED" } });
        if (!candidate) throw AppError.conflict("Chỉ có thể sửa ứng viên chưa gửi lời mời");
        if (input.action === "remove") await tx.mentorCandidate.update({ where: { id: candidate.id }, data: { status: "REMOVED" } });
        else {
          const queue = await tx.mentorCandidate.findMany({ where: { planId: plan.id, mentorRole: candidate.mentorRole, status: "PLANNED" }, orderBy: [{ priority: "asc" }, { id: "asc" }] });
          const index = queue.findIndex(c => c.id === candidate.id), other = queue[index + input.offset];
          if (!other) throw AppError.conflict("Ứng viên đã ở đầu hoặc cuối danh sách");
          await tx.mentorCandidate.update({ where: { id: candidate.id }, data: { priority: other.priority } });
          await tx.mentorCandidate.update({ where: { id: other.id }, data: { priority: candidate.priority } });
        }
      }
      if (input.action !== "restart") await tx.mentorInvitationPlan.update({ where: { id: plan.id }, data: { version: { increment: 1 } } });
      await tx.projectActivity.create({ data: { projectId: p.id, actorId: actor.id, type: "MENTOR_PLAN_UPDATED", metadata: { action: input.action, planId: plan.id } } });
    }, { maxWait: 10_000, timeout: 15_000 });
    return this.read(projectInput, actorInput);
  },
};
