import crypto from "node:crypto";

import { AppError } from "../../../common/exceptions/app-error.js";
import { ApiProviderModel } from "../models/api-provider.model.js";
import { fetchOpenAlexGroupCounts } from "../providers/openalex.client.js";
import { ingestCampaignService, type PlannedPartitionInput } from "./ingest-campaign.service.js";
import { allocateLargestRemainder, planDomainBaseline, splitSeededSampleQuota } from "./campaign-planner.js";
import { openAlexPreflightService } from "./openalex-preflight.service.js";

const ELIGIBILITY_FILTER = "has_abstract:true";
const POLICY_VERSION = "openalex-domain-proportional-v1";
const PROVIDER_CONTRACT_VERSION = "openalex-works-sample-v1";
const DEFAULT_PRIORITY_RATIO = 0.2;

// OpenAlex hierarchy IDs: Computer Science field 17, Artificial Intelligence
// subfield 1702. Keep the filters explicit in each campaign manifest so a later
// policy revision never silently changes an in-flight campaign.
const PRIORITY_STRATA = [
  { key: "artificial-intelligence", filter: "primary_topic.subfield.id:1702" },
  { key: "computer-science-non-ai", filter: "primary_topic.field.id:17,primary_topic.subfield.id:!1702" },
] as const;

export interface PlanOpenAlexBackfillInput {
  campaignKey: string;
  targetUniqueWorks: number;
  priorityRatio?: number;
}

/**
 * Builds a reproducible random-sample campaign. Every partition is bounded to
 * one-page sample contract and is tagged with an analytics baseline or a
 * retrieval-priority cohort. The campaign ledger records its exact filters
 * and seeds before any worker can start it.
 */
export const openAlexCampaignPlannerService = {
  async planBackfill(input: PlanOpenAlexBackfillInput) {
    const provider = await ApiProviderModel.exists({ providerName: "openalex" });
    if (!provider) throw AppError.conflict("OpenAlex provider is not seeded; run seed:providers before planning a campaign");

    const snapshot = await openAlexPreflightService.run();
    const priorityRatio = input.priorityRatio ?? DEFAULT_PRIORITY_RATIO;
    const priorityTarget = Math.floor(input.targetUniqueWorks * priorityRatio);
    const baselineTarget = input.targetUniqueWorks - priorityTarget;
    const baselineAllocations = planDomainBaseline(
      baselineTarget,
      snapshot.population.domains.map((domain) => ({ key: canonicalOpenAlexId(domain.openAlexId), population: domain.count })),
    );

    const partitions: PlannedPartitionInput[] = [];
    const sourceCounts: Record<string, unknown> = {
      snapshotTotal: snapshot.population.total,
      domains: snapshot.population.domains,
      priority: [],
    };

    for (const domain of baselineAllocations) {
      if (domain.quota === 0) continue;
      const filterExpression = joinFilter(ELIGIBILITY_FILTER, `primary_topic.domain.id:${domain.key}`);
      partitions.push(
        ...planStratum({
          campaignKey: input.campaignKey,
          cohortId: "analytics-baseline",
          stratumPrefix: `domain:${domain.key}`,
          baseFilter: filterExpression,
          target: domain.quota,
          population: domain.population,
        }),
      );
    }

    const priorityPopulations = await Promise.all(
      PRIORITY_STRATA.map(async (stratum) => {
        const filterExpression = joinFilter(ELIGIBILITY_FILTER, stratum.filter);
        const snapshot = await fetchOpenAlexGroupCounts({ filterExpression, groupBy: "publication_year" });
        return { ...stratum, filterExpression, total: snapshot.total };
      }),
    );
    const priorityAllocations = allocateLargestRemainder(
      priorityTarget,
      priorityPopulations.map((stratum) => ({ key: stratum.key, population: stratum.total })),
    );
    const priorityByKey = new Map(priorityAllocations.map((allocation) => [allocation.key, allocation]));
    for (const stratum of priorityPopulations) {
      const allocation = priorityByKey.get(stratum.key);
      if (!allocation || allocation.quota === 0) continue;
      partitions.push(
        ...planStratum({
          campaignKey: input.campaignKey,
          cohortId: "retrieval-priority",
          stratumPrefix: `priority:${stratum.key}`,
          baseFilter: stratum.filterExpression,
          target: allocation.quota,
          population: stratum.total,
        }),
      );
    }
    sourceCounts.priority = priorityPopulations.map(({ key, filterExpression, total }) => ({ key, filterExpression, total }));

    const plannedTarget = partitions.reduce((sum, partition) => sum + partition.targetCount, 0);
    if (plannedTarget === 0) throw AppError.conflict("OpenAlex planning produced zero eligible sample partitions");

    return ingestCampaignService.createPlanned({
      campaignKey: input.campaignKey,
      campaignKind: "backfill",
      targetUniqueWorks: plannedTarget,
      manifest: {
        planningAsOf: new Date(),
        policyVersion: POLICY_VERSION,
        providerContractVersion: PROVIDER_CONTRACT_VERSION,
        eligibilityFilter: ELIGIBILITY_FILTER,
        baselineTarget: Math.min(baselineTarget, partitions.filter((partition) => partition.cohortId === "analytics-baseline").reduce((sum, partition) => sum + partition.targetCount, 0)),
        priorityTarget: Math.min(priorityTarget, partitions.filter((partition) => partition.cohortId === "retrieval-priority").reduce((sum, partition) => sum + partition.targetCount, 0)),
        sourceCounts,
        requestFingerprints: [snapshot.snapshotFingerprint, ...partitions.map((partition) => fingerprint(partition))],
      },
      partitions,
    });
  },
};

function planStratum(input: {
  campaignKey: string;
  cohortId: string;
  stratumPrefix: string;
  baseFilter: string;
  target: number;
  population: number;
}): PlannedPartitionInput[] {
  return splitSeededSampleQuota({
    partitionPrefix: input.stratumPrefix,
    stratumKey: input.stratumPrefix,
    filterExpression: input.baseFilter,
    population: input.population,
    quota: input.target,
    seedNamespace: input.campaignKey,
  }).map((partition) => ({
    ...partition,
    cohortId: input.cohortId,
    selectionMethod: "seeded-sample" as const,
  }));
}

function canonicalOpenAlexId(value: string): string {
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

function joinFilter(...parts: string[]): string {
  return parts.filter(Boolean).join(",");
}

function fingerprint(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
