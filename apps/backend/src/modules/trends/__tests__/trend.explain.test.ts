import { describe, expect, it } from "vitest";
import type { TrendsOverview } from "@trend/shared-types";
import { buildExplainContext, buildExplainPrompt, normalizeExplanation } from "../trend.explain.js";

const overview = {
  dataSource: "openalex",
  yearFrom: 2016,
  yearTo: 2026,
  lastCompleteYear: 2025,
  totalPapersInWindow: 1000,
  topics: Array.from({ length: 12 }, (_, i) => ({
    topic: `Topic ${i}`,
    totalPapers: 100 - i,
    yearlyBreakdown: [{ year: 2020, count: 5 }],
    growthRatePct: 0,
    cagr3yPct: null,
    momentum: 0,
    classification: {
      verdict: "rising",
      confidence: "high",
      yearsUsed: 10,
      totalPapers: 100 - i,
      mannKendall: { s: 41, z: 3.5777, tau: 0.911111, pValue: 0.000346619 },
      qValue: 0.00012345,
      senSlope: 0.031167,
      senSlopeCi95: [0.021234, 0.041298],
      relativeChangePct: 10.5123,
      reasons: ["SIGNIFICANT_INCREASE"],
    },
  })),
  risingKeywords: [],
} as unknown as TrendsOverview;

describe("buildExplainContext", () => {
  it("keeps only rounded aggregates and test results", () => {
    const context = buildExplainContext(overview, null);
    expect(context.topTopics).toHaveLength(8);
    expect(context.topTopics[0]).toEqual({
      topic: "Topic 0",
      totalPapers: 100,
      trend: {
        verdict: "rising",
        confidence: "high",
        reasons: ["SIGNIFICANT_INCREASE"],
        yearsUsed: 10,
        totalPapers: 100,
        mannKendallTau: 0.91,
        pValue: 0.000347,
        qValue: 0.0001,
        senSlopePctPointsPerYear: 0.0312,
        senSlopeCi95: [0.0212, 0.0413],
        relativeChangePctPerYear: 10.51,
      },
    });
    expect(JSON.stringify(context)).not.toContain("yearlyBreakdown");
    const prompt = buildExplainPrompt(context, "vi");
    expect(prompt).toContain("Write in Vietnamese");
    expect(prompt).toContain("never contradict it");
  });
});

describe("normalizeExplanation", () => {
  it("coerces the model output into the response shape", () => {
    const result = normalizeExplanation(
      {
        summary: " Rising. ",
        whyItMatters: ["a", "", 3, "b", "c", "d"],
        evidenceSignals: [{ text: "x", sources: ["topicMetrics", "made-up"] }, { text: "" }],
        metricTrace: [{ source: "topicMetrics", label: "share", value: 10.5, explanation: "e" }, { source: "bogus", label: "y" }],
      },
      "Topic 0",
      "vi",
    );
    expect(result).toMatchObject({
      topic: "Topic 0",
      language: "vi",
      summary: "Rising.",
      whyItMatters: ["a", "b", "c"],
      evidenceSignals: [{ text: "x", sources: ["topicMetrics"] }],
      cautions: [],
      suggestedActions: [],
      metricTrace: [{ source: "topicMetrics", label: "share", value: "10.5", explanation: "e" }],
    });
  });

  it("rejects an empty answer", () => {
    expect(() => normalizeExplanation({}, undefined, "en")).toThrow();
  });
});
