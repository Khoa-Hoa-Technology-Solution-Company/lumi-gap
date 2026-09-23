import type { UserRole } from "@trend/shared-types";
import mongoose from "mongoose";
import { AppError } from "../../common/exceptions/app-error.js";
import { hasPermission } from "../../common/authorization/permissions.js";
import { aiJobsQueue } from "../../infrastructure/queue.js";
import { auditService } from "../audit/audit.service.js";
import { ProjectModel } from "../projects/models/project.model.js";
import { canAccessProject } from "../projects/project-scope.js";
import { DraftWorkspaceModel } from "../workspaces/workspace.model.js";
import { AiRunModel, type AiJobType } from "./ai-run.model.js";

export type CreateAiRunInput = {
  jobType: AiJobType;
  projectId?: string;
  workspaceId?: string;
  prompt?: string;
  evidenceIds?: string[];
  maxAttempts?: number;
};

async function assertProjectAccess(projectId: string, userId: string, role: UserRole) {
  const project = await ProjectModel.findById(projectId).select("ownerId members").lean();
  if (!project) throw AppError.notFound("Project not found");
  if (!canAccessProject(project, userId) && !hasPermission(role, "ai-run:manage")) {
    throw AppError.forbidden("Project membership is required");
  }
}

async function getRunOrThrow(runId: string) {
  const run = await AiRunModel.findById(runId);
  if (!run) throw AppError.notFound("AI run not found");
  return run;
}

async function assertRunAccess(run: { ownerId: mongoose.Types.ObjectId; projectId?: mongoose.Types.ObjectId | null }, userId: string, role: UserRole) {
  if (run.ownerId.toString() === userId || hasPermission(role, "ai-run:manage")) return;
  if (run.projectId) {
    const project = await ProjectModel.findById(run.projectId).select("ownerId members").lean();
    if (project && canAccessProject(project, userId)) return;
  }
  throw AppError.forbidden("You do not have access to this AI run");
}

export async function enqueueAiJob(runId: string) {
  const run = await getRunOrThrow(runId);
  if (run.status !== "queued") throw AppError.conflict("Only queued AI runs can be enqueued");
  const nextAttempt = run.attempts + 1;
  const jobId = `ai-run-${run.id}-attempt-${nextAttempt}`;
  await aiJobsQueue.add(
    run.jobType,
    { runId: run.id, jobType: run.jobType },
    { jobId },
  );
  run.queueJobId = jobId;
  await run.save();
  return run;
}

export async function createAiRun(input: CreateAiRunInput, ownerId: string, ownerRole: UserRole) {
  let projectId = input.projectId;
  if (input.workspaceId) {
    const workspace = await DraftWorkspaceModel.findById(input.workspaceId).select("projectId").lean();
    if (!workspace) throw AppError.notFound("Draft workspace not found");
    if (projectId && workspace.projectId.toString() !== projectId) {
      throw AppError.badRequest("Workspace does not belong to the selected project");
    }
    projectId = workspace.projectId.toString();
  }
  if (projectId) await assertProjectAccess(projectId, ownerId, ownerRole);
  const run = await AiRunModel.create({
    ownerId,
    projectId,
    workspaceId: input.workspaceId,
    jobType: input.jobType,
    prompt: input.prompt,
    evidenceIds: input.evidenceIds ?? [],
    maxAttempts: input.maxAttempts ?? 3,
    status: "queued",
  });
  try {
    await enqueueAiJob(run.id);
  } catch (error) {
    await AiRunModel.updateOne(
      { _id: run._id },
      { $set: { status: "failed", errorCode: "QUEUE_UNAVAILABLE", errorMessage: "Unable to enqueue AI job", completedAt: new Date() } },
    );
    throw error;
  }
  await auditService.log("ai_run.created", {
    userId: ownerId,
    targetTableName: "ai_runs",
    targetRecordId: run.id,
    details: { jobType: input.jobType, projectId },
  });
  return getRunOrThrow(run.id);
}

