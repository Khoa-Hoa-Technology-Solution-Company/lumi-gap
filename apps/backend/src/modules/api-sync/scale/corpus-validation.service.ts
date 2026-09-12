import type {
  CorpusValidationCheck,
  CorpusValidationDecision,
  CorpusValidationMetrics,
  CorpusValidationOverallStatus,
  CorpusValidationRun,
} from "@trend/shared-types";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

import { AppError } from "../../../common/exceptions/app-error.js";
import { logger } from "../../../infrastructure/logger.js";
import { CorpusValidationRunModel } from "../models/corpus-validation-run.model.js";
import { ApiProviderModel } from "../models/api-provider.model.js";
import { IngestDeadLetterModel } from "../models/ingest-dead-letter.model.js";
import { OpenAlexIngestCampaignModel } from "../models/openalex-ingest-campaign.model.js";
import { OpenAlexIngestPageAttemptModel } from "../models/openalex-ingest-page-attempt.model.js";
import { OpenAlexIngestPartitionModel } from "../models/openalex-ingest-partition.model.js";
import { PaperCohortMembershipModel } from "../models/paper-cohort-membership.model.js";

export const CORPUS_VALIDATOR_VERSION = "corpus-validation-v1";
const TERMINAL_CAMPAIGN_STATES = new Set(["completed", "completed_with_shortfall", "failed", "cancelled"]);

interface CampaignPaperAggregate {
  summary: Array<{
    campaignMemberships: number;
    canonicalPapers: number;
    orphanMemberships: number;
    activePapers: number;
    withAbstract: number;
    withFullTaxonomy: number;
    withSourceProvenance: number;
    withQualityCheck: number;
    qualityEligible: number;
    withOpenAlexIdentity: number;
  }>;
  duplicateOpenAlexIds: Array<{ count: number }>;
  duplicateSourceRecords: Array<{ count: number }>;
}

interface AttemptLedger {
  committedPages: number;
  acceptedWorks: number;
  rejectedWorks: number;
  conflictWorks: number;
}

interface SamplingRow {
  cohortId: string;
  stratumKey: string;
  targetCount: number;
  actualCount: number;
}

export interface CorpusValidationSnapshot {
  campaign: CorpusValidationMetrics["campaign"];
  papers: CorpusValidationMetrics["papers"];
  sampling: CorpusValidationMetrics["sampling"];
  cohorts: CorpusValidationMetrics["cohorts"];
  deadLetters: CorpusValidationMetrics["deadLetters"];
}

export interface CorpusValidationRepository {
  campaignExists(campaignId: mongoose.Types.ObjectId): Promise<boolean>;
  getCommittedPages(campaignId: mongoose.Types.ObjectId): Promise<number>;
  createOrReuseRun(
    campaignId: mongoose.Types.ObjectId,
    committedPages: number,
    force: boolean,
  ): Promise<{ _id: mongoose.Types.ObjectId; created: boolean; state: CorpusValidationRun["state"] }>;
  getRun(runId: mongoose.Types.ObjectId): Promise<unknown | null>;
  getLatestRun(campaignId: mongoose.Types.ObjectId): Promise<unknown | null>;
  markRunning(runId: mongoose.Types.ObjectId, campaignId: mongoose.Types.ObjectId, executionToken: string, startedAt: Date): Promise<boolean>;
  saveCompleted(
    runId: mongoose.Types.ObjectId,
    executionToken: string,
    result: { metrics: CorpusValidationMetrics; checks: CorpusValidationCheck[]; overallStatus: CorpusValidationOverallStatus; decision: CorpusValidationDecision },
    completedAt: Date,
  ): Promise<boolean>;
  saveFailed(runId: mongoose.Types.ObjectId, failureReason: string, completedAt: Date, executionToken?: string): Promise<void>;
  collectSnapshot(campaignId: mongoose.Types.ObjectId): Promise<CorpusValidationSnapshot>;
}

