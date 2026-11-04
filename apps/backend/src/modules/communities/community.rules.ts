import type { UserRole } from "@trend/shared-types";

/** The slice of the authenticated principal that community authorization depends on. */
export interface CommunityActor {
  sub: string;
  role?: UserRole;
  systemRole?: string;
  academicProfileType?: string;
}

export const MAX_PENDING_PROPOSALS = 3;
const PROPOSER_PROFILE_TYPES = new Set(["lecturer", "researcher"]);

export function normalizeTerm(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function isCommunityAdmin(actor: Pick<CommunityActor, "systemRole" | "role">): boolean {
  return actor.systemRole === "ADMIN" || actor.role === "admin";
}

/**
 * Admins create communities directly. Lecturers and researchers may propose one,
 * but only once their academic role is verified; a self-declared title is not enough.
 * `roleVerificationStatus` comes from the persisted academic profile, never from the token.
 */
export function canProposeCommunity(actor: Pick<CommunityActor, "systemRole" | "role" | "academicProfileType">, roleVerificationStatus?: string | null): boolean {
  if (isCommunityAdmin(actor)) return true;
  return PROPOSER_PROFILE_TYPES.has(actor.academicProfileType ?? "") && roleVerificationStatus === "VERIFIED";
}

export function initialCommunityStatus(actor: Pick<CommunityActor, "systemRole" | "role">): "ACTIVE" | "PENDING_APPROVAL" {
  return isCommunityAdmin(actor) ? "ACTIVE" : "PENDING_APPROVAL";
}
