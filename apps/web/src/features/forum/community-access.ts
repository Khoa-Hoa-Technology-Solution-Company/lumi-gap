import type { User } from "@trend/shared-types";

type ProposalUser = Pick<User, "canProposeCommunity" | "academicProfileType" | "academicRoleVerificationStatus">;

/** The server decides eligibility; the client only reads the flag and never infers it from a role. */
export function canProposeCommunity(user?: ProposalUser | null): boolean {
  return user?.canProposeCommunity === true;
}

/** Why a signed-in user cannot propose a community, so the UI can point to the right next step. */
export function proposalBlockReason(user?: ProposalUser | null): "UNVERIFIED" | "NOT_ACADEMIC" | undefined {
  if (!user || user.canProposeCommunity) return undefined;
  const academic = user.academicProfileType === "lecturer" || user.academicProfileType === "researcher";
  return academic ? "UNVERIFIED" : "NOT_ACADEMIC";
}
