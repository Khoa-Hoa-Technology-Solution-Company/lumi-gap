import type { ISODateString } from "./common.js";

export type AcademicProfileType = "student" | "researcher" | "lecturer";

export type SystemRole = "USER" | "ADMIN";
export type AccountStatus = "ACTIVE" | "SUSPENDED" | "DISABLED";
export type AcademicRole = "STUDENT" | "RESEARCHER" | "LECTURER";
export const MAX_ONBOARDING_RESEARCH_AREAS = 3;
export const MAX_ONBOARDING_RESEARCH_INTERESTS = 5;
export const MAX_ONBOARDING_RESEARCH_SKILLS = 5;
export type ParticipantScope = "INTERNAL" | "EXTERNAL" | "PENDING";
export type AdmissionBasis = "LEGACY" | "HOST_INSTITUTION" | "INVITATION" | "ADMIN" | "PERSONAL_EMAIL";
export type PrimaryPosition = "STUDENT" | "LECTURER" | "RESEARCH_STAFF" | "INDUSTRY_PRACTITIONER" | "OTHER";
export type VerificationStatus = "NOT_SUBMITTED" | "PENDING" | "NEEDS_MORE_INFORMATION" | "VERIFIED" | "REJECTED" | "EXPIRED" | "INVALIDATED" | "UNVERIFIED";
export type UserCapability =
  | "BASIC_RESEARCH" | "RESEARCH_SUPPORT" | "STRUCTURED_REVIEW" | "GAP_VALIDATION"
  | "CREATE_RESEARCH_PROJECT" | "APPROVE_ACADEMIC_CONTRIBUTION"
  | "MENTOR_PROJECT" | "REVIEW_ARTIFACT" | "MANAGE_SYSTEM";
export type LegacySystemRole = "user" | "reviewer" | "moderator" | "admin";

/** Academic roles remain readable during the legacy-data migration window. */
export type UserRole = SystemRole | LegacySystemRole | AcademicProfileType;

export function isAdminSystemRole(role: unknown): role is "ADMIN" {
  return role === "ADMIN";
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  systemRole: SystemRole;
  accountStatus: AccountStatus;
  academicProfileType?: AcademicProfileType;
  academicRole?: AcademicRole;
  academicRoleVerificationStatus?: VerificationStatus | "SELF_DECLARED";
  primaryPosition?: PrimaryPosition;
  participantScope?: ParticipantScope;
  admissionBasis?: AdmissionBasis;
  verifiedEmails?: Array<{ email: string; isPrimary: boolean; purpose: "ACCOUNT" | "INSTITUTIONAL" | "CONTACT"; verifiedAt: ISODateString }>;
  emailVerifiedAt?: ISODateString;
  hasApprovedInstitutionalEmail?: boolean;
  authProviders?: {
    password: boolean;
    google: boolean;
  };
  capabilities?: UserCapability[];
  /** Server-computed: admins, or lecturers/researchers whose academic role is verified. */
  canProposeCommunity?: boolean;
  onboarding?: { completed: boolean };
  avatarUrl?: string;
  institution?: string;
  researchInterests?: string[];
  isActive?: boolean;
  points?: number;
  credits?: number;
  penaltyPoints?: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: ISODateString;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  invitationToken?: string;
}

export interface UpdateAcademicProfileRequest {
  academicRole: AcademicRole;
  primaryPosition?: PrimaryPosition;
  positionTitle?: string;
  institutionName?: string;
  institutionId?: string;
  noAffiliation?: boolean;
  department?: string;
  specifiedPosition?: string;
  country?: string;
  campusId?: string | null;
  programId?: string | null;
  programName?: string;
  researchAreas?: string[];
  expertiseAreas?: string[];
  researchInterests?: string[];
  researchKeywords?: string[];
  skills?: string[];
}

export interface AcademicOnboardingOptions {
  institutions: Array<{ id: string; name: string; hostInstitution: boolean }>;
  researchAreas: string[];
  hostInstitution?: {
    id: string;
    name: string;
  };
  campuses: Array<{
    id: string;
    name: string;
    code?: string | null;
    city?: string | null;
    country?: string | null;
  }>;
  programs: Array<{
    id: string;
    name: string;
    code?: string | null;
    campusId?: string | null;
  }>;
  verificationMethods: {
    feid: boolean;
    institutionalEmail: boolean;
    manualReview: boolean;
  };
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}
