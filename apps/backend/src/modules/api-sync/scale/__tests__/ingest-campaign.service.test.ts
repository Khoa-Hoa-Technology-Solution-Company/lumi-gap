import { beforeEach, describe, expect, it, vi } from "vitest";

const CAMPAIGN = "11111111-1111-4111-8111-111111111111";

const m = vi.hoisted(() => ({
  campaignFindUnique: vi.fn(),
  campaignUpdate: vi.fn(),
  campaignUpdateMany: vi.fn(),
  partitionFindMany: vi.fn(),
  attemptAggregate: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("../../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({
    openAlexIngestCampaign: { findUnique: m.campaignFindUnique, update: m.campaignUpdate, updateMany: m.campaignUpdateMany },
    openAlexIngestPartition: { findMany: m.partitionFindMany },
    openAlexIngestPageAttempt: { aggregate: m.attemptAggregate },
    $queryRaw: m.queryRaw,
  }),
}));

const { ingestCampaignService } = await import("../ingest-campaign.service.js");

describe("reconcileCampaignProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.campaignFindUnique.mockResolvedValue({ id: CAMPAIGN });
    m.partitionFindMany.mockResolvedValue([
      { state: "completed", acceptedCount: 60, committedAttempts: 1 },
      { state: "completed", acceptedCount: 40, committedAttempts: 2 },
      { state: "planned", acceptedCount: 0, committedAttempts: 0 },
    ]);
    m.attemptAggregate.mockResolvedValue({ _sum: { rejectedCount: 3, conflictCount: 1 } });
    m.queryRaw.mockResolvedValue([{ count: 95n }]);
  });

  it("writes the counters the pipeline monitor reads", async () => {
    await ingestCampaignService.reconcileCampaignProgress(CAMPAIGN);

    expect(m.campaignUpdate).toHaveBeenCalledWith({
      where: { id: CAMPAIGN },
      data: {
        progress: {
          plannedPartitions: 3, completedPartitions: 2, committedPages: 3,
          acceptedWorks: 100, uniqueWorks: 95, rejectedWorks: 3, conflictWorks: 1,
        },
      },
    });
  });

  it("counts rejected rows from committed attempts only", async () => {
    await ingestCampaignService.reconcileCampaignProgress(CAMPAIGN);

    expect(m.attemptAggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { campaignId: CAMPAIGN, state: "committed" } }));
  });

  it("reports zero before anything is committed", async () => {
    m.partitionFindMany.mockResolvedValue([]);
    m.attemptAggregate.mockResolvedValue({ _sum: { rejectedCount: null, conflictCount: null } });
    m.queryRaw.mockResolvedValue([{ count: 0n }]);

    await ingestCampaignService.reconcileCampaignProgress(CAMPAIGN);

    expect(m.campaignUpdate.mock.calls[0]?.[0].data.progress).toMatchObject({ uniqueWorks: 0, rejectedWorks: 0, conflictWorks: 0 });
  });

  it("leaves an unknown campaign alone", async () => {
    m.campaignFindUnique.mockResolvedValue(null);

    await ingestCampaignService.reconcileCampaignProgress(CAMPAIGN);

    expect(m.campaignUpdate).not.toHaveBeenCalled();
  });
});

describe("pauseAfterFailure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pauses a running campaign and records why", async () => {
    m.campaignUpdateMany.mockResolvedValue({ count: 1 });

    await expect(ingestCampaignService.pauseAfterFailure(CAMPAIGN, "OpenAlex 500")).resolves.toBe(true);

    expect(m.campaignUpdateMany).toHaveBeenCalledWith({
      where: { id: CAMPAIGN, state: "running" },
      data: { state: "paused", failureReason: "OpenAlex 500" },
    });
  });

  it("only matches running campaigns, so paused, cancelled and completed ones are left alone", async () => {
    m.campaignUpdateMany.mockResolvedValue({ count: 0 });

    await expect(ingestCampaignService.pauseAfterFailure(CAMPAIGN, "boom")).resolves.toBe(false);

    expect(m.campaignUpdateMany.mock.calls[0]?.[0].where).toMatchObject({ state: "running" });
  });

  it("redacts the api key and contact address before storing", async () => {
    m.campaignUpdateMany.mockResolvedValue({ count: 1 });

    await ingestCampaignService.pauseAfterFailure(CAMPAIGN, "403 https://api.openalex.org/works?api_key=SECRET123&mailto=me@x.edu&per-page=100");

    const reason = m.campaignUpdateMany.mock.calls[0]?.[0].data.failureReason as string;
    expect(reason).not.toContain("SECRET123");
    expect(reason).not.toContain("me@x.edu");
    expect(reason).toContain("api_key=[redacted]");
    expect(reason).toContain("mailto=[redacted]");
  });

  it("truncates long reasons to 2000 characters", async () => {
    m.campaignUpdateMany.mockResolvedValue({ count: 1 });

    await ingestCampaignService.pauseAfterFailure(CAMPAIGN, "x".repeat(5000));

    expect(m.campaignUpdateMany.mock.calls[0]?.[0].data.failureReason).toHaveLength(2000);
  });
});
