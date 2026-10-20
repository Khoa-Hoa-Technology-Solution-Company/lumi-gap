import { describe, it, expect } from "vitest";
import { buildGapsPrompt } from "../gaps.prompt.js";
import { computeGapEvidence, parentGrowth, poissonCdf, resolveProbeYears } from "../gap-evidence.js";

const T = { minParentPapers: 5, maxRatio: 0.5, alpha: 0.05 };
const input = (evidenceScopeSize: number, a: number, b: number, intersectionCount: number, probeCount?: number) =>
  ({ evidenceScopeSize, parentCounts: { a, b }, intersectionCount, probeCount });

describe("poissonCdf", () => {
  it("matches the closed form for small lambda", () => {
    expect(poissonCdf(0, 0.3)).toBeCloseTo(Math.exp(-0.3), 10);
    expect(poissonCdf(1, 6)).toBeCloseTo(7 * Math.exp(-6), 10);
  });

  it("stays stable for a large lambda", () => {
    expect(poissonCdf(1000, 1000)).toBeGreaterThan(0.5);
    expect(poissonCdf(1000, 1000)).toBeLessThan(0.53);
    expect(poissonCdf(200, 1000)).toBeLessThan(1e-100);
    expect(poissonCdf(5000, 1000)).toBeCloseTo(1, 8);
  });
});

describe("computeGapEvidence (under-explored ranking signal)", () => {
  describe("OpenAlex veto", () => {
    // Local worked example (1 paper where 6 are expected) is under-explored on its own.
    const local = input(20000, 400, 300, 1);
    const openAlex = (scopeSize: number | undefined, a: number, b: number, intersectionCount: number) =>
      ({ source: "openalex" as const, intersectionCount, parentCounts: { a, b }, scopeSize, fetchedAt: "2026-10-20T00:00:00.000Z" });

    it("overrules the corpus when OpenAlex finds the intersection well covered", () => {
      // E = 50000 * 40000 / 1e7 = 200, observed 180: R = 0.9.
      const e = computeGapEvidence({ ...local, globalEvidence: openAlex(10_000_000, 50_000, 40_000, 180) }, T);
      expect(e.vetoedByGlobal).toBe(true);
      expect(e.underExplored).toBe(false);
      expect(e.global).toMatchObject({ expected: 200, underExplored: false });
      expect(e.global!.ratio).toBeCloseTo(0.9, 10);
      expect(e.evidenceConfidence).toBeLessThan(0.5);
      // The local numbers are still reported as they are.
      expect(e.ratio).toBeCloseTo(1 / 6, 10);
    });

    it("keeps the signal when OpenAlex agrees", () => {
      const e = computeGapEvidence({ ...local, globalEvidence: openAlex(10_000_000, 50_000, 40_000, 20) }, T);
      expect(e.vetoedByGlobal).toBe(false);
      expect(e.underExplored).toBe(true);
      expect(e.global!.underExplored).toBe(true);
    });

    it("does not overrule when OpenAlex has too few papers per topic to judge", () => {
      const e = computeGapEvidence({ ...local, globalEvidence: openAlex(10_000_000, 3, 40_000, 3) }, T);
      expect(e.vetoedByGlobal).toBe(false);
      expect(e.underExplored).toBe(true);
    });

    it("keeps the local signal for rows saved before OpenAlex N was recorded, or without OpenAlex counts", () => {
      expect(computeGapEvidence({ ...local, globalEvidence: openAlex(undefined, 50_000, 40_000, 180) }, T)).toMatchObject({ underExplored: true, vetoedByGlobal: false });
      expect(computeGapEvidence({ ...local, globalEvidence: openAlex(undefined, 50_000, 40_000, 180) }, T).global).toBeUndefined();
      expect(computeGapEvidence({ ...local, globalEvidence: null }, T)).toMatchObject({ underExplored: true, vetoedByGlobal: false });
    });
  });

  it("worked example: 1 paper where 6 would be expected is under-explored", () => {
    const e = computeGapEvidence(input(20000, 400, 300, 1), T);
    expect(e.expected).toBeCloseTo(6, 10);
    expect(e.ratio).toBeCloseTo(1 / 6, 10);
    expect(e.pValue).toBeCloseTo(0.0174, 4);
    expect(e.underExplored).toBe(true);
    expect(e.lowSample).toBe(false);
    expect(e.evidenceConfidence).toBe(0.92);
  });

  it("false-alarm example: an empty intersection in a small corpus is what chance predicts", () => {
    const e = computeGapEvidence(input(1000, 20, 15, 0), T);
    expect(e.expected).toBeCloseTo(0.3, 10);
    expect(e.pValue).toBeCloseTo(0.7408, 4);
    expect(e.underExplored).toBe(false);
    expect(e.evidenceConfidence).toBe(0.25);
  });

  it("large-topic example: 200 papers where 1000 would be expected is under-explored", () => {
    const e = computeGapEvidence(input(20000, 5000, 4000, 200), T);
    expect(e.expected).toBeCloseTo(1000, 10);
    expect(e.ratio).toBeCloseTo(0.2, 10);
    expect(e.pValue).toBeLessThan(1e-100);
    expect(e.underExplored).toBe(true);
    expect(e.evidenceConfidence).toBe(0.9);
  });

  it("does not flag a common intersection", () => {
    const e = computeGapEvidence(input(5000, 1240, 1000, 800), T);
    expect(e.underExplored).toBe(false);
    expect(e.evidenceConfidence).toBeLessThan(0.3);
  });

  it("does not flag an intersection that is only mildly below expectation", () => {
    const e = computeGapEvidence(input(20000, 5000, 4000, 700), T);
    expect(e.underExplored).toBe(false);
    expect(e.evidenceConfidence).toBe(0.08);
  });

  it("is significant at k = 1 but not under Bonferroni correction at k = 5", () => {
    expect(computeGapEvidence(input(20000, 400, 300, 1, 1), T).underExplored).toBe(true);
    expect(computeGapEvidence(input(20000, 400, 300, 1, 5), T).underExplored).toBe(false);
  });

  it("does not use parent growth: the signal depends only on counts", () => {
    expect(Object.keys(computeGapEvidence(input(20000, 400, 300, 1), T))).not.toContain("confirmed");
  });

  it("gives no signal when a parent topic has no papers", () => {
    const e = computeGapEvidence(input(1000, 12, 0, 0), T);
    expect(e.underExplored).toBe(false);
    expect(e.lowSample).toBe(true);
    expect(e.evidenceConfidence).toBe(0);
  });

  it("gives no signal for an empty scope", () => {
    const e = computeGapEvidence(input(0, 12, 8, 0), T);
    expect(e.underExplored).toBe(false);
    expect(e.lowSample).toBe(true);
    expect(e.evidenceConfidence).toBe(0);
  });

  it("does not flag a probe when a parent topic has too few papers", () => {
    const e = computeGapEvidence(input(1000, 4, 600, 0), T);
    expect(e.lowSample).toBe(true);
    expect(e.underExplored).toBe(false);
    expect(e.evidenceConfidence).toBeLessThanOrEqual(0.25);
  });
});

