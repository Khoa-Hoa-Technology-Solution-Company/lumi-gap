import { ProjectModel, type ProjectDoc } from "./models/project.model.js";
import type { CreateProjectRequest, UpdateProjectRequest, AddProjectMemberRequest } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import mongoose from "mongoose";
import { PaperModel } from "../papers/models/paper.model.js";
import {
  assertProjectHasPapers,
  canAccessProject,
  getProjectPaperIds,
  type ProjectAiFeature,
} from "./project-scope.js";

export class ProjectService {
  /**
   * Create a new project.
   */
  async createProject(data: CreateProjectRequest, ownerId: string): Promise<ProjectDoc> {
    const project = new ProjectModel({
      title: data.title,
      description: data.description,
      ownerId: new mongoose.Types.ObjectId(ownerId),
      members: [
        {
          targetKind: "User",
          targetId: new mongoose.Types.ObjectId(ownerId),
          role: "owner",
        },
      ],
      papers: [],
    });

    return await project.save();
  }

  /**
   * Get all projects where the user is a member (or owner).
   */
  async getProjectsByUser(userId: string): Promise<ProjectDoc[]> {
    return await ProjectModel.find({
      $or: [
        { ownerId: new mongoose.Types.ObjectId(userId) },
        { "members.targetId": new mongoose.Types.ObjectId(userId) },
      ],
    })
      .sort({ updatedAt: -1 })
      .populate("members.targetId", "fullName email avatarUrl")
      .populate("papers.targetId", "title publicationYear")
      .lean();
  }

  /**
   * Get a specific project by ID.
   */
  async getProjectById(projectId: string, userId: string, userRole?: string): Promise<ProjectDoc> {
    const project = await ProjectModel.findById(projectId)
      .populate("members.targetId", "fullName email avatarUrl")
      .populate("papers.targetId", "title publicationYear authors abstractText")
      .lean();
    if (!project) {
      throw AppError.notFound("Project not found");
    }

    if (!canAccessProject(project, userId) && userRole !== "admin") {
      throw AppError.forbidden("Access denied to this project");
    }

    return project;
  }

  /**
   * Resolve project paper ids behind one access check. AI features use this to
   * ensure "project report/gaps/chat" are grounded in the selected workspace,
   * not the global corpus.
   */
  async getProjectPaperIdsForUser(
    projectId: string,
    userId: string,
    feature?: ProjectAiFeature,
  ): Promise<string[]> {
    const project = await ProjectModel.findById(projectId).select("ownerId members papers").lean();
    if (!project) throw AppError.notFound("Project not found");
    if (!canAccessProject(project, userId)) {
      throw AppError.forbidden("Access denied to this project");
    }

    const paperIds = getProjectPaperIds(project);
    if (feature) assertProjectHasPapers(paperIds, feature);
    return paperIds;
  }

  /**
   * Update project details.
   */
  async updateProject(
    projectId: string,
    data: UpdateProjectRequest,
    userId: string,
  ): Promise<ProjectDoc> {
    const project = await ProjectModel.findById(projectId);
    if (!project) throw AppError.notFound("Project not found");

    const isOwner = project.ownerId.toString() === userId || project.members.some(
      (m) => m.targetId.toString() === userId && m.role === "owner"
    );

    if (!isOwner) throw AppError.forbidden("Only owners can update the project details");

    if (data.title !== undefined) project.title = data.title;
    if (data.description !== undefined) project.description = data.description;

    return await project.save();
  }

  /**
   * Delete a project.
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    const project = await ProjectModel.findById(projectId);
    if (!project) throw AppError.notFound("Project not found");

    if (project.ownerId.toString() !== userId) {
      throw AppError.forbidden("Only the primary owner can delete the project");
    }

    await ProjectModel.findByIdAndDelete(projectId);
  }

  /**
   * Add a paper to the project.
   */
  async addPaperToProject(projectId: string, paperId: string, userId: string): Promise<ProjectDoc> {
    if (!mongoose.Types.ObjectId.isValid(paperId)) {
      throw AppError.badRequest("Invalid paper id");
    }

    const project = await ProjectModel.findById(projectId);
    if (!project) throw AppError.notFound("Project not found");

    const hasAccess = project.ownerId.toString() === userId || project.members.some(
      (m) => m.targetId.toString() === userId
    );

    if (!hasAccess) throw AppError.forbidden("Only project members can modify papers");

    const paperExists = await PaperModel.exists({ _id: paperId, dataStatus: "active" });
    if (!paperExists) {
      throw AppError.notFound("Paper not found");
    }

    const updated = await ProjectModel.findOneAndUpdate(
      { _id: projectId, "papers.targetId": { $ne: new mongoose.Types.ObjectId(paperId) } },
      { $push: { papers: { targetKind: "Paper", targetId: new mongoose.Types.ObjectId(paperId) } } },
      { new: true }
    );

    if (!updated) {
      throw AppError.badRequest("Paper already exists in the project");
    }

    return updated;
  }

  /**
   * Remove a paper from the project.
   */
  async removePaperFromProject(projectId: string, paperId: string, userId: string): Promise<ProjectDoc> {
    const project = await ProjectModel.findById(projectId);
    if (!project) throw AppError.notFound("Project not found");

    const hasAccess = project.ownerId.toString() === userId || project.members.some(
      (m) => m.targetId.toString() === userId
    );

    if (!hasAccess) throw AppError.forbidden("Only project members can modify papers");

    const updated = await ProjectModel.findByIdAndUpdate(
      projectId,
      { $pull: { papers: { targetId: new mongoose.Types.ObjectId(paperId) } } },
      { new: true }
    );

    return updated!;
  }

  /**
   * Add a member to the project.
   */
  async addMemberToProject(
    projectId: string,
    memberData: AddProjectMemberRequest,
    userId: string,
  ): Promise<ProjectDoc> {
    const project = await ProjectModel.findById(projectId);
    if (!project) throw AppError.notFound("Project not found");

    const isOwner = project.ownerId.toString() === userId || project.members.some(
      (m) => m.targetId.toString() === userId && m.role === "owner"
    );

    if (!isOwner) throw AppError.forbidden("Only owners can modify project members");

    const updated = await ProjectModel.findOneAndUpdate(
      { _id: projectId, "members.targetId": { $ne: new mongoose.Types.ObjectId(memberData.targetId) } },
      { 
        $push: { 
          members: { 
            targetKind: memberData.targetKind, 
            targetId: new mongoose.Types.ObjectId(memberData.targetId), 
            role: memberData.role 
          } 
        } 
      },
      { new: true }
    );

    if (!updated) {
      throw AppError.badRequest("Member already exists in the project");
    }

    return updated;
  }

  /**
   * Remove a member from the project.
   */
  async removeMemberFromProject(projectId: string, targetId: string, userId: string): Promise<ProjectDoc> {
    const project = await ProjectModel.findById(projectId);
    if (!project) throw AppError.notFound("Project not found");

    if (project.ownerId.toString() === targetId) {
      throw AppError.badRequest("Cannot remove the primary owner");
    }

    const isOwner = project.ownerId.toString() === userId || project.members.some(
      (m) => m.targetId.toString() === userId && m.role === "owner"
    );

    // User can remove themselves, or owners can remove anyone
    const isSelf = targetId === userId;
    if (!isOwner && !isSelf) throw AppError.forbidden("Only owners can remove other members");

    const updated = await ProjectModel.findByIdAndUpdate(
      projectId,
      { $pull: { members: { targetId: new mongoose.Types.ObjectId(targetId) } } },
      { new: true }
    );

    return updated!;
  }
}

export const projectService = new ProjectService();
