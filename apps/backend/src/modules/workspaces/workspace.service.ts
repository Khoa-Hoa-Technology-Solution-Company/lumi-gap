import type { UserRole } from "@trend/shared-types";
import mongoose from "mongoose";
import { AppError } from "../../common/exceptions/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { UserModel } from "../auth/models/user.model.js";
import { ProjectModel } from "../projects/models/project.model.js";
import { canAccessProject } from "../projects/project-scope.js";
import { DraftWorkspaceModel, SectionRevisionModel, WorkspaceCommentModel, WorkspaceSectionModel } from "./workspace.model.js";

function isWorkspaceManager(role: UserRole): boolean {
  return role === "moderator" || role === "admin";
}

async function getWorkspaceOrThrow(workspaceId: string) {
  const workspace = await DraftWorkspaceModel.findById(workspaceId);
  if (!workspace) throw AppError.notFound("Draft workspace not found");
  return workspace;
}

async function assertWorkspaceAccess(workspaceId: string, userId: string, role: UserRole) {
  const workspace = await getWorkspaceOrThrow(workspaceId);
  if (isWorkspaceManager(role) || workspace.memberIds.some((id) => id.toString() === userId)) return workspace;
  const project = await ProjectModel.findById(workspace.projectId).select("ownerId members").lean();
  if (!project || !canAccessProject(project, userId)) throw AppError.forbidden("Workspace membership is required");
  return workspace;
}

function duplicateKey(error: unknown): boolean {
  return (error as { code?: number }).code === 11000;
}

