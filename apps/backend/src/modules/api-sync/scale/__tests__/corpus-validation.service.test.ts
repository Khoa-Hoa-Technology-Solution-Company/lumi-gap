import type { CorpusValidationMetrics } from "@trend/shared-types";
import mongoose from "mongoose";
import { describe, expect, it, vi } from "vitest";

import {
  buildCorpusValidationIdempotencyKey,
  createCorpusValidationService,
  evaluateCorpusValidation,
  type CorpusValidationRepository,
} from "../corpus-validation.service.js";

function metrics(overrides: Partial<CorpusValidationMetrics> = {}): CorpusValidationMetrics {
  const base: CorpusValidationMetrics = {
    campaign: {
      state: "completed",
      targetUniqueWorks: 100,
      baselineTarget: 80,
      priorityTarget: 20,
      storedCommittedPages: 1,
      ledgerCommittedPages: 1,
      snapshotStartedCommittedPages: 1,
      snapshotEndedCommittedPages: 1,
      snapshotChangedDuringScan: false,
      acceptedWorks: 100,
      uniqueWorks: 100,
      rejectedWorks: 0,
      conflictWorks: 0,
    },
    papers: {
      campaignMemberships: 100,
      canonicalPapers: 100,
      orphanMemberships: 0,
      activePapers: 100,
      withAbstract: 100,
      withFullTaxonomy: 100,
      withSourceProvenance: 100,
      withQualityCheck: 100,
      qualityEligible: 70,
      withOpenAlexIdentity: 100,
      duplicateOpenAlexIdGroups: 0,
      duplicateSourceRecordGroups: 0,
    },
    sampling: {
      completedStrata: 2,
      completedTargetWorks: 100,
      completedDistinctMemberships: 100,
      completedFillPct: 100,
      totalVariationDistancePct: 0,
    },
    cohorts: [
      { cohortId: "baseline", reason: "analytics_baseline", uniquePapers: 80 },
      { cohortId: "priority", reason: "cs_ai_priority", uniquePapers: 20 },
    ],
    deadLetters: [],
  };
  return {
    ...base,
    ...overrides,
    campaign: { ...base.campaign, ...overrides.campaign },
    papers: { ...base.papers, ...overrides.papers },
    sampling: { ...base.sampling, ...overrides.sampling },
  };
}

describe("evaluateCorpusValidation", () => {
  it("passes a stable terminal corpus with complete provenance and planned sampling", () => {
    const result = evaluateCorpusValidation(metrics());

    expect(result.overallStatus).toBe("pass");
    expect(result.decision).toBe("final_pass");
    expect(result.checks.every((check) => !["fail", "warning"].includes(check.status))).toBe(true);
  });

  it("keeps a clean running campaign in progress instead of claiming a final pass", () => {
    const result = evaluateCorpusValidation(metrics({ campaign: { state: "running" } as CorpusValidationMetrics["campaign"] }));

    expect(result.overallStatus).toBe("in_progress");
    expect(result.decision).toBe("pass_to_continue");
    expect(result.checks.find((check) => check.key === "cohort_allocation")?.status).toBe("pending");
  });

  it("fails release invariants for orphan memberships and duplicate OpenAlex identities", () => {
    const result = evaluateCorpusValidation(metrics({
      papers: {
        orphanMemberships: 1,
        canonicalPapers: 99,
        duplicateOpenAlexIdGroups: 1,
      } as CorpusValidationMetrics["papers"],
    }));

    expect(result.overallStatus).toBe("fail");
    expect(result.decision).toBe("final_fail");
    expect(result.checks.filter((check) => check.status === "fail").map((check) => check.key)).toEqual(
      expect.arrayContaining(["canonical_papers", "orphan_memberships", "duplicate_openalex_ids"]),
    );
  });

  it("never reports a final pass when ingest advances during the scan", () => {
    const result = evaluateCorpusValidation(metrics({
      campaign: {
        snapshotChangedDuringScan: true,
        snapshotEndedCommittedPages: 2,
      } as CorpusValidationMetrics["campaign"],
    }));

    expect(result.overallStatus).toBe("fail");
    expect(result.decision).toBe("final_fail");
    expect(result.checks.find((check) => check.key === "snapshot_stability")?.status).toBe("fail");
  });

  it("does not fail an empty campaign before its first page commits", () => {
    const result = evaluateCorpusValidation(metrics({
      campaign: { state: "running", acceptedWorks: 0, uniqueWorks: 0 } as CorpusValidationMetrics["campaign"],
      papers: { campaignMemberships: 0, canonicalPapers: 0 } as CorpusValidationMetrics["papers"],
    }));

    expect(result.overallStatus).toBe("in_progress");
    expect(result.decision).toBe("continue_with_warning");
    expect(result.checks).toHaveLength(1);
  });

  it("keeps AI eligibility informational rather than treating it as scientific merit", () => {
    const result = evaluateCorpusValidation(metrics({
      papers: { qualityEligible: 1 } as CorpusValidationMetrics["papers"],
    }));

    expect(result.overallStatus).toBe("pass");
    expect(result.checks.find((check) => check.key === "quality_eligible")?.status).toBe("info");
  });

  it("never passes a failed campaign even when persisted paper checks are clean", () => {
    const result = evaluateCorpusValidation(metrics({
      campaign: { state: "failed" } as CorpusValidationMetrics["campaign"],
    }));

    expect(result.overallStatus).toBe("fail");
    expect(result.decision).toBe("final_fail");
    expect(result.checks.find((check) => check.key === "campaign_outcome")?.status).toBe("fail");
  });

  it("uses the campaign manifest allocation instead of a hard-coded 80/20 split", () => {
    const result = evaluateCorpusValidation(metrics({
      campaign: { baselineTarget: 90, priorityTarget: 10 } as CorpusValidationMetrics["campaign"],
      cohorts: [
        { cohortId: "baseline", reason: "analytics_baseline", uniquePapers: 90 },
        { cohortId: "priority", reason: "cs_ai_priority", uniquePapers: 10 },
      ],
    }));

    expect(result.checks.find((check) => check.key === "cohort_allocation")?.status).toBe("pass");
  });
});

