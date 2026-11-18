import type { ProjectChatReference, ProjectTeamChatMessage } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { withWorkspace, jsonSnapshot, type WorkspaceDb } from "./workspace-access.js";
import { assertChatReference } from "./project-chat-references.service.js";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type ProjectTeamMessage } from "../../generated/prisma/client.js";
import { projectTeamChatEventHub } from "./project-team-chat.events.js";
import { assertActiveProjectAccount, authorizeProjectTransaction, lockProjectAccounts } from "./project-transaction.js";

interface ListTeamMessagesOptions { limit: number; before?: string; beforeId?: string; afterId?: string; aroundId?: string; q?: string; ids?: string }
interface DeleteTeamMessageOptions { reason?: string; userRole?: string }
function whereId(value: string) { const parsed = parseDatabaseId(value); if (!parsed) throw AppError.badRequest("Invalid identifier"); return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }; }
async function user(value: string) { const row = await getPrisma().user.findUnique({ where: whereId(value) }); if (!row) throw AppError.notFound("User not found"); if (!row.isActive || row.accountStatus !== "ACTIVE") throw AppError.unauthorized(); return row; }
async function project(value: string) { const row = await getPrisma().project.findUnique({ where: whereId(value) }); if (!row || Boolean(row.deletedAt)) throw AppError.notFound("Project not found"); const members = await getPrisma().projectMember.findMany({ where: { projectId: row.id, status: "ACTIVE" } }); return { ...row, members }; }

