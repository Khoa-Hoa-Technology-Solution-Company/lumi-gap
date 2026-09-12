import crypto from "node:crypto";
import mongoose from "mongoose";

import { logger } from "../../../infrastructure/logger.js";
import { ApiProviderModel } from "../models/api-provider.model.js";
import { IngestDeadLetterModel } from "../models/ingest-dead-letter.model.js";
import { OpenAlexIngestCampaignModel } from "../models/openalex-ingest-campaign.model.js";
import { OpenAlexIngestPageAttemptModel } from "../models/openalex-ingest-page-attempt.model.js";
import { OpenAlexIngestPartitionModel } from "../models/openalex-ingest-partition.model.js";
import { PaperCohortMembershipModel } from "../models/paper-cohort-membership.model.js";
import { PaperIdentityModel } from "../models/paper-identity.model.js";
import { PaperModel } from "../../papers/models/paper.model.js";
import { normalizeOpenAlexWork } from "../providers/openalex.normalizer.js";
import { fetchOpenAlexPage } from "../providers/openalex.client.js";
import { ingestOpenAlexWorks } from "../sync.service.js";
import { ingestCampaignService } from "./ingest-campaign.service.js";
import { OPENALEX_CAMPAIGN_SAMPLE_SIZE } from "./campaign-planner.js";

export type CampaignPartitionRunResult =
  | { status: "not-running" | "no-partition" }
  | { status: "completed" | "continued"; campaignId: string; partitionId: string; acceptedCount: number };

/**
 * Executes exactly one provider page. Long campaigns are therefore composed of
 * small durable units: a process kill can replay at most one idempotent page.
 */
