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
        reportCitationCoverage: async () => ({ reports: 0, avgPct: 0, withUnsupportedPercents: 0 }),
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
      "report-citation-coverage",
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
        reportCitationCoverage: async () => ({ reports: 0, avgPct: 0, withUnsupportedPercents: 0 }),
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
        reportCitationCoverage: async () => ({ reports: 0, avgPct: 0, withUnsupportedPercents: 0 }),
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
        reportCitationCoverage: async () => ({ reports: 0, avgPct: 0, withUnsupportedPercents: 0 }),
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
        reportCitationCoverage: async () => ({ reports: 10, avgPct: 85, withUnsupportedPercents: 0 }),
      },
      new Date("2026-07-13T00:00:00.000Z"),
    );

    expect(summary.overallStatus).toBe("healthy");
    expect(summary.checks.every((check) => check.status === "pass")).toBe(true);
  });
});

describe("report citation coverage check", () => {
  const summaryWith = (stats: { reports: number; avgPct: number; withUnsupportedPercents: number }) =>
    buildEvaluationSummary(
      {
        countPapers: async () => 200,
        countActivePapers: async () => 200,
        countAnalyzablePapers: async () => 200,
        countEmbeddedPapers: async () => 200,
        countAiAnalyzedPapers: async () => 200,
        countReadyReports: async () => stats.reports,
        countGroundedReports: async () => stats.reports,
        countReportsWithInvalidCitations: async () => 0,
        countActiveGaps: async () => 0,
        countEvidenceBackedGaps: async () => 0,
        reportCitationCoverage: async () => stats,
      },
      new Date("2026-07-13T00:00:00.000Z"),
    ).then((summary) => summary.checks.find((check) => check.id === "report-citation-coverage")!);

  it("passes at 70% average coverage with no unmatched percentages", async () => {
    const check = await summaryWith({ reports: 4, avgPct: 70, withUnsupportedPercents: 0 });
    expect(check.status).toBe("pass");
    expect(check.score).toBe(10);
    expect(check.evidence).toContain("70%");
    expect(check.evidence).toContain("4 ready reports");
  });

  it("warns when coverage is low", async () => {
    const check = await summaryWith({ reports: 4, avgPct: 42.5, withUnsupportedPercents: 0 });
    expect(check.status).toBe("warn");
    expect(check.score).toBe(4);
  });

  it("warns when any report states percentages that do not match", async () => {
    const check = await summaryWith({ reports: 4, avgPct: 90, withUnsupportedPercents: 1 });
    expect(check.status).toBe("warn");
    expect(check.evidence).toContain("1 reports state percentages");
  });

  it("warns with score 0 when there are no reports", async () => {
    const check = await summaryWith({ reports: 0, avgPct: 0, withUnsupportedPercents: 0 });
    expect(check.status).toBe("warn");
    expect(check.score).toBe(0);
  });
});