export async function retryAiJob(runId: string, actorId: string, actorRole: UserRole) {
  const run = await getRunOrThrow(runId);
  await assertRunAccess(run, actorId, actorRole);
  if (run.status !== "failed") throw AppError.conflict("Only failed AI runs can be retried");
  if (run.attempts >= run.maxAttempts) throw AppError.conflict("AI run has reached its retry limit");
  run.status = "queued";
  run.errorCode = undefined;
  run.errorMessage = undefined;
  run.completedAt = undefined;
  await run.save();
  try {
    await enqueueAiJob(run.id);
  } catch (error) {
    await AiRunModel.updateOne(
      { _id: run._id },
      { $set: { status: "failed", errorCode: "QUEUE_UNAVAILABLE", errorMessage: "Unable to enqueue AI job", completedAt: new Date() } },
    );
    throw error;
  }
  await auditService.log("ai_run.retried", {
    userId: actorId,
    targetTableName: "ai_runs",
    targetRecordId: run.id,
    details: { nextAttempt: run.attempts + 1 },
  });
  return getRunOrThrow(run.id);
}

export async function cancelAiJob(runId: string, actorId: string, actorRole: UserRole) {
  const run = await getRunOrThrow(runId);
  await assertRunAccess(run, actorId, actorRole);
  if (["completed", "cancelled"].includes(run.status)) throw AppError.conflict("AI run is already final");
  const now = new Date();
  const cancelled = await AiRunModel.findOneAndUpdate(
    { _id: run._id, status: { $nin: ["completed", "cancelled"] } },
    { $set: { status: "cancelled", cancelRequestedAt: now, completedAt: now } },
    { new: true },
  );
  if (!cancelled) throw AppError.conflict("AI run completed before cancellation could be recorded");
  if (run.queueJobId) {
    const job = await aiJobsQueue.getJob(run.queueJobId);
    if (job) await job.remove().catch(() => undefined);
  }
  await auditService.log("ai_run.cancelled", {
    userId: actorId,
    targetTableName: "ai_runs",
    targetRecordId: run.id,
  });
  return cancelled;
}

export async function markAiRunStarted(runId: string) {
  const run = await AiRunModel.findOneAndUpdate(
    { _id: runId, status: "queued", $expr: { $lt: ["$attempts", "$maxAttempts"] } },
    { $set: { status: "running", startedAt: new Date() }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (!run) throw AppError.conflict("AI run cannot be started");
  return run;
}

export async function completeAiRun(
  runId: string,
  result: { resultSummary?: string; costUsd?: number; latencyMs?: number; evidenceIds?: string[] },
) {
  const evidenceIds = result.evidenceIds ?? [];
  if (evidenceIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw AppError.badRequest("Worker returned an invalid evidence ID");
  }
  const run = await AiRunModel.findOneAndUpdate(
    { _id: runId, status: "running", cancelRequestedAt: { $exists: false } },
    {
      $set: {
        status: "completed",
        resultSummary: result.resultSummary,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
        evidenceIds: evidenceIds.map((id) => new mongoose.Types.ObjectId(id)),
        completedAt: new Date(),
      },
    },
    { new: true, runValidators: true },
  );
  if (!run) throw AppError.conflict("AI run is not active or was cancelled");
  return run;
}

export async function failAiRun(runId: string, error: { code: string; message: string; latencyMs?: number }) {
  return AiRunModel.findOneAndUpdate(
    { _id: runId, status: "running" },
    {
      $set: {
        status: "failed",
        errorCode: error.code.slice(0, 120),
        errorMessage: error.message.slice(0, 2000),
        latencyMs: error.latencyMs,
        completedAt: new Date(),
      },
    },
    { new: true, runValidators: true },
  );
}

export const aiRunService = {
  createAiRun,
  enqueueAiJob,
  retryAiJob,
  cancelAiJob,
  markAiRunStarted,
  completeAiRun,
  failAiRun,

  async get(runId: string, actorId: string, actorRole: UserRole) {
    const run = await getRunOrThrow(runId);
    await assertRunAccess(run, actorId, actorRole);
    return run;
  },
};
