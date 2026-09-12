import type { Job } from "bullmq";
import type { Queue } from "bullmq";
import { apiSyncQueue, corpusValidationQueue, embeddingQueue, gapsQueue, notificationQueue, openAlexIngestQueue, paperAnalysisQueue, reportQueue } from "../../infrastructure/queue.js";
import { readWorkerHeartbeats, type WorkerHeartbeatRecord } from "../../infrastructure/worker-heartbeat.js";
import { PaperModel } from "../papers/models/paper.model.js";
import { ReportModel } from "../reports/models/report.model.js";
import { GapAnalysisModel } from "../gaps/models/gap-analysis.model.js";
import { ApiSyncRunModel } from "../api-sync/models/api-sync-run.model.js";

const STUCK_GENERATING_MS = 5 * 60_000;
const STUCK_QUEUED_MS = 30 * 60_000;
const STUCK_SYNC_RUNNING_MS = 2 * 60 * 60_000;
const BACKLOG_THRESHOLD = 50;
const HIGH_QUEUE_LATENCY_MS = 10 * 60_000;
const WORKER_HEARTBEAT_STALE_MS = 2 * 60_000;

export type PipelineQueueName =
  | "api-sync"
  | "openalex-ingest"
  | "corpus-validation"
  | "embedding"
  | "paper-analysis"
  | "report"
  | "gaps"
  | "notifications";

export interface PipelineQueueStatus {
  name: PipelineQueueName;
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

export interface PipelineFailedJob {
  queue: string;
  jobId: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  maxAttempts: number;
  isExhausted: boolean;
  timestamp?: string;
}

export interface PipelineRecommendation {
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
}

export interface PipelineStatus {
  generatedAt: string;
  redis: {
    ok: boolean;
    error: string | null;
  };
  queues: PipelineQueueStatus[];
  recentFailedJobs: PipelineFailedJob[];
  workers: {
    expected: number;
    alive: number;
    stale: number;
    missing: number;
    heartbeats: PipelineWorkerHeartbeat[];
  };
  corpus: {
    totalPapers: number;
    activePapers: number;
    analyzablePapers: number;
    embeddedPapers: number;
    pendingEmbedding: number;
    aiAnalyzedPapers: number;
    pendingAiAnalysis: number;
    embeddingCoveragePct: number;
    aiAnalysisCoveragePct: number;
  };
  stale: {
    reportsQueuedTooLong: number;
    reportsGeneratingTooLong: number;
    gapsQueuedTooLong: number;
    gapsAnalyzingTooLong: number;
    syncRunningTooLong: number;
  };
  sync: {
    running: boolean;
    latestRun: null | {
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
    };
  };
  recommendations: PipelineRecommendation[];
}

export interface PipelineWorkerHeartbeat {
  workerName: string;
  queueName: PipelineQueueName;
  status: "alive" | "stale" | "missing";
  ageSeconds: number | null;
  lastSeenAt: string | null;
  startedAt: string | null;
  hostname?: string;
  pid?: number;
}

type QueueCountsLike = Partial<Record<"waiting" | "wait" | "active" | "delayed" | "failed" | "completed" | "paused", number>>;

export interface QueueAdapter {
  name: PipelineQueueName;
  label: string;
  getJobCounts(): Promise<QueueCountsLike>;
  getOldestPendingJob(): Promise<null | Pick<Job, "id" | "timestamp">>;
  getFailedJobs(): Promise<Array<Pick<Job, "id" | "name" | "failedReason" | "attemptsMade" | "timestamp" | "opts">>>;
}

interface CorpusRepository {
  countTotalPapers(): Promise<number>;
  countActivePapers(): Promise<number>;
  countAnalyzablePapers(): Promise<number>;
  countEmbeddedPapers(): Promise<number>;
  countAiAnalyzedPapers(): Promise<number>;
}

interface StaleRepository {
  countReportsQueuedBefore(before: Date): Promise<number>;
  countReportsGeneratingBefore(before: Date): Promise<number>;
  countGapsQueuedBefore(before: Date): Promise<number>;
  countGapsAnalyzingBefore(before: Date): Promise<number>;
  countSyncRunningBefore(before: Date): Promise<number>;
}

interface SyncRepository {
  getLatestRun(): Promise<PipelineStatus["sync"]["latestRun"]>;
  hasFreshRunningRun(since: Date): Promise<boolean>;
}

interface HeartbeatRepository {
  getHeartbeats(): Promise<WorkerHeartbeatRecord[]>;
}

export interface PipelineStatusDeps {
  now?: () => Date;
  queueAdapters: QueueAdapter[];
  corpusRepository: CorpusRepository;
  staleRepository: StaleRepository;
  syncRepository: SyncRepository;
  heartbeatRepository: HeartbeatRepository;
}

export function createPipelineStatusService(deps: PipelineStatusDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    async getStatus(): Promise<PipelineStatus> {
      const generatedAt = now();

      const [queueResult, corpus, stale, sync] = await Promise.all([
        inspectQueues(deps.queueAdapters, generatedAt),
        getCorpus(deps.corpusRepository),
        getStale(deps.staleRepository, generatedAt),
        getSync(deps.syncRepository, generatedAt),
      ]);
      const workers = await getWorkers(deps.heartbeatRepository, generatedAt);

      return {
        generatedAt: generatedAt.toISOString(),
        redis: queueResult.redis,
        queues: queueResult.queues,
        recentFailedJobs: queueResult.recentFailedJobs,
        workers,
        corpus,
        stale,
        sync,
        recommendations: buildRecommendations(queueResult.redis, queueResult.queues, workers, corpus, stale),
      };
    },
  };
}