describe("buildCorpusValidationIdempotencyKey", () => {
  it("reuses the stable campaign watermark key by default", () => {
    expect(buildCorpusValidationIdempotencyKey("campaign", 42, false, "ignored")).toBe(
      "campaign:corpus-validation-v1:42",
    );
  });

  it("adds an explicit nonce when remediation forces a fresh scan", () => {
    expect(buildCorpusValidationIdempotencyKey("campaign", 42, true, "retry-1")).toBe(
      "campaign:corpus-validation-v1:42:forced:retry-1",
    );
  });
});

describe("corpus validation lifecycle", () => {
  it("forwards force and returns the persisted state when a snapshot is reused", async () => {
    const campaignId = new mongoose.Types.ObjectId();
    const runId = new mongoose.Types.ObjectId();
    const repository = fakeRepository({
      createOrReuseRun: vi.fn(async () => ({ _id: runId, created: false, state: "completed" })),
    });
    const service = createCorpusValidationService(repository);

    await expect(service.createRun(campaignId.toString(), { force: true })).resolves.toEqual({
      runId: runId.toString(),
      created: false,
      state: "completed",
    });
    expect(repository.createOrReuseRun).toHaveBeenCalledWith(campaignId, 7, true);
  });

  it("rejects a second worker when the run cannot transition to running", async () => {
    const campaignId = new mongoose.Types.ObjectId();
    const runId = new mongoose.Types.ObjectId();
    const repository = fakeRepository({
      getRun: vi.fn(async () => ({ _id: runId, campaignId, state: "running" })),
      markRunning: vi.fn(async () => false),
    });
    const service = createCorpusValidationService(repository);

    await expect(service.execute(runId.toString())).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
    expect(repository.collectSnapshot).not.toHaveBeenCalled();
  });
});

function fakeRepository(overrides: Partial<CorpusValidationRepository> = {}): CorpusValidationRepository {
  const runId = new mongoose.Types.ObjectId();
  return {
    campaignExists: vi.fn(async () => true),
    getCommittedPages: vi.fn(async () => 7),
    createOrReuseRun: vi.fn(async () => ({ _id: runId, created: true, state: "queued" })),
    getRun: vi.fn(async () => null),
    getLatestRun: vi.fn(async () => null),
    markRunning: vi.fn(async () => true),
    saveCompleted: vi.fn(async () => true),
    saveFailed: vi.fn(async () => undefined),
    collectSnapshot: vi.fn(async () => metrics()),
    ...overrides,
  };
}
