import type { ProjectTeamChatMessage } from "@trend/shared-types";
import mongoose from "mongoose";
import { AppError } from "../../common/exceptions/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { projectTeamChatEventHub } from "./project-team-chat.events.js";
import { ProjectModel } from "./models/project.model.js";
import { ProjectTeamMessageModel } from "./models/project-team-message.model.js";
import { canAccessProject, idToString, type ProjectScopeLike } from "./project-scope.js";

interface ListTeamMessagesOptions {
  limit: number;
  before?: string;
}

interface DeleteTeamMessageOptions {
  reason?: string;
  userRole?: string;
}

type TeamMessageDoc = {
  _id: unknown;
  projectId: unknown;
  senderId:
    | unknown
    | {
        _id?: unknown;
        fullName?: string;
        email?: string;
        avatarUrl?: string;
      };
  content: string;
  readBy?: Array<
    | unknown
    | {
        _id?: unknown;
        fullName?: string;
        email?: string;
        avatarUrl?: string;
      }
  >;
  isDeleted?: boolean;
  deletedAt?: Date;
  deletedBy?:
    | unknown
    | {
        _id?: unknown;
        fullName?: string;
        email?: string;
        avatarUrl?: string;
      };
  deleteReason?: string;
  createdAt: Date;
};

export class ProjectTeamChatService {
  async sendMessage(
    projectId: string,
    userId: string,
    content: string,
  ): Promise<ProjectTeamChatMessage> {
    const project = await this.assertCanAccess(projectId, userId);
    const trimmed = content.trim();
    if (!trimmed) throw AppError.badRequest("Message content is required");

    const created = await ProjectTeamMessageModel.create({
      projectId: new mongoose.Types.ObjectId(projectId),
      senderId: new mongoose.Types.ObjectId(userId),
      content: trimmed,
      readBy: [new mongoose.Types.ObjectId(userId)],
    });

    const doc = await ProjectTeamMessageModel.findById(created._id)
      .populate("senderId", "fullName email avatarUrl")
      .populate("readBy", "fullName email avatarUrl")
      .populate("deletedBy", "fullName email avatarUrl")
      .lean();
    if (!doc) throw AppError.internal("Team message was created but could not be loaded");
    const message = toTeamChatMessage(doc as unknown as TeamMessageDoc);
    projectTeamChatEventHub.publish({
      type: "message.created",
      projectId,
      message,
      occurredAt: new Date().toISOString(),
    });
    await this.afterMessageSent(projectId, userId, project, message);
    return message;
  }

  async listMessages(
    projectId: string,
    userId: string,
    options: ListTeamMessagesOptions,
  ): Promise<ProjectTeamChatMessage[]> {
    await this.assertCanAccess(projectId, userId);
    const filter: Record<string, unknown> = {
      projectId: new mongoose.Types.ObjectId(projectId),
    };
    if (options.before) {
      filter.createdAt = { $lt: new Date(options.before) };
    }

    const docs = await ProjectTeamMessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(options.limit)
      .populate("senderId", "fullName email avatarUrl")
      .populate("readBy", "fullName email avatarUrl")
      .populate("deletedBy", "fullName email avatarUrl")
      .lean();

    const ids = docs.map((doc) => doc._id);
    if (ids.length > 0) {
      await ProjectTeamMessageModel.updateMany(
        { _id: { $in: ids }, readBy: { $ne: new mongoose.Types.ObjectId(userId) } },
        { $addToSet: { readBy: new mongoose.Types.ObjectId(userId) } },
      );
      const updatedReadMessages: TeamMessageDoc[] = [];
      for (const doc of docs as Array<{ readBy?: unknown[] }>) {
        const readBy: unknown[] = Array.isArray(doc.readBy) ? doc.readBy : [];
        if (!readBy.some((id: unknown) => idToString(id as Parameters<typeof idToString>[0]) === userId)) {
          readBy.push(new mongoose.Types.ObjectId(userId));
          doc.readBy = readBy;
          updatedReadMessages.push(doc as unknown as TeamMessageDoc);
        }
      }
      for (const doc of updatedReadMessages) {
        projectTeamChatEventHub.publish({
          type: "message.updated",
          projectId,
          message: toTeamChatMessage(doc),
          occurredAt: new Date().toISOString(),
        });
      }
    }

    return docs
      .reverse()
      .map((doc) => toTeamChatMessage(doc as unknown as TeamMessageDoc));
  }

