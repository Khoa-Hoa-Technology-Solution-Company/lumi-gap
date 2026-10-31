import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCampaignPartitionPage } from "../campaign-partition-runner.js";

const m = vi.hoisted(() => ({
  campaignFindUnique: vi.fn(), partitionFindUniqueOrThrow: vi.fn(), membershipCreateMany: vi.fn(),
  providerFind: vi.fn(), attemptUpdate: vi.fn(), deadLetterCreate: vi.fn(),
  claim: vi.fn(), reconcile: vi.fn(), reconcileIfDue: vi.fn(), complete: vi.fn(), markPartition: vi.fn(),
  beginAttempt: vi.fn(), renewLease: vi.fn(), commit: vi.fn(),
  fetchPage: vi.fn(), ingest: vi.fn(), followUps: vi.fn(),
}));

vi.mock("../../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({
    openAlexIngestCampaign: { findUnique: m.campaignFindUnique },
    openAlexIngestPartition: { findUniqueOrThrow: m.partitionFindUniqueOrThrow },
    openAlexIngestPageAttempt: { update: m.attemptUpdate },
    paperCohortMembership: { createMany: m.membershipCreateMany },
    apiProvider: { findUnique: m.providerFind },
    ingestDeadLetter: { create: m.deadLetterCreate },
  }),
}));
vi.mock("../../providers/openalex.client.js", () => ({ fetchOpenAlexPage: m.fetchPage }));
vi.mock("../../sync.service.js", () => ({ ingestOpenAlexWorks: m.ingest }));
vi.mock("../../../topic-backfill/topic-backfill.service.js", () => ({ runImportFollowUps: m.followUps }));
vi.mock("../ingest-campaign.service.js", () => ({
  ingestCampaignService: {
    claimNextPartition: m.claim, reconcileCampaignProgress: m.reconcile, reconcileCampaignProgressIfDue: m.reconcileIfDue,
    completeIfFinished: m.complete, markPartition: m.markPartition, beginAttempt: m.beginAttempt,
    renewPartitionLease: m.renewLease, commitAttemptAndAdvanceCheckpoint: m.commit,
  },
}));

const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const PARTITION = "00000000-0000-4000-8000-0000000000d1";
const TAG = "00000000-0000-4000-8000-000000000001";
const input = { campaignId: CAMPAIGN, workerId: "worker-1", leaseMs: 60_000 };

const campaignRow = (over: Record<string, unknown> = {}) => ({
  id: CAMPAIGN, state: "running", targetTagId: null, manifest: {}, ...over,
});
const partition = (over: Record<string, unknown> = {}) => ({
  _id: { toString: () => PARTITION }, id: PARTITION, checkpoint: { cursor: "*", acceptedCount: 0, version: 0 },
  targetCount: 10, selectionMethod: "seeded-sample", seed: 7, cohortId: `tag:${TAG}`, stratumKey: `tag:${TAG}:q1`,
  filterExpression: "topics.id:T1,has_abstract:true", ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.campaignFindUnique.mockResolvedValue(campaignRow());
  m.claim.mockResolvedValue(partition());
  m.beginAttempt.mockResolvedValue({ _id: { toString: () => "attempt-1" }, id: "attempt-1" });
  m.renewLease.mockResolvedValue(undefined);
  m.providerFind.mockResolvedValue({ id: "provider-1" });
  m.fetchPage.mockResolvedValue({ results: [{ id: "W1" }], nextCursor: null });
  m.ingest.mockResolvedValue({ records: [{ paper: { id: "paper-1" } }], rejectedCount: 0 });
  m.membershipCreateMany.mockResolvedValue({ count: 1 });
  m.commit.mockResolvedValue({ checkpointAdvanced: true });
  m.partitionFindUniqueOrThrow.mockResolvedValue({ acceptedCount: 10, targetCount: 10 });
  m.markPartition.mockResolvedValue(undefined);
  m.reconcile.mockResolvedValue(undefined);
  m.reconcileIfDue.mockResolvedValue(true);
  m.complete.mockResolvedValue(true);
  m.followUps.mockResolvedValue(undefined);
});

