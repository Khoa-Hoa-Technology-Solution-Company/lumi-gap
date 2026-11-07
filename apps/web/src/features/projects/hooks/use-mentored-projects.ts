import { useQuery } from "@tanstack/react-query";
import type { MentorRelationship } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { academicSupportApi } from "../api/academic-support.api";

export async function loadMentoredProjects(actorId: string): Promise<MentorRelationship[]> {
  const projects = new Map<string, MentorRelationship>();
  for (let page = 1; ; page += 1) {
    const result = await academicSupportApi.mine({ view: "active", page, pageSize: 30 });
    for (const relationship of result.relationships) {
      if (relationship.mentorUser._id === actorId && relationship.status === "ACTIVE" && relationship.actions.openProject && relationship.project) {
        projects.set(relationship.projectId, relationship);
      }
    }
    if (page >= result.relationshipMeta.totalPages) return [...projects.values()];
  }
}

export function useMentoredProjects(enabled = true) {
  const actorId = useAuthStore(state => state.user?.id);
  return useQuery({
    queryKey: ["academic-support", actorId, "mentored-project-directory"],
    queryFn: () => loadMentoredProjects(actorId!),
    enabled: Boolean(actorId && enabled),
    retry: false,
    retryOnMount: false,
    refetchInterval: enabled ? 30_000 : false,
  });
}
