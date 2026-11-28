// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminAiOperationsResponse,
  AdminPlatformSettings,
  AdminStats,
  AdminWorkersFleetResponse,
} from "@trend/shared-types";

const mocks = vi.hoisted(() => ({
  getStats: vi.fn(),
  getWorkers: vi.fn(),
  getAiOperations: vi.fn(),
  getSettings: vi.fn(),
  updateInstitution: vi.fn(),
  updateApiProvider: vi.fn(),
  getPlatformAi: vi.fn(),
  getQualityAgreement: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("@/features/auth", () => ({
  useCurrentUser: () => ({
    data: {
      user: {
        id: "admin-1",
        email: "ops@lumigap.edu",
        fullName: "Ops Admin",
        systemRole: "ADMIN",
      },
    },
    isLoading: false,
  }),
}));

vi.mock("@/features/admin/api/platform-ai.api", () => ({
  platformAiApi: {
    get: mocks.getPlatformAi,
  },
}));

vi.mock("@/features/admin/components/platform-ai-settings", () => ({
  PlatformAiSettings: () => <div data-testid="platform-ai-settings">Platform AI Settings</div>,
}));

vi.mock("@/features/admin/components/platform-embedding-settings", () => ({
  PlatformEmbeddingSettings: () => <div data-testid="platform-embedding-settings">Platform Embedding Settings</div>,
}));

vi.mock("@/features/admin/api/admin-users.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/admin/api/admin-users.api")>();
  return {
    ...actual,
    adminUsersApi: {
      ...actual.adminUsersApi,
      stats: mocks.getStats,
    },
  };
});

vi.mock("@/features/admin/api/admin.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/admin/api/admin.api")>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      getStats: mocks.getStats,
      getWorkers: mocks.getWorkers,
      getAiOperations: mocks.getAiOperations,
      getSettings: mocks.getSettings,
      updateInstitution: mocks.updateInstitution,
      updateApiProvider: mocks.updateApiProvider,
    },
  };
});

vi.mock("@/features/admin/hooks/use-quality-agreement", () => ({
  useQualityAgreement: mocks.getQualityAgreement,
}));

import { AdminHomePage } from "../index";
import { AdminWorkersPage } from "../workers";
import { AdminAiJobsPage } from "../ai-jobs";
import { AdminSettingsPage } from "../settings";

const MOCK_STATS: AdminStats = {
  generatedAt: "2026-11-26T04:00:00.000Z",
  unavailableSections: ["moderation"],
  users: {
    total: 142,
    byRole: { USER: 139, ADMIN: 3 },
    byStatus: { ACTIVE: 135, SUSPENDED: 5, DISABLED: 2 },
    byAcademicRole: { STUDENT: 90, LECTURER: 32, RESEARCHER: 15, UNSPECIFIED: 5 },
    unverifiedEmail: 9,
  },
  projects: { total: 48, active: 21, planning: 12, onHold: 4, completed: 9, archived: 2 },
  mentorships: { activeRelationships: 18, pendingRequests: 4 },
  papers: 3240,
  reports: 67,
  gaps: 120,
  activeProjects: 21,
  pendingVerifications: 6,
  aiJobs: 89,
  communities: 11,
  discussions: 53,
  attention: {
    pendingVerifications: 6,
    pendingPaperRequests: 3,
    openModerationReports: null,
    pendingAppeals: null,
    failedAiRuns: 2,
    staleAiJobs: 1,
    failedSyncRuns: 1,
    unhealthyWorkers: 2,
  },
  corpus: {
    totalPapers: 3240,
    activePapers: 3100,
    analyzablePapers: 2800,
    embeddedPapers: 2520,
    aiAnalyzedPapers: 1960,
    embeddingCoveragePct: 90,
    aiAnalysisCoveragePct: 70,
  },
  aiOperations: {
    totalAiRuns: 89,
    runningAiRuns: 2,
    failedAiRuns: 2,
    totalReports: 67,
    readyReports: 62,
    failedReports: 3,
    totalGapAnalyses: 34,
    failedGapAnalyses: 1,
    totalResearchGaps: 120,
    validatedResearchGaps: 44,
  },
  systemHealth: {
    overall: "degraded",
    checkedAt: "2026-11-26T04:00:00.000Z",
    timestamp: "2026-11-26T04:00:00.000Z",
    api: "healthy",
    db: "healthy",
    redis: "healthy",
    workers: "degraded",
    dependencies: {
      api: { status: "healthy", latencyMs: 1, detail: "Responding" },
      database: { status: "healthy", latencyMs: 4, detail: null },
      redis: { status: "healthy", latencyMs: 2, detail: null },
      workers: { status: "degraded", detail: "2/4 alive", expected: 4, alive: 2, stale: 1, missing: 1 },
      aiProvider: {
        status: "unknown",
        detail: "Configured",
        source: "platform_connection",
        name: "Anthropic OpenAI Proxy",
        fastModel: "claude-haiku-4.5",
        deepModel: "claude-sonnet-4.5",
      },
      embeddingProvider: {
        status: "unknown",
        detail: "Configured",
        source: "environment_default",
        name: "Environment Embedding",
        model: "text-embedding-3-small",
        dimensions: 768,
      },
    },
  },
  recentActivity: [],
  sync: {
    totalRuns: 14,
    failedRuns: 1,
    totalFetched: 5000,
    totalInserted: 3240,
    totalUpdated: 400,
    totalDuplicates: 1360,
    latestRun: null,
  },
};

