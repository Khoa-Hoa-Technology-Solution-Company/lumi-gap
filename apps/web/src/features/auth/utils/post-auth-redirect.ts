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
]);

function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return false;
  }

  const [pathname = ""] = path.split(/[?#]/, 1);
  return !AUTH_ENTRY_PATHS.has(pathname);
}

export function resolvePostAuthPath(user: User, requestedPath?: string): string {
  if (requestedPath?.startsWith("/invitations/") && isSafeInternalPath(requestedPath)) {
    return requestedPath;
  }

  if (requiresAcademicProfile(user)) {
    return ACADEMIC_ONBOARDING_PATH;
  }

  if (requestedPath && isSafeInternalPath(requestedPath)) {
    return requestedPath;
  }

  return isAdminSystemRole(user.systemRole) ? ADMIN_LANDING_PATH : MEMBER_LANDING_PATH;
}
