import crypto from "node:crypto";
import type { TagCampaign, TagCampaignPreflight, TagCampaignQuery } from "@trend/shared-types";

import { AppError } from "../../../common/exceptions/app-error.js";
import { env } from "../../../config/env.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { readWorkerHeartbeats } from "../../../infrastructure/worker-heartbeat.js";
import { auditService } from "../../audit/audit.service.js";
import {
  filterOnlyExpression, loadBackfillTarget, type BackfillTarget,
} from "../../topic-backfill/topic-backfill.queries.js";
import { fetchOpenAlexGroupCounts } from "../providers/openalex.client.js";
import { allocateLargestRemainder, splitSeededSampleQuota } from "./campaign-planner.js";
import { ingestCampaignService, type PlannedPartitionInput } from "./ingest-campaign.service.js";

const ELIGIBILITY_FILTER = "has_abstract:true";
const POLICY_VERSION = "openalex-tag-sample-v1";
const PROVIDER_CONTRACT_VERSION = "openalex-works-sample-v1";
const LIVE_STATES = ["planned", "running", "paused"];
const HEARTBEAT_MAX_AGE_MS = 90_000;
const CAMPAIGNS_PER_TAG = 10;

type CampaignRow = NonNullable<Awaited<ReturnType<ReturnType<typeof getPrisma>["openAlexIngestCampaign"]["findFirst"]>>>;

