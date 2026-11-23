import { api } from "@/services/api-client";
import type { LecturerMatchEvidence, MentorRole, MentorshipDraft, MentorshipAttachment, MentorPolicyInput, InvitationDossier, InvitationDossierInput, PreviewInvitationDossierRequest } from "@trend/shared-types";
import type { MentorRecruitmentPlan, MentorPlanCommand } from "@trend/shared-types";
import type { MentorRolesWorkspace } from "@trend/shared-types";
import type { MentorRelationship, MentorSuggestionScope, MentorSuggestionsResponse, MentorshipRequest, MentorProjectPreview, MentorDiscoverySettings, MentorshipCollection, AcademicPageMeta, AvailableMentor, MentoringPreferences, ProjectMemberUserSummary } from "@trend/shared-types";
export type MentorPreview = MentorProjectPreview;
export type MentorshipItem = MentorshipRequest | MentorRelationship;
import type { AcademicSupportSearch as AcademicSearch } from "@trend/shared-types";
export type { AcademicSupportSearch as AcademicSearch } from "@trend/shared-types";
export type ContextSection = "papers" | "gaps" | "reports" | "evidence" | "members";
export interface MentorWorkspace {
  project: MentorPreview; canManage: boolean; canProvideFeedback: boolean; accessRole: "TEAM" | "MENTOR";
  guidance: { id: string; author?: ProjectMemberUserSummary; attribution: "TEAM" | "MENTOR"; note: string; createdAt: string }[];
  context: {
    description: string; inclusionCriteria: string[]; exclusionCriteria: string[]; section: ContextSection;
    items: { id: string; title: string; body: string; detail?: string }[]; counts: Record<ContextSection, number>; meta: AcademicPageMeta
  };
}
export const academicSupportApi = {
  async roles(id: string): Promise<MentorRolesWorkspace> { return (await api.get(`/projects/${encodeURIComponent(id)}/mentorship-roles`)).data.data; },
  async proposeRoles(id: string, input: { clientKey: string; assignments: Array<{ relationshipId: string; role: MentorRole }> }): Promise<MentorRolesWorkspace> { return (await api.post(`/projects/${encodeURIComponent(id)}/mentorship-roles`, input)).data.data; },
  async respondRoles(id: string, proposalId: string, action: "ACCEPT" | "DECLINE" | "CANCEL"): Promise<MentorRolesWorkspace> { return (await api.post(`/projects/${encodeURIComponent(id)}/mentorship-roles/${encodeURIComponent(proposalId)}/respond`, { action })).data.data; },
  async mentorEvidence(projectId: string, mentorId: string): Promise<LecturerMatchEvidence> { return (await api.get(`/projects/${encodeURIComponent(projectId)}/available-mentors/${encodeURIComponent(mentorId)}/evidence`)).data.data; },
  async plan(id: string): Promise<MentorRecruitmentPlan> { return (await api.get(`/projects/${encodeURIComponent(id)}/mentor-plan`)).data.data; },
  async changePlan(id: string, input: MentorPlanCommand): Promise<MentorRecruitmentPlan> { return (await api.post(`/projects/${encodeURIComponent(id)}/mentor-plan`, input)).data.data; },
  async mine(params: AcademicSearch = {}): Promise<MentorshipCollection> { return (await api.get("/projects/academic-support/mine", { params })).data.data; },
  async list(id: string, params: AcademicSearch = {}): Promise<MentorshipCollection> { return (await api.get(`/projects/${encodeURIComponent(id)}/mentorships`, { params })).data.data; },
  async requestDetail(projectId: string, requestId: string): Promise<MentorshipRequest> { return (await api.get(`/projects/${encodeURIComponent(projectId)}/mentorships/${encodeURIComponent(requestId)}`)).data.data; },
  async preferences(): Promise<MentoringPreferences> { return (await api.get("/projects/academic-support/preferences")).data.data; },
  async savePreferences(input: Partial<Pick<MentoringPreferences, "acceptingMentorships" | "emailEnabled" | "locale">>): Promise<MentoringPreferences> { return (await api.patch("/projects/academic-support/preferences", input)).data.data; },
  async searchMentors(params: AcademicSearch): Promise<{ items: AvailableMentor[]; meta: AcademicPageMeta }> { return (await api.get("/projects/academic-support/available-mentors", { params })).data.data; },
  async mentors(id: string, params: AcademicSearch): Promise<{ items: AvailableMentor[]; meta: AcademicPageMeta }> { return (await api.get(`/projects/${encodeURIComponent(id)}/available-mentors`, { params })).data.data; },
  async opportunities(params: AcademicSearch): Promise<{ items: MentorPreview[]; meta: AcademicPageMeta }> { return (await api.get("/projects/academic-support/opportunities", { params })).data.data; },
  async settings(id: string): Promise<MentorDiscoverySettings> { return (await api.get(`/projects/${encodeURIComponent(id)}/mentorship-discovery`)).data.data; },
  async saveSettings(id: string, input: { supportTypes?: import("@trend/shared-types").ResearchSupportType[]; researchClassification?: import("@trend/shared-types").ResearchClassificationInput; methodologies?: string[]; discovery: string; summary: string; expertise: string[]; researchAreas: string[]; mentoringNeeds: string; expectedVersion?: number }): Promise<MentorDiscoverySettings> { return (await api.put(`/projects/${encodeURIComponent(id)}/mentorship-discovery`, input)).data.data; },
  async suggestions(id: string, page: number, scope?: MentorSuggestionScope): Promise<MentorSuggestionsResponse> { return (await api.get(`/projects/${encodeURIComponent(id)}/mentor-suggestions`, { params: { page, ...(scope ? { scope } : {}) } })).data.data; },
  async suggest(id: string, mentorUserId: string, message: string) { return (await api.post(`/projects/${encodeURIComponent(id)}/mentor-suggestions`, { mentorUserId, message })).data.data; },
  async dismissSuggestion(id: string, suggestionId: string, reason?: string) { return (await api.post(`/projects/${encodeURIComponent(id)}/mentor-suggestions/${encodeURIComponent(suggestionId)}/dismiss`, reason?.trim() ? { reason: reason.trim() } : {})).data.data; },
  async request(id: string, mentorUserId: string, message: string, idempotencyKey: string, content?: { mentorRole: MentorRole; attachmentIds: string[]; access?: MentorPolicyInput; expectedPreviewToken?: string; candidateId?: string; expectedPlanVersion?: number; dossier?: InvitationDossierInput; applicationId?: string; expectedApplicationVersion?: number }) { return (await api.post(`/projects/${encodeURIComponent(id)}/mentorships`, { mentorUserId, message, idempotencyKey, ...content })).data.data; },
  async previewDossier(id: string, input: PreviewInvitationDossierRequest): Promise<InvitationDossier> { return (await api.post(`/projects/${encodeURIComponent(id)}/mentorships/dossier-preview`, input)).data.data; },
  async offer(id: string, message: string, idempotencyKey: string, content?: { mentorRole: MentorRole; attachmentIds: string[] }) { return (await api.post(`/projects/${encodeURIComponent(id)}/mentorship-offers`, { message, idempotencyKey, ...content })).data.data; },
  async draft(projectId: string, direction: string): Promise<MentorshipDraft> { return (await api.get("/projects/academic-support/content/draft", { params: { projectId, direction } })).data.data; },
  async saveDraft(projectId: string, direction: string, input: { message: string; mentorRole: MentorRole; attachmentIds: string[]; expectedVersion: number }): Promise<MentorshipDraft> { return (await api.put("/projects/academic-support/content/draft", { projectId, direction, ...input })).data.data; },
  async uploadAttachment(projectId: string, direction: string, file: File): Promise<MentorshipAttachment> { const body = new FormData(); body.append("file", file); return (await api.post("/projects/academic-support/content/attachments", body, { params: { projectId, direction } })).data.data; },
  async attachment(id: string): Promise<Blob> { return (await api.get(`/projects/academic-support/content/attachments/${encodeURIComponent(id)}`, { responseType: "blob" })).data; },
  async respond(item: MentorshipItem, action: "accept" | "decline" | "cancel" | "end", note: string) { return (await api.post(`/projects/${encodeURIComponent(item.projectId)}/mentorships/${encodeURIComponent(item.id)}/${action}`, { note, ...(action === "accept" && item.accessPolicy ? { expectedAccessVersion: item.accessPolicy.version } : {}), ...(action === "accept" && item.kind === "REQUEST" && item.previewToken ? { expectedPreviewToken: item.previewToken } : {}) })).data.data; },
  async requestInfo(item: MentorshipItem, note: string) { return (await api.post(`/projects/${encodeURIComponent(item.projectId)}/mentorships/${encodeURIComponent(item.id)}/request-info`, { note })).data.data; },
  async workspace(id: string, params: { section?: ContextSection; page?: number } = {}): Promise<MentorWorkspace> { return (await api.get(`/projects/${encodeURIComponent(id)}/academic-support`, { params })).data.data; },
  async guidance(id: string, note: string): Promise<MentorWorkspace> { return (await api.post(`/projects/${encodeURIComponent(id)}/academic-support/guidance`, { note })).data.data; },
};
