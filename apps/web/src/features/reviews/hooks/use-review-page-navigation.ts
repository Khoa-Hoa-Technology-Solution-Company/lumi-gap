import { useLocation, useNavigate, useParams, useSearchParams, type NavigateOptions } from "react-router-dom";
import { mentorWorkspaceDestination, safeMentorWorkReturn, withMentorWorkReturn } from "@/features/projects/utils/mentor-workspace-navigation";
import { useCallback } from "react";

/** Reuse the same review pages in the mentor shell and their original routes. */
export function useReviewPageNavigation() {
  const embedded = useLocation().pathname === "/mentor-workspace";
  const route = useParams();
  const [search] = useSearchParams();
  const go = useNavigate();
  const returnTo = safeMentorWorkReturn(search.get("returnTo"));
  const href = useCallback((path: string) => embedded ? withMentorWorkReturn(mentorWorkspaceDestination(path), returnTo) : path, [embedded, returnTo]);
  const navigate = useCallback((path: string, options?: NavigateOptions) => go(href(path), options), [go, href]);
  const param = (name: "assignmentId" | "requestId" | "templateId" | "submissionId" | "reviewId" | "revisionId" | "reader" | "detailTab") => embedded ? search.get(name) ?? undefined : route[name] ?? search.get(name) ?? undefined;
  return { embedded, href, param, navigate, returnTo };
}