export async function runCampaignPartitionPage(input: {
  campaignId: string;
  workerId: string;
  leaseMs: number;
}): Promise<CampaignPartitionRunResult> {
  const campaign = await OpenAlexIngestCampaignModel.findById(input.campaignId).lean();
  if (!campaign || campaign.state !== "running") return { status: "not-running" };

  const partition = await ingestCampaignService.claimNextPartition({
    campaignId: input.campaignId,
    workerId: input.workerId,
    leaseMs: input.leaseMs,
  });
  if (!partition) {
    await ingestCampaignService.reconcileCampaignProgress(input.campaignId);
    await ingestCampaignService.completeIfFinished(input.campaignId);
    return { status: "no-partition" };
  }

  const partitionId = partition._id.toString();
  const cursorBefore = partition.checkpoint?.cursor ?? "*";
  const remaining = Math.max(0, partition.targetCount - (partition.checkpoint?.acceptedCount ?? 0));
  if (remaining === 0) {
    await ingestCampaignService.markPartition({ partitionId, workerId: input.workerId, state: "completed" });
    await ingestCampaignService.reconcileCampaignProgressIfDue(input.campaignId);
    return { status: "completed", campaignId: input.campaignId, partitionId, acceptedCount: 0 };
  }

  if (partition.selectionMethod === "seeded-sample" && (!Number.isInteger(partition.seed) || remaining > OPENALEX_CAMPAIGN_SAMPLE_SIZE)) {
    await deadLetter({
      campaignId: input.campaignId,
      partitionId,
      reasonCode: "INVALID_SEEDED_SAMPLE_PARTITION",
      details: { selectionMethod: partition.selectionMethod, seed: partition.seed, remaining },
    });
    await ingestCampaignService.markPartition({
      partitionId,
      workerId: input.workerId,
      state: "dead_letter",
      errorMessage: `Seeded campaign sample requires an integer seed and a target no greater than ${OPENALEX_CAMPAIGN_SAMPLE_SIZE}`,
    });
    return { status: "completed", campaignId: input.campaignId, partitionId, acceptedCount: 0 };
  }

  if (partition.selectionMethod === "repair") {
    await deadLetter({
      campaignId: input.campaignId,
      partitionId,
      reasonCode: "UNSUPPORTED_SELECTION_METHOD",
      details: { selectionMethod: partition.selectionMethod },
    });
    await ingestCampaignService.markPartition({
      partitionId,
      workerId: input.workerId,
      state: "dead_letter",
      errorMessage: `Unsupported selection method: ${partition.selectionMethod}`,
    });
    return { status: "completed", campaignId: input.campaignId, partitionId, acceptedCount: 0 };
  }

  const request = {
    filterExpression: partition.filterExpression,
    cursor: cursorBefore,
    ...(partition.selectionMethod === "seeded-sample" ? { sample: partition.targetCount, seed: partition.seed! } : {}),
    perPage: Math.min(100, remaining),
  };
  const requestFingerprint = sha256(JSON.stringify(request));
  const attempt = await ingestCampaignService.beginAttempt({
    campaignId: input.campaignId,
    partitionId,
    cursorBefore,
    seed: partition.seed ?? undefined,
    requestFingerprint,
  });

  try {
    // Replaying a committed attempt after a crash must only repair its CAS
    // checkpoint, never fetch and write the page a second time.
    if (attempt.state === "committed") {
      const repaired = await ingestCampaignService.commitAttemptAndAdvanceCheckpoint({
        attemptId: attempt._id.toString(),
        partitionId,
        expectedCheckpointVersion: partition.checkpoint?.version ?? 0,
        cursorAfter: attempt.cursorAfter ?? undefined,
        responseHash: attempt.responseHash ?? "replayed-committed-attempt",
        expectedResultCount: attempt.expectedResultCount,
        acceptedCount: attempt.acceptedCount,
        rejectedCount: attempt.rejectedCount,
        conflictCount: attempt.conflictCount,
      });
      if (!repaired.checkpointAdvanced) {
        await ingestCampaignService.markPartition({
          partitionId,
          workerId: input.workerId,
          state: "retry_wait",
          errorMessage: "Committed attempt checkpoint is already advanced or lease was superseded",
        });
        return { status: "continued", campaignId: input.campaignId, partitionId, acceptedCount: 0 };
      }
      return finalizePartitionPage(input, partitionId, attempt.acceptedCount, attempt.cursorAfter ?? null, 0);
    }

    await OpenAlexIngestPartitionModel.updateOne(
      { _id: partition._id, "lease.ownerId": input.workerId },
      { $set: { state: "fetching", "lease.heartbeatAt": new Date() } },
    );
    await ingestCampaignService.renewPartitionLease({
      partitionId,
      workerId: input.workerId,
      leaseMs: input.leaseMs,
    });
    const page = await fetchOpenAlexPage(request);
    await ingestCampaignService.renewPartitionLease({
      partitionId,
      workerId: input.workerId,
      leaseMs: input.leaseMs,
    });
    await OpenAlexIngestPartitionModel.updateOne(
      { _id: partition._id, "lease.ownerId": input.workerId },
      { $set: { state: "writing", "lease.heartbeatAt": new Date() } },
    );

    const screened = await screenIdentityConflicts({
      campaignId: input.campaignId,
      partitionId,
      attemptId: attempt._id.toString(),
      requestFingerprint,
      works: page.results,
    });
    const provider = await ApiProviderModel.findOne({ providerName: "openalex" }).select("_id").lean();
    if (!provider) throw new Error("openalex provider is not seeded");

    await ingestCampaignService.renewPartitionLease({
      partitionId,
      workerId: input.workerId,
      leaseMs: input.leaseMs,
    });
    const ingested = await ingestOpenAlexWorks(screened.acceptedWorks, provider._id);
    await Promise.all([
      writeCohortMemberships({ campaign, partition, records: ingested.records }),
      writeIdentityRegistry({ campaignId: input.campaignId, records: ingested.records }),
      ...ingested.rejectedWorks.map(({ work, errorMessage }) =>
        deadLetter({
          campaignId: input.campaignId,
          partitionId,
          attemptId: attempt._id.toString(),
          reasonCode: "PAPER_INGEST_REJECTED",
          requestFingerprint,
          sourceIdentity: work.id ?? work.doi ?? undefined,
          details: { errorMessage: errorMessage.slice(0, 2_000) },
        }),
      ),
    ]);
    await ingestCampaignService.renewPartitionLease({
      partitionId,
      workerId: input.workerId,
      leaseMs: input.leaseMs,
    });

    const acceptedCount = ingested.records.length;
    const rejectedCount = ingested.rejectedCount;
    const conflictCount = screened.conflictCount;
    const committed = await ingestCampaignService.commitAttemptAndAdvanceCheckpoint({
      attemptId: attempt._id.toString(),
      partitionId,
      expectedCheckpointVersion: partition.checkpoint?.version ?? 0,
      cursorAfter: page.nextCursor ?? undefined,
      responseHash: sha256(JSON.stringify(page.results)),
      expectedResultCount: page.results.length,
      acceptedCount,
      rejectedCount,
      conflictCount,
    });
    if (!committed.checkpointAdvanced) {
      throw new Error("Partition checkpoint CAS failed; committed attempt will be reconciled on retry");
    }
    return finalizePartitionPage(input, partitionId, acceptedCount, page.nextCursor, page.results.length);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await OpenAlexIngestPageAttemptModel.updateOne(
      { _id: attempt._id, state: "started" },
      { $set: { state: "failed", errorMessage: message.slice(0, 2_000) } },
    );
    await ingestCampaignService.markPartition({
      partitionId,
      workerId: input.workerId,
      state: "retry_wait",
      errorMessage: message,
    });
    throw error;
  }
}

