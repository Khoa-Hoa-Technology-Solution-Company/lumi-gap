import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  providerExists: vi.fn(),
  preflight: vi.fn(),
  groupCounts: vi.fn(),
  createPlanned: vi.fn(),
}));

vi.mock("../../models/api-provider.model.js", () => ({
  ApiProviderModel: { exists: mocks.providerExists },
}));
vi.mock("../../providers/openalex.client.js", () => ({
  fetchOpenAlexGroupCounts: mocks.groupCounts,
}));
vi.mock("../openalex-preflight.service.js", () => ({
  openAlexPreflightService: { run: mocks.preflight },
}));
vi.mock("../ingest-campaign.service.js", () => ({
  ingestCampaignService: { createPlanned: mocks.createPlanned },
}));

import { openAlexCampaignPlannerService } from "../openalex-campaign-planner.service.js";

describe("openAlexCampaignPlannerService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.providerExists.mockResolvedValue({ _id: "provider" });
    mocks.preflight.mockResolvedValue({
      snapshotFingerprint: "provider-snapshot",
      population: {
        total: 1_000_000,
        domains: [
          { openAlexId: "https://openalex.org/domains/1", name: "Physical Sciences", count: 600_000 },
          { openAlexId: "https://openalex.org/domains/4", name: "Health Sciences", count: 400_000 },
        ],
      },
    });
    mocks.groupCounts.mockImplementation(async ({ filterExpression }: { filterExpression?: string }) => {
      if (filterExpression?.includes("primary_topic.subfield.id:1702")) {
        return { total: 40_000, groups: [{ key: "2024", count: 40_000 }] };
      }
      if (filterExpression?.includes("primary_topic.field.id:17")) {
        return { total: 60_000, groups: [{ key: "2024", count: 60_000 }] };
      }
      if (filterExpression?.includes("domains/1")) {
        return { total: 600_000, groups: [{ key: "2024", count: 600_000 }] };
      }
      return { total: 400_000, groups: [{ key: "2024", count: 400_000 }] };
    });
    mocks.createPlanned.mockImplementation(async (input) => ({
      _id: { toString: () => "campaign-id" },
      campaignKey: input.campaignKey,
      state: "planned",
      targetUniqueWorks: input.targetUniqueWorks,
      progress: { plannedPartitions: input.partitions.length },
    }));
  });

  it("persists deterministic multi-domain baseline and separate priority cohorts", async () => {
    await openAlexCampaignPlannerService.planBackfill({
      campaignKey: "canary-1000",
      targetUniqueWorks: 1_000,
      priorityRatio: 0.2,
    });

    expect(mocks.createPlanned).toHaveBeenCalledTimes(1);
    const payload = mocks.createPlanned.mock.calls[0][0];
    expect(payload.campaignKind).toBe("backfill");
    expect(payload.partitions.reduce((sum: number, partition: { targetCount: number }) => sum + partition.targetCount, 0)).toBe(1_000);
    expect(payload.partitions.some((partition: { cohortId: string }) => partition.cohortId === "analytics-baseline")).toBe(true);
    expect(payload.partitions.some((partition: { cohortId: string }) => partition.cohortId === "retrieval-priority")).toBe(true);
    expect(payload.partitions.every((partition: { selectionMethod: string; targetCount: number; seed: number }) =>
      partition.selectionMethod === "seeded-sample" && partition.targetCount <= 100 && partition.seed > 0,
    )).toBe(true);
  });
});
