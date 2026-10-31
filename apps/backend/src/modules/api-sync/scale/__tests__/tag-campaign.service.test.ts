import { beforeEach, describe, expect, it, vi } from "vitest";
import { tagCampaignService } from "../tag-campaign.service.js";

const m = vi.hoisted(() => ({
  campaignFindFirst: vi.fn(), campaignFindMany: vi.fn(),
  ruleFindMany: vi.fn(), providerFind: vi.fn(), tagFind: vi.fn(), queryRaw: vi.fn(),
  loadTarget: vi.fn(), counts: vi.fn(), heartbeats: vi.fn(), audit: vi.fn(), createPlanned: vi.fn(),
  env: { TAG_CAMPAIGN_MAX_WORKS: 5000, OPENALEX_API_KEY: "key" as string | undefined, EMBED_MAX_PAPERS_PER_RUN: 1000 },
}));

vi.mock("../../../../config/env.js", () => ({ env: m.env }));
vi.mock("../../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({
    openAlexIngestCampaign: { findFirst: m.campaignFindFirst, findMany: m.campaignFindMany },
    tagRule: { findMany: m.ruleFindMany },
    apiProvider: { findUnique: m.providerFind },
    tag: { findUniqueOrThrow: m.tagFind },
    $queryRaw: m.queryRaw,
  }),
}));
vi.mock("../../../../infrastructure/worker-heartbeat.js", () => ({ readWorkerHeartbeats: m.heartbeats }));
vi.mock("../../../audit/audit.service.js", () => ({ auditService: { log: m.audit } }));
vi.mock("../../providers/openalex.client.js", () => ({ fetchOpenAlexGroupCounts: m.counts }));
vi.mock("../ingest-campaign.service.js", () => ({ ingestCampaignService: { createPlanned: m.createPlanned } }));
vi.mock("../../../topic-backfill/topic-backfill.queries.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../topic-backfill/topic-backfill.queries.js")>()),
  loadBackfillTarget: m.loadTarget,
}));

const USER = "00000000-0000-4000-8000-0000000000cc";
const TAG = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-30T12:00:00.000Z");

const nodeQ = (id: string) => ({ filterExpression: `topics.id:${id},has_abstract:true`, sort: "cited_by_count:desc" });
const kwQ = (phrase: string) => ({ searchText: `"${phrase}"`, filterExpression: "has_abstract:true" });
const target = (queries: unknown[] = [nodeQ("T1")]) => ({ kind: "tag", id: TAG, name: "LLM safety", paperCount: 7, queries });
const campaignRow = (over: Record<string, unknown> = {}) => ({
  id: "c1", campaignKey: "tag-llm-safety-20261030120000", state: "planned", targetUniqueWorks: 100,
  progress: { plannedPartitions: 1 }, createdAt: NOW, startedAt: null, completedAt: null, ...over,
});

/** Population per filter expression; anything unlisted has no works. */
const populations = (byFilter: Record<string, number>) =>
  m.counts.mockImplementation(async ({ filterExpression }: { filterExpression: string }) => ({ total: byFilter[filterExpression] ?? 0, groups: [] }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
  Object.assign(m.env, { TAG_CAMPAIGN_MAX_WORKS: 5000, OPENALEX_API_KEY: "key", EMBED_MAX_PAPERS_PER_RUN: 1000 });
  m.loadTarget.mockResolvedValue(target());
  populations({ "topics.id:T1,has_abstract:true": 1000 });
  m.campaignFindFirst.mockResolvedValue(null);
  m.campaignFindMany.mockResolvedValue([]);
  m.ruleFindMany.mockResolvedValue([]);
  m.providerFind.mockResolvedValue({ id: "provider-1" });
  m.tagFind.mockResolvedValue({ slug: "llm-safety" });
  m.queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
  m.heartbeats.mockResolvedValue([]);
  m.audit.mockResolvedValue(undefined);
  m.createPlanned.mockImplementation(async (input: { campaignKey: string; targetUniqueWorks: number }) =>
    campaignRow({ campaignKey: input.campaignKey, targetUniqueWorks: input.targetUniqueWorks }));
});

