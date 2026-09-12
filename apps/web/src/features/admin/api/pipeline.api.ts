import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants/api";

export interface QueueStatus {
  name: "api-sync" | "openalex-ingest" | "embedding" | "paper-analysis" | "report" | "gaps" | "notifications";
  label: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused?: number;
  oldestPendingJobAgeSeconds: number | null;
  isBacklogged: boolean;
  hasFailures: boolean;
}

export interface FailedJob {
  queue: string;
  jobId: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  maxAttempts: number;
  isExhausted: boolean;
  timestamp?: string;
}

export interface WorkerHeartbeat {
  workerName: string;
  queueName: QueueStatus["name"];
  status: "alive" | "stale" | "missing";
  ageSeconds: number | null;
  lastSeenAt: string | null;
  startedAt: string | null;
  hostname?: string;
  pid?: number;
}

export interface WorkerHeartbeatSummary {
  expected: number;
  alive: number;
  stale: number;
  missing: number;
  heartbeats: WorkerHeartbeat[];
}

export interface CorpusMetrics {
  totalPapers: number;
  activePapers: number;
  analyzablePapers: number;
  embeddedPapers: number;
  pendingEmbedding: number;
  aiAnalyzedPapers: number;
  pendingAiAnalysis: number;
  embeddingCoveragePct: number;
  aiAnalysisCoveragePct: number;
}

export interface StaleMetrics {
  reportsQueuedTooLong: number;
  reportsGeneratingTooLong: number;
  gapsQueuedTooLong: number;
  gapsAnalyzingTooLong: number;
  syncRunningTooLong: number;
}

export interface LatestSyncRun {
  id: string;
  status: string;
  searchText?: string;
  startedAt?: string;
  finishedAt?: string;
  totalFetched?: number;
  totalInserted?: number;
  totalUpdated?: number;
  totalDuplicates?: number;
  totalRejected?: number;
}

export interface SyncStatus {
  running: boolean;
  latestRun: LatestSyncRun | null;
}

export interface Recommendation {
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
}

export interface PipelineStatusResponse {
  generatedAt: string;
  redis: {
    ok: boolean;
    error: string | null;
  };
  queues: QueueStatus[];
  recentFailedJobs: FailedJob[];
  workers: WorkerHeartbeatSummary;
  corpus: CorpusMetrics;
  stale: StaleMetrics;
  sync: SyncStatus;
  recommendations: Recommendation[];
}

export async function getPipelineStatus(): Promise<PipelineStatusResponse> {
  const res = await api.get<{ data: PipelineStatusResponse }>(API_ROUTES.admin.pipelineStatus);
  return res.data.data;
}