async function finalizePartitionPage(
  input: { campaignId: string; workerId: string },
  partitionId: string,
  acceptedCount: number,
  nextCursor: string | null,
  resultCount: number,
): Promise<CampaignPartitionRunResult> {
  const partition = await OpenAlexIngestPartitionModel.findById(partitionId).lean();
  const finished =
    !partition ||
    !nextCursor ||
    resultCount === 0 ||
    (partition.checkpoint?.acceptedCount ?? 0) >= partition.targetCount;
  await ingestCampaignService.markPartition({
    partitionId,
    workerId: input.workerId,
    state: finished ? "completed" : "retry_wait",
  });
  await ingestCampaignService.reconcileCampaignProgressIfDue(input.campaignId);
  if (finished) await ingestCampaignService.completeIfFinished(input.campaignId);
  return { status: finished ? "completed" : "continued", campaignId: input.campaignId, partitionId, acceptedCount };
}

async function screenIdentityConflicts(input: {
  campaignId: string;
  partitionId: string;
  attemptId: string;
  requestFingerprint: string;
  works: Parameters<typeof normalizeOpenAlexWork>[0][];
}): Promise<{ acceptedWorks: Parameters<typeof normalizeOpenAlexWork>[0][]; conflictCount: number }> {
  const normalized = input.works.map((work) => ({ work, normalized: normalizeOpenAlexWork(work) }));
  const values = normalized.flatMap(({ normalized: paper }) => [
    ...(paper.externalIds.doi ? [{ provider: "doi", normalizedValue: paper.externalIds.doi }] : []),
    ...(paper.externalIds.openalexId ? [{ provider: "openalex", normalizedValue: paper.externalIds.openalexId }] : []),
  ]);
  if (values.length === 0) return { acceptedWorks: input.works, conflictCount: 0 };

  const [registry, existingPapers] = await Promise.all([
    PaperIdentityModel.find({ $or: values }).lean(),
    PaperModel.find({
      $or: values.map((identity) => ({
        [`externalIds.${identity.provider === "doi" ? "doi" : "openalexId"}`]: identity.normalizedValue,
      })),
    })
      .select("_id externalIds")
      .lean(),
  ]);
  const registryByKey = new Map(registry.map((record) => [`${record.provider}:${record.normalizedValue}`, record.paperId.toString()]));
  const paperByKey = new Map<string, string>();
  for (const paper of existingPapers) {
    if (paper.externalIds?.doi) paperByKey.set(`doi:${paper.externalIds.doi}`, paper._id.toString());
    if (paper.externalIds?.openalexId) paperByKey.set(`openalex:${paper.externalIds.openalexId}`, paper._id.toString());
  }
  const acceptedWorks: Parameters<typeof normalizeOpenAlexWork>[0][] = [];
  let conflictCount = 0;

  for (const item of normalized) {
    const candidateIds = new Set<string>();
    if (item.normalized.externalIds.doi) {
      const record = registryByKey.get(`doi:${item.normalized.externalIds.doi}`);
      if (record) candidateIds.add(record);
      const paperId = paperByKey.get(`doi:${item.normalized.externalIds.doi}`);
      if (paperId) candidateIds.add(paperId);
    }
    if (item.normalized.externalIds.openalexId) {
      const record = registryByKey.get(`openalex:${item.normalized.externalIds.openalexId}`);
      if (record) candidateIds.add(record);
      const paperId = paperByKey.get(`openalex:${item.normalized.externalIds.openalexId}`);
      if (paperId) candidateIds.add(paperId);
    }
    if (candidateIds.size <= 1) {
      acceptedWorks.push(item.work);
      continue;
    }
    conflictCount += 1;
    await deadLetter({
      campaignId: input.campaignId,
      partitionId: input.partitionId,
      attemptId: input.attemptId,
      reasonCode: "IDENTITY_CONFLICT",
      requestFingerprint: input.requestFingerprint,
      sourceIdentity: item.normalized.externalIds.openalexId ?? item.normalized.externalIds.doi,
      details: { doi: item.normalized.externalIds.doi, openalexId: item.normalized.externalIds.openalexId, paperIds: [...candidateIds] },
    });
  }
  return { acceptedWorks, conflictCount };
}