export const corpusValidationRepository: CorpusValidationRepository = {
  campaignExists: (campaignId) => OpenAlexIngestCampaignModel.exists({ _id: campaignId }).then(Boolean),
  async getCommittedPages(campaignId) {
    return OpenAlexIngestPageAttemptModel.countDocuments({ campaignId, state: "committed" });
  },
  async createOrReuseRun(campaignId, committedPages, force) {
    const active = await CorpusValidationRunModel.findOne({ campaignId, state: { $in: ["queued", "running"] } }).select("_id state");
    if (active) return { _id: active._id, created: false, state: active.state };
    const idempotencyKey = buildCorpusValidationIdempotencyKey(campaignId.toString(), committedPages, force);
    const existing = force ? null : await CorpusValidationRunModel.findOne({ idempotencyKey }).select("_id state");
    if (existing) {
      if (existing.state === "failed") {
        try {
          await CorpusValidationRunModel.updateOne(
            { _id: existing._id, state: "failed" },
            { $set: { state: "queued", activeKey: campaignId.toString(), requestedAt: new Date(), checks: [] }, $unset: { failureReason: 1, startedAt: 1, completedAt: 1, metrics: 1, overallStatus: 1, decision: 1 } },
          );
          return { _id: existing._id, created: true, state: "queued" };
        } catch (error) {
          if (!isDuplicateKeyError(error)) throw error;
          const concurrent = await CorpusValidationRunModel.findOne({ campaignId, state: { $in: ["queued", "running"] } }).select("_id state");
          if (concurrent) return { _id: concurrent._id, created: false, state: concurrent.state };
          throw error;
        }
      }
      return { _id: existing._id, created: false, state: existing.state };
    }
    try {
      const run = await CorpusValidationRunModel.create({
        campaignId,
        validatorVersion: CORPUS_VALIDATOR_VERSION,
        snapshotCommittedPages: committedPages,
        idempotencyKey,
        activeKey: campaignId.toString(),
      });
      return { _id: run._id, created: true, state: "queued" };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const concurrent = await CorpusValidationRunModel.findOne({
        $or: [{ idempotencyKey }, { campaignId, state: { $in: ["queued", "running"] } }],
      }).select("_id state");
      if (concurrent) return { _id: concurrent._id, created: false, state: concurrent.state };
      throw error;
    }
  },
  getRun: (runId) => CorpusValidationRunModel.findById(runId).lean(),
  getLatestRun: (campaignId) => CorpusValidationRunModel.findOne({ campaignId }).sort({ createdAt: -1 }).lean(),
  async markRunning(runId, campaignId, executionToken, startedAt) {
    const result = await CorpusValidationRunModel.updateOne(
      { _id: runId, state: { $in: ["queued", "failed"] } },
      { $set: { state: "running", activeKey: campaignId.toString(), executionToken, startedAt }, $unset: { failureReason: 1 } },
    );
    return result.modifiedCount === 1;
  },
  async saveCompleted(runId, executionToken, result, completedAt) {
    const write = await CorpusValidationRunModel.updateOne(
      { _id: runId, state: "running", executionToken },
      { $set: { state: "completed", ...result, completedAt }, $unset: { activeKey: 1, executionToken: 1 } },
    );
    return write.modifiedCount === 1;
  },
  async saveFailed(runId, failureReason, completedAt, executionToken) {
    await CorpusValidationRunModel.updateOne(
      executionToken
        ? { _id: runId, state: "running", executionToken }
        : { _id: runId, state: "queued" },
      { $set: { state: "failed", failureReason: failureReason.slice(0, 2_000), completedAt }, $unset: { activeKey: 1, executionToken: 1 } },
    );
  },
  async collectSnapshot(campaignId) {
    const snapshotStartedCommittedPages = await this.getCommittedPages(campaignId);
    const provider = await ApiProviderModel.findOne({ providerName: "openalex" }).select("_id").lean();
    const [campaign, paperResult, cohorts, deadLetters, ledger, samplingRows] = await Promise.all([
      OpenAlexIngestCampaignModel.findById(campaignId).lean(),
      collectCampaignPaperMetrics(campaignId, provider?._id),
      PaperCohortMembershipModel.aggregate<{ cohortId: string; reason: string; uniquePapers: number }>([
        { $match: { campaignId } },
        { $group: { _id: { paperId: "$paperId", cohortId: "$cohortId", reason: "$reason" } } },
        { $group: { _id: { cohortId: "$_id.cohortId", reason: "$_id.reason" }, uniquePapers: { $sum: 1 } } },
        { $project: { _id: 0, cohortId: "$_id.cohortId", reason: "$_id.reason", uniquePapers: 1 } },
        { $sort: { cohortId: 1 } },
      ]).allowDiskUse(true),
      IngestDeadLetterModel.aggregate<{ state: string; reasonCode: string; count: number }>([
        { $match: { campaignId } },
        { $group: { _id: { state: "$state", reasonCode: "$reasonCode" }, count: { $sum: 1 } } },
        { $project: { _id: 0, state: "$_id.state", reasonCode: "$_id.reasonCode", count: 1 } },
        { $sort: { state: 1, reasonCode: 1 } },
      ]),
      collectAttemptLedger(campaignId),
      collectSamplingRows(campaignId),
    ]);
    if (!campaign) throw AppError.notFound("Ingest campaign not found");

    const snapshotEndedCommittedPages = await this.getCommittedPages(campaignId);
    const summary = paperResult.summary[0] ?? emptyPaperMetrics();
    const sampling = summarizeSampling(samplingRows);
    return {
      campaign: {
        state: campaign.state,
        targetUniqueWorks: campaign.targetUniqueWorks,
        baselineTarget: campaign.manifest.baselineTarget,
        priorityTarget: campaign.manifest.priorityTarget,
        storedCommittedPages: campaign.progress?.committedPages ?? 0,
        ledgerCommittedPages: ledger.committedPages,
        snapshotStartedCommittedPages,
        snapshotEndedCommittedPages,
        snapshotChangedDuringScan: snapshotStartedCommittedPages !== snapshotEndedCommittedPages,
        acceptedWorks: ledger.acceptedWorks,
        uniqueWorks: campaign.progress?.uniqueWorks ?? 0,
        rejectedWorks: ledger.rejectedWorks,
        conflictWorks: ledger.conflictWorks,
      },
      papers: {
        ...summary,
        duplicateOpenAlexIdGroups: paperResult.duplicateOpenAlexIds[0]?.count ?? 0,
        duplicateSourceRecordGroups: paperResult.duplicateSourceRecords[0]?.count ?? 0,
      },
      sampling,
      cohorts,
      deadLetters,
    };
  },
};

