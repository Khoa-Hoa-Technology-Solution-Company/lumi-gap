import type { User } from "@trend/shared-types";

/**
 * Authoritative client-side check matching `isLecturerWorkspaceEligible` in
 * `@trend/shared-types` and `isEligibleVerifiedLecturer` in backend
 * `identity-foundation.rules.ts`.
 *
 * Kept locally inside `apps/web` so Vite dev HMR always resolves it even when
 * workspace package builds are cached.
 */
export function isLecturerWorkspaceEligible(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.accountStatus !== "ACTIVE" || user.isActive === false) return false;
  if (!user.emailVerifiedAt) return false;
  if (typeof user.lecturerWorkspaceEligible === "boolean") {
    return user.lecturerWorkspaceEligible;
  }
  return (
    user.academicRole === "LECTURER"
    && user.academicRoleVerificationStatus === "VERIFIED"
    && user.positionVerificationStatus === "VERIFIED"
  );
}