async function writeCohortMemberships(input: {
  campaign: { _id: mongoose.Types.ObjectId; manifest: { policyVersion: string } };
  partition: {
    cohortId: string;
    stratumKey: string;
    selectionMethod: "seeded-sample" | "cursor" | "repair";
    plannedPopulation: number;
    targetCount: number;
  };
  records: Awaited<ReturnType<typeof ingestOpenAlexWorks>>["records"];
}): Promise<void> {
  if (input.records.length === 0) return;
  const reason = input.partition.cohortId.startsWith("analytics-baseline") ? "analytics_baseline" : "cs_ai_priority";
  const samplingWeight = input.partition.targetCount > 0 ? input.partition.plannedPopulation / input.partition.targetCount : undefined;
  const selectionMethod =
    input.partition.selectionMethod === "repair" ? "refresh" : input.partition.selectionMethod;
  await PaperCohortMembershipModel.collection.bulkWrite(
    input.records.map(({ paper }) => ({
      updateOne: {
        filter: { paperId: paper._id, cohortId: input.partition.cohortId, campaignId: input.campaign._id },
        update: {
          $setOnInsert: {
            paperId: paper._id,
            cohortId: input.partition.cohortId,
            campaignId: input.campaign._id,
            stratumKey: input.partition.stratumKey,
            samplingWeight,
            selectionMethod,
            policyVersion: input.campaign.manifest.policyVersion,
            reason,
            sourcePopulation: input.partition.plannedPopulation,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

async function writeIdentityRegistry(input: {
  campaignId: string;
  records: Awaited<ReturnType<typeof ingestOpenAlexWorks>>["records"];
}): Promise<void> {
  const now = new Date();
  const operations: Array<{
    provider: "doi" | "openalex";
    normalizedValue: string;
    paperId: mongoose.Types.ObjectId;
  }> = input.records.flatMap(({ paper }) => [
    ...(paper.externalIds?.doi
      ? [{ provider: "doi" as const, normalizedValue: paper.externalIds.doi, paperId: paper._id }]
      : []),
    ...(paper.externalIds?.openalexId
      ? [{ provider: "openalex" as const, normalizedValue: paper.externalIds.openalexId, paperId: paper._id }]
      : []),
  ]);
  if (operations.length === 0) return;
  const campaignId = new mongoose.Types.ObjectId(input.campaignId);
  await PaperIdentityModel.collection.bulkWrite(
    operations.map((identity) => ({
      updateOne: {
        filter: { provider: identity.provider, normalizedValue: identity.normalizedValue },
        update: {
          $set: { lastVerifiedAt: now },
          $setOnInsert: { ...identity, firstSeenCampaignId: campaignId },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

async function deadLetter(input: {
  campaignId: string;
  partitionId?: string;
  attemptId?: string;
  reasonCode: string;
  requestFingerprint?: string;
  sourceIdentity?: string;
  details?: unknown;
}): Promise<void> {
  await IngestDeadLetterModel.create({ ...input, payloadHash: input.details ? sha256(JSON.stringify(input.details)) : undefined });
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
