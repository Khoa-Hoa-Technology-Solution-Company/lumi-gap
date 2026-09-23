import type { AcademicVerificationStatus } from "@trend/shared-types";

/** The public badge is a trust signal, never an inference from role or profile content. */
export function canShowVerifiedLecturerBadge(status: AcademicVerificationStatus | undefined): boolean {
  return status === "VERIFIED";
}
