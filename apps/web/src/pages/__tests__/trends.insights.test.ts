import { describe, expect, it } from "vitest";
import type { TrendClassification, TrendVerdict } from "@trend/shared-types";
import {
  compareTopicsByTrend,
  formatMetricValue,
  formatSigned,
  getFastestKeyword,
  getTopicMetric,
  getTopRisingTopic,
  parseTrendSortKey,
  sortTopics,
  type TrendTopicLike,
} from "../trends.insights";

function topic(name: string, verdict: TrendVerdict, relativeChangePct: number | null, totalPapers: number): TrendTopicLike {
  const classification: TrendClassification = {
    verdict,
    confidence: verdict === "rising" || verdict === "declining" ? "medium" : null,
    yearsUsed: 10,
    totalPapers,
    mannKendall: null,
    qValue: null,
    senSlope: null,
    senSlopeCi95: null,
    relativeChangePct,
    reasons: [],
  };
  return { topic: name, totalPapers, yearlyBreakdown: [], classification };
}

const topics = [
  topic("stable-big", "stable", 1, 900),
  topic("falling-mild", "declining", -5, 100),
  topic("rising-mid", "rising", 12, 50),
  topic("insufficient", "insufficient", null, 10),
  topic("rising-top", "rising", 40, 30),
  topic("falling-steep", "declining", -30, 80),
  topic("stable-small", "stable", 0, 200),
];

describe("trends insights", () => {
  it("formats signed values without plus-minus artifacts", () => {
    expect(formatSigned(12.345, 1)).toBe("+12.3");
    expect(formatSigned(-12.345, 1)).toBe("-12.3");
    expect(formatSigned(0, 1)).toBe("0.0");
  });

  it("formats metric values by sort mode without raw-count rate labels", () => {
    expect(formatMetricValue(12.345, "trend")).toBe("+12.3%");
    expect(formatMetricValue(-1.234, "trend")).toBe("-1.2%");
    expect(formatMetricValue(42, "total")).toBe("42");
  });

  it("maps legacy sort values to trend", () => {
    expect(parseTrendSortKey("momentum")).toBe("trend");
    expect(parseTrendSortKey("growth")).toBe("trend");
    expect(parseTrendSortKey("trend")).toBe("trend");
    expect(parseTrendSortKey(null)).toBe("trend");
    expect(parseTrendSortKey("total")).toBe("total");
  });

  it("orders topics by verdict, then relative change", () => {
    expect(sortTopics(topics, "trend").map((t) => t.topic)).toEqual([
      "rising-top",
      "rising-mid",
      "stable-big",
      "stable-small",
      "falling-steep",
      "falling-mild",
      "insufficient",
    ]);
  });

  it("orders by total papers when asked", () => {
    expect(sortTopics(topics, "total")[0]?.topic).toBe("stable-big");
    expect(compareTopicsByTrend(topics[0]!, topics[0]!)).toBe(0);
  });

  it("treats a topic without classification as insufficient", () => {
    const untested: TrendTopicLike = { topic: "untested", totalPapers: 5, yearlyBreakdown: [] };
    expect(sortTopics([untested, topics[0]!], "trend")[0]?.topic).toBe("stable-big");
  });

  it("returns the right topic metric", () => {
    expect(getTopicMetric(topics[0]!, "total")).toBe(900);
    expect(getTopicMetric(topics[2]!, "trend")).toBe(12);
    expect(getTopicMetric(topics[3]!, "trend")).toBe(0);
  });

  it("only offers a rising topic as the default focus", () => {
    expect(getTopRisingTopic(topics)?.topic).toBe("rising-top");
    expect(getTopRisingTopic([topics[0]!, topics[1]!])).toBeNull();
  });

  it("does not rank keywords by raw growth (P0.5)", () => {
    const keywords = [
      { keyword: "tiny spike", totalPapers: 4, growthRatePct: 300, yearlyBreakdown: [] },
      { keyword: "real growth", totalPapers: 42, growthRatePct: 120, yearlyBreakdown: [] },
    ];
    expect(getFastestKeyword(keywords)).toBeNull();
  });

  it("formats negative growth with its sign (no '+-')", () => {
    expect(`${formatSigned(-12.3, 1)}%`).toBe("-12.3%");
    expect(`${formatSigned(4, 1)}%`).toBe("+4.0%");
  });
});
