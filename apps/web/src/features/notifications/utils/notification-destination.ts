import type { NotificationItem } from "@trend/shared-types";

export function getNotificationDestination(
  notification: Pick<NotificationItem, "type" | "targetKind" | "targetId"> & Partial<Pick<NotificationItem, "title" | "verificationRequestId">>,
  isAdmin: boolean,
): string | null {
  if (notification.type === "level_up") return "/rankings";
  const verificationQuery = notification.verificationRequestId ? `?requestId=${encodeURIComponent(notification.verificationRequestId)}` : "";
  if (notification.type === "LECTURER_VERIFICATION_REVIEW_REQUESTED") return isAdmin ? `/admin/academic-verifications${verificationQuery}` : null;
  if (notification.type.startsWith("LECTURER_VERIFICATION_")) return `/settings/verification/lecturer${verificationQuery}`;
  if (notification.type.startsWith("MENTORSHIP_") || notification.type.startsWith("PROJECT_MENTORSHIP_")) return notification.targetId ? `/academic-support?projectId=${encodeURIComponent(notification.targetId)}` : "/academic-support";
  if (notification.type.startsWith("academic_verification_")) return "/settings/academic";
  if (["REVIEW_REQUESTED", "REVIEW_REQUEST_ACCEPTED", "REVIEW_REQUEST_DECLINED", "REVIEW_REQUEST_CANCELLED", "REVIEW_SUBMITTED", "REVISION_REQUESTED", "REVISION_RESUBMITTED"].includes(notification.type)) return "/reviews";
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
  if (notification.targetId) {
    const routeByKind: Record<NonNullable<NotificationItem["targetKind"]>, string> = {
      paper: "/papers",
      report: "/reports",
      gap: "/gaps",
      project: "/projects",
      forum_post: "/forum",
      academic_profile: "/academics",
      community: "/communities",
    };
    if (notification.targetKind && routeByKind[notification.targetKind]) return `${routeByKind[notification.targetKind]}/${encodeURIComponent(notification.targetId)}`;
  }
  if (notification.type === "FORUM_MODERATION") return "/forum/moderation";
  if (notification.type === "paper_submission") return isAdmin ? "/admin/papers" : "/settings/my-papers";
  if (notification.type.startsWith("submission")) return isAdmin ? "/admin/papers" : "/settings/my-papers";
  return null;
}
