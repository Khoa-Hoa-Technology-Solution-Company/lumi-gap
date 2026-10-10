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
  emailVerified?: boolean;
  academicRole?: AcademicRole;
  academicRoleVerificationStatus?: VerificationStatus | "SELF_DECLARED";
  participantScope: ParticipantScope;
  currentHostPositionVerified?: boolean;
  positionVerified?: boolean;
}

export function policyCapabilities(identity: CapabilityIdentity): UserCapability[] {
  if (!identity.accountActive) return [];
  if (identity.systemRole !== "ADMIN" && !identity.emailVerified) return [];
  const capabilities: UserCapability[] = identity.systemRole === "ADMIN" ? ["MANAGE_SYSTEM"] : ["BASIC_RESEARCH"];
  if (identity.systemRole !== "ADMIN") capabilities.push("CREATE_RESEARCH_PROJECT");
  // These express eligibility; object access still requires an assignment or mentor relationship.
  if (identity.academicRole === "LECTURER" && identity.academicRoleVerificationStatus === "VERIFIED"
    && identity.positionVerified === true) {
    capabilities.push("REVIEW_ARTIFACT", "STRUCTURED_REVIEW", "MENTOR_PROJECT");
    if (identity.participantScope === "INTERNAL" && identity.currentHostPositionVerified === true) capabilities.push("APPROVE_ACADEMIC_CONTRIBUTION");
  }
  return capabilities;
}

export function invitationCanAdmitAcademicRole(role: AcademicRole): boolean {
  return ["STUDENT", "RESEARCHER", "LECTURER"].includes(role);
}

