import { describe, expect, it, vi, beforeEach } from "vitest";
import { projectService } from "../project.service.js";
import { ProjectModel } from "../models/project.model.js";
import { AppError } from "../../../common/exceptions/app-error.js";
import mongoose from "mongoose";
import { PaperModel } from "../../papers/models/paper.model.js";

// Mock the Mongoose model
vi.mock("../models/project.model.js", () => {
  return {
    ProjectModel: {
      find: vi.fn(),
      findById: vi.fn(),
      findByIdAndDelete: vi.fn(),
      findOneAndUpdate: vi.fn(),
      findByIdAndUpdate: vi.fn(),
    }
  };
});

vi.mock("../../papers/models/paper.model.js", () => ({
  PaperModel: {
    exists: vi.fn(),
  },
}));

describe("ProjectService", () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const projectId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProjectsByUser", () => {
    it("should return projects for the user", async () => {
      const mockProjects = [{ _id: projectId, title: "Test Project" }];
      const mockQuery = {
        sort: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockProjects),
      };
      vi.mocked(ProjectModel.find).mockReturnValue(mockQuery as any);

      const result = await projectService.getProjectsByUser(userId);
      expect(result).toEqual(mockProjects);
      expect(ProjectModel.find).toHaveBeenCalled();
    });
  });

  describe("getProjectById", () => {
    it("should return project if user is owner", async () => {
      const mockProject = {
        _id: projectId,
        ownerId: userId,
        members: [],
      };
      vi.mocked(ProjectModel.findById).mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockProject),
      } as any);

      const result = await projectService.getProjectById(projectId, userId);
      expect(result).toEqual(mockProject);
    });

    it("should return project if user is a member", async () => {
      const mockProject = {
        _id: projectId,
        ownerId: new mongoose.Types.ObjectId().toString(),
        members: [{ targetId: userId, targetKind: "User", role: "member" }],
      };
      vi.mocked(ProjectModel.findById).mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockProject),
      } as any);

      const result = await projectService.getProjectById(projectId, userId);
      expect(result).toEqual(mockProject);
    });

    it("should throw 403 if user has no access", async () => {
      const mockProject = {
        _id: projectId,
        ownerId: new mongoose.Types.ObjectId().toString(),
        members: [],
      };
      vi.mocked(ProjectModel.findById).mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockProject),
      } as any);

      await expect(projectService.getProjectById(projectId, userId)).rejects.toThrow(AppError);
    });

    it("should return project for admin moderation even when admin is not a member", async () => {
      const mockProject = {
        _id: projectId,
        ownerId: new mongoose.Types.ObjectId().toString(),
        members: [],
      };
      vi.mocked(ProjectModel.findById).mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockProject),
      } as any);

      const result = await projectService.getProjectById(projectId, userId, "admin");
      expect(result).toEqual(mockProject);
    });

    it("should throw 404 if project not found", async () => {
      vi.mocked(ProjectModel.findById).mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(null),
      } as any);

      await expect(projectService.getProjectById(projectId, userId)).rejects.toThrow(AppError);
    });
  });

  describe("updateProject", () => {
    it("should allow owner to update", async () => {
      const mockProject = {
        _id: projectId,
        ownerId: userId,
        members: [],
        save: vi.fn().mockResolvedValue({ _id: projectId, title: "New Title" })
      };
      vi.mocked(ProjectModel.findById).mockResolvedValue(mockProject as any);

      const result = await projectService.updateProject(projectId, { title: "New Title" }, userId);
      expect(result.title).toBe("New Title");
      expect(mockProject.save).toHaveBeenCalled();
    });

    it("should allow members with owner role to update", async () => {
      const mockProject = {
        _id: projectId,
        ownerId: new mongoose.Types.ObjectId().toString(),
        members: [{ targetId: userId, targetKind: "User", role: "owner" }],
        save: vi.fn().mockResolvedValue({ _id: projectId, title: "New Title 2" })
      };
      vi.mocked(ProjectModel.findById).mockResolvedValue(mockProject as any);

      const result = await projectService.updateProject(projectId, { title: "New Title 2" }, userId);
      expect(result.title).toBe("New Title 2");
      expect(mockProject.save).toHaveBeenCalled();
    });

    it("should throw 403 if normal member tries to update", async () => {
      const mockProject = {
        _id: projectId,
        ownerId: new mongoose.Types.ObjectId().toString(),
        members: [{ targetId: userId, targetKind: "User", role: "member" }],
      };
      vi.mocked(ProjectModel.findById).mockResolvedValue(mockProject as any);

      await expect(projectService.updateProject(projectId, { title: "Fail" }, userId)).rejects.toThrow(AppError);
    });
  });

  describe("deleteProject", () => {
    it("should allow primary owner to delete", async () => {
      const mockProject = {
        _id: projectId,
        ownerId: userId,
      };
      vi.mocked(ProjectModel.findById).mockResolvedValue(mockProject as any);
      vi.mocked(ProjectModel.findByIdAndDelete).mockResolvedValue(mockProject as any);

      await projectService.deleteProject(projectId, userId);
      expect(ProjectModel.findByIdAndDelete).toHaveBeenCalledWith(projectId);
    });

    it("should throw 403 if non-primary owner tries to delete", async () => {
      const mockProject = {
        _id: projectId,
        ownerId: new mongoose.Types.ObjectId().toString(),
        members: [{ targetId: userId, targetKind: "User", role: "owner" }],
      };
      vi.mocked(ProjectModel.findById).mockResolvedValue(mockProject as any);

      await expect(projectService.deleteProject(projectId, userId)).rejects.toThrow(AppError);
    });
  });

  describe("addPaperToProject", () => {
    it("adds only an active, visible paper", async () => {
      const paperId = new mongoose.Types.ObjectId().toString();
      vi.mocked(ProjectModel.findById).mockResolvedValue({
        _id: projectId,
        ownerId: userId,
        members: [],
      } as any);
      vi.mocked(PaperModel.exists).mockResolvedValue({ _id: paperId } as any);
      vi.mocked(ProjectModel.findOneAndUpdate).mockResolvedValue({
        _id: projectId,
        papers: [{ targetId: paperId, targetKind: "Paper" }],
      } as any);

      const result = await projectService.addPaperToProject(projectId, paperId, userId);

      expect(result).toBeDefined();
      expect(PaperModel.exists).toHaveBeenCalledWith({ _id: paperId, dataStatus: "active" });
    });

    it("rejects a missing or non-active paper", async () => {
      const paperId = new mongoose.Types.ObjectId().toString();
      vi.mocked(ProjectModel.findById).mockResolvedValue({
        _id: projectId,
        ownerId: userId,
        members: [],
      } as any);
      vi.mocked(PaperModel.exists).mockResolvedValue(null);

      await expect(
        projectService.addPaperToProject(projectId, paperId, userId),
      ).rejects.toThrow("Paper not found");
      expect(ProjectModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("addMemberToProject", () => {
    it("should allow owner to add members", async () => {
      const mockProject = {
        _id: projectId,
        ownerId: userId,
        members: [],
      };
      vi.mocked(ProjectModel.findById).mockResolvedValue(mockProject as any);
      
      const newMemberId = new mongoose.Types.ObjectId().toString();
      vi.mocked(ProjectModel.findOneAndUpdate).mockResolvedValue({
        _id: projectId,
        members: [{ targetId: newMemberId, targetKind: "User", role: "member" }]
      } as any);

      const result = await projectService.addMemberToProject(projectId, { targetId: newMemberId, targetKind: "User", role: "member" }, userId);
      expect(result).toBeDefined();
      expect(ProjectModel.findOneAndUpdate).toHaveBeenCalled();
    });

    it("should throw 403 if normal member tries to add members", async () => {
      const mockProject = {
        _id: projectId,
        ownerId: new mongoose.Types.ObjectId().toString(),
        members: [{ targetId: userId, targetKind: "User", role: "member" }],
      };
      vi.mocked(ProjectModel.findById).mockResolvedValue(mockProject as any);

      const newMemberId = new mongoose.Types.ObjectId().toString();
      await expect(projectService.addMemberToProject(projectId, { targetId: newMemberId, targetKind: "User", role: "member" }, userId)).rejects.toThrow(AppError);
    });
  });
});
