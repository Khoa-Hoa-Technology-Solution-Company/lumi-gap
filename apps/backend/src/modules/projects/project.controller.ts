import type { Request, Response } from "express";
import { projectService } from "./project.service.js";
import { z } from "zod";

export const createProjectSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
});

export const updateProjectSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
});

export const addMemberSchema = z.object({
  targetKind: z.enum(["User"]),
  targetId: z.string(),
  role: z.enum(["owner", "member"]),
});

export const addPaperSchema = z.object({
  paperId: z.string(),
});

export class ProjectController {
  async createProject(req: Request, res: Response) {
    const data = req.body;
    const userId = req.user!.sub; // assuming passport auth sets req.user

    const project = await projectService.createProject(data, userId);
    res.status(201).json({ success: true, data: project });
  }

  async getProjectsByUser(req: Request, res: Response) {
    const userId = req.user!.sub;
    const projects = await projectService.getProjectsByUser(userId);
    res.json({ success: true, data: projects, meta: { page: 1, pageSize: 0, total: projects.length, totalPages: 1 } });
  }

  async getProjectById(req: Request, res: Response) {
    const id = req.params.id as string;
    const userId = req.user!.sub;
    const project = await projectService.getProjectById(id, userId, req.user!.role);
    res.json({ success: true, data: project });
  }

  async updateProject(req: Request, res: Response) {
    const id = req.params.id as string;
    const data = req.body;
    const userId = req.user!.sub;
    const project = await projectService.updateProject(id, data, userId);
    res.json({ success: true, data: project });
  }

  async deleteProject(req: Request, res: Response) {
    const id = req.params.id as string;
    const userId = req.user!.sub;
    await projectService.deleteProject(id, userId);
    res.json({ success: true, data: { deleted: true } });
  }

  async addPaper(req: Request, res: Response) {
    const id = req.params.id as string;
    const data = req.body;
    const userId = req.user!.sub;
    const project = await projectService.addPaperToProject(id, data.paperId, userId);
    res.json({ success: true, data: project });
  }

  async removePaper(req: Request, res: Response) {
    const id = req.params.id as string;
    const paperId = req.params.paperId as string;
    const userId = req.user!.sub;
    const project = await projectService.removePaperFromProject(id, paperId, userId);
    res.json({ success: true, data: project });
  }

  async addMember(req: Request, res: Response) {
    const id = req.params.id as string;
    const data = req.body;
    const userId = req.user!.sub;
    const project = await projectService.addMemberToProject(id, data, userId);
    res.json({ success: true, data: project });
  }

  async removeMember(req: Request, res: Response) {
    const id = req.params.id as string;
    const memberId = req.params.memberId as string;
    const userId = req.user!.sub;
    const project = await projectService.removeMemberFromProject(id, memberId, userId);
    res.json({ success: true, data: project });
  }
}

export const projectController = new ProjectController();