async function inspectQueues(queueAdapters: QueueAdapter[], currentTime: Date): Promise<{
  redis: PipelineStatus["redis"];
  queues: PipelineQueueStatus[];
  recentFailedJobs: PipelineFailedJob[];
}> {
  try {
    const queueResults = await Promise.all(
      queueAdapters.map(async (queue) => {
        const [counts, oldestPendingJob, failedJobs] = await Promise.all([
          queue.getJobCounts(),
          queue.getOldestPendingJob(),
          queue.getFailedJobs(),
        ]);
        const waiting = getCount(counts, "waiting") + getCount(counts, "wait");
        const active = getCount(counts, "active");
        const delayed = getCount(counts, "delayed");
        const failed = getCount(counts, "failed");
        const completed = getCount(counts, "completed");
        const paused = getCount(counts, "paused");

        return {
          status: {
            name: queue.name,
            label: queue.label,
            waiting,
            active,
            delayed,
            failed,
            completed,
            paused,
            oldestPendingJobAgeSeconds: oldestPendingJob
              ? Math.max(0, Math.floor((currentTime.getTime() - oldestPendingJob.timestamp) / 1000))
              : null,
            isBacklogged: waiting + delayed > BACKLOG_THRESHOLD,
            hasFailures: failed > 0,
          } satisfies PipelineQueueStatus,
          failedJobs: failedJobs.map((job) => {
            const maxAttempts = getMaxAttempts(job);
            return {
              queue: queue.name,
              jobId: String(job.id ?? ""),
              name: job.name,
              failedReason: sanitizeReason(job.failedReason),
              attemptsMade: job.attemptsMade,
              maxAttempts,
              isExhausted: job.attemptsMade >= maxAttempts,
              timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : undefined,
            };
          }),
        };
      }),
    );

    return {
      redis: { ok: true, error: null },
      queues: queueResults.map((result) => result.status),
      recentFailedJobs: queueResults.flatMap((result) => result.failedJobs).slice(0, 10),
    };
  } catch (err) {
    return {
      redis: { ok: false, error: errorMessage(err) },
      queues: [],
      recentFailedJobs: [],
    };
  }
}

