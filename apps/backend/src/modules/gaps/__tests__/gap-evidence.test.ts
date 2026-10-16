import { describe, it, expect } from "vitest";
import { buildGapsPrompt } from "../gaps.prompt.js";
import { computeGapEvidence, parentGrowth, resolveProbeYears, scarcityCeiling } from "../gap-evidence.js";

const T = { scarceAbs: 5, scarcePct: 0.02, parentRisingMin: 10, minParentPapers: 20 };

describe("computeGapEvidence", () => {
  it("confirms a scarce intersection under a rising parent", () => {
    const e = computeGapEvidence(
      { intersectionCount: 3, parentCounts: { a: 1240, b: 60 }, parentRising: true },
      T,
    );
    expect(e.confirmed).toBe(true);
    expect(e.scarcityScore).toBeGreaterThan(0);
    expect(e.evidenceConfidence).toBeGreaterThan(0.5);
  });

  it("rejects a common intersection (not scarce)", () => {
    const e = computeGapEvidence(
      { intersectionCount: 800, parentCounts: { a: 1240, b: 1000 }, parentRising: true },
      T,
    );
    expect(e.confirmed).toBe(false);
    expect(e.scarcityScore).toBe(0);
    expect(e.evidenceConfidence).toBeLessThan(0.3);
  });

  it("does not confirm a scarce-but-flat intersection", () => {
    const e = computeGapEvidence(
      { intersectionCount: 2, parentCounts: { a: 500, b: 40 }, parentRising: false },
      T,
    );
    expect(e.confirmed).toBe(false); // parent not rising
    expect(e.scarcityScore).toBeGreaterThan(0);
  });

  it("treats a zero-paper intersection as maximally scarce", () => {
    const e = computeGapEvidence(
      { intersectionCount: 0, parentCounts: { a: 300, b: 80 }, parentRising: true },
      T,
    );
    expect(e.scarcityScore).toBe(1);
    expect(e.confirmed).toBe(true);
  });

  it("gives no evidence confidence when a parent topic has no papers", () => {
    const e = computeGapEvidence(
      { intersectionCount: 0, parentCounts: { a: 12, b: 0 }, parentRising: true },
      T,
    );
    expect(e.scarcityScore).toBe(0);
    expect(e.confirmed).toBe(false);
    expect(e.evidenceConfidence).toBe(0);
  });

  it("does not confirm when a parent topic has too few papers", () => {
    const e = computeGapEvidence(
      { intersectionCount: 0, parentCounts: { a: 1, b: 1 }, parentRising: true },
      T,
    );
    expect(e.lowSample).toBe(true);
    expect(e.confirmed).toBe(false);
    expect(e.evidenceConfidence).toBeLessThanOrEqual(0.25);
  });
});

const growing = (counts: number[], startYear = 2020) => counts.map((count, index) => ({ year: startYear + index, count }));

describe("scarcityCeiling", () => {
  it("is the larger of the floor and the percentage, capped at a quarter of the smaller parent", () => {
    expect(scarcityCeiling(20, T)).toBe(5);
    expect(scarcityCeiling(8, T)).toBe(2); // scarceAbs 5 would otherwise be 62% of the topic
    expect(scarcityCeiling(1000, T)).toBe(20);
    expect(scarcityCeiling(2, T)).toBe(1);
  });
});

describe("parentGrowth", () => {
  it("uses the CAGR and compares it to the rising threshold", () => {
    const growth = parentGrowth(growing([10, 12, 15, 20]), 10);
    expect(growth.cagrPct).toBeGreaterThan(10);
    expect(growth.growthRatePct).toBe(growth.cagrPct);
    expect(growth.rising).toBe(true);
    expect(parentGrowth(growing([10, 12, 15, 20]), 50).rising).toBe(false);
  });

  it("falls back to the slope when the CAGR is undefined (zero base)", () => {
    const growth = parentGrowth(growing([0, 0, 1, 2]), 10);
    expect(growth.cagrPct).toBeNull();
    expect(growth.slope).toBeGreaterThan(0);
    expect(growth.rising).toBe(true);
  });

  it("does not call a flat series rising", () => {
    const growth = parentGrowth(growing([5, 5, 5, 5]), 10);
    expect(growth.rising).toBe(false);
    expect(parentGrowth(growing([0, 0, 0, 0]), 10).rising).toBe(false);
  });
});

describe("computeGapEvidence thresholds and OpenAlex counts", () => {
  it("does not confirm 5 papers per topic growing from 1 to 2", () => {
    const e = computeGapEvidence({ intersectionCount: 0, parentCounts: { a: 5, b: 5 }, parentRising: parentGrowth(growing([0, 0, 1, 2]), 10).rising }, T);
    expect(e.lowSample).toBe(true);
    expect(e.confirmed).toBe(false);
  });

  it("does not confirm a corpus-scarce gap that is common in OpenAlex", () => {
    const e = computeGapEvidence({ intersectionCount: 1, parentCounts: { a: 100, b: 80 }, parentRising: true, globalEvidence: { source: "openalex", intersectionCount: 5000, parentCounts: { a: 20000, b: 30000 }, fetchedAt: "2026-10-16T00:00:00.000Z" } }, T);
    expect(e.globalScarce).toBe(false);
    expect(e.confirmed).toBe(false);
  });

  it("confirms when the intersection is also scarce in OpenAlex", () => {
    const e = computeGapEvidence({ intersectionCount: 1, parentCounts: { a: 100, b: 80 }, parentRising: true, globalEvidence: { source: "openalex", intersectionCount: 12, parentCounts: { a: 20000, b: 30000 }, fetchedAt: "2026-10-16T00:00:00.000Z" } }, T);
    expect(e.globalScarce).toBe(true);
    expect(e.confirmed).toBe(true);
  });

  it("treats an OpenAlex topic with no papers as not scarce", () => {
    const e = computeGapEvidence({ intersectionCount: 0, parentCounts: { a: 100, b: 80 }, parentRising: true, globalEvidence: { source: "openalex", intersectionCount: 0, parentCounts: { a: 0, b: 30000 }, fetchedAt: "2026-10-16T00:00:00.000Z" } }, T);
    expect(e.globalScarce).toBe(false);
    expect(e.confirmed).toBe(false);
  });

  it.each([undefined, null])("keeps the corpus-only behaviour when OpenAlex is unavailable (%s)", (globalEvidence) => {
    const e = computeGapEvidence({ intersectionCount: 1, parentCounts: { a: 100, b: 80 }, parentRising: true, globalEvidence }, T);
    expect(e.globalScarce).toBeNull();
    expect(e.confirmed).toBe(true);
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
