import { classifyScreeningPair, automaticFullTextStage } from "../screening.calculator.js";
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { balancedReviewers, cohenKappa, screeningConsensus } from "../screening.calculator.js";
import { screeningAssignSchema, screeningConfigSchema, screeningSubmitSchema, screeningActionSchema, screeningResolveSchema } from "../dto/screening.schema.js";
import type { ScreeningChoice } from "@trend/shared-types";
describe("screening consensus and agreement", () => {
  it("completes current screening in one round while retaining old explicit stage protocols", () => {
    const settings = { reviewMode: "INDEPENDENT" as const, stages: ["TITLE_ABSTRACT", "FULL_TEXT"] as const };
    for (const workflowVersion of [5, 6, 7, 8, 9, 10]) expect(automaticFullTextStage({ ...settings, stages: [...settings.stages], workflowVersion })).toBe(false);
    expect(automaticFullTextStage({ ...settings, stages: [...settings.stages], workflowVersion: 3 })).toBe(true);
  });
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
    // Proposer-aware eligibility tests
    expect(balancedReviewers(["a", "b", "c"], [], 2, new Map(), "a")).toEqual(["b", "c"]);
    expect(balancedReviewers(["a", "b"], [], 2, new Map(), "a")).toEqual(["b", "a"]);
    expect(balancedReviewers(["a"], [], 1, new Map(), "a")).toEqual(["a"]);
  });
});
describe("screening request boundaries", () => {
  const valid = { assignmentId: randomUUID(), expectedRevision: 1, decision: "EXCLUDE", exclusionReason: "Wrong population", comment: "", confirmed: true, clientKey: randomUUID() };
  it("requires explicit confirmation, a reason, and rejects actor forgery", () => {
    expect(screeningSubmitSchema.safeParse(valid).success).toBe(true);
    for (const altered of [{ ...valid, exclusionReason: " " }, { ...valid, confirmed: false }, { ...valid, reviewerId: randomUUID() }, { ...valid, expectedRevision: 0 }]) expect(screeningSubmitSchema.safeParse(altered).success).toBe(false);
    expect(screeningActionSchema.safeParse({ expectedVersion: 1, reason: "short", confirmed: true, clientKey: randomUUID() }).success).toBe(false);
  });
  it.each(["INCLUDE", "EXCLUDE", "UNSURE"] as const)("requires a nonblank rationale for %s, including edited submissions", decision => {
    const field = decision === "EXCLUDE" ? "exclusionReason" : "comment";
    const input = { ...valid, decision, expectedRevision: 2, exclusionReason: "", comment: "" };
    for (const value of [undefined, "", "   ", " a "]) {
      const result = screeningSubmitSchema.safeParse({ ...input, [field]: value });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues.some(issue => issue.path[0] === field)).toBe(true);
    }
    const parsed = screeningSubmitSchema.parse({ ...input, [field]: "  Có căn cứ từ tiêu chí nghiên cứu  " });
    expect(parsed[field]).toBe("Có căn cứ từ tiêu chí nghiên cứu");
    const wrongField = field === "comment" ? "exclusionReason" : "comment";
    expect(screeningSubmitSchema.safeParse({ ...input, [wrongField]: "A rationale in the wrong field" }).success).toBe(false);
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


describe("precise current-stage review pairs", () => {
  const pair = (a: string, b: string, reasons = ["Population", "Population"]) => [a,b].map((decision, i) => ({ reviewerId: String(i), roundId: "same-round", decision, exclusionReason: reasons[i]! }));
  it.each([
    ["INCLUDE", "INCLUDE", "AGREEMENT_INCLUDE"], ["EXCLUDE", "EXCLUDE", "AGREEMENT_EXCLUDE"],
    ["INCLUDE", "EXCLUDE", "CONFLICT"], ["EXCLUDE", "INCLUDE", "CONFLICT"],
    ["INCLUDE", "UNSURE", "NEEDS_CLARIFICATION"], ["UNSURE", "INCLUDE", "NEEDS_CLARIFICATION"],
    ["EXCLUDE", "UNSURE", "NEEDS_CLARIFICATION"], ["UNSURE", "EXCLUDE", "NEEDS_CLARIFICATION"],
    ["UNSURE", "UNSURE", "NEEDS_MORE_INFORMATION"],
  ])("%s and %s classify as %s", (a,b,result) => expect(classifyScreeningPair(pair(a,b), "TITLE_ABSTRACT")).toBe(result));
  it("only reconciles required full-text primary reasons, ignoring title notes and normalized whitespace", () => {
    const reviews = pair("EXCLUDE", "EXCLUDE", ["Population", "Method"]);
    expect(classifyScreeningPair(reviews, "FULL_TEXT")).toBe("EXCLUSION_REASON_MISMATCH");
    expect(classifyScreeningPair(reviews, "FULL_TEXT", false)).toBe("AGREEMENT_EXCLUDE");
    expect(classifyScreeningPair(reviews, "TITLE_ABSTRACT")).toBe("AGREEMENT_EXCLUDE");
    expect(classifyScreeningPair(pair("EXCLUDE", "EXCLUDE", [" Population ", "population"]), "FULL_TEXT")).toBe("AGREEMENT_EXCLUDE");
  });
  it("rejects incomplete, duplicate, draft and cross-round pairs", () => {
    const reviews = pair("INCLUDE", "EXCLUDE");
    expect(classifyScreeningPair(reviews.slice(0,1), "FULL_TEXT")).toBeNull();
    expect(classifyScreeningPair([reviews[0]!, { ...reviews[1]!, reviewerId: "0" }], "FULL_TEXT")).toBeNull();
    expect(classifyScreeningPair([reviews[0]!, { ...reviews[1]!, roundId: "other-stage" }], "FULL_TEXT")).toBeNull();
    expect(classifyScreeningPair(pair("DRAFT", "EXCLUDE"), "FULL_TEXT")).toBeNull();
  });
});
