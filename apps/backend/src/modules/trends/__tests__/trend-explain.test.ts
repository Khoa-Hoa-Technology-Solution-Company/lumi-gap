import { describe, expect, it, vi } from "vitest";
import type { TrendMetricTrace, TrendsOverview } from "@trend/shared-types";

import { LlmContentError } from "../../llm/gemini.client.js";
import { UNTRUSTED_DATA_PREAMBLE } from "../../llm/grounding.js";
import {
  buildAllowedTrendNumbers,
  buildTrendExplainPrompt,
  generateTrendExplanationWithRetry,
  pickRepresentativePapers,
  TREND_EXPLAIN_SYSTEM_PROMPT,
  validateTrendExplanation,
  type ValidateTrendContext,
} from "../trend-explain.prompt.js";

const metricTrace: TrendMetricTrace[] = [
  { source: "yearlyTotalPapers", label: "Publication activity", value: "120 papers, 2020-2026", explanation: "Counts active papers in the current year window and Data Scope." },
  { source: "topicMetrics", label: "Focus topic metrics", value: "48 papers, +6.5 papers/year", explanation: "Computes the selected topic's volume, growth, CAGR, and momentum." },
];

const context = (overrides: Partial<ValidateTrendContext> = {}): ValidateTrendContext => ({
  topic: "Natural Language Processing Techniques",
  language: "en",
  metricTrace,
  allowedNumbers: [120, 48, 6.5, 7, 2020, 2026, 100],
  allowedPaperIds: new Set(["paper-1", "paper-2"]),
  ...overrides,
});

const raw = (overrides: Record<string, unknown> = {}) => ({
  topic: "Natural Language Processing Techniques",
  language: "en",
  summary: "The topic is rising in the selected scope.",
  whyItMatters: ["It has a visible publication signal."],
  evidenceSignals: [{ text: "The topic shows positive momentum in the selected complete-year window.", sources: ["topicMetrics", "yearlyTotalPapers"] }],
  cautions: ["Citation counts may favor older papers."],
  suggestedActions: ["Compare with adjacent topics."],
  possibleDrivers: [],
  metricTrace: [],
  generatedAt: "2020-01-01T00:00:00.000Z",
  ...overrides,
});

describe("validateTrendExplanation", () => {
  it("keeps the explanation grounded with metric trace sources", () => {
    const validated = validateTrendExplanation(raw(), context());

    expect(validated.topic).toBe("Natural Language Processing Techniques");
    expect(validated.language).toBe("en");
    expect(validated.evidenceSignals[0]).toEqual({ text: "The topic shows positive momentum in the selected complete-year window.", sources: ["topicMetrics", "yearlyTotalPapers"] });
    expect(validated.metricTrace).toEqual(metricTrace);
    expect(validated.possibleDrivers).toEqual([]);
  });

  it("falls back to every trace source when a signal names none", () => {
    const validated = validateTrendExplanation(raw({ evidenceSignals: [{ text: "Signal.", sources: ["nope"] }, "Plain string signal."] }), context());

    expect(validated.evidenceSignals.map((signal) => signal.sources)).toEqual([["yearlyTotalPapers", "topicMetrics"], ["yearlyTotalPapers", "topicMetrics"]]);
  });

  it("trims every list to its limit", () => {
    const many = Array.from({ length: 9 }, (_, i) => `Item ${i}`);
    const validated = validateTrendExplanation(raw({
      whyItMatters: many, evidenceSignals: many, cautions: many, suggestedActions: many,
      possibleDrivers: many.map((text) => ({ text, paperIds: ["paper-1"] })),
    }), context());

    expect([validated.whyItMatters.length, validated.evidenceSignals.length, validated.cautions.length, validated.suggestedActions.length, validated.possibleDrivers!.length]).toEqual([4, 5, 3, 4, 3]);
  });

  it("throws LlmContentError on a wrong shape", () => {
    expect(() => validateTrendExplanation(raw({ summary: "  " }), context())).toThrow(LlmContentError);
    expect(() => validateTrendExplanation(raw({ cautions: "not a list" }), context())).toThrow(LlmContentError);
  });

  it("rejects a summary with a number that is not in the metrics", () => {
    expect(() => validateTrendExplanation(raw({ summary: "Output grew 37.5% to 900 papers." }), context())).toThrow(/numbers not in the metrics: 37.5%, 900/);
  });

  it("drops bullets with invented numbers and keeps the ones that match", () => {
    const validated = validateTrendExplanation(raw({
      whyItMatters: ["Momentum is +6.5 papers per year.", "It grew 80% in one year."],
      evidenceSignals: [{ text: "48 papers match the topic.", sources: ["topicMetrics"] }, { text: "Citations reached 5,000.", sources: ["citationTrend"] }],
      cautions: ["Only 48 papers, a small base.", "About 33 labs work on it."],
    }), context());

    expect(validated.whyItMatters).toEqual(["Momentum is +6.5 papers per year."]);
    expect(validated.evidenceSignals.map((signal) => signal.text)).toEqual(["48 papers match the topic."]);
    expect(validated.cautions).toEqual(["Only 48 papers, a small base."]);
  });

  it("does not check numbers in suggested actions", () => {
    expect(validateTrendExplanation(raw({ suggestedActions: ["Read the top 25 papers."] }), context()).suggestedActions).toEqual(["Read the top 25 papers."]);
  });

  it("keeps only drivers that cite papers the model was shown", () => {
    const validated = validateTrendExplanation(raw({
      possibleDrivers: [
        { text: "May reflect new benchmarks.", paperIds: ["paper-1", "invented"] },
        { text: "May reflect funding.", paperIds: ["invented"] },
        { text: "May reflect 80% more funding.", paperIds: ["paper-2"] },
      ],
    }), context());

    expect(validated.possibleDrivers).toEqual([{ text: "May reflect new benchmarks.", paperIds: ["paper-1"] }]);
  });
});

