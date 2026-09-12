import type { ISODateString } from "./common.js";

export type UserRole = "student" | "lecturer" | "researcher" | "admin";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
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
  role?: Exclude<UserRole, "admin">;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}