describe("preflight", () => {
  it("404s for a missing or archived tag before asking OpenAlex anything", async () => {
    m.loadTarget.mockResolvedValue(null);
    await expect(tagCampaignService.preflight(TAG)).rejects.toMatchObject({ statusCode: 404 });
    expect(m.counts).not.toHaveBeenCalled();
  });

  it("409s with TAG_HAS_NO_INCLUDE_RULES for a tag OpenAlex cannot be asked about", async () => {
    m.loadTarget.mockResolvedValue(target([]));
    await expect(tagCampaignService.preflight(TAG)).rejects.toMatchObject({ statusCode: 409, code: "TAG_HAS_NO_INCLUDE_RULES" });
    expect(m.counts).not.toHaveBeenCalled();
  });

  it("sums the population over the queries, counting a repeated filter once", async () => {
    m.loadTarget.mockResolvedValue(target([nodeQ("T1"), nodeQ("T2"), nodeQ("T1")]));
    populations({ "topics.id:T1,has_abstract:true": 1000, "topics.id:T2,has_abstract:true": 250 });

    const result = await tagCampaignService.preflight(TAG);

    expect(m.counts).toHaveBeenCalledTimes(2);
    expect(result.queries).toEqual([
      { filterExpression: "topics.id:T1,has_abstract:true", population: 1000 },
      { filterExpression: "topics.id:T2,has_abstract:true", population: 250 },
    ]);
    expect(result.population).toBe(1250);
    expect(result.tag).toEqual({ id: TAG, name: "LLM safety", paperCount: 7 });
  });

  it("asks OpenAlex for a keyword query as one title_and_abstract.search filter", async () => {
    m.loadTarget.mockResolvedValue(target([kwQ("prompt engineering")]));
    populations({ 'title_and_abstract.search:"prompt engineering",has_abstract:true': 40 });

    const result = await tagCampaignService.preflight(TAG);

    expect(m.counts).toHaveBeenCalledWith({ filterExpression: 'title_and_abstract.search:"prompt engineering",has_abstract:true', groupBy: "publication_year" });
    expect(result.population).toBe(40);
  });

  it("counts include-keyword rules that got no query, and the exclude rules", async () => {
    m.loadTarget.mockResolvedValue(target([nodeQ("T1"), kwQ("alpha")]));
    populations({ "topics.id:T1,has_abstract:true": 10, 'title_and_abstract.search:"alpha",has_abstract:true': 5 });
    m.ruleFindMany.mockResolvedValue([
      { effect: "include", keywordId: "k1" },
      { effect: "include", keywordId: "k2" },
      { effect: "include", keywordId: "k3" },
      { effect: "include", keywordId: null },
      { effect: "exclude", keywordId: "k4" },
      { effect: "exclude", keywordId: null },
    ]);

    const result = await tagCampaignService.preflight(TAG);

    // three include-keyword rules, one keyword query was built
    expect(result.keywordRulesSkipped).toBe(2);
    expect(result.excludeRuleCount).toBe(2);
    expect(m.ruleFindMany.mock.calls[0]![0].where).toEqual({ tagId: TAG });
  });

  it("never reports a negative number of skipped keyword rules", async () => {
    m.loadTarget.mockResolvedValue(target([kwQ("alpha"), kwQ("beta")]));
    populations({});
    m.ruleFindMany.mockResolvedValue([{ effect: "include", keywordId: "k1" }]);
    expect((await tagCampaignService.preflight(TAG)).keywordRulesSkipped).toBe(0);
  });

  describe("ingestWorkerOnline", () => {
    const beat = (workerName: string, ageMs: number) =>
      ({ workerName, lastSeenAt: new Date(NOW.getTime() - ageMs).toISOString() });
    const online = async () => {
      vi.useFakeTimers({ now: NOW });
      return (await tagCampaignService.preflight(TAG)).ingestWorkerOnline;
    };

    it("is true for a fresh openalex-ingest heartbeat, up to 90 seconds old", async () => {
      m.heartbeats.mockResolvedValue([beat("worker:openalex-ingest", 5_000)]);
      expect(await online()).toBe(true);
      m.heartbeats.mockResolvedValue([beat("worker:openalex-ingest", 90_000)]);
      expect(await online()).toBe(true);
    });

    it("is false for a stale heartbeat", async () => {
      m.heartbeats.mockResolvedValue([beat("worker:openalex-ingest", 91_000)]);
      expect(await online()).toBe(false);
    });

    it("is false when only other workers are alive, or none", async () => {
      m.heartbeats.mockResolvedValue([beat("worker:embedding", 1_000)]);
      expect(await online()).toBe(false);
      m.heartbeats.mockResolvedValue([]);
      expect(await online()).toBe(false);
    });
  });

  it("reports the embedding backlog next to the nightly capacity", async () => {
    m.queryRaw.mockResolvedValue([{ count: BigInt(4321) }]);
    m.env.EMBED_MAX_PAPERS_PER_RUN = 750;
    expect((await tagCampaignService.preflight(TAG)).embeddingBacklog).toEqual({ pendingPapers: 4321, papersPerDay: 750 });
  });

  it("reports the key configuration and the cap", async () => {
    m.env.OPENALEX_API_KEY = undefined;
    m.env.TAG_CAMPAIGN_MAX_WORKS = 123;
    const result = await tagCampaignService.preflight(TAG);
    expect(result).toMatchObject({ openAlexKeyConfigured: false, maxTarget: 123 });
  });

  it("maps a planned, running or paused campaign of the tag, and null when there is none", async () => {
    expect((await tagCampaignService.preflight(TAG)).liveCampaign).toBeNull();

    m.campaignFindFirst.mockResolvedValue(campaignRow({
      state: "running", startedAt: new Date("2026-10-30T12:05:00.000Z"),
      progress: { plannedPartitions: 4, completedPartitions: 1, uniqueWorks: 90 },
    }));
    const result = await tagCampaignService.preflight(TAG);

    expect(m.campaignFindFirst.mock.calls[0]![0].where).toEqual({ targetTagId: TAG, state: { in: ["planned", "running", "paused"] } });
    expect(result.liveCampaign).toEqual({
      id: "c1", campaignKey: "tag-llm-safety-20261030120000", state: "running", targetUniqueWorks: 100,
      uniqueWorks: 90, plannedPartitions: 4, completedPartitions: 1,
      createdAt: NOW.toISOString(), startedAt: "2026-10-30T12:05:00.000Z", completedAt: null,
    });
  });

  it("creates nothing", async () => {
    await tagCampaignService.preflight(TAG);
    expect(m.createPlanned).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
});

describe("plan", () => {
  const plan = (targetUniqueWorks = 100) => tagCampaignService.plan(USER, { tagId: TAG, targetUniqueWorks });
  const planned = () => m.createPlanned.mock.calls[0]![0];

  it("refuses a target above the cap before any OpenAlex call or lookup", async () => {
    m.env.TAG_CAMPAIGN_MAX_WORKS = 500;
    await expect(plan(501)).rejects.toMatchObject({ statusCode: 400, code: "TAG_CAMPAIGN_TOO_LARGE" });
    expect(m.counts).not.toHaveBeenCalled();
    expect(m.loadTarget).not.toHaveBeenCalled();
    expect(m.createPlanned).not.toHaveBeenCalled();
    await expect(plan(500)).resolves.toBeDefined();
  });

  it("409s with OPENALEX_API_KEY_REQUIRED when no key is configured", async () => {
    m.env.OPENALEX_API_KEY = undefined;
    await expect(plan()).rejects.toMatchObject({ statusCode: 409, code: "OPENALEX_API_KEY_REQUIRED" });
    expect(m.counts).not.toHaveBeenCalled();
    expect(m.createPlanned).not.toHaveBeenCalled();
  });

  it("404s for a missing tag and 409s for a tag without searchable rules", async () => {
    m.loadTarget.mockResolvedValue(null);
    await expect(plan()).rejects.toMatchObject({ statusCode: 404 });
    m.loadTarget.mockResolvedValue(target([]));
    await expect(plan()).rejects.toMatchObject({ statusCode: 409, code: "TAG_HAS_NO_INCLUDE_RULES" });
    expect(m.createPlanned).not.toHaveBeenCalled();
  });

  it("409s with TAG_CAMPAIGN_ACTIVE while the tag has an unfinished campaign, and plans nothing", async () => {
    m.campaignFindFirst.mockResolvedValue(campaignRow({ state: "paused" }));
    await expect(plan()).rejects.toMatchObject({ statusCode: 409, code: "TAG_CAMPAIGN_ACTIVE" });
    expect(m.createPlanned).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("409s with TAG_HAS_NO_OPENALEX_WORKS when OpenAlex has nothing for the tag", async () => {
    populations({});
    await expect(plan()).rejects.toMatchObject({ statusCode: 409, code: "TAG_HAS_NO_OPENALEX_WORKS" });
    expect(m.createPlanned).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("splits the target across queries in proportion to their population", async () => {
    m.loadTarget.mockResolvedValue(target([nodeQ("T1"), nodeQ("T2")]));
    populations({ "topics.id:T1,has_abstract:true": 300, "topics.id:T2,has_abstract:true": 100 });

    await plan(200);

    const sums = (stratum: string) => planned().partitions
      .filter((p: { stratumKey: string }) => p.stratumKey === `tag:${TAG}:${stratum}`)
      .reduce((sum: number, p: { targetCount: number }) => sum + p.targetCount, 0);
    expect(sums("q1")).toBe(150);
    expect(sums("q2")).toBe(50);
    expect(planned().targetUniqueWorks).toBe(200);
  });

  it("never draws more from a query than it holds, so the planned target can fall below the request", async () => {
    m.loadTarget.mockResolvedValue(target([nodeQ("T1"), nodeQ("T2")]));
    populations({ "topics.id:T1,has_abstract:true": 200, "topics.id:T2,has_abstract:true": 30 });

    const campaign = await plan(1000);

    const total = planned().partitions.reduce((sum: number, p: { targetCount: number }) => sum + p.targetCount, 0);
    expect(total).toBe(230);
    expect(planned().targetUniqueWorks).toBe(230);
    expect(campaign.targetUniqueWorks).toBe(230);
  });

  it("splits 250 works into seeded-sample partitions of at most 100, tagged with the cohort and stratum", async () => {
    await plan(250);

    const { partitions } = planned();
    expect(partitions.map((p: { targetCount: number }) => p.targetCount)).toEqual([100, 100, 50]);
    for (const partition of partitions) {
      expect(partition).toMatchObject({
        selectionMethod: "seeded-sample", cohortId: `tag:${TAG}`, stratumKey: `tag:${TAG}:q1`,
        filterExpression: "topics.id:T1,has_abstract:true",
      });
      expect(Number.isInteger(partition.seed)).toBe(true);
      expect(partition.seed).toBeGreaterThan(0);
    }
    expect(new Set(partitions.map((p: { partitionKey: string }) => p.partitionKey)).size).toBe(3);
    expect(new Set(partitions.map((p: { seed: number }) => p.seed)).size).toBe(3);
  });

  it("creates a backfill campaign linked to the tag, with a manifest that names the policy and the tag", async () => {
    vi.useFakeTimers({ now: NOW });
    m.loadTarget.mockResolvedValue(target([nodeQ("T1"), kwQ("prompt engineering")]));
    populations({ "topics.id:T1,has_abstract:true": 500, 'title_and_abstract.search:"prompt engineering",has_abstract:true': 500 });

    await plan(200);

    const input = planned();
    expect(input).toMatchObject({ campaignKind: "backfill", targetTagId: TAG, targetUniqueWorks: 200 });
    expect(input.manifest).toMatchObject({
      policyVersion: "openalex-tag-sample-v1",
      tag: { id: TAG, name: "LLM safety" },
      eligibilityFilter: "has_abstract:true",
      planningAsOf: NOW,
    });
    expect(input.manifest.sourceCounts.queries.map((q: { filterExpression: string }) => q.filterExpression)).toEqual([
      "topics.id:T1,has_abstract:true", 'title_and_abstract.search:"prompt engineering",has_abstract:true',
    ]);
    expect(input.manifest.requestFingerprints).toHaveLength(input.partitions.length);
    expect(new Set(input.manifest.requestFingerprints).size).toBe(input.partitions.length);
    // the keyword query is sampled through the filter form, not a separate search parameter
    expect(input.partitions.map((p: { filterExpression: string }) => p.filterExpression)).toContain(
      'title_and_abstract.search:"prompt engineering",has_abstract:true',
    );
  });

  it("returns the planned campaign and audits it", async () => {
    const result = await plan(100);

    expect(result).toMatchObject({ id: "c1", state: "planned", targetUniqueWorks: 100, plannedPartitions: 1, uniqueWorks: 0, completedPartitions: 0 });
    expect(m.audit).toHaveBeenCalledWith("ingest_campaign.planned", {
      userId: USER, targetTableName: "openalex_ingest_campaigns", targetRecordId: "c1",
      details: { tagId: TAG, targetUniqueWorks: 100 },
    });
  });

  it("gives plans made at different times different campaign keys and seeds", async () => {
    vi.useFakeTimers({ now: NOW });
    await plan(100);
    vi.setSystemTime(new Date(NOW.getTime() + 1000));
    await plan(100);

    const [first, second] = m.createPlanned.mock.calls.map((call) => call[0]);
    expect(first.campaignKey).toBe("tag-llm-safety-20261030120000");
    expect(second.campaignKey).toBe("tag-llm-safety-20261030120001");
    expect(first.partitions[0].seed).not.toBe(second.partitions[0].seed);
  });
});

describe("listForTag", () => {
  it("asks for the tag's campaigns, newest first, and maps their progress", async () => {
    m.campaignFindMany.mockResolvedValue([
      campaignRow({
        id: "c2", state: "completed", completedAt: new Date("2026-10-30T13:00:00.000Z"),
        progress: { plannedPartitions: 3, completedPartitions: 3, uniqueWorks: 250, committedPages: 3 },
      }),
    ]);

    const result = await tagCampaignService.listForTag(TAG);

    const args = m.campaignFindMany.mock.calls[0]![0];
    expect(args.where).toEqual({ targetTagId: TAG });
    expect(args.orderBy).toEqual({ createdAt: "desc" });
    expect(result).toEqual([expect.objectContaining({
      id: "c2", state: "completed", uniqueWorks: 250, plannedPartitions: 3, completedPartitions: 3,
      completedAt: "2026-10-30T13:00:00.000Z", startedAt: null,
    })]);
  });

  it("defaults missing progress to zero", async () => {
    m.campaignFindMany.mockResolvedValue([campaignRow({ progress: null }), campaignRow({ id: "c3", progress: {} })]);
    const result = await tagCampaignService.listForTag(TAG);
    expect(result).toHaveLength(2);
    for (const campaign of result) {
      expect(campaign).toMatchObject({ uniqueWorks: 0, plannedPartitions: 0, completedPartitions: 0 });
    }
  });
});
