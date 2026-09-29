import type {
  AcademicRole, AdmissionBasis, ParticipantScope, UserCapability, VerificationStatus,
} from "@trend/shared-types";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export interface ScopeAffiliation {
  hostInstitution: boolean;
  isCurrent: boolean;
  verificationStatus: VerificationStatus;
}

export function deriveParticipantScope(
  admissionBasis: AdmissionBasis,
  affiliations: readonly ScopeAffiliation[],
): ParticipantScope {
  const currentHost = affiliations.filter((item) => item.hostInstitution && item.isCurrent);
  if (currentHost.some((item) => item.verificationStatus === "VERIFIED")) return "INTERNAL";
  if (currentHost.some((item) => ["NOT_SUBMITTED", "PENDING", "UNVERIFIED"].includes(item.verificationStatus))) {
    return "PENDING";
  }
  return admissionBasis === "INVITATION" || admissionBasis === "ADMIN" || admissionBasis === "LEGACY"
    ? "EXTERNAL"
    : "PENDING";
}

export interface CapabilityIdentity {
  systemRole: "USER" | "ADMIN";
  accountActive: boolean;
  academicRole?: AcademicRole;
  academicRoleVerificationStatus?: VerificationStatus | "SELF_DECLARED";
  participantScope: ParticipantScope;
  currentHostPositionVerified?: boolean;
}

export function policyCapabilities(identity: CapabilityIdentity): UserCapability[] {
  if (!identity.accountActive) return [];
  const capabilities: UserCapability[] = identity.systemRole === "ADMIN" ? ["MANAGE_SYSTEM"] : ["BASIC_RESEARCH"];
  if (identity.systemRole !== "ADMIN" && identity.participantScope !== "EXTERNAL") capabilities.push("CREATE_RESEARCH_PROJECT");
  if (
    identity.academicRole === "LECTURER"
    && identity.academicRoleVerificationStatus === "VERIFIED"
  ) {
    if (identity.participantScope === "INTERNAL" && identity.currentHostPositionVerified === true) {
      capabilities.push(
        "APPROVE_ACADEMIC_CONTRIBUTION",
        "MENTOR_PROJECT",
        "REVIEW_ARTIFACT",
        "STRUCTURED_REVIEW",
      );
    } else if (identity.participantScope === "EXTERNAL") {
      capabilities.push("REVIEW_ARTIFACT", "STRUCTURED_REVIEW");
    }
  }
  return capabilities;
}

export function invitationCanAdmitAcademicRole(role: AcademicRole): boolean {
  return role === "RESEARCHER" || role === "LECTURER";
}

