// packages/shared-types/src/admin.ts
import type { ISODateString } from "./common.js";
import type { AccountStatus, AcademicProfileType, PrimaryPosition, SystemRole } from "./user.js";

export type AdminAcademicRole = "STUDENT" | "LECTURER" | "RESEARCHER";

export type AdminVerificationStatusFilter =
  | "SELF_DECLARED"
  | "PENDING"
  | "NEEDS_MORE_INFORMATION"
  | "VERIFIED"
  | "REJECTED";

export interface AdminUserItem {
  id: string;
  email: string;
  fullName: string;
  role: SystemRole;
  academicProfileType?: AcademicProfileType;
  academicRole?: AdminAcademicRole;
  primaryPosition?: PrimaryPosition;
  positionTitle?: string;
  verificationStatus?: string;
  positionStatus?: string;
  affiliationStatus?: string;
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
  academicRole?: AdminAcademicRole;
  verificationStatus?: AdminVerificationStatusFilter;
  institution?: string;
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
  role?: "USER";
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
  byAcademicRole: Record<AdminAcademicRole | "UNSPECIFIED", number>;
}

export interface AdminUserSession {
  id: string;
  userAgent?: string;
  ipAddress?: string;
  lastUsedAt?: ISODateString;
  expiresAt: ISODateString;
  createdAt: ISODateString;
}

export interface AdminUserResearchActivitySummary {
  ownedProjects: number;
  memberProjects: number;
  activeMentorships: number;
  reviewAssignments: number;
  aiRuns: number;
  failedAiRuns: number;
}

