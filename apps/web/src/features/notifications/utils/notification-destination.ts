import type { NotificationItem } from "@trend/shared-types";
import { getTopicTrendTarget } from "@/features/trends/trend-navigation";

export function getNotificationDestination(
  notification: Pick<NotificationItem, "type" | "targetKind" | "targetId"> & Partial<Pick<NotificationItem, "paperId" | "title" | "screeningRoundId" | "mentorshipRequestId" | "verificationRequestId" | "allocationRevisionId" | "workContributionId" | "contributionEvaluationId" | "manuscriptId" | "manuscriptSnapshotId" | "trendTopic" | "trendTopicId">>,
  isAdmin: boolean,
): string | null {
  if (["SCREENING_REVIEW_ASSIGNED", "SCREENING_ACTION_REQUIRED"].includes(notification.type) && notification.targetId) return `/projects/${encodeURIComponent(notification.targetId)}?tab=papers${notification.paperId ? `&source=${encodeURIComponent(notification.paperId)}` : ""}`;
  if (notification.type === "SCREENING_ADJUDICATION_ASSIGNED" && notification.targetId && notification.screeningRoundId) return `/academic-support/projects/${encodeURIComponent(notification.targetId)}/screening/${encodeURIComponent(notification.screeningRoundId)}`;
  if (notification.type === "PROJECT_CONTRIBUTION_UPDATE" && notification.targetId && notification.contributionEvaluationId) return `/projects/${encodeURIComponent(notification.targetId)}/contribution-review?evaluation=${encodeURIComponent(notification.contributionEvaluationId)}`;
  if (notification.type === "MANUSCRIPT_FEEDBACK_REQUEST" && notification.targetId && notification.manuscriptId && notification.manuscriptSnapshotId) return `/projects/${encodeURIComponent(notification.targetId)}/manuscripts/${encodeURIComponent(notification.manuscriptId)}?snapshot=${encodeURIComponent(notification.manuscriptSnapshotId)}`;
  if (notification.type === "PROJECT_ALLOCATION_UPDATE" && notification.targetId && notification.allocationRevisionId) return `/projects/${encodeURIComponent(notification.targetId)}/allocation?revision=${encodeURIComponent(notification.allocationRevisionId)}`;
  if (notification.type === "PROJECT_CONTRIBUTION_UPDATE" && notification.targetId) return notification.workContributionId ? `/projects/${encodeURIComponent(notification.targetId)}/contribution-review?record=${encodeURIComponent(notification.workContributionId)}` : `/projects/${encodeURIComponent(notification.targetId)}?tab=contributions&contributionTab=work`;
  if (notification.type === "TREND_VERDICT_CHANGED" && notification.trendTopic) return getTopicTrendTarget(notification.trendTopic, notification.trendTopicId);
  if (notification.type === "level_up") return "/rankings";
  if (notification.type.startsWith("PROJECT_WORKSPACE_") && notification.targetId) {
    const id = encodeURIComponent(notification.targetId);
    if (notification.type === "PROJECT_WORKSPACE_GAP_GUIDANCE") return `/academic-support?projectId=${id}&section=gaps`;
    if (["PROJECT_WORKSPACE_PLAN_SHARED", "PROJECT_WORKSPACE_MENTOR_QUESTION"].includes(notification.type)) return `/projects/${id}/plan-review`;
    const tasks = ["PROJECT_WORKSPACE_ASSIGNMENT", "PROJECT_WORKSPACE_MILESTONE"].includes(notification.type);
    return `/projects/${id}?tab=${tasks ? "tasks" : notification.type === "PROJECT_WORKSPACE_MENTOR_FEEDBACK" ? "overview" : "chat"}`;
  }
  const verificationQuery = notification.verificationRequestId ? `?requestId=${encodeURIComponent(notification.verificationRequestId)}` : "";
  if (notification.type === "LECTURER_VERIFICATION_REVIEW_REQUESTED") return isAdmin ? `/admin/academic-verifications${verificationQuery}` : null;
  if (notification.type.startsWith("LECTURER_VERIFICATION_")) return `/settings/verification/lecturer${verificationQuery}`;
  if (notification.type.startsWith("MENTORSHIP_") || notification.type.startsWith("PROJECT_MENTORSHIP_")) {
    if (["MENTORSHIP_REQUEST_RECEIVED", "MENTORSHIP_OFFER_RECEIVED"].includes(notification.type)) {
      const query = new URLSearchParams({ view: "incoming" });
      if (notification.targetId && notification.mentorshipRequestId) { query.set("invitationProjectId", notification.targetId); query.set("requestId", notification.mentorshipRequestId); }
      return `/academic-support?${query}`;
    }
    if (notification.type.endsWith("_ACCEPTED")) return "/academic-support?view=active";
    if (["_DECLINED", "_CANCELLED", "_EXPIRED", "_ENDED", "_POSITION_FILLED"].some(suffix => notification.type.endsWith(suffix))) return "/academic-support?view=history";
    if (notification.type === "MENTORSHIP_SUGGESTED" && notification.targetId) return `/projects/${encodeURIComponent(notification.targetId)}?tab=support`;
    return notification.targetId ? `/academic-support?projectId=${encodeURIComponent(notification.targetId)}` : "/academic-support";
  }
  if (notification.type.startsWith("academic_verification_")) return "/settings/academic";
  // Reviewers can respond in the review center without project membership.
  if (["REVIEW_REQUESTED", "REVISION_RESUBMITTED", "REVIEW_REQUEST_CANCELLED"].includes(notification.type)) return "/reviews";
  if (["REVIEW_REQUEST_ACCEPTED", "REVIEW_REQUEST_DECLINED", "REVIEW_SUBMITTED", "REVISION_REQUESTED"].includes(notification.type)) {
    if (notification.targetKind === "review_request" && notification.targetId) return `/review-requests/${encodeURIComponent(notification.targetId)}`;
    if (["REVIEW_SUBMITTED", "REVISION_REQUESTED"].includes(notification.type) && notification.targetKind === "project" && notification.targetId) {
      return `/projects/${encodeURIComponent(notification.targetId)}?tab=reports`;
    }
    return "/reviews";
  }
  if (notification.type.startsWith("affiliation_")) return "/settings/academic";
  if (isAdmin && ["submission_pending", "paper_submission"].includes(notification.type)) return "/admin/papers";
  const adminReviewRoutes: Record<string, string> = {
    FORUM_REPORT_REVIEW: "/admin/trust-safety?tab=reports&status=all",
    FORUM_REPORT_ESCALATED: "/admin/trust-safety?tab=reports&status=escalated",
    FORUM_APPEAL_RECEIVED: "/admin/trust-safety?tab=appeals",
    FORUM_COPYRIGHT_RECEIVED: "/admin/trust-safety?tab=copyright",
  };
  const reviewDestination = adminReviewRoutes[notification.type];
  if (isAdmin && typeof reviewDestination === "string") return reviewDestination;
  // Existing alerts used one generic type and had no resource target.
  if (isAdmin && notification.type === "FORUM_MODERATION" && !notification.targetId) {
    const legacyReviewTypes: Record<string, string> = {
      "Forum report needs review": "FORUM_REPORT_REVIEW",
      "Forum report escalated": "FORUM_REPORT_ESCALATED",
      "Moderation appeal received": "FORUM_APPEAL_RECEIVED",
      "Copyright claim received": "FORUM_COPYRIGHT_RECEIVED",
    };
    const reviewType = legacyReviewTypes[notification.title ?? ""];
    const legacyDestination = reviewType ? adminReviewRoutes[reviewType] : undefined;
    if (typeof legacyDestination === "string") return legacyDestination;
  }
  if (!isAdmin && notification.type === "submission_rejected" && notification.targetKind === "paper" && notification.targetId) {
    return `/settings/submit-paper?edit=${encodeURIComponent(notification.targetId)}`;
  }
  // Keep invitations visible instead of auto-opening an unrelated recent project.
  if (notification.type === "project_invitation") return "/projects?view=invitations";
  if (notification.targetId) {
    const routeByKind: Record<NonNullable<NotificationItem["targetKind"]>, string> = {
      paper: "/papers",
      report: "/reports",
      gap: "/gaps",
      project: "/projects",
      forum_post: "/forum",
      academic_profile: "/academics",
      community: "/communities",
      review_request: "/review-requests",
    };
    if (notification.targetKind && routeByKind[notification.targetKind]) return `${routeByKind[notification.targetKind]}/${encodeURIComponent(notification.targetId)}`;
  }
  if (notification.type === "FORUM_MODERATION") return "/forum/moderation";
  if (notification.type === "paper_submission") return isAdmin ? "/admin/papers" : "/settings/my-papers";
  if (notification.type.startsWith("submission")) return isAdmin ? "/admin/papers" : "/settings/my-papers";
  return null;
}
