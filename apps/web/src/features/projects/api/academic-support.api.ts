import { api } from "@/services/api-client";
import type { MentorRelationship, MentorshipRequest, MentorProjectPreview, MentorshipCollection, AcademicPageMeta, AvailableMentor, MentoringPreferences, ProjectMemberUserSummary } from "@trend/shared-types";
export type MentorPreview = MentorProjectPreview;
export type MentorshipItem = MentorshipRequest | MentorRelationship;
export interface AcademicSearch { q?: string; page?: number; pageSize?: number; institution?: string; area?: string; interest?: string; position?: string }
export type ContextSection = "papers" | "gaps" | "reports" | "evidence" | "members";
export interface MentorWorkspace {
  project: MentorPreview; canManage: boolean; canProvideFeedback: boolean; accessRole: "TEAM" | "MENTOR";
  guidance: { id: string; author?: ProjectMemberUserSummary; attribution: "TEAM" | "MENTOR"; note: string; createdAt: string }[];
  context: { description: string; inclusionCriteria: string[]; exclusionCriteria: string[]; section: ContextSection;
    items: { id: string; title: string; body: string; detail?: string }[]; counts: Record<ContextSection, number>; meta: AcademicPageMeta };
}
export const academicSupportApi = {
  async mine(params: AcademicSearch = {}): Promise<MentorshipCollection> { return (await api.get("/projects/academic-support/mine", { params })).data.data; },
  async list(id: string, params: AcademicSearch = {}): Promise<MentorshipCollection> { return (await api.get(`/projects/${encodeURIComponent(id)}/mentorships`, { params })).data.data; },
  async preferences(): Promise<MentoringPreferences> { return (await api.get("/projects/academic-support/preferences")).data.data; },
  async savePreferences(input: Partial<Omit<MentoringPreferences, "canEnable">>): Promise<MentoringPreferences> { return (await api.patch("/projects/academic-support/preferences", input)).data.data; },
  async mentors(id: string, params: AcademicSearch): Promise<{ items: AvailableMentor[]; meta: AcademicPageMeta }> { return (await api.get(`/projects/${encodeURIComponent(id)}/available-mentors`, { params })).data.data; },
  async opportunities(params: AcademicSearch): Promise<{ items: MentorPreview[]; meta: AcademicPageMeta }> { return (await api.get("/projects/academic-support/opportunities", { params })).data.data; },
  async settings(id: string): Promise<MentorPreview> { return (await api.get(`/projects/${encodeURIComponent(id)}/mentorship-discovery`)).data.data; },
  async saveSettings(id: string, input: { discovery: string; summary: string; expertise: string[] }): Promise<MentorPreview> { return (await api.put(`/projects/${encodeURIComponent(id)}/mentorship-discovery`, input)).data.data; },
  async request(id: string, mentorUserId: string, message: string, idempotencyKey: string) { return (await api.post(`/projects/${encodeURIComponent(id)}/mentorships`, { mentorUserId, message, idempotencyKey })).data.data; },
  async offer(id: string, message: string, idempotencyKey: string) { return (await api.post(`/projects/${encodeURIComponent(id)}/mentorship-offers`, { message, idempotencyKey })).data.data; },
  async respond(item: MentorshipItem, action: "accept" | "decline" | "cancel" | "end", note: string) { return (await api.post(`/projects/${encodeURIComponent(item.projectId)}/mentorships/${encodeURIComponent(item.id)}/${action}`, { note })).data.data; },
  async workspace(id: string, params: { section?: ContextSection; page?: number } = {}): Promise<MentorWorkspace> { return (await api.get(`/projects/${encodeURIComponent(id)}/academic-support`, { params })).data.data; },
  async guidance(id: string, note: string): Promise<MentorWorkspace> { return (await api.post(`/projects/${encodeURIComponent(id)}/academic-support/guidance`, { note })).data.data; },
};
