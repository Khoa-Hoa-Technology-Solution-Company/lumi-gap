import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "../api/projects.api";
import type { CreateProjectRequest, UpdateProjectRequest, AddProjectMemberRequest, AddProjectPaperRequest } from "@trend/shared-types";

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
