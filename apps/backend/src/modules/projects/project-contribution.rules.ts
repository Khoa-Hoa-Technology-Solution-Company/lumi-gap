type ProjectAccess = {
  ownerId: unknown;
  members: Array<{ targetId: unknown; role: "owner" | "member" }>;
};

const sameId = (value: unknown, userId: string) => String(value) === userId;

export function isProjectMember(project: ProjectAccess, userId: string) {
  return sameId(project.ownerId, userId) || project.members.some((member) => sameId(member.targetId, userId));
}

export function isProjectOwner(project: ProjectAccess, userId: string) {
  return sameId(project.ownerId, userId)
    || project.members.some((member) => member.role === "owner" && sameId(member.targetId, userId));
}

export function contributionConfirmationParty(proposerId: string, contributorId: string) {
  return proposerId === contributorId ? "OWNER" as const : "CONTRIBUTOR" as const;
}

export function canResolveContribution(input: {
  requiredFrom: "OWNER" | "CONTRIBUTOR";
  actorId: string;
  proposerId: string;
  contributorId: string;
  actorIsOwner: boolean;
  actorHasAcademicApproval?: boolean;
}) {
  if (input.actorId === input.proposerId) return false;
  if (input.actorHasAcademicApproval) return true;
  return input.requiredFrom === "OWNER"
    ? input.actorIsOwner
    : input.actorId === input.contributorId;
}
