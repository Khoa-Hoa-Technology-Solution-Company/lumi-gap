import { createHash } from "node:crypto";
import type { Job } from "bullmq";
import type { QualityEvaluation, QualityEvaluationTask, QualityLanguage, QualityTargetKind } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { qualityService, resolveQualityTarget } from "./quality.service.js";
import { withUserAi } from "../user-ai/user-ai.runtime.js";
import type { EvaluateInput } from "./dto/quality.schema.js";

export const QUALITY_EVALUATION_JOB = "quality-evaluation";
export interface QualityEvaluationPayload extends EvaluateInput { userId: string }
const getQueue = async () => (await import("../../infrastructure/queue.js")).aiJobsQueue;

/** BullMQ retries Redis connections indefinitely; HTTP reads must remain bounded. */
async function queueDeadline<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(AppError.serviceUnavailable("AI evaluation queue is temporarily unavailable. Please try again later.")), 2000); }),
    ]);
  } finally { clearTimeout(timer); }
}

export function qualityEvaluationJobId(userId: string, targetKind: QualityTargetKind, targetId: string, language: QualityLanguage) {
  return `quality-${createHash("sha256").update(JSON.stringify([userId, targetKind, targetId, language])).digest("hex").slice(0, 40)}`;
}

async function present(job: Job<QualityEvaluationPayload, QualityEvaluation>): Promise<QualityEvaluationTask> {
  const state = await job.getState();
  if (state === "completed") return { jobId: job.id, status: "completed", evaluation: job.returnvalue };
  if (state === "failed") return { jobId: job.id, status: "failed", error: job.failedReason || "AI evaluation failed. Please try again." };
  return { jobId: job.id, status: state === "active" ? "running" : "queued" };
}

export const qualityJobs = {
  async start(userId: string, input: EvaluateInput): Promise<QualityEvaluationTask> {
    const prepared = await qualityService.prepareEvaluation(userId, input);
    if (!input.force && prepared.current?.freshness === "current") return { status: "completed", evaluation: prepared.current };
    const language = input.language ?? "en";
    const jobId = qualityEvaluationJobId(prepared.ownerId, input.targetKind, prepared.targetId, language);
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
      const job = await queue.add(QUALITY_EVALUATION_JOB, { ...input, language, targetId: prepared.targetId, userId: prepared.ownerId }, { jobId, attempts: 1 });
      return present(job);
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw AppError.serviceUnavailable("Unable to queue AI evaluation. Please try again later.");
    }
  },

  async get(userId: string, jobId: string): Promise<QualityEvaluationTask> {
    const job = await queueDeadline(async () => (await getQueue()).getJob(jobId));
    if (!job || job.name !== QUALITY_EVALUATION_JOB) throw AppError.notFound("Evaluation task not found");
    const { owner } = await resolveQualityTarget(userId, job.data.targetKind, job.data.targetId);
    if (owner.id !== job.data.userId) throw AppError.notFound("Evaluation task not found");
    const task = await queueDeadline(() => present(job));
    if (task.status === "completed") {
      // Recheck freshness on completion, including a target edited while the job ran.
      task.evaluation = (await qualityService.view(userId, job.data.targetKind, job.data.targetId)).evaluation;
    }
    return task;
  },

  async active(userId: string, kind: QualityTargetKind, id: string, language: QualityLanguage): Promise<QualityEvaluationTask | undefined> {
    const { owner, row } = await resolveQualityTarget(userId, kind, id);
    try {
      const job = await queueDeadline(async () => (await getQueue()).getJob(qualityEvaluationJobId(owner.id, kind, row.id, language)));
      if (!job) return undefined;
      const task = await queueDeadline(() => present(job));
      return task.status === "completed" ? undefined : task;
    } catch {
      // The saved assessment and community ratings remain readable during a queue outage.
      return undefined;
    }
  },

  async process(payload: QualityEvaluationPayload): Promise<QualityEvaluation> {
    // Never use the worker's default connection in place of the caller's chosen AI provider.
    try {
      return await withUserAi(payload.userId, () => qualityService.evaluate(payload.userId, payload));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw AppError.serviceUnavailable("AI evaluation is temporarily unavailable. Please try again.");
    }
  },
};