  async markRead(
    projectId: string,
    messageId: string,
    userId: string,
  ): Promise<ProjectTeamChatMessage> {
    await this.assertCanAccess(projectId, userId);
    const updated = await ProjectTeamMessageModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(messageId),
        projectId: new mongoose.Types.ObjectId(projectId),
      },
      { $addToSet: { readBy: new mongoose.Types.ObjectId(userId) } },
      { new: true },
    )
      .populate("senderId", "fullName email avatarUrl")
      .populate("readBy", "fullName email avatarUrl")
      .populate("deletedBy", "fullName email avatarUrl")
      .lean();
    if (!updated) throw AppError.notFound("Team message not found");
    const message = toTeamChatMessage(updated as unknown as TeamMessageDoc);
    projectTeamChatEventHub.publish({
      type: "message.updated",
      projectId,
      message,
      occurredAt: new Date().toISOString(),
    });
    return message;
  }

  async assertCanOpenEvents(projectId: string, userId: string, userRole?: string): Promise<void> {
    await this.assertCanAccess(projectId, userId, { allowAdmin: userRole === "admin" });
  }

  async deleteMessage(
    projectId: string,
    messageId: string,
    userId: string,
    options: DeleteTeamMessageOptions | string = {},
  ): Promise<ProjectTeamChatMessage> {
    const reason = typeof options === "string" ? options : options.reason;
    const userRole = typeof options === "string" ? undefined : options.userRole;
    const project = await this.assertCanAccess(projectId, userId, { allowAdmin: userRole === "admin" });
    const doc = await ProjectTeamMessageModel.findOne({
      _id: new mongoose.Types.ObjectId(messageId),
      projectId: new mongoose.Types.ObjectId(projectId),
    })
      .populate("senderId", "fullName email avatarUrl")
      .populate("readBy", "fullName email avatarUrl")
      .populate("deletedBy", "fullName email avatarUrl")
      .exec();

    if (!doc) throw AppError.notFound("Team message not found");
    const senderId = idToString((doc as any).senderId);
    const ownerId = idToString(project.ownerId);
    const canModerate = senderId === userId || ownerId === userId || userRole === "admin";
    if (!canModerate) {
      throw AppError.forbidden("Only the sender, project owner, or admin can delete this message.");
    }

    (doc as any).isDeleted = true;
    (doc as any).deletedAt = new Date();
    (doc as any).deletedBy = new mongoose.Types.ObjectId(userId);
    (doc as any).deleteReason = reason?.trim() || undefined;
    await (doc as any).save();

    await auditService.log("project.team_chat.message_deleted", {
      userId,
      targetTableName: "research_projects",
      targetRecordId: projectId,
      details: { messageId, reason: reason?.trim() || undefined },
    });

    const message = toTeamChatMessage(doc as unknown as TeamMessageDoc);
    projectTeamChatEventHub.publish({
      type: "message.deleted",
      projectId,
      message,
      occurredAt: new Date().toISOString(),
    });
    return message;
  }

  private async assertCanAccess(
    projectId: string,
    userId: string,
    options: { allowAdmin?: boolean } = {},
  ): Promise<ProjectScopeLike> {
    const project = await ProjectModel.findById(projectId).select("ownerId members").lean();
    if (!project) throw AppError.notFound("Project not found");
    if (!canAccessProject(project, userId) && !options.allowAdmin) {
      throw AppError.forbidden("Access denied to this project");
    }
    return project;
  }

  private async afterMessageSent(
    projectId: string,
    userId: string,
    project: ProjectScopeLike,
    message: ProjectTeamChatMessage,
  ): Promise<void> {
    const recipientIds = getProjectMemberUserIds(project).filter((id) => id !== userId);
    await Promise.allSettled([
      auditService.log("project.team_chat.message_sent", {
        userId,
        targetTableName: "research_projects",
        targetRecordId: projectId,
        details: { messageId: message.id },
      }),
      ...recipientIds.map((recipientId) =>
        notificationService.create({
          userId: recipientId,
          title: "New project team message",
          message: `${message.sender.fullName || message.sender.email || "A project member"} sent a message in your project.`,
          type: "project_team_chat",
          targetKind: "project",
          targetId: projectId,
        }),
      ),
    ]);
  }
}

function toTeamChatMessage(doc: TeamMessageDoc): ProjectTeamChatMessage {
  const sender = toSender(doc.senderId);
  const readBy = (doc.readBy ?? []).map(toSender).filter((reader) => reader.id);
  const deletedBy = doc.deletedBy ? toSender(doc.deletedBy) : undefined;

  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    sender,
    content: doc.isDeleted ? "" : doc.content,
    readBy,
    readCount: readBy.length,
    isDeleted: Boolean(doc.isDeleted),
    deletedAt: doc.deletedAt?.toISOString(),
    deletedBy,
    deleteReason: doc.deleteReason,
    createdAt: doc.createdAt.toISOString(),
  };
}

function toSender(value: TeamMessageDoc["senderId"]): ProjectTeamChatMessage["sender"] {
  const sender =
    value && typeof value === "object" && "_id" in value
      ? (value as {
          _id?: unknown;
          fullName?: string;
          email?: string;
          avatarUrl?: string;
        })
      : { _id: value };

  return {
    id: String(sender._id ?? ""),
    fullName: sender.fullName,
    email: sender.email,
    avatarUrl: sender.avatarUrl,
  };
}

function getProjectMemberUserIds(project: ProjectScopeLike): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  const ownerId = idToString(project.ownerId);
  if (ownerId) {
    seen.add(ownerId);
    ids.push(ownerId);
  }
  for (const member of project.members ?? []) {
    const id = idToString(member.targetId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export const projectTeamChatService = new ProjectTeamChatService();
