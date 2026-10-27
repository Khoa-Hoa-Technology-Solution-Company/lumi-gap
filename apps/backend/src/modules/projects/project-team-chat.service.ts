import type { ProjectTeamChatMessage } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { projectTeamChatEventHub } from "./project-team-chat.events.js";
import { assertActiveProjectAccount, authorizeProjectTransaction, lockProjectAccounts } from "./project-transaction.js";

interface ListTeamMessagesOptions { limit: number; before?: string; beforeId?: string }
interface DeleteTeamMessageOptions { reason?: string; userRole?: string }
function whereId(value: string) { const parsed = parseDatabaseId(value); if (!parsed) throw AppError.badRequest("Invalid identifier"); return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }; }
async function user(value: string) { const row = await getPrisma().user.findUnique({ where: whereId(value) }); if (!row) throw AppError.notFound("User not found"); if (!row.isActive || row.accountStatus !== "ACTIVE") throw AppError.unauthorized(); return row; }
async function project(value: string) { const row = await getPrisma().project.findUnique({ where: whereId(value) }); if (!row) throw AppError.notFound("Project not found"); const members = await getPrisma().projectMember.findMany({ where: { projectId: row.id, status: "ACTIVE" } }); return { ...row, members }; }

export class ProjectTeamChatService {
  private async assertCanAccess(projectId: string, userId: string, options: { allowAdmin?: boolean } = {}) { const [row, actor] = await Promise.all([project(projectId), user(userId)]); const allowed = row.ownerId === actor.id || row.members.some((member) => member.userId === actor.id); if (!allowed && !options.allowAdmin) throw AppError.forbidden("Access denied to this project"); return { project: row, actor }; }
  private async hydrate(messageId: string): Promise<ProjectTeamChatMessage> { const row = await getPrisma().projectTeamMessage.findUniqueOrThrow({ where: { id: messageId } }); const reads = await getPrisma().projectTeamMessageRead.findMany({ where: { messageId: row.id } }); const actorIds = [row.senderId, row.deletedById, ...reads.map((read) => read.userId)].filter((id): id is string => Boolean(id)); const users = await getPrisma().user.findMany({ where: { id: { in: actorIds } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true } }); const byId = new Map(users.map((item) => [item.id, { id: publicDatabaseId(item), fullName: item.fullName, email: item.email, avatarUrl: item.avatarUrl ?? undefined }])); const readBy = reads.flatMap((read) => byId.get(read.userId) ? [byId.get(read.userId)!] : []); return { id: publicDatabaseId(row), projectId: row.projectId, sender: byId.get(row.senderId)!, content: row.isDeleted ? "" : row.content, readBy, readCount: readBy.length, isDeleted: row.isDeleted, deletedAt: row.deletedAt?.toISOString(), deletedBy: row.deletedById ? byId.get(row.deletedById) : undefined, deleteReason: row.deleteReason ?? undefined, createdAt: row.createdAt.toISOString() }; }
  async sendMessage(projectIdInput: string, userIdInput: string, content: string, clientKey?: string) {
    const { project: row, actor } = await this.assertCanAccess(projectIdInput, userIdInput);
    const trimmed = content.trim(); if (!trimmed) throw AppError.badRequest("Message content is required");
    const created = await getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id], row.id);
      await authorizeProjectTransaction(tx, row.id, actor.id, "CONTRIBUTE");
      if (clientKey) {
        const previous = await tx.projectTeamMessage.findUnique({ where: { projectId_senderId_clientKey: { projectId: row.id, senderId: actor.id, clientKey } } });
        if (previous) {
          if (previous.threadId !== null || previous.content !== trimmed) throw AppError.conflict("This message key was already used");
          return { message: previous, duplicate: true };
        }
      }
      const message = await tx.projectTeamMessage.create({ data: { projectId: row.id, senderId: actor.id, content: trimmed, clientKey } });
      await tx.projectTeamMessageRead.create({ data: { messageId: message.id, userId: actor.id } }); return { message, duplicate: false };
    });
    const message = await this.hydrate(created.message.id);
    if (created.duplicate) return message;
    projectTeamChatEventHub.publish({ type: "message.created", projectId: projectIdInput, message, occurredAt: new Date().toISOString() });
    await this.afterMessageSent(projectIdInput, actor.id, row, message); return message;
  }
  async listMessages(projectIdInput: string, userIdInput: string, options: ListTeamMessagesOptions) {
    const { project: row, actor } = await this.assertCanAccess(projectIdInput, userIdInput), db = getPrisma();
    const cursor = options.beforeId ? await db.projectTeamMessage.findFirst({ where: { ...whereId(options.beforeId), projectId: row.id, threadId: null } }) : null;
    if (options.beforeId && !cursor) throw AppError.notFound("Team message cursor not found");
    const messages = await db.projectTeamMessage.findMany({ where: { projectId: row.id, threadId: null,
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : options.before ? { createdAt: { lt: new Date(options.before) } } : {}),
    }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: options.limit });
    await db.projectTeamMessageRead.createMany({ data: messages.map(message => ({ messageId: message.id, userId: actor.id })), skipDuplicates: true });
    const hydrated = await Promise.all(messages.reverse().map(message => this.hydrate(message.id)));
    for (const message of hydrated) projectTeamChatEventHub.publish({ type: "message.updated", projectId: projectIdInput, message, occurredAt: new Date().toISOString() });
    return hydrated;
  }
  async markRead(projectIdInput: string, messageIdInput: string, userIdInput: string) { const { project: row, actor } = await this.assertCanAccess(projectIdInput, userIdInput); const message = await getPrisma().projectTeamMessage.findUnique({ where: whereId(messageIdInput) }); if (!message || message.projectId !== row.id || message.threadId !== null) throw AppError.notFound("Team message not found"); await getPrisma().projectTeamMessageRead.upsert({ where: { messageId_userId: { messageId: message.id, userId: actor.id } }, create: { messageId: message.id, userId: actor.id }, update: { readAt: new Date() } }); const result = await this.hydrate(message.id); projectTeamChatEventHub.publish({ type: "message.updated", projectId: projectIdInput, message: result, occurredAt: new Date().toISOString() }); return result; }
  async assertCanOpenEvents(projectId: string, userId: string, userRole?: string) { await this.assertCanAccess(projectId, userId, { allowAdmin: userRole === "admin" }); }
  async deleteMessage(projectIdInput: string, messageIdInput: string, userIdInput: string, options: DeleteTeamMessageOptions | string = {}) {
    const reason = typeof options === "string" ? options : options.reason;
    const userRole = typeof options === "string" ? undefined : options.userRole;
    const { project: row, actor } = await this.assertCanAccess(projectIdInput, userIdInput, { allowAdmin: userRole === "admin" });
    const result = await getPrisma().$transaction(async tx => {
      await lockProjectAccounts(tx, [actor.id], row.id);
      const liveActor = await assertActiveProjectAccount(tx, actor.id);
      const admin = userRole === "admin" && liveActor.systemRole === "ADMIN";
      const live = admin ? await tx.project.findUniqueOrThrow({ where: { id: row.id } }) : (await authorizeProjectTransaction(tx, row.id, actor.id, "CONTRIBUTE")).project;
      const message = await tx.projectTeamMessage.findUnique({ where: whereId(messageIdInput) });
      if (!message || message.projectId !== live.id || message.threadId !== null) throw AppError.notFound("Team message not found");
      if (message.senderId !== actor.id && live.ownerId !== actor.id && !admin) throw AppError.forbidden("Only the sender, project owner, or admin can delete this message.");
      if (message.isDeleted) return { id: message.id, duplicate: true };
      await tx.projectTeamMessage.update({ where: { id: message.id }, data: { isDeleted: true, deletedAt: new Date(), deletedById: actor.id, deleteReason: reason?.trim() || null } });
      return { id: message.id, duplicate: false };
    });
    const message = await this.hydrate(result.id);
    if (!result.duplicate) {
      await auditService.log("project.team_chat.message_deleted", { userId: userIdInput, targetTableName: "research_projects", targetRecordId: projectIdInput, details: { messageId: messageIdInput, reason: reason?.trim() || undefined } });
      projectTeamChatEventHub.publish({ type: "message.deleted", projectId: projectIdInput, message, occurredAt: new Date().toISOString() });
    }
    return message;
  }
  private async afterMessageSent(projectId: string, senderId: string, row: Awaited<ReturnType<typeof project>>, message: ProjectTeamChatMessage) { const recipients = [...new Set([row.ownerId, ...row.members.map((member) => member.userId)])].filter((id) => id !== senderId); await Promise.allSettled([auditService.log("project.team_chat.message_sent", { userId: senderId, targetTableName: "research_projects", targetRecordId: projectId, details: { messageId: message.id } }), ...recipients.map((recipient) => notificationService.create({ userId: recipient, title: "New project team message", message: `${message.sender.fullName || message.sender.email || "A project member"} sent a message in your project.`, type: "project_team_chat", targetKind: "project", targetId: projectId }))]); }
}
export const projectTeamChatService = new ProjectTeamChatService();