export function createCorpusValidationService(repository: CorpusValidationRepository) {
  return {
    async createRun(
      campaignIdInput: string,
      options: { force?: boolean } = {},
    ): Promise<{ runId: string; created: boolean; state: CorpusValidationRun["state"] }> {
      const campaignId = objectId(campaignIdInput, "campaignId");
      if (!(await repository.campaignExists(campaignId))) throw AppError.notFound("Ingest campaign not found");
      const committedPages = await repository.getCommittedPages(campaignId);
      const run = await repository.createOrReuseRun(campaignId, committedPages, options.force ?? false);
      return { runId: run._id.toString(), created: run.created, state: run.state };
    },

    async getRun(runIdInput: string): Promise<CorpusValidationRun> {
      const runId = objectId(runIdInput, "validationRunId");
      const run = await repository.getRun(runId);
      if (!run) throw AppError.notFound("Corpus validation run not found");
      return toValidationRun(run);
    },

    async getLatest(campaignIdInput: string): Promise<CorpusValidationRun | null> {
      const campaignId = objectId(campaignIdInput, "campaignId");
      const run = await repository.getLatestRun(campaignId);
      return run ? toValidationRun(run) : null;
    },

    async execute(runIdInput: string): Promise<CorpusValidationRun> {
      const runId = objectId(runIdInput, "validationRunId");
      const rawRun = await repository.getRun(runId) as { campaignId?: mongoose.Types.ObjectId; state?: string } | null;
      if (!rawRun?.campaignId) throw AppError.notFound("Corpus validation run not found");
      if (rawRun.state === "completed") return this.getRun(runIdInput);
      const executionToken = randomUUID();
      if (!(await repository.markRunning(runId, rawRun.campaignId, executionToken, new Date()))) {
        throw AppError.conflict("Corpus validation run is already being processed");
      }
      try {
        const metrics = await repository.collectSnapshot(rawRun.campaignId);
        const result = evaluateCorpusValidation(metrics);
        const saved = await repository.saveCompleted(runId, executionToken, result, new Date());
        if (!saved) {
          logger.warn({ runId: runIdInput }, "discarded stale corpus validation execution result");
        }
        return this.getRun(runIdInput);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await repository.saveFailed(runId, message, new Date(), executionToken);
        logger.error({ error, runId: runIdInput }, "corpus validation failed");
        throw error;
      }
    },

    markQueueFailure(runIdInput: string, error: unknown): Promise<void> {
      const runId = objectId(runIdInput, "validationRunId");
      const message = error instanceof Error ? error.message : String(error);
      return repository.saveFailed(runId, `Queue enqueue failed: ${message}`, new Date());
    },
  };
}

export const corpusValidationService = createCorpusValidationService(corpusValidationRepository);

export function buildCorpusValidationIdempotencyKey(
  campaignId: string,
  committedPages: number,
  force: boolean,
  nonce?: string,
): string {
  const base = `${campaignId}:${CORPUS_VALIDATOR_VERSION}:${committedPages}`;
  return force ? `${base}:forced:${nonce ?? randomUUID()}` : base;
}

