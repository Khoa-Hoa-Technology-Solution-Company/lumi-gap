import type {
  AddProjectMemberRequest,
  AddProjectPaperRequest,
  CreateProjectRequest,
  IProject,
  ProjectChatHistoryResponse,
  ProjectChatMessage,
  SendProjectChatMessageResponse,
  UpdateProjectRequest,
} from "@trend/shared-types";

import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export type ProjectMemberView = Omit<IProject["members"][number], "targetId"> & {
  targetId: string | { _id?: string; id?: string; fullName?: string; email?: string; avatarUrl?: string };
};

export type ProjectPaperView = Omit<IProject["papers"][number], "targetId"> & {
  targetId: string | {
    _id?: string;
    id?: string;
    title?: string;
    publicationYear?: number;
    authors?: { displayName: string }[];
    abstractText?: string;
    abstract?: string;
  };
};

export type ProjectView = Omit<IProject, "members" | "papers"> & {
  members: ProjectMemberView[];
  papers: ProjectPaperView[];
};

export const projectsApi = {
  async list(): Promise<ProjectView[]> {
    const res = await api.get(API_ROUTES.projects.list);
    return res.data.data;
  },

  async detail(id: string): Promise<ProjectView> {
    const res = await api.get(API_ROUTES.projects.detail(id));
    return res.data.data;
  },

  async create(data: CreateProjectRequest): Promise<ProjectView> {
    const res = await api.post(API_ROUTES.projects.create, data);
    return res.data.data;
  },

  async update(id: string, data: UpdateProjectRequest): Promise<ProjectView> {
    const res = await api.put(API_ROUTES.projects.update(id), data);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(API_ROUTES.projects.delete(id));
  },

  async addPaper(id: string, data: AddProjectPaperRequest): Promise<ProjectView> {
    const res = await api.post(API_ROUTES.projects.addPaper(id), data);
    return res.data.data;
  },

  async removePaper(id: string, paperId: string): Promise<ProjectView> {
    const res = await api.delete(API_ROUTES.projects.removePaper(id, paperId));
    return res.data.data;
  },

  async addMember(id: string, data: AddProjectMemberRequest): Promise<ProjectView> {
    const res = await api.post(API_ROUTES.projects.addMember(id), data);
    return res.data.data;
  },

  async removeMember(id: string, memberId: string): Promise<ProjectView> {
    const res = await api.delete(API_ROUTES.projects.removeMember(id, memberId));
    return res.data.data;
  },

  async listChat(projectId: string, limit = 50): Promise<ProjectChatMessage[]> {
    const res = await api.get<{
      success: boolean;
      data: ProjectChatHistoryResponse;
    }>(API_ROUTES.projects.chat.history(projectId), { params: { limit } });
    return res.data.data.messages;
  },

  async sendChat(projectId: string, message: string): Promise<SendProjectChatMessageResponse> {
    const res = await api.post<{
      success: boolean;
      data: SendProjectChatMessageResponse;
    }>(API_ROUTES.projects.chat.send(projectId), { message });
    return res.data.data;
  },
};