export interface AdminUserDetail extends AdminUserItem {
  academicProfile?: {
    academicRole?: AdminAcademicRole;
    primaryPosition?: PrimaryPosition;
    positionTitle?: string;
    department?: string;
    verificationStatus?: string;
    publicHandle?: string;
    profileVisibility?: string;
    headline?: string;
    biography?: string;
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
  researchActivity?: AdminUserResearchActivitySummary;
  recentActivity: AdminAuditLogItem[];
}

export type AdminOperationalStatus =
  | "healthy"
  | "degraded"
  | "unavailable"
  | "unknown"
  | "stale"
  | "not_configured";

export interface AdminDependencyHealth {
  status: AdminOperationalStatus;
  latencyMs?: number | null;
  detail?: string | null;
}

export interface AdminSystemHealth {
  overall: "healthy" | "degraded" | "unavailable";
  checkedAt: ISODateString;
  /** Legacy compatibility fields derived from real probes. */
  db: "healthy" | "degraded" | "down";
  redis: "healthy" | "degraded" | "down";
  workers: "active" | "degraded" | "idle";
  api: "healthy" | "degraded" | "down";
  timestamp: ISODateString;
  dependencies: {
    api: AdminDependencyHealth;
    database: AdminDependencyHealth;
    redis: AdminDependencyHealth;
    workers: AdminDependencyHealth & {
      expected: number;
      alive: number;
      stale: number;
      missing: number;
    };
    aiProvider: AdminDependencyHealth & {
      source: "platform_connection" | "environment_default" | "not_configured";
      name: string | null;
      fastModel: string | null;
      deepModel: string | null;
    };
    embeddingProvider: AdminDependencyHealth & {
      source: "platform_connection" | "environment_default" | "not_configured";
      name: string | null;
      model: string | null;
      dimensions: number | null;
    };
  };
}

export interface AdminAttentionSummary {
  pendingVerifications: number | null;
  pendingPaperRequests: number | null;
  openModerationReports: number | null;
  pendingAppeals: number | null;
  failedAiRuns: number | null;
  staleAiJobs: number | null;
  failedSyncRuns: number | null;
  unhealthyWorkers: number | null;
  /** BullMQ jobs that exhausted all retries, summed over every queue (embedding, tagging, analysis, ...). */
  failedQueueJobs: number | null;
}

export interface AdminStats {
  generatedAt: ISODateString;
  unavailableSections: string[];
  users: {
    total: number;
    byRole: Record<SystemRole, number>;
    byStatus: Record<AccountStatus, number>;
    byAcademicRole: Record<AdminAcademicRole | "UNSPECIFIED", number>;
    unverifiedEmail: number;
  };
  projects: {
    total: number;
    active: number;
    planning: number;
    onHold: number;
    completed: number;
    archived: number;
  } | null;
  mentorships: {
    activeRelationships: number;
    pendingRequests: number;
  } | null;
  papers: number;
  reports: number;
  gaps: number;
  /** Real count of non-deleted projects with status = ACTIVE (null if unavailable). */
  activeProjects: number | null;
  pendingVerifications: number | null;
  /** Count of persisted AiRun records only (never summed with reports). */
  aiJobs: number | null;
  communities: number | null;
  discussions?: number;
  attention: AdminAttentionSummary;
  corpus: {
    totalPapers: number;
    activePapers: number;
    analyzablePapers: number;
    embeddedPapers: number;
    aiAnalyzedPapers: number;
    embeddingCoveragePct: number;
    aiAnalysisCoveragePct: number;
  } | null;
  aiOperations: {
    totalAiRuns: number;
    runningAiRuns: number;
    failedAiRuns: number;
    totalReports: number;
    readyReports: number;
    failedReports: number;
    totalGapAnalyses: number;
    failedGapAnalyses: number;
    totalResearchGaps: number;
    validatedResearchGaps: number;
  } | null;
  systemHealth: AdminSystemHealth;
  recentActivity: AdminAuditLogItem[];
  sync: {
    totalRuns: number;
    failedRuns: number;
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

export interface AdminAuditLogsQuery {
  search?: string;
  actionName?: string;
  targetTableName?: string;
  actorId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminAuditLogsResponse {
  data: AdminAuditLogItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    facets?: {
      targetTables: string[];
    };
  };
}

export interface AdminWorkerHeartbeatItem {
  workerName: string;
  queueName: string;
  status: "alive" | "stale" | "missing";
  ageSeconds: number | null;
  lastSeenAt: ISODateString | null;
  startedAt: ISODateString | null;
  hostname?: string | null;
  pid?: number | null;
}

export interface AdminQueueMetricItem {
  name: string;
  label: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: number;
  oldestPendingJobAgeSeconds: number | null;
  isBacklogged: boolean;
  hasFailures: boolean;
}

export interface AdminFailedQueueJob {
  queue: string;
  jobId: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  maxAttempts: number;
  isExhausted: boolean;
  timestamp?: ISODateString;
}

export interface AdminWorkersFleetResponse {
  generatedAt: ISODateString;
  redis: {
    ok: boolean;
    error: string | null;
  };
  summary: {
    expected: number;
    alive: number;
    stale: number;
    missing: number;
  };
  workers: AdminWorkerHeartbeatItem[];
  queues: AdminQueueMetricItem[];
  recentFailedJobs: AdminFailedQueueJob[];
}

/** @deprecated Legacy flat worker row retained for compatibility. */
export interface AdminWorkerStatus {
  name: string;
  queue: string;
  status: "active" | "idle" | "stopped";
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  lastHeartbeat: ISODateString;
}

export type AdminAiOperationKind = "ai_run" | "report" | "gap_analysis";

export interface AdminAiOperationItem {
  id: string;
  kind: AdminAiOperationKind;
  operationType: string;
  status: string;
  initiator: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  modelVersion: string | null;
  attempts: number | null;
  maxAttempts: number | null;
  durationMs: number | null;
  creditCost: number | null;
  costUsd: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: ISODateString;
  startedAt: ISODateString | null;
  completedAt: ISODateString | null;
}

export interface AdminAiOperationsQuery {
  kind?: "all" | AdminAiOperationKind;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminAiOperationsResponse {
  generatedAt: ISODateString;
  summary: {
    aiRuns: { total: number; queued: number; running: number; completed: number; failed: number; cancelled: number };
    reports: { total: number; queued: number; generating: number; ready: number; failed: number };
    gapAnalyses: { total: number; queued: number; analyzing: number; completed: number; failed: number };
    researchGaps: { total: number; validated: number; candidate: number };
  };
  queues: AdminQueueMetricItem[];
  items: AdminAiOperationItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface AdminRuntimePolicySetting {
  key: string;
  label: string;
  value: string | number | boolean;
  unit?: string;
  source: "env";
  editable: false;
  requiresRestart: true;
  description: string;
}

export interface AdminInstitutionSettingItem {
  id: string;
  name: string;
  slug: string;
  rorId?: string | null;
  hostInstitution: boolean;
  domains: string[];
  isActive: boolean;
  status: string;
  updatedAt: ISODateString;
}

export interface AdminApiProviderSettingItem {
  id: string;
  providerName: string;
  baseUrl: string;
  providerKind: string;
  providerStatus: "enabled" | "disabled" | string;
  rateLimitPerMin: number;
  updatedAt: ISODateString;
}

export interface AdminPlatformSettings {
  generatedAt: ISODateString;
  /** Environment-controlled read-only values reflected from live server config. */
  initialCredits: number;
  openAlexRateLimit: number | null;
  environmentPolicies: AdminRuntimePolicySetting[];
  institutions: AdminInstitutionSettingItem[];
  apiProviders: AdminApiProviderSettingItem[];
}

export interface UpdateAdminInstitutionRequest {
  isActive: boolean;
  reason?: string;
}

export interface UpdateAdminApiProviderRequest {
  rateLimitPerMin?: number;
  providerStatus?: "enabled" | "disabled";
  reason?: string;
}

/** API protocol of an AI connection (personal or platform). */
export type AiConnectionProvider = "gemini" | "openai-compatible";

/** A platform-wide AI connection as shown to admins; the API key is never returned. */
export interface PlatformAiConnection {
  id: string;
  name: string;
  provider: AiConnectionProvider;
  baseUrl: string;
  /** Summaries, scoring, reranking, chat. */
  fastModel: string;
  /** Reports, research gaps, trends. */
  deepModel: string;
  hasApiKey: boolean;
  isActive: boolean;
  updatedAt: string;
}

/** GET /admin/ai-connections. Without an active connection, the environment defaults are used. */
export interface PlatformAiSettings {
  connections: PlatformAiConnection[];
  activeConnectionId: string | null;
  environmentDefaults: { provider: "gemini"; fastModel: string; deepModel: string };
}

/** A platform-wide embedding connection as shown to admins; the API key is never returned. */
export interface PlatformEmbeddingConnection {
  id: string;
  name: string;
  baseUrl: string;
  /** The provider's id for the model. */
  model: string;
  hasApiKey: boolean;
  isActive: boolean;
  /** Cosine against stored vectors at the last check; null when no stored vectors existed to compare with. */
  verifiedSimilarity: number | null;
  updatedAt: string;
}

/** GET /admin/ai-connections/embedding. Without an active connection, the environment defaults are used. */
export interface PlatformEmbeddingSettings {
  connections: PlatformEmbeddingConnection[];
  activeConnectionId: string | null;
  environmentDefaults: { provider: "gemini"; model: string; dimensions: number };
}
