import type { ISODateString } from "./common.js";

export type AcademicProfileType = "student" | "researcher" | "lecturer";

export type SystemRole =
  | "user"
  | "reviewer"
  | "moderator"
  | "admin";

/** Academic roles remain readable during the legacy-data migration window. */
export type UserRole = SystemRole | AcademicProfileType;

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  academicProfileType?: AcademicProfileType;
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
  academicProfileType: AcademicProfileType;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}