const MOCK_WORKERS: AdminWorkersFleetResponse = {
  generatedAt: "2026-11-26T04:00:00.000Z",
  redis: { ok: true, error: null },
  summary: { expected: 3, alive: 1, stale: 1, missing: 1 },
  workers: [
    {
      workerName: "sync-worker",
      queueName: "sync",
      status: "alive",
      ageSeconds: 4,
      lastSeenAt: "2026-11-26T03:59:56.000Z",
      startedAt: "2026-11-26T01:00:00.000Z",
      hostname: "worker-1",
      pid: 1201,
    },
    {
      workerName: "report-worker",
      queueName: "report",
      status: "stale",
      ageSeconds: 185,
      lastSeenAt: "2026-11-26T03:56:55.000Z",
      startedAt: "2026-11-26T01:00:00.000Z",
      hostname: "worker-2",
      pid: 1202,
    },
    {
      workerName: "embedding-worker",
      queueName: "embedding",
      status: "missing",
      ageSeconds: null,
      lastSeenAt: null,
      startedAt: null,
    },
  ],
  queues: [
    {
      name: "report",
      label: "Reports",
      waiting: 3,
      active: 1,
      delayed: 0,
      failed: 2,
      completed: 41,
      paused: 0,
      oldestPendingJobAgeSeconds: 22,
      isBacklogged: false,
      hasFailures: true,
    },
  ],
  recentFailedJobs: [
    {
      queue: "report",
      jobId: "job-77",
      name: "generate-report",
      failedReason: "Provider timeout after 30s",
      attemptsMade: 3,
      maxAttempts: 3,
      isExhausted: true,
      timestamp: "2026-11-26T03:50:00.000Z",
    },
  ],
};

const MOCK_AI_OPS: AdminAiOperationsResponse = {
  generatedAt: "2026-11-26T04:00:00.000Z",
  summary: {
    aiRuns: { total: 89, queued: 1, running: 2, completed: 84, failed: 2, cancelled: 0 },
    reports: { total: 67, queued: 0, generating: 2, ready: 62, failed: 3 },
    gapAnalyses: { total: 34, queued: 0, analyzing: 0, completed: 33, failed: 1 },
    researchGaps: { total: 120, validated: 44, candidate: 76 },
  },
  queues: MOCK_WORKERS.queues,
  items: [
    {
      id: "run-fail-1",
      kind: "ai_run",
      operationType: "manuscript_review",
      status: "failed",
      initiator: { id: "u-1", fullName: "Dr. Tran", email: "tran@uni.edu" },
      modelVersion: "claude-sonnet-4.5",
      attempts: 3,
      maxAttempts: 3,
      durationMs: 4200,
      creditCost: 5,
      costUsd: null,
      errorCode: "UPSTREAM_502",
      errorMessage: "Provider gateway returned 502",
      createdAt: "2026-11-26T03:45:00.000Z",
      startedAt: "2026-11-26T03:45:01.000Z",
      completedAt: "2026-11-26T03:45:05.000Z",
    },
  ],
  meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
};