describe("when a page finishes its partition", () => {
  it("runs the follow-ups for the campaign's tag once the campaign is complete", async () => {
    m.campaignFindUnique.mockResolvedValue(campaignRow({ targetTagId: TAG }));

    await expect(runCampaignPartitionPage(input)).resolves.toMatchObject({ status: "completed", acceptedCount: 1 });

    expect(m.complete).toHaveBeenCalledWith(CAMPAIGN);
    expect(m.followUps).toHaveBeenCalledTimes(1);
    expect(m.followUps).toHaveBeenCalledWith({ campaignId: CAMPAIGN }, TAG);
  });

  it("runs no follow-ups for a campaign that is not tied to a tag", async () => {
    await runCampaignPartitionPage(input);
    expect(m.complete).toHaveBeenCalledWith(CAMPAIGN);
    expect(m.followUps).not.toHaveBeenCalled();
  });

  it("runs no follow-ups while other partitions are still open", async () => {
    m.campaignFindUnique.mockResolvedValue(campaignRow({ targetTagId: TAG }));
    m.complete.mockResolvedValue(false);

    await runCampaignPartitionPage(input);

    expect(m.complete).toHaveBeenCalledTimes(1);
    expect(m.followUps).not.toHaveBeenCalled();
  });

  it("does not even check for completion while the partition has more pages", async () => {
    m.campaignFindUnique.mockResolvedValue(campaignRow({ targetTagId: TAG }));
    m.fetchPage.mockResolvedValue({ results: [{ id: "W1" }], nextCursor: "next" });
    m.partitionFindUniqueOrThrow.mockResolvedValue({ acceptedCount: 1, targetCount: 10 });

    await expect(runCampaignPartitionPage(input)).resolves.toMatchObject({ status: "continued" });

    expect(m.complete).not.toHaveBeenCalled();
    expect(m.followUps).not.toHaveBeenCalled();
  });
});

describe("when no partition is left to claim", () => {
  beforeEach(() => m.claim.mockResolvedValue(null));

  it("reconciles progress, completes the campaign and runs the tag's follow-ups", async () => {
    m.campaignFindUnique.mockResolvedValue(campaignRow({ targetTagId: TAG }));

    await expect(runCampaignPartitionPage(input)).resolves.toEqual({ status: "no-partition" });

    expect(m.reconcile).toHaveBeenCalledWith(CAMPAIGN);
    expect(m.complete).toHaveBeenCalledWith(CAMPAIGN);
    expect(m.followUps).toHaveBeenCalledWith({ campaignId: CAMPAIGN }, TAG);
    expect(m.fetchPage).not.toHaveBeenCalled();
  });

  it("runs no follow-ups without a tag", async () => {
    await runCampaignPartitionPage(input);
    expect(m.complete).toHaveBeenCalledTimes(1);
    expect(m.followUps).not.toHaveBeenCalled();
  });

  it("runs no follow-ups when the campaign is not complete", async () => {
    m.campaignFindUnique.mockResolvedValue(campaignRow({ targetTagId: TAG }));
    m.complete.mockResolvedValue(false);
    await runCampaignPartitionPage(input);
    expect(m.followUps).not.toHaveBeenCalled();
  });
});

describe("campaigns that are not running", () => {
  it("does nothing for a paused campaign", async () => {
    m.campaignFindUnique.mockResolvedValue(campaignRow({ state: "paused", targetTagId: TAG }));
    await expect(runCampaignPartitionPage(input)).resolves.toEqual({ status: "not-running" });
    expect(m.claim).not.toHaveBeenCalled();
    expect(m.followUps).not.toHaveBeenCalled();
  });
});

describe("cohort membership policy version", () => {
  const policyOf = () => m.membershipCreateMany.mock.calls[0]![0].data[0].policyVersion;

  it("comes from the campaign manifest, so a tag campaign is not recorded as a domain one", async () => {
    m.campaignFindUnique.mockResolvedValue(campaignRow({ targetTagId: TAG, manifest: { policyVersion: "openalex-tag-sample-v1" } }));
    await runCampaignPartitionPage(input);
    expect(m.membershipCreateMany).toHaveBeenCalledTimes(1);
    expect(policyOf()).toBe("openalex-tag-sample-v1");
  });

  it("falls back to the domain policy for a manifest that names none", async () => {
    await runCampaignPartitionPage(input);
    expect(policyOf()).toBe("openalex-domain-proportional-v1");
  });

  it("links each ingested paper to the partition's cohort and stratum", async () => {
    await runCampaignPartitionPage(input);
    expect(m.membershipCreateMany.mock.calls[0]![0].data).toEqual([
      expect.objectContaining({
        paperId: "paper-1", cohortId: `tag:${TAG}`, campaignId: CAMPAIGN, stratumKey: `tag:${TAG}:q1`,
        selectionMethod: "seeded-sample", reason: "campaign",
      }),
    ]);
  });
});