async function getWorkers(
  repository: HeartbeatRepository,
  currentTime: Date,
): Promise<PipelineStatus["workers"]> {
  const seen = await repository.getHeartbeats().catch(() => []);
  const byWorker = new Map<string, WorkerHeartbeatRecord>(seen.map((heartbeat) => [heartbeat.workerName, heartbeat]));
  const observed = seen.map((heartbeat) => toWorkerHeartbeat(heartbeat, currentTime));
  const missing = EXPECTED_WORKERS.filter((worker) => !byWorker.has(worker.workerName)).map((worker) => ({
    workerName: worker.workerName,
    queueName: worker.queueName,
    status: "missing" as const,
    ageSeconds: null,
    lastSeenAt: null,
    startedAt: null,
  }));
  const heartbeats = [...observed, ...missing];

  return {
    expected: EXPECTED_WORKERS.length,
    alive: heartbeats.filter((heartbeat) => heartbeat.status === "alive").length,
    stale: heartbeats.filter((heartbeat) => heartbeat.status === "stale").length,
    missing: heartbeats.filter((heartbeat) => heartbeat.status === "missing").length,
    heartbeats,
  };
}

function toWorkerHeartbeat(record: WorkerHeartbeatRecord, currentTime: Date): PipelineWorkerHeartbeat {
  const lastSeenAt = new Date(record.lastSeenAt);
  const ageSeconds = Number.isFinite(lastSeenAt.getTime())
    ? Math.max(0, Math.floor((currentTime.getTime() - lastSeenAt.getTime()) / 1000))
    : null;

  return {
    workerName: record.workerName,
    queueName: record.queueName,
    status: ageSeconds !== null && ageSeconds * 1000 <= WORKER_HEARTBEAT_STALE_MS ? "alive" : "stale",
    ageSeconds,
    lastSeenAt: record.lastSeenAt,
    startedAt: record.startedAt,
    hostname: record.hostname,
    pid: record.pid,
  };
}

async function getCorpus(repository: CorpusRepository): Promise<PipelineStatus["corpus"]> {
  const [totalPapers, activePapers, analyzablePapers, embeddedPapers, aiAnalyzedPapers] = await Promise.all([
    repository.countTotalPapers(),
    repository.countActivePapers(),
    repository.countAnalyzablePapers(),
    repository.countEmbeddedPapers(),
    repository.countAiAnalyzedPapers(),
  ]);

  const pendingEmbedding = Math.max(0, analyzablePapers - embeddedPapers);
  const pendingAiAnalysis = Math.max(0, analyzablePapers - aiAnalyzedPapers);

  return {
    totalPapers,
    activePapers,
    analyzablePapers,
    embeddedPapers,
    pendingEmbedding,
    aiAnalyzedPapers,
    pendingAiAnalysis,
    embeddingCoveragePct: pct(embeddedPapers, analyzablePapers),
    aiAnalysisCoveragePct: pct(aiAnalyzedPapers, analyzablePapers),
  };
}

async function getStale(repository: StaleRepository, currentTime: Date): Promise<PipelineStatus["stale"]> {
  const queuedBefore = new Date(currentTime.getTime() - STUCK_QUEUED_MS);
  const generatingBefore = new Date(currentTime.getTime() - STUCK_GENERATING_MS);
  const syncRunningBefore = new Date(currentTime.getTime() - STUCK_SYNC_RUNNING_MS);
  const [reportsQueuedTooLong, reportsGeneratingTooLong, gapsQueuedTooLong, gapsAnalyzingTooLong, syncRunningTooLong] =
    await Promise.all([
      repository.countReportsQueuedBefore(queuedBefore),
      repository.countReportsGeneratingBefore(generatingBefore),
      repository.countGapsQueuedBefore(queuedBefore),
      repository.countGapsAnalyzingBefore(generatingBefore),
      repository.countSyncRunningBefore(syncRunningBefore),
    ]);

  return { reportsQueuedTooLong, reportsGeneratingTooLong, gapsQueuedTooLong, gapsAnalyzingTooLong, syncRunningTooLong };
}

async function getSync(repository: SyncRepository, currentTime = new Date()): Promise<PipelineStatus["sync"]> {
  const freshRunningSince = new Date(currentTime.getTime() - STUCK_SYNC_RUNNING_MS);
  const [latestRun, running] = await Promise.all([
    repository.getLatestRun(),
    repository.hasFreshRunningRun(freshRunningSince),
  ]);
  return { latestRun, running };
}

