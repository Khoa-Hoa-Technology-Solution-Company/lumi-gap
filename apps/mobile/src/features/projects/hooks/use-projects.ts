import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateProjectRequest, UpdateProjectRequest } from "@trend/shared-types";

import { projectsApi } from "../api/projects.api";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsApi.list(),
  });
}

export function useProject(id?: string) {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: () => projectsApi.detail(id!),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectRequest) => projectsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProjectRequest }) => projectsApi.update(id, input),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", project._id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useAddPaperToProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, paperId }: { projectId: string; paperId: string }) => projectsApi.addPaper(projectId, { paperId }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", project._id] });
    },
  });
}

export function useProjectChat(projectId?: string) {
  return useQuery({
    queryKey: ["projects", projectId, "chat"],
    queryFn: () => projectsApi.listChat(projectId!),
    enabled: !!projectId,
  });
}

export function useSendProjectChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, message }: { projectId: string; message: string }) => projectsApi.sendChat(projectId, message),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projects", variables.projectId, "chat"] });
    },
  });
}
