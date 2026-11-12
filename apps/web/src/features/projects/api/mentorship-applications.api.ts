import { api } from "@/services/api-client";
import type { MentorshipApplicationInput, MentorshipApplicationView, MentorshipApplicationDetail, AcademicPageMeta } from "@trend/shared-types";
const root = (id: string) => `/projects/${encodeURIComponent(id)}/mentorship-applications`;
export const mentorshipApplicationsApi = {
  async list(projectId: string, page = 1): Promise<{ items: MentorshipApplicationView[]; meta: AcademicPageMeta }> { return (await api.get(root(projectId), { params: { page } })).data.data; },
  async mine(page = 1): Promise<{ items: MentorshipApplicationView[]; meta: AcademicPageMeta }> { return (await api.get("/projects/academic-support/applications", { params: { page } })).data.data; },
  async apply(projectId: string, input: MentorshipApplicationInput): Promise<{ id: string }> { return (await api.post(root(projectId), input)).data.data; },
  async detail(projectId: string, id: string): Promise<MentorshipApplicationDetail> { return (await api.get(`${root(projectId)}/${encodeURIComponent(id)}`)).data.data; },
  async action(projectId: string, item: MentorshipApplicationView, action: "SHORTLIST" | "DECLINE" | "WITHDRAW"): Promise<MentorshipApplicationDetail> { return (await api.post(`${root(projectId)}/${encodeURIComponent(item.id)}/action`, { action, expectedVersion: item.version })).data.data; },
  async note(projectId: string, id: string, body: string, clientKey: string): Promise<MentorshipApplicationDetail> { return (await api.post(`${root(projectId)}/${encodeURIComponent(id)}/notes`, { body, clientKey })).data.data; },
};
