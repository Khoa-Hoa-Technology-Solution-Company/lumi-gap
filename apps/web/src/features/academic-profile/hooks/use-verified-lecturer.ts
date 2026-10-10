import { useAcademicProfile } from "./use-academic-profile";

/** UI eligibility only; object permissions are enforced by the API. */
export function useVerifiedLecturer() {
  const { data } = useAcademicProfile();
  return data?.academicRole === "LECTURER"
    && data.academicRoleVerificationStatus === "VERIFIED"
    && data.verificationStatuses?.position === "VERIFIED";
}
