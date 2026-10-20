import { api } from "@/services/api-client";
import type { MentorRole, MentorshipDraft, MentorshipAttachment } from "@trend/shared-types";
import type { MentorRelationship, MentorSuggestion, MentorshipRequest, MentorProjectPreview, MentorDiscoverySettings, MentorshipCollection, AcademicPageMeta, AvailableMentor, MentoringPreferences, ProjectMemberUserSummary } from "@trend/shared-types";
export type MentorPreview = MentorProjectPreview;
export type MentorshipItem = MentorshipRequest | MentorRelationship;
import type { AcademicSupportSearch as AcademicSearch } from "@trend/shared-types";
export type { AcademicSupportSearch as AcademicSearch } from "@trend/shared-types";
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
  async settings(id: string): Promise<MentorDiscoverySettings> { return (await api.get(`/projects/${encodeURIComponent(id)}/mentorship-discovery`)).data.data; },
  async saveSettings(id: string, input: { discovery: string; summary: string; expertise: string[]; researchAreas: string[]; mentoringNeeds: string; expectedVersion?: number }): Promise<MentorDiscoverySettings> { return (await api.put(`/projects/${encodeURIComponent(id)}/mentorship-discovery`, input)).data.data; },
  async suggestions(id: string, page: number): Promise<{ items: MentorSuggestion[]; meta: AcademicPageMeta }> { return (await api.get(`/projects/${encodeURIComponent(id)}/mentor-suggestions`, { params: { page } })).data.data; },
  async suggest(id: string, mentorUserId: string, message: string) { return (await api.post(`/projects/${encodeURIComponent(id)}/mentor-suggestions`, { mentorUserId, message })).data.data; },
  async dismissSuggestion(id: string, suggestionId: string) { return (await api.post(`/projects/${encodeURIComponent(id)}/mentor-suggestions/${encodeURIComponent(suggestionId)}/dismiss`, {})).data.data; },
  async request(id: string, mentorUserId: string, message: string, idempotencyKey: string, content?: { mentorRole: MentorRole; attachmentIds: string[] }) { return (await api.post(`/projects/${encodeURIComponent(id)}/mentorships`, { mentorUserId, message, idempotencyKey, ...content })).data.data; },
  async offer(id: string, message: string, idempotencyKey: string, content?: { mentorRole: MentorRole; attachmentIds: string[] }) { return (await api.post(`/projects/${encodeURIComponent(id)}/mentorship-offers`, { message, idempotencyKey, ...content })).data.data; },
  async draft(projectId: string, direction: string): Promise<MentorshipDraft> { return (await api.get("/projects/academic-support/content/draft", { params: { projectId, direction } })).data.data; },
  async saveDraft(projectId: string, direction: string, input: { message: string; mentorRole: MentorRole; attachmentIds: string[]; expectedVersion: number }): Promise<MentorshipDraft> { return (await api.put("/projects/academic-support/content/draft", { projectId, direction, ...input })).data.data; },
  async uploadAttachment(projectId: string, direction: string, file: File): Promise<MentorshipAttachment> { const body = new FormData(); body.append("file", file); return (await api.post("/projects/academic-support/content/attachments", body, { params: { projectId, direction } })).data.data; },
  async attachment(id: string): Promise<Blob> { return (await api.get(`/projects/academic-support/content/attachments/${encodeURIComponent(id)}`, { responseType: "blob" })).data; },
  async respond(item: MentorshipItem, action: "accept" | "decline" | "cancel" | "end", note: string) { return (await api.post(`/projects/${encodeURIComponent(item.projectId)}/mentorships/${encodeURIComponent(item.id)}/${action}`, { note })).data.data; },
  async workspace(id: string, params: { section?: ContextSection; page?: number } = {}): Promise<MentorWorkspace> { return (await api.get(`/projects/${encodeURIComponent(id)}/academic-support`, { params })).data.data; },
  async guidance(id: string, note: string): Promise<MentorWorkspace> { return (await api.post(`/projects/${encodeURIComponent(id)}/academic-support/guidance`, { note })).data.data; },
};
