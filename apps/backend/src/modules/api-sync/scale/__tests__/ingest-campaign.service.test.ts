import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  campaignCreate: vi.fn(),
  campaignDeleteOne: vi.fn(),
  campaignFindById: vi.fn(),
  campaignUpdateOne: vi.fn(),
  attemptAggregate: vi.fn(),
  attemptCountDocuments: vi.fn(),
  attemptFindOneAndUpdate: vi.fn(),
  partitionCountDocuments: vi.fn(),
  partitionDeleteMany: vi.fn(),
  partitionInsertMany: vi.fn(),
  membershipAggregate: vi.fn(),
}));

vi.mock("../../models/openalex-ingest-campaign.model.js", () => ({
  OpenAlexIngestCampaignModel: {
    create: mocks.campaignCreate,
    deleteOne: mocks.campaignDeleteOne,
    findById: mocks.campaignFindById,
    updateOne: mocks.campaignUpdateOne,
  },
}));
vi.mock("../../models/openalex-ingest-page-attempt.model.js", () => ({
  OpenAlexIngestPageAttemptModel: {
    aggregate: mocks.attemptAggregate,
    countDocuments: mocks.attemptCountDocuments,
    findOneAndUpdate: mocks.attemptFindOneAndUpdate,
  },
}));
vi.mock("../../models/openalex-ingest-partition.model.js", () => ({
  OpenAlexIngestPartitionModel: {
    countDocuments: mocks.partitionCountDocuments,
    deleteMany: mocks.partitionDeleteMany,
    insertMany: mocks.partitionInsertMany,
  },
}));
vi.mock("../../models/paper-cohort-membership.model.js", () => ({
  PaperCohortMembershipModel: { aggregate: mocks.membershipAggregate },
}));

import { ingestCampaignService } from "../ingest-campaign.service.js";

const CAMPAIGN_ID = "64b64c7a2f4f6c0012345678";
const PARTITION_ID = "64b64c7a2f4f6c0012345679";

describe("ingestCampaignService hardening", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reopens a failed idempotent attempt instead of returning it as failed", async () => {
    const reopened = { _id: "attempt", state: "started" };
    mocks.attemptFindOneAndUpdate.mockResolvedValueOnce(reopened);

    const result = await ingestCampaignService.beginAttempt({
      campaignId: CAMPAIGN_ID,
      partitionId: PARTITION_ID,
      cursorBefore: "*",
      requestFingerprint: "fingerprint",
    });

    expect(result).toBe(reopened);
    expect(mocks.attemptFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.attemptFindOneAndUpdate.mock.calls[0]?.[0]).toMatchObject({ state: "failed" });
    expect(mocks.attemptFindOneAndUpdate.mock.calls[0]?.[1]).toMatchObject({
      $set: { state: "started" },
      $unset: { errorMessage: 1 },
    });
  });

  it("removes inserted partitions when planned campaign creation fails", async () => {
    mocks.campaignCreate.mockResolvedValue({ _id: CAMPAIGN_ID });
    mocks.partitionInsertMany.mockRejectedValue(new Error("partition insert failed"));
    mocks.partitionDeleteMany.mockResolvedValue({ deletedCount: 2 });
    mocks.campaignDeleteOne.mockResolvedValue({ deletedCount: 1 });

    await expect(
      ingestCampaignService.createPlanned({
        campaignKey: "cleanup-test",
        campaignKind: "backfill",
        targetUniqueWorks: 1,
        manifest: {
          planningAsOf: new Date(),
          policyVersion: "test",
          providerContractVersion: "test",
          eligibilityFilter: "has_abstract:true",
          baselineTarget: 1,
          priorityTarget: 0,
          sourceCounts: {},
          requestFingerprints: [],
        },
        partitions: [{
          partitionKey: "partition-1",
          cohortId: "analytics-baseline",
          stratumKey: "domain:1",
          filterExpression: "has_abstract:true",
          plannedPopulation: 1,
          targetCount: 1,
          selectionMethod: "seeded-sample",
          seed: 1,
        }],
      }),
    ).rejects.toThrow("partition insert failed");

    expect(mocks.partitionDeleteMany).toHaveBeenCalledWith({ campaignId: CAMPAIGN_ID });
    expect(mocks.campaignDeleteOne).toHaveBeenCalledWith({ _id: CAMPAIGN_ID });
  });

  it("does not report success when unique works are below the campaign target", async () => {
    mocks.partitionCountDocuments
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(10);
    mocks.attemptAggregate.mockResolvedValue([{ accepted: 1_000, rejected: 0, conflicts: 0, pages: 10 }]);
    mocks.membershipAggregate.mockResolvedValue([{ count: 950 }]);
    mocks.campaignUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.campaignFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ targetUniqueWorks: 1_000, progress: { uniqueWorks: 950 } }),
      }),
    });

    await expect(ingestCampaignService.completeIfFinished(CAMPAIGN_ID)).resolves.toBe(true);

    expect(mocks.campaignUpdateOne).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: "running" }),
      expect.objectContaining({
        $set: expect.objectContaining({ state: "completed_with_shortfall" }),
      }),
    );
  });
});