function buildRecommendations(
  redis: PipelineStatus["redis"],
  queues: PipelineQueueStatus[],
  workers: PipelineStatus["workers"],
  corpus: PipelineStatus["corpus"],
  stale: PipelineStatus["stale"],
): PipelineRecommendation[] {
  const recommendations: PipelineRecommendation[] = [];

  if (!redis.ok) {
    recommendations.push({
      severity: "critical",
      title: "Redis/queue unavailable",
      description: `BullMQ queues cannot be inspected: ${redis.error ?? "unknown Redis error"}. Reports, gaps, sync, and embedding workers may stay queued.`,
    });
  }

  const failedQueues = queues.filter((queue) => queue.hasFailures);
  if (failedQueues.length > 0) {
    recommendations.push({
      severity: "warning",
      title: "Queue has failed jobs",
      description: `${failedQueues.map((queue) => queue.label).join(", ")} have failed jobs. Check worker logs before scaling more work.`,
    });
  }

  const backloggedQueues = queues.filter((queue) => queue.isBacklogged);
  if (backloggedQueues.length > 0) {
    recommendations.push({
      severity: "warning",
      title: "Queue backlog is growing",
      description: `${backloggedQueues.map((queue) => queue.label).join(", ")} have more than ${BACKLOG_THRESHOLD} waiting or delayed jobs.`,
    });
  }

  const slowQueues = queues.filter(
    (queue) => queue.oldestPendingJobAgeSeconds !== null && queue.oldestPendingJobAgeSeconds * 1000 > HIGH_QUEUE_LATENCY_MS,
  );
  if (slowQueues.length > 0) {
    recommendations.push({
      severity: "warning",
      title: "Queue latency is high",
      description: `${slowQueues.map((queue) => queue.label).join(", ")} have waiting jobs older than ${Math.floor(HIGH_QUEUE_LATENCY_MS / 60_000)} minutes.`,
    });
  }

  if (workers.stale + workers.missing > 0) {
    recommendations.push({
      severity: "critical",
      title: "Worker heartbeat missing or stale",
      description: `${workers.alive}/${workers.expected} expected workers are alive. Missing/stale workers can leave report, gap, embedding, or sync jobs stuck.`,
    });
  }

  if (corpus.pendingEmbedding > 0 && corpus.embeddingCoveragePct < 90) {
    recommendations.push({
      severity: "warning",
      title: "Embedding coverage is below target",
      description: `${corpus.pendingEmbedding} analyzable papers are missing embeddings. Run or scale the embedding worker before relying on semantic search/RAG.`,
    });
  }

  if (corpus.pendingAiAnalysis > 0 && corpus.aiAnalysisCoveragePct < 70) {
    recommendations.push({
      severity: "info",
      title: "Structured AI coverage is still warming up",
      description: `${corpus.pendingAiAnalysis} analyzable papers are missing structured AI analysis. Run the paper-analysis worker to improve gaps, directions, reports, and chat grounding.`,
    });
  }

  if (
    stale.reportsQueuedTooLong +
      stale.reportsGeneratingTooLong +
      stale.gapsQueuedTooLong +
      stale.gapsAnalyzingTooLong >
    0
  ) {
    recommendations.push({
      severity: "warning",
      title: "Stale AI work detected",
      description: "Some report or gap jobs have stayed queued/analyzing longer than expected. Restart workers or inspect queue failures.",
    });
  }

  if (stale.syncRunningTooLong > 0) {
    recommendations.push({
      severity: "warning",
      title: "Stale sync run detected",
      description: `${stale.syncRunningTooLong} sync run(s) have stayed running for more than 2 hours. They may be interrupted records rather than active work.`,
    });
  }

  return recommendations;
}

