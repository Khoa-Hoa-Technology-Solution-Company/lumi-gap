import { describe, expect, it } from "vitest";
import {
  buildCitationMetric,
  citationBand,
  fillMissingCitationYears,
  fillMissingYearsFromCounts,
  toFacetBuckets,
} from "../trend.intelligence.js";

describe("trend.intelligence", () => {
  it("builds citation metrics with rounded average citations", () => {
    expect(buildCitationMetric(2025, 3, 10)).toEqual({
      year: 2025,
      count: 3,
      totalCitations: 10,
      avgCitations: 3.3,
    });
    expect(buildCitationMetric(2025, 0, 10).avgCitations).toBe(0);
  });

  it("fills missing citation years with zero metrics", () => {
    expect(fillMissingCitationYears([buildCitationMetric(2024, 2, 7)], 2023, 2025)).toEqual([
      { year: 2023, count: 0, totalCitations: 0, avgCitations: 0 },
      { year: 2024, count: 2, totalCitations: 7, avgCitations: 3.5 },
      { year: 2025, count: 0, totalCitations: 0, avgCitations: 0 },
    ]);
  });

  it("normalizes facet aggregation rows", () => {
    expect(toFacetBuckets([{ _id: "article", count: 4 }, { _id: null, count: 2 }, { _id: "empty", count: 0 }])).toEqual([
      { id: "article", name: "article", count: 4 },
      { id: "unknown", name: "unknown", count: 2 },
    ]);
  });

  it("maps citation counts into stable bands", () => {
    expect(citationBand(0)).toBe("0-9");
    expect(citationBand(10)).toBe("10-49");
    expect(citationBand(50)).toBe("50-99");
    expect(citationBand(100)).toBe("100-499");
    expect(citationBand(500)).toBe("500-999");
    expect(citationBand(1000)).toBe("1000+");
  });

  it("fills count-only yearly series", () => {
    expect(fillMissingYearsFromCounts([{ year: 2025, count: 8 }], 2024, 2026)).toEqual([
      { year: 2024, count: 0 },
      { year: 2025, count: 8 },
      { year: 2026, count: 0 },
    ]);
  });
});