function toCampaign(row: CampaignRow): TagCampaign {
  const progress = (row.progress ?? {}) as { plannedPartitions?: number; completedPartitions?: number; uniqueWorks?: number };
  return {
    id: row.id,
    campaignKey: row.campaignKey,
    state: row.state,
    targetUniqueWorks: row.targetUniqueWorks,
    uniqueWorks: progress.uniqueWorks ?? 0,
    plannedPartitions: progress.plannedPartitions ?? 0,
    completedPartitions: progress.completedPartitions ?? 0,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

async function loadTarget(tagId: string): Promise<BackfillTarget> {
  const target = await loadBackfillTarget("tag", tagId);
  if (!target) throw AppError.notFound("Tag not found or archived");
  if (!target.queries.length) {
    throw new AppError(409, "TAG_HAS_NO_INCLUDE_RULES", "This tag has no include rule that OpenAlex can search");
  }
  return target;
}

function findLiveCampaign(tagId: string) {
  return getPrisma().openAlexIngestCampaign.findFirst({
    where: { targetTagId: tagId, state: { in: LIVE_STATES } },
    orderBy: { createdAt: "desc" },
  });
}

/** One after another: this runs inside a request, and a tag's queries are few. */
async function countQueries(target: BackfillTarget): Promise<TagCampaignQuery[]> {
  const queries: TagCampaignQuery[] = [];
  for (const filterExpression of new Set(target.queries.map(filterOnlyExpression))) {
    const { total } = await fetchOpenAlexGroupCounts({ filterExpression, groupBy: "publication_year" });
    queries.push({ filterExpression, population: total });
  }
  return queries;
}

async function isIngestWorkerOnline(): Promise<boolean> {
  const heartbeats = await readWorkerHeartbeats();
  const now = Date.now();
  return heartbeats.some((heartbeat) => heartbeat.workerName === "worker:openalex-ingest"
    && now - Date.parse(heartbeat.lastSeenAt) <= HEARTBEAT_MAX_AGE_MS);
}

async function pendingEmbeddings(): Promise<number> {
  const rows = await getPrisma().$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM papers
    WHERE is_ai_analyzable = TRUE AND data_status = 'active' AND embedding IS NULL
  `;
  return Number(rows[0]?.count ?? 0);
}

function fingerprint(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Sortable and unique to the second, and the seeds derive from it, so each plan draws a fresh sample. */
function buildCampaignKey(slug: string, now: Date): string {
  return `tag-${slug}-${now.toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;
}

/**
 * Plans an OpenAlex campaign from a tag's include rules. Like the domain planner it draws a reproducible random
 * sample, one bounded request per partition, and records the exact filters before any worker can start it; the
 * existing start, pause and cancel controls then apply. The sample is not the most cited works: that is what a
 * topic backfill fetches.
 */
export const tagCampaignService = {
  async preflight(tagId: string): Promise<TagCampaignPreflight> {
    const target = await loadTarget(tagId);
    const prisma = getPrisma();
    const [queries, rules, live, pendingPapers, ingestWorkerOnline] = await Promise.all([
      countQueries(target),
      prisma.tagRule.findMany({ where: { tagId }, select: { effect: true, keywordId: true } }),
      findLiveCampaign(tagId),
      pendingEmbeddings(),
      isIngestWorkerOnline(),
    ]);
    const includedKeywords = rules.filter((rule) => rule.effect === "include" && rule.keywordId).length;
    const keywordQueries = target.queries.filter((query) => query.searchText).length;
    return {
      tag: { id: target.id, name: target.name, paperCount: target.paperCount },
      planningAsOf: new Date().toISOString(),
      queries,
      population: queries.reduce((sum, query) => sum + query.population, 0),
      keywordRulesSkipped: Math.max(0, includedKeywords - keywordQueries),
      excludeRuleCount: rules.filter((rule) => rule.effect === "exclude").length,
      maxTarget: env.TAG_CAMPAIGN_MAX_WORKS,
      openAlexKeyConfigured: Boolean(env.OPENALEX_API_KEY),
      ingestWorkerOnline,
      embeddingBacklog: { pendingPapers, papersPerDay: env.EMBED_MAX_PAPERS_PER_RUN },
      liveCampaign: live ? toCampaign(live) : null,
    };
  },

  async plan(userId: string | undefined, input: { tagId: string; targetUniqueWorks: number }): Promise<TagCampaign> {
    if (input.targetUniqueWorks > env.TAG_CAMPAIGN_MAX_WORKS) {
      throw new AppError(400, "TAG_CAMPAIGN_TOO_LARGE", `A tag campaign can sample at most ${env.TAG_CAMPAIGN_MAX_WORKS} works`);
    }
    if (!env.OPENALEX_API_KEY) {
      throw new AppError(409, "OPENALEX_API_KEY_REQUIRED", "OpenAlex campaigns require OPENALEX_API_KEY before planning can run");
    }
    const prisma = getPrisma();
    const provider = await prisma.apiProvider.findUnique({ where: { providerName: "openalex" }, select: { id: true } });
    if (!provider) throw AppError.conflict("OpenAlex provider is not seeded; run seed:providers before planning a campaign");

    const target = await loadTarget(input.tagId);
    if (await findLiveCampaign(input.tagId)) {
      throw new AppError(409, "TAG_CAMPAIGN_ACTIVE", "This tag already has a campaign that has not finished");
    }
    const tag = await prisma.tag.findUniqueOrThrow({ where: { id: input.tagId }, select: { slug: true } });
    const queries = await countQueries(target);
    const allocations = allocateLargestRemainder(
      input.targetUniqueWorks,
      queries.map((query, index) => ({ key: String(index), population: query.population })),
    );

    const now = new Date();
    const campaignKey = buildCampaignKey(tag.slug, now);
    const partitions: PlannedPartitionInput[] = allocations.flatMap((allocation) => {
      const query = queries[Number(allocation.key)]!;
      const stratum = `q${Number(allocation.key) + 1}`;
      return splitSeededSampleQuota({
        partitionPrefix: stratum,
        stratumKey: `tag:${input.tagId}:${stratum}`,
        filterExpression: query.filterExpression,
        population: query.population,
        quota: allocation.quota,
        seedNamespace: campaignKey,
      }).map((partition) => ({ ...partition, cohortId: `tag:${input.tagId}`, selectionMethod: "seeded-sample" as const }));
    });
    const plannedTarget = partitions.reduce((sum, partition) => sum + partition.targetCount, 0);
    if (plannedTarget === 0) throw new AppError(409, "TAG_HAS_NO_OPENALEX_WORKS", "OpenAlex has no eligible works for this tag");

    const campaign = await ingestCampaignService.createPlanned({
      campaignKey,
      campaignKind: "backfill",
      targetUniqueWorks: plannedTarget,
      targetTagId: input.tagId,
      manifest: {
        planningAsOf: now,
        policyVersion: POLICY_VERSION,
        providerContractVersion: PROVIDER_CONTRACT_VERSION,
        eligibilityFilter: ELIGIBILITY_FILTER,
        tag: { id: target.id, name: target.name },
        sourceCounts: { queries },
        requestFingerprints: partitions.map(fingerprint),
      },
      partitions,
    });

    await auditService.log("ingest_campaign.planned", {
      userId,
      targetTableName: "openalex_ingest_campaigns",
      targetRecordId: campaign.id,
      details: { tagId: input.tagId, targetUniqueWorks: plannedTarget },
    });
    return toCampaign(campaign);
  },

  async listForTag(tagId: string): Promise<TagCampaign[]> {
    const rows = await getPrisma().openAlexIngestCampaign.findMany({
      where: { targetTagId: tagId },
      orderBy: { createdAt: "desc" },
      take: CAMPAIGNS_PER_TAG,
    });
    return rows.map(toCampaign);
  },
};
