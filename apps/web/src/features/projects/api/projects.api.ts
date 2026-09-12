import type { IProject, CreateProjectRequest, UpdateProjectRequest, AddProjectMemberRequest, AddProjectPaperRequest } from "@trend/shared-types";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

export const projectsApi = {
  async list(): Promise<IProject[]> {
    const res = await api.get(API_ROUTES.projects.list);
    return res.data.data;
  },
  async detail(id: string): Promise<IProject> {
    const res = await api.get(API_ROUTES.projects.detail(id));
    return res.data.data;
  },
  async create(data: CreateProjectRequest): Promise<IProject> {
    const res = await api.post(API_ROUTES.projects.create, data);
    return res.data.data;
  },
  async update(id: string, data: UpdateProjectRequest): Promise<IProject> {
    const res = await api.put(API_ROUTES.projects.update(id), data);
    return res.data.data;
  },
  async delete(id: string): Promise<void> {
    await api.delete(API_ROUTES.projects.delete(id));
  },
  async addPaper(id: string, data: AddProjectPaperRequest): Promise<IProject> {
    const res = await api.post(API_ROUTES.projects.addPaper(id), data);
    return res.data.data;
  },
  async removePaper(id: string, paperId: string): Promise<IProject> {
    const res = await api.delete(API_ROUTES.projects.removePaper(id, paperId));
    return res.data.data;
  },
  async addMember(id: string, data: AddProjectMemberRequest): Promise<IProject> {
    const res = await api.post(API_ROUTES.projects.addMember(id), data);
    return res.data.data;
  },
  async removeMember(id: string, memberId: string): Promise<IProject> {
    const res = await api.delete(API_ROUTES.projects.removeMember(id, memberId));
    return res.data.data;
  },
};