export function evaluateCorpusValidation(metrics: CorpusValidationMetrics): {
  metrics: CorpusValidationMetrics;
  checks: CorpusValidationCheck[];
  overallStatus: CorpusValidationOverallStatus;
  decision: CorpusValidationDecision;
} {
  const total = metrics.papers.campaignMemberships;
  const openConflicts = metrics.deadLetters
    .filter((item) => item.state === "open" && item.reasonCode === "IDENTITY_CONFLICT")
    .reduce((sum, item) => sum + item.count, 0);
  const openDeadLetters = metrics.deadLetters
    .filter((item) => item.state === "open")
    .reduce((sum, item) => sum + item.count, 0);
  const openDeadLetterRate = pct(openDeadLetters, Math.max(1, metrics.campaign.acceptedWorks + metrics.campaign.rejectedWorks));
  const rejectionRate = pct(metrics.campaign.rejectedWorks, Math.max(1, metrics.campaign.acceptedWorks + metrics.campaign.rejectedWorks));
  const terminal = TERMINAL_CAMPAIGN_STATES.has(metrics.campaign.state);
  const counterDelta = metrics.campaign.storedCommittedPages - metrics.campaign.ledgerCommittedPages;

  if (total === 0) {
    const noDataStatus = terminal ? "fail" : "pending";
    return {
      metrics,
      checks: [{
        key: "campaign_data",
        label: "Campaign data available",
        status: noDataStatus,
        actual: 0,
        target: "> 0 distinct campaign papers",
        detail: terminal ? "A terminal campaign cannot pass with an empty persisted corpus." : "No committed campaign memberships are available yet; rerun after ingest commits data.",
      }],
      overallStatus: terminal ? "fail" : "in_progress",
      decision: terminal ? "final_fail" : "continue_with_warning",
    };
  }

  const checks: CorpusValidationCheck[] = [
    buildCampaignOutcomeCheck(metrics, terminal),
    buildTargetFulfillmentCheck(metrics, terminal),
    exactCoverageCheck("canonical_papers", "Canonical paper presence", metrics.papers.canonicalPapers, total),
    exactZeroCheck("orphan_memberships", "Orphan cohort memberships", metrics.papers.orphanMemberships),
    thresholdCheck("active_papers", "Active-paper coverage", pct(metrics.papers.activePapers, total), 99.9, 99, "%"),
    thresholdCheck("abstract_coverage", "Abstract coverage", pct(metrics.papers.withAbstract, total), 99, 95, "%"),
    thresholdCheck("taxonomy_coverage", "Full OpenAlex taxonomy coverage", pct(metrics.papers.withFullTaxonomy, total), 95, 85, "%"),
    thresholdCheck("source_provenance", "OpenAlex source provenance coverage", pct(metrics.papers.withSourceProvenance, total), terminal ? 100 : 99.9, 99, "%"),
    thresholdCheck("quality_checks", "Quality-check coverage", pct(metrics.papers.withQualityCheck, total), terminal ? 100 : 99.9, 99, "%"),
    thresholdCheck("openalex_identity", "OpenAlex identity coverage", pct(metrics.papers.withOpenAlexIdentity, total), 99.9, 99, "%"),
    exactZeroCheck("duplicate_openalex_ids", "Duplicate canonical OpenAlex IDs", metrics.papers.duplicateOpenAlexIdGroups),
    exactZeroCheck("duplicate_source_records", "Duplicate OpenAlex source records", metrics.papers.duplicateSourceRecordGroups),
    exactZeroCheck("open_identity_conflicts", "Unresolved identity conflicts", openConflicts),
    upperBoundCheck("rejection_rate", "Provider record rejection rate", rejectionRate, 0.1, 0.5, "%"),
    {
      key: "open_dead_letters",
      label: "Open dead letters",
      status: terminal
        ? openDeadLetters === 0 ? "pass" : "fail"
        : openDeadLetterRate <= 0.1 ? "pass" : openDeadLetterRate <= 0.5 ? "warning" : "fail",
      actual: `${openDeadLetters} (${openDeadLetterRate}%)`,
      target: "Running rate <= 0.1%; 0 unresolved at campaign completion",
      detail: `${openDeadLetters} dead-letter item(s) remain open across all reason codes. Terminal campaigns must resolve every item.`,
    },
    {
      key: "campaign_counter_reconciliation",
      label: "Campaign counter reconciliation",
      status: counterDelta === 0 ? "pass" : terminal ? "fail" : "info",
      actual: counterDelta,
      target: "Stored committed pages equal committed attempt ledger",
      detail: terminal
        ? "Terminal campaign counters must exactly match durable committed page attempts."
        : "Running campaign counters are periodically reconciled; the durable attempt ledger is used for validation totals.",
    },
    {
      key: "unique_counter_reconciliation",
      label: "Unique-work counter reconciliation",
      status: metrics.campaign.uniqueWorks === total ? "pass" : terminal ? "fail" : "info",
      actual: `${metrics.campaign.uniqueWorks} stored / ${total} distinct memberships`,
      target: "Stored uniqueWorks equals distinct campaign paper memberships",
      detail: terminal
        ? "A terminal campaign must reconcile its unique counter with persisted cohort memberships."
        : "The membership count is authoritative while a running campaign waits for periodic counter reconciliation.",
    },
    {
      key: "snapshot_stability",
      label: "Validation snapshot stability",
      status: metrics.campaign.snapshotChangedDuringScan ? terminal ? "fail" : "warning" : "pass",
      actual: `${metrics.campaign.snapshotStartedCommittedPages} -> ${metrics.campaign.snapshotEndedCommittedPages}`,
      target: "No committed-page change during scan",
      detail: metrics.campaign.snapshotChangedDuringScan
        ? "Ingest advanced while validation was scanning. This result is operational guidance, not a final release gate."
        : "The committed-page watermark stayed stable for the full scan.",
    },
    {
      key: "quality_eligible",
      label: "AI-eligible metadata coverage",
      status: "info",
      actual: pct(metrics.papers.qualityEligible, total),
      target: "Informational only",
      detail: "dataQualityScore >= 0.7 plus an abstract controls downstream AI eligibility; it is not a scientific merit score.",
    },
    buildCohortAllocationCheck(metrics, terminal),
    buildSamplingCheck(metrics, terminal),
  ];

  const hasFailure = checks.some((check) => check.status === "fail");
  const hasWarning = checks.some((check) => check.status === "warning");
  const overallStatus: CorpusValidationOverallStatus = hasFailure
    ? "fail"
    : !terminal
      ? "in_progress"
      : hasWarning
        ? "warning"
        : "pass";
  const decision: CorpusValidationDecision = terminal
    ? hasFailure ? "final_fail" : hasWarning ? "final_warning" : "final_pass"
    : hasFailure ? "pause_and_remediate" : hasWarning ? "continue_with_warning" : "pass_to_continue";
  return { metrics, checks, overallStatus, decision };
}