export class ProjectTeamChatService {
  private async assertCanAccess(projectId: string, userId: string, options: { allowAdmin?: boolean } = {}) { const [row, actor] = await Promise.all([project(projectId), user(userId)]); const allowed = row.ownerId === actor.id || row.members.some((member) => member.userId === actor.id); if (!allowed && !options.allowAdmin) throw AppError.forbidden("Access denied to this project"); return { project: row, actor }; }
  /** Hydrate one bounded page with batch queries, never one query per sender/read/reply. */
  private async hydrateMany(rows: ProjectTeamMessage[], db: WorkspaceDb = getPrisma()): Promise<ProjectTeamChatMessage[]> {
    if (!rows.length) return [];
    const replies = await db.projectTeamMessage.findMany({ where: { id: { in: rows.flatMap(r => r.replyToId ? [r.replyToId] : []) }, projectId: rows[0]!.projectId, threadId: null } });
    const [reads, receipts, timestamps] = await Promise.all([
      db.projectTeamMessageRead.findMany({ where: { messageId: { in: rows.map(r => r.id) } } }),
      db.projectActivity.findMany({ where: { projectId: rows[0]!.projectId, idempotencyKey: { in: rows.map(r => `team-chat:${r.id}`) }, type: "TEAM_CHAT_MESSAGE_SENT" }, select: { entityId: true, metadata: true } }),
      db.$queryRaw<Array<{ id: string; timestamp: string }>>`SELECT id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS timestamp FROM project_team_messages WHERE id IN (${Prisma.join(rows.map(r => Prisma.sql`${r.id}::uuid`))})`,
    ]);
    const ids = [...rows.flatMap(r => [r.senderId, r.deletedById]), ...reads.map(r => r.userId), ...replies.map(r => r.senderId)].filter((id): id is string => Boolean(id));
    const users = await db.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true } });
    const people = new Map(users.map(u => [u.id, { id: publicDatabaseId(u), fullName: u.fullName, email: u.email, avatarUrl: u.avatarUrl ?? undefined }]));
    return rows.map(row => {
      const readBy = reads.filter(r => r.messageId === row.id).flatMap(r => people.get(r.userId) ? [people.get(r.userId)!] : []);
      const reply = replies.find(r => r.id === row.replyToId);
      const snapshot = receipts.find(r => r.entityId === row.id)?.metadata as { reference?: ProjectChatReference } | undefined;
      return { id: publicDatabaseId(row), projectId: row.projectId, sender: people.get(row.senderId) ?? { id: row.senderId }, content: row.isDeleted ? "" : row.content, readBy, readCount: readBy.length, isDeleted: row.isDeleted, deletedAt: row.deletedAt?.toISOString(), deletedBy: row.deletedById ? people.get(row.deletedById) : undefined, deleteReason: row.deleteReason ?? undefined, createdAt: timestamps.find(t => t.id === row.id)?.timestamp ?? row.createdAt.toISOString(), clientKey: row.clientKey ?? undefined,
        ...(!row.isDeleted && snapshot?.reference ? { reference: snapshot.reference } : {}),
        ...(row.replyToId ? { replyTo: { id: reply ? publicDatabaseId(reply) : row.replyToId, sender: reply ? people.get(reply.senderId) ?? { id: reply.senderId } : { id: "" }, content: !reply || reply.isDeleted ? "" : reply.content.slice(0, 240), isDeleted: !reply || reply.isDeleted } } : {}),
      };
    });
  }
  private async hydrate(id: string) { return (await this.hydrateMany([await getPrisma().projectTeamMessage.findUniqueOrThrow({ where: { id } })]))[0]!; }
  async sendMessage(projectIdInput: string, userIdInput: string, content: string, clientKey?: string, extra: { replyToId?: string; reference?: ProjectChatReference } = {}) {
    const trimmed = content.trim();
    if ((!trimmed && !extra.reference) || trimmed.length > 2000) throw AppError.badRequest("Write a message or choose a research reference (maximum 2000 characters)");
    const created = await withWorkspace(projectIdInput, userIdInput, { write: true }, async c => {
      const reply = extra.replyToId ? await c.tx.projectTeamMessage.findFirst({ where: { ...whereId(extra.replyToId), projectId: c.project.id, threadId: null } }) : null;
      if (extra.replyToId && !reply) throw AppError.notFound("Reply message is unavailable");
      const input = { content: trimmed, replyToId: reply?.id ?? null, reference: extra.reference ?? null };
      if (clientKey) {
        const previous = await c.tx.projectTeamMessage.findUnique({ where: { projectId_senderId_clientKey: { projectId: c.project.id, senderId: c.actorId, clientKey } } });
        if (previous) {
          const revision = await c.tx.projectActivity.findUnique({ where: { projectId_idempotencyKey: { projectId: c.project.id, idempotencyKey: `team-chat:${previous.id}` } } });
          const original = { content: previous.content, replyToId: previous.replyToId, reference: (revision?.metadata as { reference?: ProjectChatReference } | undefined)?.reference ?? null };
          if (previous.threadId || !isDeepStrictEqual(input, original)) throw AppError.conflict("This message key was already used");
          return { message: previous, duplicate: true };
        }
      }
      if (reply?.isDeleted) throw AppError.notFound("Reply message is unavailable");
      if (extra.reference) await assertChatReference(c, extra.reference);

      const message = await c.tx.projectTeamMessage.create({ data: { projectId: c.project.id, senderId: c.actorId, content: trimmed, clientKey, replyToId: reply?.id } });
      // Reuse the append-only project activity receipt for immutable message context.
      // Only IDs/kinds are saved: no copied private title, file, or manuscript content.
      await c.tx.projectActivity.create({ data: { projectId: c.project.id, type: "TEAM_CHAT_MESSAGE_SENT", sourceModule: "TEAM_CHAT", entityKind: "TEAM_MESSAGE", entityId: message.id, actorId: c.actorId, idempotencyKey: `team-chat:${message.id}`, metadata: jsonSnapshot({ ...(extra.reference ? { reference: extra.reference } : {}) }) } });
      await c.tx.projectTeamMessageRead.create({ data: { messageId: message.id, userId: c.actorId } });
      const members = await c.tx.projectMember.findMany({ where: { projectId: c.project.id, status: "ACTIVE" }, select: { userId: true } });
      const recipients = [...new Set([c.project.ownerId, ...members.map(m => m.userId)])].filter(id => id !== c.actorId);
      for (const recipient of recipients) await notificationService.create({ userId: recipient, title: "New project team message", message: "A member sent a message in your project.", type: "project_team_chat", targetKind: "project", targetId: projectIdInput, eventKey: `TEAM_CHAT:${message.id}:${recipient}`, emailStatus: "SKIPPED" }, c.tx);
      return { message, duplicate: false };
    });
    const message = await this.hydrate(created.message.id);
    if (!created.duplicate) {
      projectTeamChatEventHub.publish({ type: "message.created", projectId: created.message.projectId, message, occurredAt: new Date().toISOString() });
      await auditService.log("project.team_chat.message_sent", { userId: userIdInput, targetTableName: "research_projects", targetRecordId: projectIdInput, details: { messageId: message.id } }).catch(() => undefined);
    }
    return message;
  }
  async listMessages(projectIdInput: string, userIdInput: string, options: ListTeamMessagesOptions) {
    return withWorkspace(projectIdInput, userIdInput, {}, async c => {
      const db = c.tx;
      if (options.ids) {
        const ids = options.ids.split(",");
        if (ids.length > 100) throw AppError.badRequest("Too many message IDs");
        return this.hydrateMany(await db.projectTeamMessage.findMany({ where: { projectId: c.project.id, threadId: null, OR: ids.map(whereId) } }), db);
      }
      const cursorId = options.beforeId ?? options.afterId ?? options.aroundId;
      const cursor = cursorId ? await db.projectTeamMessage.findFirst({ where: { ...whereId(cursorId), projectId: c.project.id, threadId: null } }) : null;
      if (cursorId && !cursor) throw AppError.notFound("Team message cursor not found");
      const limit = Math.min(Math.max(options.limit, 1), 100);
      const readPage = async (direction: "lt" | "gt", take: number) => {
        const op = direction === "lt" ? Prisma.sql`<` : Prisma.sql`>`;
        const order = direction === "lt" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
        // Compare the exact PostgreSQL timestamp, not Prisma's millisecond-truncated Date.
        const boundary = cursor ? Prisma.sql`AND (m.created_at,m.id) ${op} (SELECT created_at,id FROM project_team_messages WHERE id=${cursor.id}::uuid)` : options.before ? Prisma.sql`AND m.created_at < ${new Date(options.before)}` : Prisma.empty;
        const text = options.q?.replace(/[\\%_]/g, "\\$&");
        const search = text ? Prisma.sql`AND NOT m.is_deleted AND m.content ILIKE ${"%" + text + "%"}` : Prisma.empty;
        const ids = await db.$queryRaw<Array<{ id: string }>>`SELECT m.id FROM project_team_messages m WHERE m.project_id=${c.project.id}::uuid AND m.thread_id IS NULL ${boundary} ${search} ORDER BY m.created_at ${order}, m.id ${order} LIMIT ${take}`;
        const rows = await db.projectTeamMessage.findMany({ where: { id: { in: ids.map(r => r.id) }, projectId: c.project.id, threadId: null } });
        const byId = new Map(rows.map(r => [r.id, r]));
        return ids.flatMap(r => byId.get(r.id) ? [byId.get(r.id)!] : []);
      };
      if (options.aroundId) {
        const [before, after] = await Promise.all([readPage("lt", Math.floor(limit / 2)), readPage("gt", Math.floor(limit / 2))]);
        return this.hydrateMany([...before.reverse(), cursor!, ...after], db);
      }
      const rows = await readPage(options.afterId ? "gt" : "lt", limit);
      return this.hydrateMany(options.afterId ? rows : rows.reverse(), db);
    });
  }
  async markRead(projectIdInput: string, messageIdInput: string, userIdInput: string) {
    const result = await withWorkspace(projectIdInput, userIdInput, {}, async c => {
      const message = await c.tx.projectTeamMessage.findFirst({ where: { ...whereId(messageIdInput), projectId: c.project.id, threadId: null } });
      if (!message) throw AppError.notFound("Team message not found");
      await c.tx.projectTeamMessageRead.upsert({ where: { messageId_userId: { messageId: message.id, userId: c.actorId } }, create: { messageId: message.id, userId: c.actorId }, update: { readAt: new Date() } });
      return (await this.hydrateMany([message], c.tx))[0]!;
    });
    projectTeamChatEventHub.publish({ type: "message.updated", projectId: result.projectId, message: result, occurredAt: new Date().toISOString() });
    return result;
  }
  async assertCanOpenEvents(projectId: string, userId: string, _userRole?: string) { return withWorkspace(projectId, userId, {}, async c => c.project.id); }
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
      projectTeamChatEventHub.publish({ type: "message.deleted", projectId: row.id, message, occurredAt: new Date().toISOString() });
    }
    return message;
  }
}
export const projectTeamChatService = new ProjectTeamChatService();
