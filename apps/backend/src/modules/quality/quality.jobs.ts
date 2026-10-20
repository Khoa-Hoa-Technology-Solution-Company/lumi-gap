import { createHash } from "node:crypto";
import { UnrecoverableError, type Job } from "bullmq";
import type { QualityErrorCode, QualityEvaluation, QualityEvaluationTask, QualityLanguage, QualityProjectEvaluation, QualityTargetKind } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { qualityService, resolveQualityTarget } from "./quality.service.js";
import { withUserAi } from "../user-ai/user-ai.runtime.js";
import { logger } from "../../infrastructure/logger.js";
import { describeFailure, isQualityErrorCode, qualityError, toQualityError } from "./quality.errors.js";
import type { EvaluateInput } from "./dto/quality.schema.js";

export const QUALITY_EVALUATION_JOB = "quality-evaluation";
export interface QualityEvaluationPayload extends EvaluateInput { userId: string }
const getQueue = async () => (await import("../../infrastructure/queue.js")).aiJobsQueue;
/** Repo convention for worker retries; only transient provider failures (AI_EVALUATION_BUSY) use them. */
export const QUALITY_JOB_OPTIONS = { attempts: 5, backoff: { type: "exponential" as const, delay: 2000 } };

/** The failure code travels in the job's failedReason as "[CODE] message" so GET /evaluation-jobs can return it. */
export function encodeFailure(code: string, message: string) { return `[${code}] ${message}`; }
export function decodeFailure(reason: string | undefined): { error: string; errorCode?: QualityErrorCode } {
  const match = /^\[([A-Z_]+)\] ([\s\S]*)$/.exec(reason ?? "");
  if (match && isQualityErrorCode(match[1])) return { error: match[2]!, errorCode: match[1] };
  if (match) return { error: match[2]! };
  return reason ? { error: reason } : { error: "AI evaluation failed. Please try again.", errorCode: "AI_EVALUATION_UNAVAILABLE" };
}

/** BullMQ retries Redis connections indefinitely; HTTP reads must remain bounded. */
async function queueDeadline<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(qualityError("AI_EVALUATION_UNAVAILABLE", "AI evaluation queue is temporarily unavailable. Please try again later.")), 2000); }),
    ]);
  } finally { clearTimeout(timer); }
}

/** Project-mode tasks get their own ID (projectId included) so they never join a reference task. */
export function qualityEvaluationJobId(userId: string, targetKind: QualityTargetKind, targetId: string, language: QualityLanguage, projectId?: string) {
  const parts = projectId ? [userId, targetKind, targetId, language, projectId] : [userId, targetKind, targetId, language];
  return `quality-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 40)}`;
}

type QualityJobResult = QualityEvaluation | QualityProjectEvaluation;
async function present(job: Job<QualityEvaluationPayload, QualityJobResult>): Promise<QualityEvaluationTask> {
  const state = await job.getState();
  if (state === "completed") return job.data.projectId
    ? { jobId: job.id, status: "completed", projectEvaluation: job.returnvalue as QualityProjectEvaluation }
    : { jobId: job.id, status: "completed", evaluation: job.returnvalue as QualityEvaluation };
  if (state === "failed") return { jobId: job.id, status: "failed", ...decodeFailure(job.failedReason) };
  // "delayed" (waiting for a retry after provider overload) stays queued, so clicks keep joining this task.
  return { jobId: job.id, status: state === "active" ? "running" : "queued" };
}