async function collectCampaignPaperMetrics(
  campaignId: mongoose.Types.ObjectId,
  openAlexProviderId?: mongoose.Types.ObjectId,
): Promise<CampaignPaperAggregate> {
  const [result] = await PaperCohortMembershipModel.aggregate<CampaignPaperAggregate>([
    { $match: { campaignId } },
    { $group: { _id: "$paperId" } },
    { $lookup: { from: "research_papers", localField: "_id", foreignField: "_id", as: "paper" } },
    { $set: { paper: { $arrayElemAt: ["$paper", 0] } } },
    {
      $lookup: {
        from: "paper_source_records",
        let: { paperId: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$paperId", "$$paperId"] },
            ...(openAlexProviderId ? [{ $eq: ["$providerId", openAlexProviderId] }] : [{ $eq: [1, 0] }]),
          ] } } },
          { $project: { _id: 1 } },
          { $limit: 2 },
        ],
        as: "sourceRecord",
      },
    },
    {
      $lookup: {
        from: "paper_quality_checks",
        let: { paperId: "$_id" },
        pipeline: [{ $match: { $expr: { $eq: ["$paperId", "$$paperId"] } } }, { $limit: 1 }, { $project: { _id: 1 } }],
        as: "qualityCheck",
      },
    },
    {
      $lookup: {
        from: "paper_identities",
        let: { paperId: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$paperId", "$$paperId"] }, { $eq: ["$provider", "openalex"] }] } } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: "openAlexIdentity",
      },
    },
    {
      $set: {
        fullTaxonomy: {
          $anyElementTrue: {
            $map: {
              input: { $ifNull: ["$paper.topics", []] },
              as: "topic",
              in: {
                $and: [
                  { $eq: ["$$topic.isPrimary", true] },
                  { $ne: [{ $ifNull: ["$$topic.openalexTopicId", ""] }, ""] },
                  { $ne: [{ $ifNull: ["$$topic.subfieldId", ""] }, ""] },
                  { $ne: [{ $ifNull: ["$$topic.fieldId", ""] }, ""] },
                  { $ne: [{ $ifNull: ["$$topic.domainId", ""] }, ""] },
                ],
              },
            },
          },
        },
      },
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              campaignMemberships: { $sum: 1 },
              canonicalPapers: { $sum: { $cond: [{ $ne: [{ $type: "$paper._id" }, "missing"] }, 1, 0] } },
              orphanMemberships: { $sum: { $cond: [{ $eq: [{ $type: "$paper._id" }, "missing"] }, 1, 0] } },
              activePapers: { $sum: { $cond: [{ $eq: ["$paper.dataStatus", "active"] }, 1, 0] } },
              withAbstract: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$paper.abstractText", ""] } }, 0] }, 1, 0] } },
              withFullTaxonomy: { $sum: { $cond: ["$fullTaxonomy", 1, 0] } },
              withSourceProvenance: { $sum: { $cond: [{ $gt: [{ $size: "$sourceRecord" }, 0] }, 1, 0] } },
              withQualityCheck: { $sum: { $cond: [{ $gt: [{ $size: "$qualityCheck" }, 0] }, 1, 0] } },
              qualityEligible: {
                $sum: { $cond: [{ $and: [{ $gte: ["$paper.dataQualityScore", 0.7] }, { $eq: ["$paper.isAiAnalyzable", true] }] }, 1, 0] },
              },
              withOpenAlexIdentity: { $sum: { $cond: [{ $gt: [{ $size: "$openAlexIdentity" }, 0] }, 1, 0] } },
            },
          },
          { $project: { _id: 0 } },
        ],
        duplicateOpenAlexIds: [
          { $match: { "paper.externalIds.openalexId": { $type: "string", $ne: "" } } },
          { $group: { _id: "$paper.externalIds.openalexId", paperIds: { $addToSet: "$_id" } } },
          { $project: { count: { $size: "$paperIds" } } },
          { $match: { count: { $gt: 1 } } },
          { $count: "count" },
        ],
        duplicateSourceRecords: [
          { $match: { $expr: { $gt: [{ $size: "$sourceRecord" }, 1] } } },
          { $count: "count" },
        ],
      },
    },
  ])
    .allowDiskUse(true)
    .option({ maxTimeMS: 15 * 60_000 });
  return result ?? { summary: [], duplicateOpenAlexIds: [], duplicateSourceRecords: [] };
}