export const workspaceService = {
  async create(input: { projectId: string; name: string; memberIds?: string[] }, actorId: string, actorRole: UserRole) {
    const project = await ProjectModel.findById(input.projectId).select("ownerId members").lean();
    if (!project) throw AppError.notFound("Project not found");
    if (!canAccessProject(project, actorId) && !isWorkspaceManager(actorRole)) {
      throw AppError.forbidden("Project membership is required");
    }
    const memberIds = [...new Set([actorId, ...(input.memberIds ?? [])])];
    if (await UserModel.countDocuments({ _id: { $in: memberIds }, isActive: true }) !== memberIds.length) {
      throw AppError.badRequest("One or more workspace members are invalid");
    }
    try {
      const workspace = await DraftWorkspaceModel.create({ ...input, memberIds, createdBy: actorId });
      await auditService.log("workspace.created", {
        userId: actorId,
        targetTableName: "draft_workspaces",
        targetRecordId: workspace.id,
        details: { projectId: input.projectId },
      });
      return workspace;
    } catch (error) {
      if (duplicateKey(error)) throw AppError.conflict("This project already has a draft workspace");
      throw error;
    }
  },

  async get(workspaceId: string, actorId: string, actorRole: UserRole) {
    const workspace = await assertWorkspaceAccess(workspaceId, actorId, actorRole);
    const [sections, comments] = await Promise.all([
      WorkspaceSectionModel.find({ workspaceId }).sort({ order: 1, createdAt: 1 }).lean(),
      WorkspaceCommentModel.find({ workspaceId }).populate("authorId", "fullName avatarUrl").sort({ createdAt: 1 }).lean(),
    ]);
    return { workspace, sections, comments };
  },

  async createSection(
    workspaceId: string,
    input: { title: string; content?: string; order?: number },
    actorId: string,
    actorRole: UserRole,
  ) {
    await assertWorkspaceAccess(workspaceId, actorId, actorRole);
    const order = input.order ?? await WorkspaceSectionModel.countDocuments({ workspaceId });
    const section = await WorkspaceSectionModel.create({
      workspaceId,
      title: input.title,
      content: input.content ?? "",
      order,
      version: 1,
      createdBy: actorId,
      updatedBy: actorId,
    });
    try {
      await SectionRevisionModel.create({
        workspaceId,
        sectionId: section._id,
        version: 1,
        title: section.title,
        content: section.content,
        order: section.order,
        changedBy: actorId,
        changeSummary: "Initial section",
      });
    } catch (error) {
      await section.deleteOne().catch(() => undefined);
      throw error;
    }
    await auditService.log("workspace.section.created", {
      userId: actorId,
      targetTableName: "workspace_sections",
      targetRecordId: section.id,
      details: { workspaceId, version: 1 },
    });
    return section;
  },

  async updateSection(
    workspaceId: string,
    sectionId: string,
    input: { expectedVersion: number; title?: string; content?: string; order?: number; changeSummary?: string },
    actorId: string,
    actorRole: UserRole,
  ) {
    await assertWorkspaceAccess(workspaceId, actorId, actorRole);
    const update: Record<string, unknown> = { updatedBy: new mongoose.Types.ObjectId(actorId) };
    if (input.title !== undefined) update.title = input.title;
    if (input.content !== undefined) update.content = input.content;
    if (input.order !== undefined) update.order = input.order;
    const section = await WorkspaceSectionModel.findOneAndUpdate(
      { _id: sectionId, workspaceId, version: input.expectedVersion },
      { $set: update, $inc: { version: 1 } },
      { new: true, runValidators: true },
    );
    if (!section) {
      const exists = await WorkspaceSectionModel.exists({ _id: sectionId, workspaceId });
      if (!exists) throw AppError.notFound("Workspace section not found");
      throw AppError.conflict("Section was changed by another editor; reload before saving");
    }
    await SectionRevisionModel.create({
      workspaceId,
      sectionId,
      version: section.version,
      title: section.title,
      content: section.content,
      order: section.order,
      changedBy: actorId,
      changeSummary: input.changeSummary,
    });
    await auditService.log("workspace.section.updated", {
      userId: actorId,
      targetTableName: "workspace_sections",
      targetRecordId: section.id,
      details: { workspaceId, previousVersion: input.expectedVersion, version: section.version },
    });
    return section;
  },

  async listSectionRevisions(workspaceId: string, sectionId: string, actorId: string, actorRole: UserRole) {
    await assertWorkspaceAccess(workspaceId, actorId, actorRole);
    if (!(await WorkspaceSectionModel.exists({ _id: sectionId, workspaceId }))) throw AppError.notFound("Workspace section not found");
    return SectionRevisionModel.find({ workspaceId, sectionId }).sort({ version: -1 }).lean();
  },

  async addComment(
    workspaceId: string,
    sectionId: string,
    body: string,
    actorId: string,
    actorRole: UserRole,
  ) {
    await assertWorkspaceAccess(workspaceId, actorId, actorRole);
    const section = await WorkspaceSectionModel.findOne({ _id: sectionId, workspaceId }).select("version").lean();
    if (!section) throw AppError.notFound("Workspace section not found");
    const comment = await WorkspaceCommentModel.create({
      workspaceId,
      sectionId,
      authorId: actorId,
      body,
      sectionVersion: section.version,
    });
    await auditService.log("workspace.comment.created", {
      userId: actorId,
      targetTableName: "workspace_comments",
      targetRecordId: comment.id,
      details: { workspaceId, sectionId, sectionVersion: section.version },
    });
    return comment;
  },

  async updateComment(
    workspaceId: string,
    commentId: string,
    status: "open" | "resolved",
    actorId: string,
    actorRole: UserRole,
  ) {
    await assertWorkspaceAccess(workspaceId, actorId, actorRole);
    const comment = await WorkspaceCommentModel.findOne({ _id: commentId, workspaceId });
    if (!comment) throw AppError.notFound("Workspace comment not found");
    comment.status = status;
    comment.resolvedBy = status === "resolved" ? new mongoose.Types.ObjectId(actorId) : undefined;
    comment.resolvedAt = status === "resolved" ? new Date() : undefined;
    await comment.save();
    await auditService.log("workspace.comment.status_updated", {
      userId: actorId,
      targetTableName: "workspace_comments",
      targetRecordId: comment.id,
      details: { workspaceId, status },
    });
    return comment;
  },
};
