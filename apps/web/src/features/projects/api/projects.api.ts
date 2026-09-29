import type {
  IProject,
  CreateProjectRequest,
  UpdateProjectRequest,
  AddProjectMemberRequest,
  AddProjectPaperRequest,
  ProjectContributionProposal,
  ProposeProjectContributionRequest,
  ResolveProjectContributionRequest,
  IncomingProjectInvitation,
  ProjectInvitationPreview,
  InviteProjectMemberRequest,
  ProjectActivity,
  UpdateProjectPaperRequest,
  MentorRelationship,
  RequestMentorRelationshipRequest,
  RespondMentorRelationshipRequest,
} from "@trend/shared-types";
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
  async updatePaper(id: string, paperId: string, data: UpdateProjectPaperRequest): Promise<void> {
    await api.patch(API_ROUTES.projects.updatePaper(id, paperId), data);
  },
  async addMember(id: string, data: AddProjectMemberRequest): Promise<IProject> {
    const res = await api.post(API_ROUTES.projects.addMember(id), data);
    return res.data.data;
  },
  async removeMember(id: string, memberId: string): Promise<IProject> {
    const res = await api.delete(API_ROUTES.projects.removeMember(id, memberId));
    return res.data.data;
  },
  async inviteMember(id: string, data: InviteProjectMemberRequest): Promise<void> {
    await api.post(API_ROUTES.projects.invitations.create(id), data);
  },
  async cancelInvitation(id: string, invitationId: string): Promise<void> {
    await api.post(API_ROUTES.projects.invitations.cancel(id, invitationId));
  },
  async listMyInvitations(): Promise<IncomingProjectInvitation[]> {
    const res = await api.get(API_ROUTES.projects.invitations.mine);
    return res.data.data;
  },
  async respondToInvitation(projectId: string, invitationId: string, decision: "accept" | "decline"): Promise<void> {
    await api.post(decision === "accept" ? API_ROUTES.projects.invitations.accept(projectId, invitationId) : API_ROUTES.projects.invitations.decline(projectId, invitationId));
  },
  async invitationPreview(token: string): Promise<ProjectInvitationPreview> {
    const res = await api.get(API_ROUTES.projects.invitations.preview(token));
    return res.data.data;
  },
  async respondToInvitationToken(token: string, decision: "accept" | "decline"): Promise<{ status: "ACCEPTED" | "DECLINED"; alreadyMember: boolean }> {
    const res = await api.post(decision === "accept" ? API_ROUTES.projects.invitations.acceptToken(token) : API_ROUTES.projects.invitations.declineToken(token));
    return res.data.data;
  },
  async archive(id: string): Promise<IProject> {
    const res = await api.post(API_ROUTES.projects.archive(id));
    return res.data.data;
  },
  async leave(id: string): Promise<void> {
    await api.post(API_ROUTES.projects.leave(id));
  },
  async transferOwnership(id: string, userId: string): Promise<IProject> {
    const res = await api.post(API_ROUTES.projects.transferOwnership(id), { userId });
    return res.data.data;
  },
  async activity(id: string): Promise<ProjectActivity[]> {
    const res = await api.get(API_ROUTES.projects.activity(id));
    return res.data.data;
  },
  async mentorships(id: string): Promise<MentorRelationship[]> {
    const res = await api.get(API_ROUTES.projects.mentorships.list(id));
    return res.data.data;
  },
  async requestMentorship(id: string, data: RequestMentorRelationshipRequest): Promise<MentorRelationship> {
    const res = await api.post(API_ROUTES.projects.mentorships.request(id), data);
    return res.data.data;
  },
  async acceptMentorship(id: string, relationshipId: string, data: RespondMentorRelationshipRequest = {}): Promise<MentorRelationship> {
    const res = await api.post(API_ROUTES.projects.mentorships.accept(id, relationshipId), data);
    return res.data.data;
  },
  async declineMentorship(id: string, relationshipId: string, data: RespondMentorRelationshipRequest = {}): Promise<MentorRelationship> {
    const res = await api.post(API_ROUTES.projects.mentorships.decline(id, relationshipId), data);
    return res.data.data;
  },
  async endMentorship(id: string, relationshipId: string, data: RespondMentorRelationshipRequest = {}): Promise<MentorRelationship> {
    const res = await api.post(API_ROUTES.projects.mentorships.end(id, relationshipId), data);
    return res.data.data;
  },
  async contributions(id: string): Promise<ProjectContributionProposal[]> {
    const res = await api.get(`/projects/${id}/contributions`);
    return res.data.data;
  },
  async proposeContribution(id: string, data: ProposeProjectContributionRequest): Promise<ProjectContributionProposal> {
    const res = await api.post(`/projects/${id}/contributions/proposals`, data);
    return res.data.data;
  },
  async confirmContribution(id: string, proposalId: string, data: ResolveProjectContributionRequest = {}): Promise<ProjectContributionProposal> {
    const res = await api.post(`/projects/${id}/contributions/${proposalId}/confirm`, data);
    return res.data.data;
  },
  async rejectContribution(id: string, proposalId: string, data: ResolveProjectContributionRequest = {}): Promise<ProjectContributionProposal> {
    const res = await api.post(`/projects/${id}/contributions/${proposalId}/reject`, data);
    return res.data.data;
  },
};
