import type { User } from "@trend/shared-types";

/** Only regular users must complete academic onboarding. Privileged roles are managed by admins. */
export function requiresAcademicProfile(user: User | null | undefined): boolean {
  return user?.role === "user" && !user.academicProfileType;
}
