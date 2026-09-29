import type { NotificationItem } from "@trend/shared-types";

export function getNotificationDestination(
  notification: Pick<NotificationItem, "type" | "targetKind" | "targetId">,
  isAdmin: boolean,
): string | null {
  if (notification.type === "level_up") return "/rankings";
  if (isAdmin && notification.type === "submission_pending") return "/admin/papers";
  if (!isAdmin && notification.type === "submission_rejected" && notification.targetKind === "paper" && notification.targetId) {
    return `/settings/submit-paper?edit=${notification.targetId}`;
  }
  if (notification.targetId) {
    const routeByKind: Record<NonNullable<NotificationItem["targetKind"]>, string> = {
      paper: "/papers",
      report: "/reports",
      gap: "/gaps",
      project: "/projects",
      forum_post: "/forum",
      academic_profile: "/academics",
    };
    if (notification.targetKind) return `${routeByKind[notification.targetKind]}/${notification.targetId}`;
  }
  if (notification.type.startsWith("submission")) return isAdmin ? "/admin/papers" : "/settings/my-papers";
  return null;
}
