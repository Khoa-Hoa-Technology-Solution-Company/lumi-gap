import { describe, expect, it } from "vitest";
import { buildEvaluationSummary, classifyPaperScoreRank } from "../evaluation.service.js";

describe("classifyPaperScoreRank", () => {
  it("explains the 1-3 paper score bands", () => {
    expect(classifyPaperScoreRank(0.2).rank).toBe(1);
    expect(classifyPaperScoreRank(0.55).rank).toBe(2);
    expect(classifyPaperScoreRank(0.82).rank).toBe(3);
  });
});

describe("buildEvaluationSummary", () => {
  it("returns deterministic benchmark checks for trend, gap, report grounding, and score rubric", async () => {
    const summary = await buildEvaluationSummary(
      {
        countPapers: async () => 100,
        countActivePapers: async () => 90,
        countAnalyzablePapers: async () => 80,
        countEmbeddedPapers: async () => 70,
        countAiAnalyzedPapers: async () => 50,
        countReadyReports: async () => 12,
        countGroundedReports: async () => 10,
        countReportsWithInvalidCitations: async () => 0,
        countActiveGaps: async () => 8,
        countEvidenceBackedGaps: async () => 6,
      },
      new Date("2026-07-13T00:00:00.000Z"),
    );

    expect(summary.overallScore).toBeGreaterThan(0);
    expect(summary.overallStatus).toBe("at_risk");
    expect(summary.corpus.embeddingCoveragePct).toBe(87.5);
    expect(summary.corpus.aiAnalysisCoveragePct).toBe(62.5);
    expect(summary.rubric.scoreBands).toHaveLength(3);
    expect(summary.checks.map((check) => check.id)).toEqual([
      "search-retrieval-readiness",
      "trend-formula-benchmark",
      "gap-evidence-benchmark",
      "report-grounding-guard",
      "paper-score-rubric",
      "structured-knowledge-coverage",
      "report-corpus-grounding",
      "report-saved-citation-validity",
      "gap-corpus-evidence",
    ]);
    expect(summary.checks.find((check) => check.id === "trend-formula-benchmark")?.status).toBe("pass");
    expect(summary.checks.find((check) => check.id === "gap-evidence-benchmark")?.evidence).toContain(
      "confirmed=true",
    );
    expect(summary.checks.find((check) => check.id === "report-grounding-guard")?.evidence).toContain(
      "out-of-range",
    );
  });

  it("warns when the corpus is too small to prove production-grade correctness", async () => {
    const summary = await buildEvaluationSummary(
      {
        countPapers: async () => 0,
        countActivePapers: async () => 0,
        countAnalyzablePapers: async () => 0,
        countEmbeddedPapers: async () => 0,
        countAiAnalyzedPapers: async () => 0,
        countReadyReports: async () => 0,
        countGroundedReports: async () => 0,
        countReportsWithInvalidCitations: async () => 0,
        countActiveGaps: async () => 0,
        countEvidenceBackedGaps: async () => 0,
      },
      new Date("2026-07-13T00:00:00.000Z"),
    );

    expect(summary.overallStatus).toBe("needs_data");
    expect(summary.checks.find((check) => check.id === "search-retrieval-readiness")?.status).toBe("fail");
    expect(summary.checks.find((check) => check.id === "report-corpus-grounding")?.status).toBe("warn");
  });

  it("fails search readiness when analyzable papers exist but no valid embeddings exist", async () => {
    const summary = await buildEvaluationSummary(
      {
        countPapers: async () => 10,
        countActivePapers: async () => 10,
        countAnalyzablePapers: async () => 10,
        countEmbeddedPapers: async () => 0,
        countAiAnalyzedPapers: async () => 0,
        countReadyReports: async () => 0,
        countGroundedReports: async () => 0,
        countReportsWithInvalidCitations: async () => 0,
        countActiveGaps: async () => 0,
        countEvidenceBackedGaps: async () => 0,
      },
      new Date("2026-07-13T00:00:00.000Z"),
    );

    const search = summary.checks.find((check) => check.id === "search-retrieval-readiness");
    expect(search?.status).toBe("fail");
    expect(search?.score).toBe(0);
    expect(summary.overallStatus).toBe("at_risk");
  });

  it("fails report saved-citation validity when ready reports contain out-of-range citations", async () => {
    const summary = await buildEvaluationSummary(
      {
        countPapers: async () => 200,
        countActivePapers: async () => 200,
        countAnalyzablePapers: async () => 200,
        countEmbeddedPapers: async () => 200,
        countAiAnalyzedPapers: async () => 200,
        countReadyReports: async () => 10,
        countGroundedReports: async () => 10,
        countReportsWithInvalidCitations: async () => 2,
        countActiveGaps: async () => 10,
        countEvidenceBackedGaps: async () => 10,
      },
      new Date("2026-07-13T00:00:00.000Z"),
    );

    const citationValidity = summary.checks.find((check) => check.id === "report-saved-citation-validity");
    expect(citationValidity?.status).toBe("fail");
    expect(citationValidity?.evidence).toContain("2/10");
    expect(summary.overallStatus).toBe("at_risk");
  });

  it("marks the system healthy only when every benchmark passes", async () => {
    const summary = await buildEvaluationSummary(
      {
        countPapers: async () => 200,
        countActivePapers: async () => 200,
        countAnalyzablePapers: async () => 200,
        countEmbeddedPapers: async () => 200,
        countAiAnalyzedPapers: async () => 200,
        countReadyReports: async () => 10,
        countGroundedReports: async () => 10,
        countReportsWithInvalidCitations: async () => 0,
        countActiveGaps: async () => 10,
        countEvidenceBackedGaps: async () => 10,
      },
      new Date("2026-07-13T00:00:00.000Z"),
    );

    expect(summary.overallStatus).toBe("healthy");
    expect(summary.checks.every((check) => check.status === "pass")).toBe(true);
  });
});