function buildCohortAllocationCheck(metrics: CorpusValidationMetrics, terminal: boolean): CorpusValidationCheck {
  const baseline = metrics.cohorts.filter((item) => item.reason === "analytics_baseline").reduce((sum, item) => sum + item.uniquePapers, 0);
  const priority = metrics.cohorts.filter((item) => item.reason === "cs_ai_priority").reduce((sum, item) => sum + item.uniquePapers, 0);
  if (!terminal) {
    return {
      key: "cohort_allocation",
      label: "Cohort allocation",
      status: "pending",
      actual: `${baseline} baseline / ${priority} priority`,
      target: "Evaluate after campaign completion",
      detail: "A running campaign can temporarily be imbalanced because partitions commit sequentially.",
    };
  }
  const total = Math.max(1, baseline + priority);
  const baselinePct = pct(baseline, total);
  const plannedTotal = metrics.campaign.baselineTarget + metrics.campaign.priorityTarget;
  const expectedPct = pct(metrics.campaign.baselineTarget, plannedTotal);
  const drift = Math.abs(baselinePct - expectedPct);
  return {
    key: "cohort_allocation",
    label: "Baseline / priority cohort allocation",
    status: drift <= 1 ? "pass" : drift <= 5 ? "warning" : "fail",
    actual: baselinePct,
    target: `${expectedPct}% analytics baseline +/- 1 percentage point`,
    detail: `${baseline} baseline and ${priority} retrieval-priority unique memberships; observed drift is ${drift.toFixed(2)} points.`,
  };
}

function buildCampaignOutcomeCheck(metrics: CorpusValidationMetrics, terminal: boolean): CorpusValidationCheck {
  const state = metrics.campaign.state;
  const status: CorpusValidationCheck["status"] = state === "completed"
    ? "pass"
    : state === "completed_with_shortfall"
      ? "warning"
      : state === "failed" || state === "cancelled"
        ? "fail"
        : "pending";
  return {
    key: "campaign_outcome",
    label: "Campaign outcome",
    status,
    actual: state,
    target: "completed for final pass",
    detail: terminal
      ? state === "completed" ? "Campaign reached its intended terminal state." : `Terminal state '${state}' cannot receive final_pass.`
      : "Campaign is still mutable; this validation can only guide whether ingest should continue.",
  };
}

