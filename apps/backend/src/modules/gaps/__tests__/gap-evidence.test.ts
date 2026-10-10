import { describe, it, expect } from "vitest";
import { buildGapsPrompt } from "../gaps.prompt.js";
import { computeGapEvidence, resolveProbeYears } from "../gap-evidence.js";

const T = { scarceAbs: 5, scarcePct: 0.02, parentRisingMin: 0, minParentPapers: 5 };

describe("computeGapEvidence", () => {
  it("confirms a scarce intersection under a rising parent", () => {
    const e = computeGapEvidence(
      { intersectionCount: 3, parentCounts: { a: 1240, b: 60 }, parentRisingGrowthPct: 45 },
      T,
    );
    expect(e.confirmed).toBe(true);
    expect(e.scarcityScore).toBeGreaterThan(0);
    expect(e.evidenceConfidence).toBeGreaterThan(0.5);
  });

  it("rejects a common intersection (not scarce)", () => {
    const e = computeGapEvidence(
      { intersectionCount: 800, parentCounts: { a: 1240, b: 1000 }, parentRisingGrowthPct: 45 },
      T,
    );
    expect(e.confirmed).toBe(false);
    expect(e.scarcityScore).toBe(0);
    expect(e.evidenceConfidence).toBeLessThan(0.3);
  });

  it("does not confirm a scarce-but-flat intersection", () => {
    const e = computeGapEvidence(
      { intersectionCount: 2, parentCounts: { a: 500, b: 40 }, parentRisingGrowthPct: 0 },
      T,
    );
    expect(e.confirmed).toBe(false); // parent not rising (0 is not > 0)
    expect(e.scarcityScore).toBeGreaterThan(0);
  });

  it("treats a zero-paper intersection as maximally scarce", () => {
    const e = computeGapEvidence(
      { intersectionCount: 0, parentCounts: { a: 300, b: 80 }, parentRisingGrowthPct: 12 },
      T,
    );
    expect(e.scarcityScore).toBe(1);
    expect(e.confirmed).toBe(true);
  });

  it("gives no evidence confidence when a parent topic has no papers", () => {
    const e = computeGapEvidence(
      { intersectionCount: 0, parentCounts: { a: 12, b: 0 }, parentRisingGrowthPct: 30 },
      T,
    );
    expect(e.scarcityScore).toBe(0);
    expect(e.confirmed).toBe(false);
    expect(e.evidenceConfidence).toBe(0);
  });

  it("does not confirm when a parent topic has too few papers", () => {
    const e = computeGapEvidence(
      { intersectionCount: 0, parentCounts: { a: 1, b: 1 }, parentRisingGrowthPct: 100 },
      T,
    );
    expect(e.lowSample).toBe(true);
    expect(e.confirmed).toBe(false);
    expect(e.evidenceConfidence).toBeLessThanOrEqual(0.25);
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

    expect(prompt).toContain("Structured analysis:");
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
