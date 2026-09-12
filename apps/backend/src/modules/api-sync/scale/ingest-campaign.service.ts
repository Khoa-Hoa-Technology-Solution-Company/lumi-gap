import crypto from "node:crypto";
import mongoose from "mongoose";
import { AppError } from "../../../common/exceptions/app-error.js";
import { OpenAlexIngestCampaignModel, type OpenAlexIngestCampaignDoc } from "../models/openalex-ingest-campaign.model.js";
import { OpenAlexIngestPageAttemptModel, type OpenAlexIngestPageAttemptDoc } from "../models/openalex-ingest-page-attempt.model.js";
import { OpenAlexIngestPartitionModel, type OpenAlexIngestPartitionDoc } from "../models/openalex-ingest-partition.model.js";
import { PaperCohortMembershipModel } from "../models/paper-cohort-membership.model.js";
import { OPENALEX_CAMPAIGN_SAMPLE_SIZE } from "./campaign-planner.js";

export interface CreateCampaignInput {
  campaignKey: string;
  campaignKind: "backfill" | "refresh" | "repair";
  targetUniqueWorks: number;
  manifest: OpenAlexIngestCampaignDoc["manifest"];
}

export interface PlannedPartitionInput {
  partitionKey: string;
  cohortId: string;
  stratumKey: string;
  filterExpression: string;
  plannedPopulation: number;
  targetCount: number;
  selectionMethod: "seeded-sample" | "cursor" | "repair";
  seed?: number;
}

export interface CreatePlannedCampaignInput extends CreateCampaignInput {
  partitions: PlannedPartitionInput[];
}

export interface ClaimInput {
  campaignId: string;
  workerId: string;
  leaseMs: number;
  now?: Date;
}

export interface BeginAttemptInput {
  campaignId: string;
  partitionId: string;
  cursorBefore?: string;
  seed?: number;
  requestFingerprint: string;
}

export interface CommitAttemptInput {
  attemptId: string;
  partitionId: string;
  expectedCheckpointVersion: number;
  cursorAfter?: string;
  responseHash: string;
  expectedResultCount: number;
  acceptedCount: number;
  rejectedCount: number;
  conflictCount: number;
}

export interface MarkPartitionInput {
  partitionId: string;
  workerId: string;
  state: "completed" | "retry_wait" | "dead_letter";
  errorMessage?: string;
}

function objectId(value: string, label: string): mongoose.Types.ObjectId {
  if (!mongoose.isObjectIdOrHexString(value)) throw AppError.badRequest(`Invalid ${label}`);
  return new mongoose.Types.ObjectId(value);
}

export function buildAttemptIdempotencyKey(input: BeginAttemptInput): string {
  return crypto
    .createHash("sha256")
    .update([input.campaignId, input.partitionId, input.cursorBefore ?? "", input.seed ?? "", input.requestFingerprint].join("\u0000"))
    .digest("hex");
}