function buildTargetFulfillmentCheck(metrics: CorpusValidationMetrics, terminal: boolean): CorpusValidationCheck {
  const actual = metrics.papers.campaignMemberships;
  const target = metrics.campaign.targetUniqueWorks;
  const coverage = pct(actual, target);
  const status: CorpusValidationCheck["status"] = !terminal
    ? "pending"
    : actual >= target
      ? "pass"
      : coverage >= 95 && metrics.campaign.state === "completed_with_shortfall"
        ? "warning"
        : "fail";
  return {
    key: "target_fulfillment",
    label: "Target corpus fulfillment",
    status,
    actual: `${actual} / ${target} (${coverage}%)`,
    target: `At least ${target} distinct campaign papers`,
    detail: terminal
      ? "Final validation compares persisted distinct memberships with the campaign target."
      : "Progress is informational until the campaign reaches a terminal state.",
  };
}

function buildSamplingCheck(metrics: CorpusValidationMetrics, terminal: boolean): CorpusValidationCheck {
  const { completedStrata, completedFillPct, totalVariationDistancePct } = metrics.sampling;
  if (completedStrata === 0) {
    return {
      key: "sampling_distribution",
      label: "Completed-strata sampling distribution",
      status: "pending",
      actual: "No completed strata",
      target: "Fill >= 99%; TVD <= 2%",
      detail: "Distribution validation starts after at least one planned partition completes.",
    };
  }
  if (!terminal) {
    return {
      key: "sampling_distribution",
      label: "Completed-strata sampling distribution",
      status: "pending",
      actual: `${completedFillPct}% provisional fill; ${totalVariationDistancePct}% provisional TVD`,
      target: "Evaluate from a quiescent terminal campaign",
      detail: "Memberships are not partition-attributed, so an active partition in the same stratum can affect this provisional value.",
    };
  }
  const acceptable = completedFillPct >= 99 && totalVariationDistancePct <= 2;
  const warning = completedFillPct >= 95 && totalVariationDistancePct <= 5;
  return {
    key: "sampling_distribution",
    label: "Completed-strata sampling distribution",
    status: acceptable ? "pass" : warning || !terminal ? "warning" : "fail",
    actual: `${completedFillPct}% fill; ${totalVariationDistancePct}% TVD`,
    target: "Fill >= 99%; total variation distance <= 2%",
    detail: `${completedStrata} completed strata are compared with their deterministic planned quotas.`,
  };
}

async function collectAttemptLedger(campaignId: mongoose.Types.ObjectId): Promise<AttemptLedger> {
  const rows = await OpenAlexIngestPageAttemptModel.aggregate<AttemptLedger & { _id: null }>([
    { $match: { campaignId, state: "committed" } },
    {
      $group: {
        _id: null,
        committedPages: { $sum: 1 },
        acceptedWorks: { $sum: "$acceptedCount" },
        rejectedWorks: { $sum: "$rejectedCount" },
        conflictWorks: { $sum: "$conflictCount" },
      },
    },
  ]);
  const row = rows[0];
  return row ?? { committedPages: 0, acceptedWorks: 0, rejectedWorks: 0, conflictWorks: 0 };
}

async function collectSamplingRows(campaignId: mongoose.Types.ObjectId): Promise<SamplingRow[]> {
  return OpenAlexIngestPartitionModel.aggregate<SamplingRow>([
    { $match: { campaignId, state: "completed" } },
    {
      $group: {
        _id: { cohortId: "$cohortId", stratumKey: "$stratumKey" },
        targetCount: { $sum: "$targetCount" },
      },
    },
    {
      $lookup: {
        from: "paper_cohort_memberships",
        let: { cohortId: "$_id.cohortId", stratumKey: "$_id.stratumKey" },
        pipeline: [
          { $match: { campaignId } },
          { $match: { $expr: { $and: [{ $eq: ["$cohortId", "$$cohortId"] }, { $eq: ["$stratumKey", "$$stratumKey"] }] } } },
          { $group: { _id: "$paperId" } },
          { $count: "count" },
        ],
        as: "actual",
      },
    },
    {
      $project: {
        _id: 0,
        cohortId: "$_id.cohortId",
        stratumKey: "$_id.stratumKey",
        targetCount: 1,
        actualCount: { $ifNull: [{ $arrayElemAt: ["$actual.count", 0] }, 0] },
      },
    },
  ]).allowDiskUse(true);
}