describe("pickRepresentativePapers", () => {
  const paper = (id: string, publicationYear: number, citationCount: number) => ({ id, publicationYear, citationCount });
  const yearly = [{ year: 2020, count: 1 }, { year: 2021, count: 9 }, { year: 2022, count: 8 }, { year: 2023, count: 7 }, { year: 2024, count: 2 }];

  it("prefers papers from the three busiest years, then by citations", () => {
    const picked = pickRepresentativePapers([paper("old-famous", 2020, 999), paper("a", 2021, 5), paper("b", 2023, 50), paper("c", 2024, 500), paper("d", 2022, 20)], yearly, 3);

    expect(picked.map((p) => p.id)).toEqual(["b", "d", "a"]);
  });

  it("falls back to the other years when there are too few", () => {
    expect(pickRepresentativePapers([paper("x", 2020, 1), paper("y", 2024, 9)], yearly, 6).map((p) => p.id)).toEqual(["y", "x"]);
  });

  it("limits to six by default", () => {
    const papers = Array.from({ length: 10 }, (_, i) => paper(`p${i}`, 2021, i));
    expect(pickRepresentativePapers(papers, yearly)).toHaveLength(6);
  });
});

describe("buildTrendExplainPrompt", () => {
  const overview = { yearFrom: 2020, yearTo: 2026, lastCompleteYear: 2025, totalPapersInWindow: 120, uniqueTopicsInScope: 3, yearlyTotalPapers: [{ year: 2025, count: 40 }], citationTrend: [], facets: { domains: [], topics: [] }, topics: [], risingKeywords: [] } as unknown as TrendsOverview;
  const data = { overview, topicDetail: null, relationships: null };
  const prompt = buildTrendExplainPrompt({ ...data, topic: "NLP", language: "vi", papers: [{ id: "paper-1", title: "A paper", abstractText: "About NLP.", publicationYear: 2024, citationCount: 3 }] });

  it("fences the metrics and the representative papers", () => {
    expect(prompt).toContain("OUTPUT LANGUAGE: Vietnamese");
    expect(prompt).toContain("<<<METRICS>>>");
    expect(prompt).toContain("<<<END_METRICS>>>");
    expect(prompt).toContain("<<<ABSTRACT_1>>> id=paper-1");
    expect(TREND_EXPLAIN_SYSTEM_PROMPT).toContain(UNTRUSTED_DATA_PREAMBLE);
  });

  it("has no digits in the output schema example", () => {
    const schema = prompt.slice(prompt.indexOf("Return JSON with exactly this shape:"));
    expect(schema).not.toMatch(/\d/);
  });

  it("allows the metrics, 100 and the rounded decimals only", () => {
    const allowed = buildAllowedTrendNumbers({ ...data, overview: { ...overview, totalPapersInWindow: 120.6 } });
    expect(allowed).toEqual(expect.arrayContaining([120.6, 121, 100, 2025, 40]));
    expect(allowed).not.toContain(37);
  });
});

describe("generateTrendExplanationWithRetry", () => {
  it("returns the first answer without retrying", async () => {
    const generate = vi.fn().mockResolvedValue("ok");

    await expect(generateTrendExplanationWithRetry(generate, "PROMPT")).resolves.toBe("ok");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith("PROMPT", {});
  });

  it("asks once more, bypassing the cache and naming the rejection, after a validation error", async () => {
    const generate = vi.fn().mockRejectedValueOnce(new LlmContentError("cites numbers not in the metrics: 900")).mockResolvedValueOnce("fixed");

    await expect(generateTrendExplanationWithRetry(generate, "PROMPT")).resolves.toBe("fixed");
    expect(generate).toHaveBeenCalledTimes(2);
    const [prompt, options] = generate.mock.calls[1]!;
    expect(options).toEqual({ bypassCache: true });
    expect(prompt).toContain("PROMPT");
    expect(prompt).toContain("previous answer was rejected: cites numbers not in the metrics: 900");
  });

  it("throws the second validation error", async () => {
    const generate = vi.fn().mockRejectedValue(new LlmContentError("bad"));

    await expect(generateTrendExplanationWithRetry(generate, "PROMPT")).rejects.toBeInstanceOf(LlmContentError);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("quota"));

    await expect(generateTrendExplanationWithRetry(generate, "PROMPT")).rejects.toThrow("quota");
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