function getCount(counts: QueueCountsLike, key: keyof QueueCountsLike): number {
  const value = counts[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function sanitizeReason(reason: unknown): string {
  const text = typeof reason === "string" && reason.trim() ? reason.trim() : "Unknown failure";
  return text.slice(0, 500);
}

function getMaxAttempts(job: Pick<Job, "opts">): number {
  const attempts = job.opts?.attempts;
  return typeof attempts === "number" && Number.isFinite(attempts) && attempts > 0 ? attempts : 1;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function queueAdapter(name: PipelineQueueName, label: string, queue: Queue): QueueAdapter {
  return {
    name,
    label,
    getJobCounts: () => queue.getJobCounts("waiting", "active", "delayed", "failed", "completed", "paused"),
    async getOldestPendingJob() {
      const [job] = await queue.getJobs(["waiting"], 0, 0, true);
      return job ? { id: job.id, timestamp: job.timestamp } : null;
    },
    getFailedJobs: () => queue.getFailed(0, 4),
  };
}

export const pipelineService = createPipelineStatusService({
  queueAdapters: [
    queueAdapter("api-sync", "API Sync", apiSyncQueue),
    queueAdapter("openalex-ingest", "OpenAlex Campaign Ingest", openAlexIngestQueue),
    queueAdapter("corpus-validation", "Corpus Validation", corpusValidationQueue),
    queueAdapter("embedding", "Embeddings", embeddingQueue),
    queueAdapter("paper-analysis", "Paper Analysis", paperAnalysisQueue),
    queueAdapter("report", "Reports", reportQueue),
    queueAdapter("gaps", "Research Gaps", gapsQueue),
    queueAdapter("notifications", "Notifications", notificationQueue),
  ],
  corpusRepository: {
    countTotalPapers: () => PaperModel.countDocuments({}),
    countActivePapers: () => PaperModel.countDocuments({ dataStatus: "active" }),
    countAnalyzablePapers: () => PaperModel.countDocuments({ isAiAnalyzable: true }),
    countEmbeddedPapers: () => PaperModel.countDocuments({ isAiAnalyzable: true, embedding: { $exists: true } }),
    countAiAnalyzedPapers: () => PaperModel.countDocuments({
      isAiAnalyzable: true,
      "aiAnalysis.analysisPromptVersion": { $exists: true },
    }),
  },
  staleRepository: {
    countReportsQueuedBefore: (before) => ReportModel.countDocuments({ status: "queued", updatedAt: { $lt: before } }),
    countReportsGeneratingBefore: (before) =>
      ReportModel.countDocuments({ status: "generating", updatedAt: { $lt: before } }),
    countGapsQueuedBefore: (before) => GapAnalysisModel.countDocuments({ status: "queued", updatedAt: { $lt: before } }),
    countGapsAnalyzingBefore: (before) =>
      GapAnalysisModel.countDocuments({ status: "analyzing", updatedAt: { $lt: before } }),
    countSyncRunningBefore: (before) => ApiSyncRunModel.countDocuments({ runStatus: "running", startedAt: { $lt: before } }),
  },
  syncRepository: {
    async getLatestRun() {
      const run = await ApiSyncRunModel.findOne().sort({ startedAt: -1 }).lean();
      if (!run) return null;
      return {
        id: String(run._id),
        status: run.runStatus,
        searchText: run.searchText ?? undefined,
        startedAt: run.startedAt?.toISOString(),
        finishedAt: run.finishedAt?.toISOString(),
        totalFetched: run.totalFetched,
        totalInserted: run.totalInserted,
        totalUpdated: run.totalUpdated,
        totalDuplicates: run.totalDuplicates,
        totalRejected: 0,
      };
    },
    async hasFreshRunningRun(since) {
      return (await ApiSyncRunModel.countDocuments({ runStatus: "running", startedAt: { $gte: since } })) > 0;
    },
  },
  heartbeatRepository: {
    getHeartbeats: readWorkerHeartbeats,
  },
});

const EXPECTED_WORKERS: Array<{ workerName: string; queueName: PipelineQueueName }> = [
  { workerName: "worker:report", queueName: "report" },
  { workerName: "worker:gaps", queueName: "gaps" },
  { workerName: "worker:embedding", queueName: "embedding" },
  { workerName: "worker:paper-analysis", queueName: "paper-analysis" },
  { workerName: "worker:notifications", queueName: "notifications" },
  { workerName: "worker:sync", queueName: "api-sync" },
  { workerName: "worker:openalex-ingest", queueName: "openalex-ingest" },
  { workerName: "worker:corpus-validation", queueName: "corpus-validation" },
];
