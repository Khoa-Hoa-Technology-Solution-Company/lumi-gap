export type MentorRelationshipStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED" | "ACTIVE" | "ENDED";

export function canViewMentorRelationship(input: {
  actorId: string;
  mentorUserId: string;
  requestedBy: string;
  actorHasProjectAccess: boolean;
}) {
  return input.actorHasProjectAccess
    || input.actorId === input.mentorUserId
    || input.actorId === input.requestedBy;
}

export function canAcceptMentorRelationship(input: {
  actorId: string;
  mentorUserId: string;
  status: MentorRelationshipStatus;
  hasMentorCapability: boolean;
}) {
  return input.actorId === input.mentorUserId
    && input.status === "PENDING"
    && input.hasMentorCapability;
}

export function canEndMentorRelationship(input: {
  actorId: string;
  mentorUserId: string;
  requestedBy: string;
  projectOwnerId: string;
  status: MentorRelationshipStatus;
}) {
  return input.status === "ACTIVE"
    && (
      input.actorId === input.mentorUserId
      || input.actorId === input.projectOwnerId
    );
}
