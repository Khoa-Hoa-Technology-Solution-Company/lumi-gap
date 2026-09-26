// packages/shared-types/src/admin.ts
import type { ISODateString } from "./common.js";
import type { AccountStatus, AcademicProfileType, PrimaryPosition, SystemRole } from "./user.js";

export interface AdminUserItem {
  id: string;
  email: string;
  fullName: string;
  role: SystemRole;
  academicProfileType?: AcademicProfileType;
  primaryPosition?: PrimaryPosition;
  accountStatus: AccountStatus;
  isActive: boolean;
  institution?: string;
  emailVerifiedAt?: ISODateString;
  lastLoginAt?: ISODateString;
  statusReason?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ListUsersQuery {
  search?: string;
  role?: SystemRole;
  accountStatus?: AccountStatus;
  emailVerified?: boolean;
  isActive?: boolean;
  sortBy?: "createdAt" | "lastLoginAt" | "fullName" | "email";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface ListUsersResponse {
  data: AdminUserItem[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

export interface UpdateUserRoleRequest {
  role: SystemRole;
  reason: string;
}

export interface UpdateUserStatusRequest {
  accountStatus: AccountStatus;
  reason: string;
}

export interface CreateAdminUserRequest {
  email: string;
  fullName: string;
  password: string;
  role: SystemRole;
  institution?: string;
  accountStatus?: AccountStatus;
}

export interface UpdateAdminUserRequest {
  email?: string;
  fullName?: string;
  institution?: string | null;
}

export interface AdminUserSummary {
  total: number;
  active: number;
  suspended: number;
  disabled: number;
  unverifiedEmail: number;
  byRole: Record<SystemRole, number>;
}

export interface AdminUserSession {
  id: string;
  userAgent?: string;
  ipAddress?: string;
  lastUsedAt?: ISODateString;
  expiresAt: ISODateString;
  createdAt: ISODateString;
}

export interface AdminUserDetail extends AdminUserItem {
  academicProfile?: {
    primaryPosition?: PrimaryPosition;
    positionTitle?: string;
    department?: string;
    verificationStatus?: string;
    publicHandle?: string;
    profileVisibility?: string;
    headline?: string;
    institutionalEmail?: string;
    institutionalEmailVerifiedAt?: ISODateString;
    identityStatus?: string;
    emailStatus?: string;
    affiliationStatus?: string;
    positionStatus?: string;
    orcidStatus?: string;
  };
  authenticationMethods: Array<"PASSWORD" | "GOOGLE">;
  onboardingCompletedAt?: ISODateString;
  statusChangedAt?: ISODateString;
  statusChangedBy?: { id: string; fullName: string; email: string };
  points: number;
  credits: number;
  penaltyPoints: number;
  capabilities: string[];
  activeSessions: AdminUserSession[];
  recentActivity: AdminAuditLogItem[];
}

export interface AdminStats {
  users: { total: number; byRole: Record<SystemRole, number> };
  papers: number;
  reports: number;
  gaps: number;
  activeProjects?: number;
  pendingVerifications?: number;
  aiJobs?: number;
  communities?: number;
  discussions?: number;
  systemHealth?: {
    db: "healthy" | "degraded" | "down";
    redis: "healthy" | "degraded" | "down";
    workers: "active" | "degraded" | "idle";
    api: "healthy" | "degraded" | "down";
    timestamp: ISODateString;
  };
  recentActivity?: Array<{
    id: string;
    actionName: string;
    targetTableName?: string | null;
    targetRecordId?: string | null;
    details?: unknown;
    createdAt: ISODateString;
    user?: {
      id: string;
      fullName: string;
      email: string;
    } | null;
  }>;
  sync: {
    totalRuns: number;
    totalFetched: number;
    totalInserted: number;
    totalUpdated: number;
    totalDuplicates: number;
    latestRun: {
      id: string;
      status: "running" | "succeeded" | "failed" | "cancelled";
      searchText?: string;
      startedAt: ISODateString;
      finishedAt?: ISODateString;
      totalFetched: number;
      totalInserted: number;
      totalUpdated: number;
      totalDuplicates: number;
      errorMessage?: string;
    } | null;
  };
}

export interface AdminAuditLogItem {
  id: string;
  actionName: string;
  targetTableName?: string | null;
  targetRecordId?: string | null;
  details?: unknown;
  createdAt: ISODateString;
  user?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

export interface AdminWorkerStatus {
  name: string;
  queue: string;
  status: "active" | "idle" | "stopped";
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  lastHeartbeat: ISODateString;
}

export interface AdminPlatformSettings {
  initialCredits: number;
  openAlexRateLimit: number;
  enablePublicRegistration: boolean;
  enableAutoEmailVerify: boolean;
  enableAiEvaluationJudge: boolean;
  trustedInstitutions: Array<{
    id: string;
    name: string;
    rorId?: string | null;
    domains: string[];
    isActive: boolean;
  }>;
  apiProviders: Array<{
    id: string;
    providerName: string;
    baseUrl: string;
    providerKind: string;
    providerStatus: string;
    rateLimitPerMin: number;
  }>;
}
