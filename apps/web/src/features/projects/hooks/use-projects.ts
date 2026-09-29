import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "../api/projects.api";
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
} from "@trend/shared-types";

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
    },
  });
}

export function useRemovePaperFromProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paperId: string) => projectsApi.removePaper(id, paperId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
    },
  });
}

export function useAddMemberToProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddProjectMemberRequest) => projectsApi.addMember(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
    },
  });
}

export function useRemoveMemberFromProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => projectsApi.removeMember(id, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
    },
  });
}

export function useUpdateProjectPaper(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paperId, data }: { paperId: string; data: UpdateProjectPaperRequest }) => projectsApi.updatePaper(id, paperId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", id] }),
  });
}

export function useInviteProjectMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (data: InviteProjectMemberRequest) => projectsApi.inviteMember(id, data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", id] }) });
}

export function useCancelProjectInvitation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (invitationId: string) => projectsApi.cancelInvitation(id, invitationId), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", id] }) });
}

export function useMyProjectInvitations() {
  return useQuery({ queryKey: ["project-invitations", "mine"], queryFn: projectsApi.listMyInvitations });
}

export function useRespondToProjectInvitation() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ projectId, invitationId, decision }: { projectId: string; invitationId: string; decision: "accept" | "decline" }) => projectsApi.respondToInvitation(projectId, invitationId, decision), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["project-invitations", "mine"] }); queryClient.invalidateQueries({ queryKey: ["projects"] }); } });
}

export function useProjectInvitationPreview(token: string | undefined) {
  return useQuery({
    queryKey: ["project-invitation-token", token],
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
  return useMutation({ mutationFn: () => projectsApi.archive(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["project", id] }); queryClient.invalidateQueries({ queryKey: ["projects"] }); } });
}

export function useLeaveProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: () => projectsApi.leave(id), onSuccess: () => { queryClient.removeQueries({ queryKey: ["project", id] }); queryClient.invalidateQueries({ queryKey: ["projects"] }); } });
}

export function useTransferProjectOwnership(id: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (userId: string) => projectsApi.transferOwnership(id, userId), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["project", id] }); queryClient.invalidateQueries({ queryKey: ["projects"] }); } });
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
    mutationFn: ({ relationshipId, data = {} }: { relationshipId: string; data?: RespondMentorRelationshipRequest }) => {
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
