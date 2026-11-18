import type { MentorshipRequest } from "@trend/shared-types";

export function mentorshipViewer(item: MentorshipRequest, userId?: string): NonNullable<MentorshipRequest["viewer"]> {
  if (item.viewer) return item.viewer;
  // Compatibility with older cached DTOs, never an authorization decision.
  if (item.direction === "PROJECT_TO_LECTURER") {
    if (item.mentorUser._id === userId) return "RECIPIENT";
    if (item.requestedBy._id === userId || item.actions.cancel) return "SENDER";
  } else {
    if (item.mentorUser._id === userId) return "SENDER";
    if (item.actions.accept || item.actions.decline) return "RECIPIENT";
  }
  return "TEAM";
}