describe("parentGrowth", () => {
  it("uses CAGR when the starting count is non-zero", () => {
    const growth = parentGrowth([10, 12, 15, 20].map((count, index) => ({ year: 2020 + index, count })), 10);
    expect(growth.cagrPct).toBeGreaterThan(10);
    expect(growth.growthRatePct).toBe(growth.cagrPct);
    expect(growth.rising).toBe(true);
  });

  it("falls back to slope when CAGR has a zero base", () => {
    const growth = parentGrowth([0, 0, 1, 2].map((count, index) => ({ year: 2020 + index, count })), 10);
    expect(growth.cagrPct).toBeNull();
    expect(growth.slope).toBeGreaterThan(0);
    expect(growth.rising).toBe(true);
  });
});

describe("buildGapsPrompt", () => {
  it("includes structured paper knowledge when available", () => {
    const prompt = buildGapsPrompt("LLM feedback gaps", [
      {
        id: "p1",
        title: "Structured gap evidence",
        publicationYear: 2025,
        abstractText: "raw abstract",
        aiAnalysis: {
          summary: "Studies LLM feedback adoption.",
          methods: "Survey",
          dataset: null,
          findings: ["Teachers used feedback inconsistently"],
          limitations: ["Only one institution"],
          contributions: ["Adoption framework"],
          futureWork: ["Evaluate longitudinal outcomes"],
          keyTerms: ["LLM feedback"],
        },
      } as any,
    ]);

    expect(prompt).toContain("AI-extracted notes");
    expect(prompt).toContain("Limitations: Only one institution");
    expect(prompt).toContain("Findings: Teachers used feedback inconsistently");
    expect(prompt).toContain("Future work: Evaluate longitudinal outcomes");
  });
});

describe("resolveProbeYears", () => {
  it("uses the user's window when the probe has none", () => {
    expect(resolveProbeYears({ yearFrom: 2020, yearTo: 2024 }, {})).toEqual({ yearFrom: 2020, yearTo: 2024, conflict: false });
  });

  it("uses the probe's window when the user chose none", () => {
    expect(resolveProbeYears({}, { yearFrom: 2018, yearTo: 2022 })).toEqual({ yearFrom: 2018, yearTo: 2022, conflict: false });
  });

  it("intersects both windows", () => {
    expect(resolveProbeYears({ yearFrom: 2020, yearTo: 2025 }, { yearFrom: 2022, yearTo: 2030 })).toEqual({ yearFrom: 2022, yearTo: 2025, conflict: false });
  });

  it("falls back to the user's window when the intersection is empty", () => {
    expect(resolveProbeYears({ yearFrom: 2023, yearTo: 2025 }, { yearFrom: 2010, yearTo: 2015 })).toEqual({ yearFrom: 2023, yearTo: 2025, conflict: true });
  });

  it("returns no window when neither side has one", () => {
    expect(resolveProbeYears({}, {})).toEqual({ yearFrom: undefined, yearTo: undefined, conflict: false });
  });
});