function summarizeSampling(rows: SamplingRow[]): CorpusValidationMetrics["sampling"] {
  const completedTargetWorks = rows.reduce((sum, row) => sum + row.targetCount, 0);
  const completedDistinctMemberships = rows.reduce((sum, row) => sum + row.actualCount, 0);
  const completedFillPct = pct(completedDistinctMemberships, completedTargetWorks);
  if (completedTargetWorks === 0 || completedDistinctMemberships === 0) {
    return { completedStrata: rows.length, completedTargetWorks, completedDistinctMemberships, completedFillPct, totalVariationDistancePct: 0 };
  }
  const tvd = rows.reduce((sum, row) => {
    const expectedShare = row.targetCount / completedTargetWorks;
    const actualShare = row.actualCount / completedDistinctMemberships;
    return sum + Math.abs(expectedShare - actualShare);
  }, 0) / 2;
  return {
    completedStrata: rows.length,
    completedTargetWorks,
    completedDistinctMemberships,
    completedFillPct,
    totalVariationDistancePct: Math.round(tvd * 10_000) / 100,
  };
}

function exactCoverageCheck(key: string, label: string, actual: number, expected: number): CorpusValidationCheck {
  return {
    key,
    label,
    status: actual === expected ? "pass" : "fail",
    actual,
    target: `Exactly ${expected}`,
    detail: actual === expected ? "Every campaign membership resolves to a canonical paper." : `${expected - actual} membership(s) do not resolve correctly.`,
  };
}

function exactZeroCheck(key: string, label: string, actual: number): CorpusValidationCheck {
  return {
    key,
    label,
    status: actual === 0 ? "pass" : "fail",
    actual,
    target: "0",
    detail: actual === 0 ? "No violations detected." : `${actual} violation(s) require remediation before release.`,
  };
}

function thresholdCheck(key: string, label: string, actual: number, passAt: number, warnAt: number, unit: string): CorpusValidationCheck {
  return {
    key,
    label,
    status: actual >= passAt ? "pass" : actual >= warnAt ? "warning" : "fail",
    actual,
    target: `>= ${passAt}${unit} pass; >= ${warnAt}${unit} warning`,
    detail: `${label} is ${actual}${unit} across distinct campaign papers.`,
  };
}

function upperBoundCheck(key: string, label: string, actual: number, passAt: number, warnAt: number, unit: string): CorpusValidationCheck {
  return {
    key,
    label,
    status: actual <= passAt ? "pass" : actual <= warnAt ? "warning" : "fail",
    actual,
    target: `<= ${passAt}${unit} pass; <= ${warnAt}${unit} warning`,
    detail: `${label} is ${actual}${unit}.`,
  };
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 10_000) / 100;
}

function emptyPaperMetrics(): Omit<CorpusValidationMetrics["papers"], "duplicateOpenAlexIdGroups" | "duplicateSourceRecordGroups"> {
  return {
    campaignMemberships: 0,
    canonicalPapers: 0,
    orphanMemberships: 0,
    activePapers: 0,
    withAbstract: 0,
    withFullTaxonomy: 0,
    withSourceProvenance: 0,
    withQualityCheck: 0,
    qualityEligible: 0,
    withOpenAlexIdentity: 0,
  };
}

function objectId(value: string, field: string): mongoose.Types.ObjectId {
  if (!mongoose.isObjectIdOrHexString(value)) throw AppError.badRequest(`Invalid ${field}`);
  return new mongoose.Types.ObjectId(value);
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 11000;
}

function toValidationRun(value: unknown): CorpusValidationRun {
  const run = value as Record<string, unknown> & { _id: mongoose.Types.ObjectId; campaignId: mongoose.Types.ObjectId };
  const date = (input: unknown) => input instanceof Date ? input.toISOString() : typeof input === "string" ? input : undefined;
  return {
    id: run._id.toString(),
    campaignId: run.campaignId.toString(),
    state: run.state as CorpusValidationRun["state"],
    overallStatus: run.overallStatus as CorpusValidationRun["overallStatus"],
    decision: run.decision as CorpusValidationRun["decision"],
    validatorVersion: String(run.validatorVersion),
    snapshotCommittedPages: Number(run.snapshotCommittedPages ?? 0),
    metrics: run.metrics as CorpusValidationMetrics | undefined,
    checks: (run.checks as CorpusValidationCheck[] | undefined) ?? [],
    failureReason: typeof run.failureReason === "string" ? run.failureReason : undefined,
    requestedAt: date(run.requestedAt) ?? new Date(0).toISOString(),
    startedAt: date(run.startedAt),
    completedAt: date(run.completedAt),
  };
}