export const qualityJobs = {
  async start(userId: string, input: EvaluateInput): Promise<QualityEvaluationTask> {
    const language = input.language ?? "en";
    let prepared: { ownerId: string; targetId: string };
    if (input.projectId) {
      // Membership is checked inside, before the shared project assessment is read.
      const project = await qualityService.prepareProjectEvaluation(userId, input);
      if (!input.force && project.current?.freshness === "current") return { status: "completed", projectEvaluation: project.current };
      prepared = project;
    } else {
      const reference = await qualityService.prepareEvaluation(userId, input);
      if (!input.force && reference.current?.freshness === "current") return { status: "completed", evaluation: reference.current };
      prepared = reference;
    }
    const jobId = qualityEvaluationJobId(prepared.ownerId, input.targetKind, prepared.targetId, language, input.projectId);
    try {
      return await queueDeadline(async () => {
      const queue = await getQueue();
      const previous = await queue.getJob(jobId);
      if (previous) {
        const state = await previous.getState();
        if (!["completed", "failed", "unknown"].includes(state)) return present(previous);
        // Only a terminal job is removed; an active job is always shared by concurrent clicks.
        await previous.remove().catch(async () => {
          const competing = await queue.getJob(jobId);
          if (competing && !["completed", "failed"].includes(await competing.getState())) throw AppError.conflict("An evaluation is already in progress. Reopen its status.");
        });
      }
      const job = await queue.add(QUALITY_EVALUATION_JOB, { ...input, language, targetId: prepared.targetId, userId: prepared.ownerId }, { jobId, ...QUALITY_JOB_OPTIONS });
      return present(job);
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw qualityError("AI_EVALUATION_UNAVAILABLE", "Unable to queue AI evaluation. Please try again later.");
    }
  },

  async get(userId: string, jobId: string): Promise<QualityEvaluationTask> {
    const job = await queueDeadline(async () => (await getQueue()).getJob(jobId));
    if (!job || job.name !== QUALITY_EVALUATION_JOB) throw AppError.notFound("Evaluation task not found");
    const { owner } = await resolveQualityTarget(userId, job.data.targetKind, job.data.targetId);
    if (owner.id !== job.data.userId) throw AppError.notFound("Evaluation task not found");
    const projectId = job.data.projectId;
    if (projectId) await qualityService.requireProjectReader(userId, projectId);
    const task = await queueDeadline(() => present(job));
    if (task.status === "completed" && projectId) {
      task.projectEvaluation = (await qualityService.view(userId, "paper", job.data.targetId, { projectId, language: job.data.language })).projectEvaluation;
    } else if (task.status === "completed") {
      // Recheck freshness on completion, including a target edited while the job ran.
      task.evaluation = (await qualityService.view(userId, job.data.targetKind, job.data.targetId)).evaluation;
    }
    return task;
  },

  /** Callers pass `projectId` only after checking membership (QualityService.view does). */
  async active(userId: string, kind: QualityTargetKind, id: string, language: QualityLanguage, projectId?: string): Promise<QualityEvaluationTask | undefined> {
    const { owner, row } = await resolveQualityTarget(userId, kind, id);
    try {
      const job = await queueDeadline(async () => (await getQueue()).getJob(qualityEvaluationJobId(owner.id, kind, row.id, language, projectId)));
      if (!job) return undefined;
      const task = await queueDeadline(() => present(job));
      return task.status === "completed" ? undefined : task;
    } catch {
      // The saved assessment and community ratings remain readable during a queue outage.
      return undefined;
    }
  },

  async process(payload: QualityEvaluationPayload): Promise<QualityJobResult> {
    // Never use the worker's default connection in place of the caller's chosen AI provider.
    try {
      const { projectId } = payload;
      return await withUserAi(payload.userId, () => projectId
        ? qualityService.evaluateProject(payload.userId, { ...payload, projectId })
        : qualityService.evaluate(payload.userId, payload));
    } catch (error) {
      const mapped = toQualityError(error);
      logger.warn({ targetKind: payload.targetKind, targetId: payload.targetId, projectId: payload.projectId, code: mapped.code, cause: describeFailure(error) }, "quality evaluation job failed");
      const reason = encodeFailure(mapped.code, mapped.message);
      // Overload/rate limits retry with backoff; validation, authorization, quota and invalid output never will.
      if (mapped.code === "AI_EVALUATION_BUSY") throw new Error(reason);
      throw new UnrecoverableError(reason);
    }
  },
};
