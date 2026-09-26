import type { ISODateString } from "./common.js";

export type AcademicProfileType = "student" | "researcher" | "lecturer";

export type SystemRole = "RESEARCH_USER" | "ADMIN" | "SUPER_ADMIN";
export type AccountStatus = "ACTIVE" | "SUSPENDED" | "DISABLED";
export type PrimaryPosition = "STUDENT" | "LECTURER" | "RESEARCH_STAFF" | "INDUSTRY_PRACTITIONER" | "OTHER";
export type VerificationStatus = "NOT_SUBMITTED" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" | "INVALIDATED" | "UNVERIFIED";
export type UserCapability = "BASIC_RESEARCH" | "RESEARCH_SUPPORT" | "STRUCTURED_REVIEW" | "GAP_VALIDATION";
export type LegacySystemRole = "user" | "reviewer" | "moderator" | "admin";

/** Academic roles remain readable during the legacy-data migration window. */
export type UserRole = SystemRole | LegacySystemRole | AcademicProfileType;

export function isAdminSystemRole(role: unknown): role is "ADMIN" | "SUPER_ADMIN" {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  systemRole: SystemRole;
  accountStatus: AccountStatus;
  academicProfileType?: AcademicProfileType;
  primaryPosition?: PrimaryPosition;
  emailVerifiedAt?: ISODateString;
  capabilities?: UserCapability[];
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
}

export interface UpdateAcademicProfileRequest {
  primaryPosition?: PrimaryPosition;
  positionTitle?: string;
  institutionName?: string;
  noAffiliation?: boolean;
  department?: string;
  specifiedPosition?: string;
  country?: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}