/** Durable campaign state operations. API handlers enqueue jobs; workers use this service. */
export const ingestCampaignService = {
  async createDraft(input: CreateCampaignInput): Promise<OpenAlexIngestCampaignDoc> {
    return OpenAlexIngestCampaignModel.create({ ...input, state: "draft" });
  },

  async createPlanned(input: CreatePlannedCampaignInput): Promise<OpenAlexIngestCampaignDoc> {
    if (input.partitions.length === 0) throw AppError.badRequest("A campaign requires at least one partition");
    if (input.campaignKind === "backfill" && input.partitions.some((partition) => partition.selectionMethod === "cursor")) {
      throw AppError.badRequest(
        "Backfill partitions must use a planner-approved seeded sample; cursor scans are reserved for repair/refresh paths.",
      );
    }
    if (input.partitions.some((partition) => partition.selectionMethod === "seeded-sample" && partition.targetCount > OPENALEX_CAMPAIGN_SAMPLE_SIZE)) {
      throw AppError.badRequest(`A seeded OpenAlex campaign sample partition cannot exceed ${OPENALEX_CAMPAIGN_SAMPLE_SIZE} works`);
    }
    const campaign = await OpenAlexIngestCampaignModel.create({
      campaignKey: input.campaignKey,
      campaignKind: input.campaignKind,
      targetUniqueWorks: input.targetUniqueWorks,
      manifest: input.manifest,
      state: "planned",
      progress: { plannedPartitions: input.partitions.length },
    });
    try {
      await OpenAlexIngestPartitionModel.insertMany(
        input.partitions.map((partition) => ({ ...partition, campaignId: campaign._id, state: "planned" })),
        { ordered: true },
      );
      return campaign;
    } catch (error) {
      await Promise.all([
        OpenAlexIngestPartitionModel.deleteMany({ campaignId: campaign._id }),
        OpenAlexIngestCampaignModel.deleteOne({ _id: campaign._id }),
      ]);
      throw error;
    }
  },

  async start(campaignIdInput: string): Promise<OpenAlexIngestCampaignDoc> {
    const campaignId = objectId(campaignIdInput, "campaignId");
    const partitionCount = await OpenAlexIngestPartitionModel.countDocuments({
      campaignId,
      state: { $in: ["planned", "retry_wait"] },
    });
    if (partitionCount === 0) {
      throw AppError.conflict("Campaign has no planned partitions. Run preflight/planning before starting it.");
    }
    const campaign = await OpenAlexIngestCampaignModel.findOneAndUpdate(
      { _id: campaignId, state: { $in: ["planned", "paused"] } },
      { $set: { state: "running" }, $setOnInsert: { startedAt: new Date() } },
      { new: true },
    );
    if (!campaign) throw AppError.conflict("Campaign is not in a startable state");
    if (!campaign.startedAt) {
      campaign.startedAt = new Date();
      await campaign.save();
    }
    return campaign;
  },

  async pause(campaignIdInput: string): Promise<OpenAlexIngestCampaignDoc> {
    const campaignId = objectId(campaignIdInput, "campaignId");
    const campaign = await OpenAlexIngestCampaignModel.findOneAndUpdate(
      { _id: campaignId, state: "running" },
      { $set: { state: "paused" } },
      { new: true },
    );
    if (!campaign) throw AppError.conflict("Only a running campaign can be paused");
    return campaign;
  },

  async resume(campaignIdInput: string): Promise<OpenAlexIngestCampaignDoc> {
    return this.start(campaignIdInput);
  },

  async cancel(campaignIdInput: string): Promise<OpenAlexIngestCampaignDoc> {
    const campaignId = objectId(campaignIdInput, "campaignId");
    const campaign = await OpenAlexIngestCampaignModel.findOneAndUpdate(
      { _id: campaignId, state: { $in: ["draft", "preflight", "planned", "running", "paused", "cancelling"] } },
      { $set: { state: "cancelled", completedAt: new Date() } },
      { new: true },
    );
    if (!campaign) throw AppError.conflict("Campaign cannot be cancelled from its current state");
    return campaign;
  },

  /**
   * Claims a partition with a lease. A crashed worker does not block progress:
   * another worker may claim only after the previous lease expiry.
   */
  async claimNextPartition(input: ClaimInput): Promise<OpenAlexIngestPartitionDoc | null> {
    const now = input.now ?? new Date();
    const campaignId = objectId(input.campaignId, "campaignId");
    return OpenAlexIngestPartitionModel.findOneAndUpdate(
      {
        campaignId,
        $or: [
          { state: { $in: ["planned", "retry_wait"] } },
          { state: { $in: ["leased", "fetching", "writing", "checkpointing"] }, "lease.expiresAt": { $lte: now } },
        ],
      },
      {
        $set: {
          state: "leased",
          "lease.ownerId": input.workerId,
          "lease.heartbeatAt": now,
          "lease.expiresAt": new Date(now.getTime() + input.leaseMs),
        },
      },
      { new: true, sort: { createdAt: 1 } },
    );
  },

  async beginAttempt(input: BeginAttemptInput): Promise<OpenAlexIngestPageAttemptDoc> {
    const campaignId = objectId(input.campaignId, "campaignId");
    const partitionId = objectId(input.partitionId, "partitionId");
    const idempotencyKey = buildAttemptIdempotencyKey(input);
    const retried = await OpenAlexIngestPageAttemptModel.findOneAndUpdate(
      { partitionId, idempotencyKey, state: "failed" },
      { $set: { state: "started" }, $unset: { errorMessage: 1 } },
      { new: true },
    );
    if (retried) return retried;

    return OpenAlexIngestPageAttemptModel.findOneAndUpdate(
      { partitionId, idempotencyKey },
      {
        $setOnInsert: {
          campaignId,
          partitionId,
          idempotencyKey,
          cursorBefore: input.cursorBefore,
          requestFingerprint: input.requestFingerprint,
          state: "started",
        },
      },
      { upsert: true, new: true },
    );
  },

  async renewPartitionLease(input: { partitionId: string; workerId: string; leaseMs: number }): Promise<void> {
    const partitionId = objectId(input.partitionId, "partitionId");
    const now = new Date();
    const result = await OpenAlexIngestPartitionModel.updateOne(
      {
        _id: partitionId,
        "lease.ownerId": input.workerId,
        state: { $in: ["leased", "fetching", "writing", "checkpointing"] },
      },
      {
        $set: {
          "lease.heartbeatAt": now,
          "lease.expiresAt": new Date(now.getTime() + input.leaseMs),
        },
      },
    );
    if (result.matchedCount === 0) throw AppError.conflict("Partition lease was lost before it could be renewed");
  },

  /**
   * This is deliberately at-least-once, not a fake cross-collection transaction.
   * The attempt becomes immutable once committed; a failed CAS checkpoint is later
   * repaired by reconciliation from committed attempts.
   */
  async commitAttemptAndAdvanceCheckpoint(input: CommitAttemptInput): Promise<{ checkpointAdvanced: boolean }> {
    const attemptId = objectId(input.attemptId, "attemptId");
    const partitionId = objectId(input.partitionId, "partitionId");
    const attempt = await OpenAlexIngestPageAttemptModel.findOneAndUpdate(
      { _id: attemptId, state: "started" },
      {
        $set: {
          state: "committed",
          cursorAfter: input.cursorAfter,
          responseHash: input.responseHash,
          expectedResultCount: input.expectedResultCount,
          acceptedCount: input.acceptedCount,
          rejectedCount: input.rejectedCount,
          conflictCount: input.conflictCount,
          committedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!attempt) {
      const existing = await OpenAlexIngestPageAttemptModel.findById(attemptId).lean();
      if (!existing) throw AppError.notFound("Ingest page attempt not found");
      if (existing.state !== "committed") return { checkpointAdvanced: false };

      // A replay after a crash may find the immutable attempt already committed
      // but the partition checkpoint still behind. The same CAS makes this safe:
      // exactly one replay advances it, all later ones observe version mismatch.
      const replay = await OpenAlexIngestPartitionModel.updateOne(
        { _id: partitionId, "checkpoint.version": input.expectedCheckpointVersion },
        {
          $set: { state: "checkpointing", "checkpoint.cursor": existing.cursorAfter },
          $inc: {
            "checkpoint.acceptedCount": existing.acceptedCount,
            "checkpoint.committedAttemptCount": 1,
            "checkpoint.version": 1,
          },
        },
      );
      return { checkpointAdvanced: replay.modifiedCount === 1 };
    }

    const partition = await OpenAlexIngestPartitionModel.updateOne(
      { _id: partitionId, "checkpoint.version": input.expectedCheckpointVersion },
      {
        $set: { state: "checkpointing", "checkpoint.cursor": input.cursorAfter },
        $inc: {
          "checkpoint.acceptedCount": input.acceptedCount,
          "checkpoint.committedAttemptCount": 1,
          "checkpoint.version": 1,
        },
      },
    );
    return { checkpointAdvanced: partition.modifiedCount === 1 };
  },

  async markPartition(input: MarkPartitionInput): Promise<void> {
    const partitionId = objectId(input.partitionId, "partitionId");
    const update = await OpenAlexIngestPartitionModel.updateOne(
      { _id: partitionId, "lease.ownerId": input.workerId },
      {
        $set: {
          state: input.state,
          ...(input.errorMessage ? { lastError: input.errorMessage.slice(0, 2_000) } : {}),
        },
        $unset: { lease: 1 },
      },
    );
    if (update.modifiedCount === 0) {
      throw AppError.conflict("Partition lease was lost before its state could be updated");
    }
  },

  async completeIfFinished(campaignIdInput: string): Promise<boolean> {
    const campaignId = objectId(campaignIdInput, "campaignId");
    const [remaining, deadLetterPartitions] = await Promise.all([
      OpenAlexIngestPartitionModel.countDocuments({
        campaignId,
        state: { $in: ["planned", "leased", "fetching", "writing", "checkpointing", "retry_wait"] },
      }),
      OpenAlexIngestPartitionModel.countDocuments({ campaignId, state: "dead_letter" }),
    ]);
    if (remaining > 0) return false;
    // The last page may not align with the periodic reconciliation interval.
    // Seal exact ledger-derived counters before making the campaign terminal.
    await this.reconcileCampaignProgress(campaignIdInput);
    if (deadLetterPartitions > 0) {
      const result = await OpenAlexIngestCampaignModel.updateOne(
        { _id: campaignId, state: "running" },
        {
          $set: {
            state: "failed",
            completedAt: new Date(),
            failureReason: `${deadLetterPartitions} partition(s) require dead-letter review`,
          },
        },
      );
      return result.modifiedCount === 1;
    }
    const sealed = await OpenAlexIngestCampaignModel.findById(campaignId)
      .select("targetUniqueWorks progress.uniqueWorks")
      .lean();
    if (!sealed) throw AppError.notFound("Ingest campaign not found");
    const uniqueWorks = sealed.progress?.uniqueWorks ?? 0;
    if (uniqueWorks < sealed.targetUniqueWorks) {
      const shortfall = sealed.targetUniqueWorks - uniqueWorks;
      const result = await OpenAlexIngestCampaignModel.updateOne(
        { _id: campaignId, state: "running" },
        {
          $set: {
            state: "completed_with_shortfall",
            completedAt: new Date(),
            completionNote: `${shortfall} additional unique work(s) require a refill campaign`,
          },
        },
      );
      return result.modifiedCount === 1;
    }
    const result = await OpenAlexIngestCampaignModel.updateOne(
      { _id: campaignId, state: "running" },
      { $set: { state: "completed", completedAt: new Date() } },
    );
    return result.modifiedCount === 1;
  },

  /**
   * Full reconciliation groups the immutable attempt ledger and distinct paper
   * memberships. At million-paper scale that must not run after every page.
   * Progress is refreshed every N committed pages and once unconditionally
   * when the worker observes that no partition remains.
   */
  async reconcileCampaignProgressIfDue(campaignIdInput: string, intervalPages = 100): Promise<boolean> {
    const campaignId = objectId(campaignIdInput, "campaignId");
    const committedPages = await OpenAlexIngestPageAttemptModel.countDocuments({ campaignId, state: "committed" });
    if (committedPages === 0 || committedPages % Math.max(1, intervalPages) !== 0) return false;
    await this.reconcileCampaignProgress(campaignIdInput);
    return true;
  },

  /** Counters are rebuilt from committed ledger rows, not crash-prone increments. */
  async reconcileCampaignProgress(campaignIdInput: string): Promise<void> {
    const campaignId = objectId(campaignIdInput, "campaignId");
    const [attempts, partitionCount, completedPartitions, uniqueWorks] = await Promise.all([
      OpenAlexIngestPageAttemptModel.aggregate<{ accepted: number; rejected: number; conflicts: number; pages: number }>([
        { $match: { campaignId, state: "committed" } },
        { $group: { _id: null, accepted: { $sum: "$acceptedCount" }, rejected: { $sum: "$rejectedCount" }, conflicts: { $sum: "$conflictCount" }, pages: { $sum: 1 } } },
      ]),
      OpenAlexIngestPartitionModel.countDocuments({ campaignId }),
      OpenAlexIngestPartitionModel.countDocuments({ campaignId, state: "completed" }),
      PaperCohortMembershipModel.aggregate<{ count: number }>([
        { $match: { campaignId } },
        { $group: { _id: "$paperId" } },
        { $count: "count" },
      ]),
    ]);
    const totals = attempts[0] ?? { accepted: 0, rejected: 0, conflicts: 0, pages: 0 };
    await OpenAlexIngestCampaignModel.updateOne(
      { _id: campaignId },
      {
        $set: {
          "progress.plannedPartitions": partitionCount,
          "progress.completedPartitions": completedPartitions,
          "progress.committedPages": totals.pages,
          "progress.acceptedWorks": totals.accepted,
          "progress.uniqueWorks": uniqueWorks[0]?.count ?? 0,
          "progress.rejectedWorks": totals.rejected,
          "progress.conflictWorks": totals.conflicts,
        },
      },
    );
  },
};
