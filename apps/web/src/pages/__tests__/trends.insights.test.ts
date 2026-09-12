import { describe, expect, it } from "vitest";
import {
  formatMetricValue,
  formatSigned,
  getFastestKeyword,
  getFastestTopic,
  getHighestGrowthTopic,
  getMostEstablishedTopic,
  getTopicMetric,
  isSmallBaseKeyword,
} from "../trends.insights";

const topics = [
  { topic: "A", totalPapers: 10, growthRatePct: -20, momentum: -1.2, yearlyBreakdown: [] },
  { topic: "B", totalPapers: 80, growthRatePct: 15, momentum: 3.4, yearlyBreakdown: [] },
  { topic: "C", totalPapers: 30, growthRatePct: 90, momentum: 1.1, yearlyBreakdown: [] },
];

describe("trends insights", () => {
  it("formats signed values without plus-minus artifacts", () => {
    expect(formatSigned(12.345, 1)).toBe("+12.3");
    expect(formatSigned(-12.345, 1)).toBe("-12.3");
    expect(formatSigned(0, 1)).toBe("0.0");
  });

  it("formats metric values by selected sort mode", () => {
    expect(formatMetricValue(12.345, "growth")).toBe("+12.3%");
    expect(formatMetricValue(42, "total")).toBe("42 papers");
    expect(formatMetricValue(-1.234, "momentum")).toBe("-1.23 papers/year");
  });

  it("selects useful topic insights", () => {
    expect(getFastestTopic(topics)?.topic).toBe("B");
    expect(getHighestGrowthTopic(topics)?.topic).toBe("C");
    expect(getMostEstablishedTopic(topics)?.topic).toBe("B");
  });

  it("returns the right topic metric", () => {
    expect(getTopicMetric(topics[0]!, "total")).toBe(10);
    expect(getTopicMetric(topics[0]!, "growth")).toBe(-20);
    expect(getTopicMetric(topics[0]!, "momentum")).toBe(-1.2);
  });

  it("flags high-growth keywords from a tiny paper base", () => {
    const keywords = [
      { keyword: "tiny spike", totalPapers: 4, growthRatePct: 300, yearlyBreakdown: [] },
      { keyword: "real growth", totalPapers: 42, growthRatePct: 120, yearlyBreakdown: [] },
    ];
    expect(getFastestKeyword(keywords)?.keyword).toBe("tiny spike");
    expect(isSmallBaseKeyword(keywords[0]!)).toBe(true);
    expect(isSmallBaseKeyword(keywords[1]!)).toBe(false);
  });
});
