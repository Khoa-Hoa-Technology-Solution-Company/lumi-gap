import { useLocation, useNavigate, useParams, useSearchParams, type NavigateOptions } from "react-router-dom";
import { mentorWorkspaceDestination } from "@/features/projects/utils/mentor-workspace-navigation";
import { useCallback } from "react";

/** Reuse the same review pages in the mentor shell and their original routes. */
export function useReviewPageNavigation() {
  const embedded = useLocation().pathname === "/mentor-workspace";
  const route = useParams();
  const [search] = useSearchParams();
  const go = useNavigate();
  const href = useCallback((path: string) => embedded ? mentorWorkspaceDestination(path) : path, [embedded]);
  const navigate = useCallback((path: string, options?: NavigateOptions) => go(href(path), options), [go, href]);
  const param = (name: "assignmentId" | "requestId" | "templateId" | "submissionId") => embedded ? search.get(name) ?? undefined : route[name];
  return { embedded, href, param, navigate };
}
