import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { balancedReviewers, cohenKappa, screeningConsensus } from "../screening.calculator.js";
import { screeningAssignSchema, screeningConfigSchema, screeningSubmitSchema, screeningActionSchema, screeningResolveSchema } from "../dto/screening.schema.js";
import type { ScreeningChoice } from "@trend/shared-types";
describe("screening consensus and agreement", () => {
  it.each<[ScreeningChoice, ScreeningChoice, string]>([
    ["INCLUDE", "INCLUDE", "INCLUDED"], ["EXCLUDE", "EXCLUDE", "EXCLUDED"], ["INCLUDE", "EXCLUDE", "NEEDS_RESOLUTION"],
    ["EXCLUDE", "INCLUDE", "NEEDS_RESOLUTION"], ["INCLUDE", "UNSURE", "NEEDS_RESOLUTION"], ["UNSURE", "INCLUDE", "NEEDS_RESOLUTION"],
    ["EXCLUDE", "UNSURE", "NEEDS_RESOLUTION"], ["UNSURE", "EXCLUDE", "NEEDS_RESOLUTION"], ["UNSURE", "UNSURE", "NEEDS_RESOLUTION"],
  ])("%s + %s yields %s", (a, b, result) => expect(screeningConsensus([a, b], 2, 2, "UNANIMOUS")).toBe(result));
  it("waits for all assigned people, including extra reviewers", () => {
    expect(screeningConsensus([], 2, 2, "UNANIMOUS")).toBe("NOT_REVIEWED");
    expect(screeningConsensus(["INCLUDE"], 2, 2, "UNANIMOUS")).toBe("IN_REVIEW");
    expect(screeningConsensus(["INCLUDE", "INCLUDE"], 3, 2, "STRICT_MAJORITY")).toBe("IN_REVIEW");
    expect(screeningConsensus(["INCLUDE"], 1, 2, "UNANIMOUS")).toBe("IN_REVIEW");
  });
  it("uses an explicit strict-majority policy only after completion", () => {
    expect(screeningConsensus(["INCLUDE", "INCLUDE", "UNSURE"], 3, 3, "UNANIMOUS")).toBe("NEEDS_RESOLUTION");
    expect(screeningConsensus(["INCLUDE", "INCLUDE", "UNSURE"], 3, 3, "STRICT_MAJORITY")).toBe("INCLUDED");
    expect(screeningConsensus(["EXCLUDE", "EXCLUDE", "INCLUDE"], 3, 3, "STRICT_MAJORITY")).toBe("EXCLUDED");
    expect(screeningConsensus(["INCLUDE", "INCLUDE", "EXCLUDE", "EXCLUDE"], 4, 4, "STRICT_MAJORITY")).toBe("NEEDS_RESOLUTION");
  });
  it("calculates chance correction using stable reviewer identities", () => {
    const pairs = [
      { reviewers: ["a", "b"], decisions: ["INCLUDE", "INCLUDE"] as ScreeningChoice[] },
      { reviewers: ["b", "a"], decisions: ["EXCLUDE", "EXCLUDE"] as ScreeningChoice[] },
      { reviewers: ["a", "b"], decisions: ["INCLUDE", "EXCLUDE"] as ScreeningChoice[] },
      { reviewers: ["a", "b"], decisions: ["EXCLUDE", "INCLUDE"] as ScreeningChoice[] },
    ];
    expect(cohenKappa(pairs)).toMatchObject({ value: 0, reason: "OK", papers: 4, reviewerIds: ["a", "b"] });
    expect(cohenKappa([{ reviewers: ["a", "b"], decisions: ["INCLUDE", "EXCLUDE"] }, { reviewers: ["a", "b"], decisions: ["EXCLUDE", "INCLUDE"] }]).value).toBe(-1);
    expect(cohenKappa([{ reviewers: ["a", "b"], decisions: ["UNSURE", "UNSURE"] }, { reviewers: ["a", "b"], decisions: ["INCLUDE", "INCLUDE"] }]).value).toBe(1);
  });
  it("does not report a value for missing, degenerate, mixed or multi-rater data", () => {
    expect(cohenKappa([]).reason).toBe("NO_PAIRS");
    expect(cohenKappa([{ reviewers: ["a", "b"], decisions: ["INCLUDE", "INCLUDE"] }])).toMatchObject({ value: null, reason: "DEGENERATE" });
    expect(cohenKappa([{ reviewers: ["a", "b"], decisions: ["INCLUDE", "EXCLUDE"] }, { reviewers: ["a", "c"], decisions: ["EXCLUDE", "EXCLUDE"] }]).reason).toBe("INCONSISTENT_PAIRS");
    expect(cohenKappa([{ reviewers: ["a", "b", "c"], decisions: ["INCLUDE", "INCLUDE", "INCLUDE"] }]).reason).toBe("MULTI_RATER");
  });
  it("balances bulk work deterministically while preserving existing reviewers", () => {
    const loads = new Map<string, { pending: number; total: number }>();
    for (let i = 0; i < 12; i++) expect(new Set(balancedReviewers(["c", "a", "b"], [], 2, loads)).size).toBe(2);
    expect([...loads.values()].map(l => l.pending)).toEqual([8, 8, 8]);
    expect(balancedReviewers(["a", "b"], ["retained-submitted"], 2, new Map())).toEqual(["retained-submitted", "a"]);
    expect(balancedReviewers(["only"], [], 2, new Map())).toEqual(["only"]);
  });
});
describe("screening request boundaries", () => {
  const valid = { assignmentId: randomUUID(), expectedRevision: 1, decision: "EXCLUDE", exclusionReason: "Wrong population", comment: "", confirmed: true, clientKey: randomUUID() };
  it("requires explicit confirmation, a reason, and rejects actor forgery", () => {
    expect(screeningSubmitSchema.safeParse(valid).success).toBe(true);
    for (const altered of [{ ...valid, exclusionReason: " " }, { ...valid, confirmed: false }, { ...valid, reviewerId: randomUUID() }, { ...valid, expectedRevision: 0 }]) expect(screeningSubmitSchema.safeParse(altered).success).toBe(false);
    expect(screeningActionSchema.safeParse({ expectedVersion: 1, reason: "short", confirmed: true, clientKey: randomUUID() }).success).toBe(false);
  });
  it("rejects duplicate assignment ids and unsupported policies/counts", () => {
    const id = randomUUID();
    expect(screeningAssignSchema.safeParse({ roundIds: [id], mode: "MANUAL", reviewerIds: [id, id], clientKey: randomUUID() }).success).toBe(false);
    const config = { expectedVersion: 0, requiredReviewers: 2, consensusPolicy: "UNANIMOUS", aiAssisted: false, inclusionCriteria: [], exclusionCriteria: [], researchQuestions: [], clientKey: randomUUID() };
    expect(screeningConfigSchema.safeParse(config).success).toBe(true);
    expect(screeningConfigSchema.safeParse({ ...config, requiredReviewers: 1 }).success).toBe(false);
    expect(screeningConfigSchema.safeParse({ ...config, reviewMode: "SIMPLE", requiredReviewers: 1 }).success).toBe(true);
    expect(screeningConfigSchema.safeParse({ ...config, reviewMode: "SIMPLE", requiredReviewers: 2 }).success).toBe(false);
    expect(screeningConfigSchema.safeParse({ ...config, resolutionPolicy: "PROFILE_SCORE" }).success).toBe(false);
    expect(screeningConfigSchema.safeParse({ ...config, consensusPolicy: "AUTO" }).success).toBe(false);
    expect(screeningConfigSchema.safeParse({ ...config, stages: [] }).success).toBe(true);
    expect(screeningConfigSchema.safeParse({ ...config, stages: ["FULL_TEXT", "FULL_TEXT"] }).success).toBe(false);
    expect(screeningResolveSchema.safeParse({ decision: "BACKGROUND", expectedVersion: 1, reason: "Useful background for the research context", confirmed: true, clientKey: randomUUID() }).success).toBe(true);
    expect(screeningResolveSchema.safeParse({ decision: "EXCLUDED", expectedVersion: 1, reason: " ", confirmed: true, clientKey: randomUUID() }).success).toBe(false);
  });
});
