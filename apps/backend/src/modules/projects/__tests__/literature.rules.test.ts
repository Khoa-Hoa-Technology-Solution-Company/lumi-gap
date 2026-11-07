import { describe, expect, it } from "vitest";
import type { FeasibilityScores } from "@trend/shared-types";
import {
  assertFeasibilityNotes,
  assertFeasibleForSupport,
  distinctPaperCount,
  feasibilityMean,
  feasibilityVerdict,
  gapTypeForLimitation,
  sanitizeCriteriaValues,
  storedCriteriaValues,
  summarizeFeasibility,
} from "../literature.rules.js";

const scores = (value: number, overrides: Partial<FeasibilityScores> = {}): FeasibilityScores =>
  ({ dataAvailability: value, expertise: value, resources: value, timeline: value, risk: value, ...overrides });

describe("feasibility verdict", () => {
  it("is FEASIBLE from a mean of 3.5 without blockers", () => {
    expect(feasibilityVerdict(scores(4))).toBe("FEASIBLE");
    expect(feasibilityVerdict(scores(3, { dataAvailability: 5, expertise: 5, resources: 4 }))).toBe("FEASIBLE"); // mean 4
    expect(feasibilityMean(scores(3, { dataAvailability: 4, expertise: 4, resources: 4 }))).toBe(3.6);
  });
  it("is CONDITIONAL between 2.5 and 3.5", () => {
    expect(feasibilityVerdict(scores(3))).toBe("CONDITIONAL");
    expect(feasibilityVerdict(scores(3, { risk: 2, timeline: 2 }))).toBe("CONDITIONAL"); // mean 2.6
  });
  it("is NOT_FEASIBLE below 2.5 or with any score of 1, whatever the mean", () => {
    expect(feasibilityVerdict(scores(2))).toBe("NOT_FEASIBLE");
    expect(feasibilityVerdict(scores(5, { dataAvailability: 1 }))).toBe("NOT_FEASIBLE"); // mean 4.2 but no data
  });
});

describe("team feasibility summary", () => {
  it("is empty without assessments and blocks team support", () => {
    const summary = summarizeFeasibility([]);
    expect(summary).toEqual({ count: 0, means: null, mean: null, verdict: null, blockers: [] });
    expect(() => assertFeasibleForSupport(summary)).toThrow(/feasibility assessment/);
  });
  it("averages each dimension and keeps one assessor's blocker", () => {
    const summary = summarizeFeasibility([scores(5), scores(4, { resources: 1 })]);
    expect(summary.count).toBe(2);
    expect(summary.means).toEqual({ dataAvailability: 4.5, expertise: 4.5, resources: 3, timeline: 4.5, risk: 4.5 });
    expect(summary.blockers).toEqual(["resources"]);
    expect(summary.verdict).toBe("NOT_FEASIBLE");
    expect(() => assertFeasibleForSupport(summary)).toThrow(/not feasible/);
  });
  it("allows team support when the team verdict is conditional or better", () => {
    expect(() => assertFeasibleForSupport(summarizeFeasibility([scores(3), scores(4)]))).not.toThrow();
  });
});

describe("feasibility notes", () => {
  it("requires an explanation for any score of 1 or 2", () => {
    expect(() => assertFeasibilityNotes(scores(4, { timeline: 2 }), "  ")).toThrow(/Explain/);
    expect(() => assertFeasibilityNotes(scores(4, { timeline: 2 }), "Six-month project window")).not.toThrow();
    expect(() => assertFeasibilityNotes(scores(3), "")).not.toThrow();
  });
});

describe("matrix criteria values", () => {
  const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
  it("trims values and drops empty ones", () => {
    expect(sanitizeCriteriaValues({ [a]: "  CNN + CTC ", [b]: "   " }, new Set([a, b]))).toEqual({ [a]: "CNN + CTC" });
    expect(sanitizeCriteriaValues(undefined, new Set([a]))).toEqual({});
  });
  it("rejects a column that is not active instead of dropping it silently", () => {
    expect(() => sanitizeCriteriaValues({ [b]: "x" }, new Set([a]))).toThrow(/Reload the matrix/);
  });
  it("rejects values above the size limit", () => {
    expect(() => sanitizeCriteriaValues({ [a]: "x".repeat(2001) }, new Set([a]))).toThrow(/longer than/);
  });
  it("reads stored JSON defensively", () => {
    expect(storedCriteriaValues(null)).toEqual({});
    expect(storedCriteriaValues([1, 2])).toEqual({});
    expect(storedCriteriaValues({ [a]: "ok", [b]: 3 })).toEqual({ [a]: "ok" });
  });
});

describe("limitations", () => {
  it("counts distinct papers, not extractions", () => {
    expect(distinctPaperCount([{ paperId: "p1" }, { paperId: "p1" }, { paperId: "p2" }])).toBe(2);
  });
  it("maps every category to an accepted gap type", () => {
    expect(gapTypeForLimitation("METHOD")).toBe("METHODOLOGICAL_GAP");
    expect(gapTypeForLimitation("DATA")).toBe("EMPIRICAL_VALIDATION_GAP");
    expect(gapTypeForLimitation("OTHER")).toBe("OTHER");
  });
});
