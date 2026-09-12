import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TrendMetricTrace, TrendExplanationResponse } from "@trend/shared-types";

vi.mock("../../../infrastructure/cache.js", () => ({
  cache: { get: vi.fn(), set: vi.fn() },
  hashKey: (value: unknown) => JSON.stringify(value),
}));

vi.mock("../../llm/llm.run.js", () => ({
  cachedGenerateJSON: vi.fn(),
}));

vi.mock("../../papers/models/paper.model.js", () => ({
  PaperModel: {},
}));

vi.mock("../models/trend-explanation.model.js", () => ({
  TrendExplanationModel: {},
}));

describe("trend explain golden guard", () => {
  let validateTrendExplanation: typeof import("../trend.service.js").validateTrendExplanation;

  beforeAll(async () => {
    ({ validateTrendExplanation } = await import("../trend.service.js"));
  });

  it("keeps AI explanation grounded with metric trace sources", () => {
    const metricTrace: TrendMetricTrace[] = [
      {
        source: "yearlyTotalPapers",
        label: "Publication activity",
        value: "120 papers, 2020-2026",
        explanation: "Counts active papers in the current year window and Data Scope.",
      },
      {
        source: "topicMetrics",
        label: "Focus topic metrics",
        value: "48 papers, +6.5 papers/year",
        explanation: "Computes the selected topic's volume, growth, CAGR, and momentum.",
      },
    ];

    const raw = {
      topic: "Natural Language Processing Techniques",
      language: "en",
      summary: "The topic is rising in the selected scope.",
      whyItMatters: ["It has a visible publication signal."],
      evidenceSignals: [
        {
          text: "The topic shows positive momentum in the selected complete-year window.",
          sources: ["topicMetrics", "yearlyTotalPapers"],
        },
      ],
      cautions: ["Citation counts may favor older papers."],
      suggestedActions: ["Compare with adjacent topics."],
      metricTrace: [],
      generatedAt: "2020-01-01T00:00:00.000Z",
    } satisfies TrendExplanationResponse;

    const validated = validateTrendExplanation(raw, "Natural Language Processing Techniques", "en", metricTrace);

    expect(validated.topic).toBe("Natural Language Processing Techniques");
    expect(validated.language).toBe("en");
    expect(validated.evidenceSignals[0]).toEqual({
      text: "The topic shows positive momentum in the selected complete-year window.",
      sources: ["topicMetrics", "yearlyTotalPapers"],
    });
    expect(validated.metricTrace).toEqual(metricTrace);
  });
});
