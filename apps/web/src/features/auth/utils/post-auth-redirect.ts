import { isAdminSystemRole, type User } from "@trend/shared-types";

import { requiresAcademicProfile } from "./academic-profile";

export const MEMBER_LANDING_PATH = "/home";
export const ADMIN_LANDING_PATH = "/admin";
export const ACADEMIC_ONBOARDING_PATH = "/onboarding/academic-profile";
export const EMAIL_VERIFICATION_PATH = "/verify-email";

const AUTH_ENTRY_PATHS = new Set([
  "/login",
  "/register",
  "/auth/oauth-callback",
  "/verify-email",
  "/onboarding/academic-profile",
]);

function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return false;
  }

  const [pathname = ""] = path.split(/[?#]/, 1);
  return !AUTH_ENTRY_PATHS.has(pathname);
}

export function resolvePostAuthPath(user: User, requestedPath?: string): string {
  if (user.systemRole !== "ADMIN" && !user.emailVerifiedAt) return EMAIL_VERIFICATION_PATH;
  if (requiresAcademicProfile(user)) {
    return ACADEMIC_ONBOARDING_PATH;
  }

  if (requestedPath && isSafeInternalPath(requestedPath)) {
    const [pathname = ""] = requestedPath.split(/[?#]/, 1);
    const adminDestination = pathname === ADMIN_LANDING_PATH || pathname.startsWith(`${ADMIN_LANDING_PATH}/`);
    if (!adminDestination || isAdminSystemRole(user.systemRole)) {
      return requestedPath;
    }
  }

  return isAdminSystemRole(user.systemRole) ? ADMIN_LANDING_PATH : MEMBER_LANDING_PATH;
}
