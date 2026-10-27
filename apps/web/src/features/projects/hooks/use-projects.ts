import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { projectsApi } from "../api/projects.api";
import { useAuthStore } from "@/stores/auth-store";
import type {
  CreateProjectRequest,
  UpdateProjectRequest,
  AddProjectMemberRequest,
  AddProjectPaperRequest,
  ProposeProjectContributionRequest,
  ResolveProjectContributionRequest,
  InviteProjectMemberRequest,
  UpdateProjectPaperRequest,
  RequestMentorRelationshipRequest,
  RespondMentorRelationshipRequest,
  MentorRelationship, MentorshipRequest,
} from "@trend/shared-types";

function refreshProject(client: QueryClient, id: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ["projects"] }),
    client.invalidateQueries({ predicate: query => query.queryKey[0] === "project" &&
      (query.queryKey[1] === id || (query.state.data as { _id?: string } | undefined)?._id === id) }),
    client.invalidateQueries({ predicate: query => ["project-research", "project-workspace"].includes(String(query.queryKey[0])) && query.queryKey[2] === id }),
  ]);
}
function refreshProjectLiterature(client: QueryClient, id: string) {
  return Promise.all([
    refreshProject(client, id),
    client.invalidateQueries({ queryKey: ["gaps"] }),
  ]);
}

export function useProjects(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
    enabled: options?.enabled ?? true,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: () => projectsApi.detail(id!),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectRequest) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProjectRequest) => projectsApi.update(id, data),
    onSuccess: (project) => {
      queryClient.setQueryData(["project", id], project);
      return refreshProject(queryClient, id);
    },
  });
}

export function useDeleteProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.removeQueries({ queryKey: ["project", id] });
    },
  });
}

export function useAddPaperToProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddProjectPaperRequest) => projectsApi.addPaper(id, data),
    onSuccess: () => refreshProjectLiterature(queryClient, id),
  });
}

export function useRemovePaperFromProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paperId: string) => projectsApi.removePaper(id, paperId),
    onSuccess: () => refreshProjectLiterature(queryClient, id),
  });
}

export function useAddMemberToProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddProjectMemberRequest) => projectsApi.addMember(id, data),
    onSuccess: () => {
      return refreshProject(queryClient, id);
    },
  });
}

export function useRemoveMemberFromProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => projectsApi.removeMember(id, memberId),
    onSuccess: () => {
      return refreshProject(queryClient, id);
    },
  });
}

export function useUpdateProjectPaper(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paperId, data }: { paperId: string; data: UpdateProjectPaperRequest }) => projectsApi.updatePaper(id, paperId, data),
    onSuccess: () => refreshProjectLiterature(queryClient, id),
  });
}

export function useInviteProjectMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (data: InviteProjectMemberRequest) => projectsApi.inviteMember(id, data), onSuccess: () => refreshProject(queryClient, id) });
}

export function useCancelProjectInvitation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (invitationId: string) => projectsApi.cancelInvitation(id, invitationId), onSuccess: () => refreshProject(queryClient, id) });
}

export function useResendProjectInvitation(id: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (invitationId: string) => projectsApi.resendInvitation(id, invitationId), onSuccess: () => refreshProject(client, id) });
}

export function useProjectTeam(id: string, page: number, invitationPage: number) {
  return useQuery({ queryKey: ["project", id, "team", page, invitationPage], queryFn: () => projectsApi.team(id, page, invitationPage), enabled: Boolean(id) });
}

export function useRestoreProject(id: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: () => projectsApi.restore(id), onSuccess: () => refreshProject(client, id) });
}

export function useMyProjectInvitations() {
  return useQuery({ queryKey: ["project-invitations", "mine"], queryFn: projectsApi.listMyInvitations });
}

export function useRespondToProjectInvitation() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ projectId, invitationId, decision }: { projectId: string; invitationId: string; decision: "accept" | "decline" }) => projectsApi.respondToInvitation(projectId, invitationId, decision), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["project-invitations", "mine"] }); queryClient.invalidateQueries({ queryKey: ["projects"] }); } });
}

export function useProjectInvitationPreview(token: string | undefined) {
  const viewerId = useAuthStore(state => state.user?.id);
  return useQuery({
    queryKey: ["project-invitation-token", token, viewerId],
    queryFn: () => projectsApi.invitationPreview(token!),
    enabled: Boolean(token),
    retry: false,
  });
}

export function useRespondToProjectInvitationToken(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decision: "accept" | "decline") => projectsApi.respondToInvitationToken(token, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-invitation-token", token] });
      queryClient.invalidateQueries({ queryKey: ["project-invitations", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useArchiveProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: () => projectsApi.archive(id), onSuccess: () => refreshProject(queryClient, id) });
}

export function useLeaveProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: () => projectsApi.leave(id), onSuccess: () => { queryClient.removeQueries({ queryKey: ["project", id] }); queryClient.invalidateQueries({ queryKey: ["projects"] }); } });
}

export function useTransferProjectOwnership(id: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (userId: string) => projectsApi.transferOwnership(id, userId), onSuccess: () => refreshProject(queryClient, id) });
}

export function useProjectActivity(id: string) {
  return useQuery({ queryKey: ["project", id, "activity"], queryFn: () => projectsApi.activity(id), enabled: Boolean(id) });
}

export function useProjectMentorships(id: string) {
  return useQuery({ queryKey: ["project", id, "mentorships"], queryFn: () => projectsApi.mentorships(id), enabled: Boolean(id) });
}

export function useRequestProjectMentorship(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RequestMentorRelationshipRequest) => projectsApi.requestMentorship(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", id, "mentorships"] }),
  });
}

export function useRespondToProjectMentorship(id: string, action: "accept" | "decline" | "end") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ relationshipId, data = {} }: { relationshipId: string; data?: RespondMentorRelationshipRequest }): Promise<MentorshipRequest | MentorRelationship> => {
      if (action === "accept") return projectsApi.acceptMentorship(id, relationshipId, data);
      if (action === "decline") return projectsApi.declineMentorship(id, relationshipId, data);
      return projectsApi.endMentorship(id, relationshipId, data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", id, "mentorships"] }),
  });
}

export function useProjectContributions(id: string) {
  return useQuery({
    queryKey: ["project", id, "contributions"],
    queryFn: () => projectsApi.contributions(id),
    enabled: Boolean(id),
  });
}

export function useProposeProjectContribution(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProposeProjectContributionRequest) => projectsApi.proposeContribution(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", id, "contributions"] }),
  });
}

export function useResolveProjectContribution(id: string, action: "confirm" | "reject") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ proposalId, data = {} }: { proposalId: string; data?: ResolveProjectContributionRequest }) => (
      action === "confirm"
        ? projectsApi.confirmContribution(id, proposalId, data)
        : projectsApi.rejectContribution(id, proposalId, data)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id, "contributions"] });
      queryClient.invalidateQueries({ queryKey: ["contributions"] });
    },
  });
}
