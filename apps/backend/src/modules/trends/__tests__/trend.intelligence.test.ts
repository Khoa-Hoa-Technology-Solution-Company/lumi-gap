import { describe, expect, it } from "vitest";
import {
  buildCitationMetric,
  fillMissingCitationYears,
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
});