const MOCK_SETTINGS: AdminPlatformSettings = {
  generatedAt: "2026-11-26T04:00:00.000Z",
  initialCredits: 1000,
  openAlexRateLimit: 600,
  environmentPolicies: [
    {
      key: "DEFAULT_INITIAL_CREDITS",
      label: "Initial Sign-up Credits",
      value: 1000,
      unit: "credits",
      source: "env",
      editable: false,
      requiresRestart: true,
      description: "Controlled by server environment.",
    },
  ],
  institutions: [
    {
      id: "inst-1",
      name: "FPT University",
      slug: "fpt-university",
      rorId: "https://ror.org/01234",
      hostInstitution: true,
      domains: ["fpt.edu.vn"],
      isActive: false,
      status: "VERIFIED",
      updatedAt: "2026-11-25T10:00:00.000Z",
    },
  ],
  apiProviders: [
    {
      id: "prov-1",
      providerName: "openalex",
      baseUrl: "https://api.openalex.org",
      providerKind: "bibliographic",
      providerStatus: "enabled",
      rateLimitPerMin: 600,
      updatedAt: "2026-11-25T10:00:00.000Z",
    },
  ],
};

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mocks.getQualityAgreement.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  mocks.getPlatformAi.mockResolvedValue({
    connections: [
      {
        id: "conn-1",
        name: "Anthropic OpenAI Proxy",
        provider: "openai-compatible",
        baseUrl: "https://proxy.example/v1",
        fastModel: "claude-haiku-4.5",
        deepModel: "claude-sonnet-4.5",
        hasApiKey: true,
        isActive: true,
        updatedAt: "2026-11-26T00:00:00.000Z",
      },
    ],
    activeConnectionId: "conn-1",
    environmentDefaults: { provider: "gemini", fastModel: "gemini-2.5-flash", deepModel: "gemini-2.5-pro" },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});

async function renderPage(node: React.ReactNode) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {node}
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe("Admin Workspace Overhaul — Truthfulness & Workflows", () => {
  it("renders truthful dashboard metrics without fabricated claims and shows unavailable section warning", async () => {
    mocks.getStats.mockResolvedValue(MOCK_STATS);
    await renderPage(<AdminHomePage />);

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("+12.5%");
    expect(text).not.toContain("High engagement");
    expect(text).not.toContain("Gemini 2.5 active");
    expect(text).not.toContain("High agreement confirms synthetic review reliability");

    expect(text).toContain("142");
    expect(text).toContain("21");
    expect(text).toContain("Degraded");
    expect(text).toContain("moderation");
  });

  it("renders an explicit error panel on dashboard stats failure instead of fallback zeros", async () => {
    mocks.getStats.mockRejectedValue(new Error("Backend 500"));
    await renderPage(<AdminHomePage />);

    const alert = document.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("Unable to load admin overview");
  });

  it("renders live worker heartbeats (alive/stale/missing) and queue-level metrics separately", async () => {
    mocks.getWorkers.mockResolvedValue(MOCK_WORKERS);
    await renderPage(<AdminWorkersPage />);

    const text = document.body.textContent ?? "";
    expect(text).toContain("sync-worker");
    expect(text).toContain("report-worker");
    expect(text).toContain("embedding-worker");
    expect(text).toContain("Alive");
    expect(text).toContain("Stale");
    expect(text).toContain("Missing");
    expect(text).toContain("Provider timeout after 30s");
  });

  it("renders AI operations with actual failed status and configured provider without hardcoding Gemini", async () => {
    mocks.getAiOperations.mockResolvedValue(MOCK_AI_OPS);
    await renderPage(<AdminAiJobsPage />);

    const text = document.body.textContent ?? "";
    expect(text).toContain("claude-haiku-4.5");
    expect(text).toContain("Anthropic OpenAI Proxy");
    expect(text).toContain("manuscript_review");
    expect(text).toContain("Failed");
    expect(text).toContain("UPSTREAM_502");
    expect(text).not.toContain("Literature reviews synthesized with Gemini");
  });

  it("renders honest settings with real inactive institution status, read-only env policies, and no fake Save Changes button", async () => {
    mocks.getSettings.mockResolvedValue(MOCK_SETTINGS);
    await renderPage(<AdminSettingsPage />);

    const text = document.body.textContent ?? "";
    expect(text).toContain("FPT University");
    expect(text).toContain("Inactive");
    expect(text).toContain("DEFAULT_INITIAL_CREDITS");
    expect(text).toContain(".env controlled");

    const fakeSaveBtn = Array.from(document.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Save Changes",
    );
    expect(fakeSaveBtn).toBeUndefined();
  });
});
