import type {
  EvaluationCheck,
  EvaluationCorpusMetrics,
  EvaluationScoreBand,
  EvaluationSummary,
} from "@trend/shared-types";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { assertCitationsInRange, citationCoverage } from "../llm/grounding.js";
import { computePaperScore } from "../scoring/paper-score.js";
import { computeGapEvidence } from "../gaps/gap-evidence.js";
import { computeMetrics } from "../trends/trend.formulas.js";

export interface EvaluationRepository {
  countPapers(): Promise<number>;
  countActivePapers(): Promise<number>;
  countAnalyzablePapers(): Promise<number>;
  countEmbeddedPapers(): Promise<number>;
  countAiAnalyzedPapers(): Promise<number>;
  countReadyReports(): Promise<number>;
  countGroundedReports(): Promise<number>;
  countReportsWithInvalidCitations(): Promise<number>;
  countActiveGaps(): Promise<number>;
  countEvidenceBackedGaps(): Promise<number>;
  reportCitationCoverage(): Promise<{ reports: number; avgPct: number; withUnsupportedPercents: number }>;
}

export const evaluationRepository: EvaluationRepository = {
  countPapers: () => getPrisma().paper.count(),
  countActivePapers: () => getPrisma().paper.count({ where: { dataStatus: "active" } }),
  countAnalyzablePapers: () => getPrisma().paper.count({ where: { dataStatus: "active", isAiAnalyzable: true } }),
  countEmbeddedPapers: () => getPrisma().$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM papers
    WHERE data_status = 'active' AND is_ai_analyzable = TRUE AND embedding IS NOT NULL
  `.then((rows) => Number(rows[0]?.count ?? 0)),
  countAiAnalyzedPapers: () => getPrisma().paper.count({ where: { dataStatus: "active", isAiAnalyzable: true, aiAnalysis: { not: null as never } } }),
  countReadyReports: () => getPrisma().report.count({ where: { status: "ready" } }),
  countGroundedReports: async () => {
    const ready = await getPrisma().report.findMany({ where: { status: "ready" }, select: { id: true } });
    return (await getPrisma().reportPaper.groupBy({ by: ["reportId"], where: { reportId: { in: ready.map((row) => row.id) } } })).length;
  },
  async countReportsWithInvalidCitations() {
    const reports = await getPrisma().report.findMany({ where: { status: "ready" }, select: { id: true, markdown: true } });
    const counts = await getPrisma().reportPaper.groupBy({ by: ["reportId"], where: { reportId: { in: reports.map((row) => row.id) } }, _count: { _all: true } });
    const countByReport = new Map(counts.map((row) => [row.reportId, row._count._all]));

    let invalid = 0;
    for (const report of reports) {
      try {
        assertCitationsInRange(report.markdown ?? "", countByReport.get(report.id) ?? 0);
      } catch {
        invalid += 1;
      }
    }
    return invalid;
  },
  async reportCitationCoverage() {
    const reports = await getPrisma().report.findMany({ where: { status: "ready" }, select: { markdown: true, groundingChecks: true } });
    let total = 0, withUnsupportedPercents = 0;
    for (const report of reports) {
      const checks = report.groundingChecks as { citationCoverage?: { pct?: number }; unsupportedPercents?: unknown[] } | null;
      // Reports saved before grounding checks existed are measured from their markdown; they have no percentage check.
      total += typeof checks?.citationCoverage?.pct === "number" ? checks.citationCoverage.pct : citationCoverage(report.markdown ?? "").pct;
      if (checks?.unsupportedPercents?.length) withUnsupportedPercents += 1;
    }
    return { reports: reports.length, avgPct: reports.length ? Math.round((total / reports.length) * 10) / 10 : 0, withUnsupportedPercents };
  },
  countActiveGaps: () => getPrisma().researchGap.count({ where: { status: "active" } }),
  countEvidenceBackedGaps: async () => {
    const gaps = await getPrisma().researchGap.findMany({ where: { status: "active", evidenceConfidence: { gte: 0.5 } }, select: { id: true, probe: true } });
    const supported = await getPrisma().researchGapPaper.groupBy({ by: ["gapId"], where: { gapId: { in: gaps.map((row) => row.id) }, kind: "supporting" } });
    const ids = new Set(supported.map((row) => row.gapId));
    return gaps.filter((row) => { const probe = row.probe as Record<string, unknown> | null; return ids.has(row.id) && Boolean(probe?.topicA) && Boolean(probe?.topicB); }).length;
  },
};

export const evaluationService = {
  getSummary(now = new Date()): Promise<EvaluationSummary> {
    return buildEvaluationSummary(evaluationRepository, now);
  },
};

export async function buildEvaluationSummary(
  repository: EvaluationRepository,
  now = new Date(),
): Promise<EvaluationSummary> {
  const corpus = await getCorpusMetrics(repository);
  const checks = buildChecks(corpus, now);
  const overallScore = checks.reduce((sum, check) => sum + check.score, 0);
  const maxScore = checks.reduce((sum, check) => sum + check.maxScore, 0);

  return {
    generatedAt: now.toISOString(),
    overallStatus: resolveOverallStatus(overallScore, maxScore, corpus, checks),
    overallScore,
    maxScore,
    rubric: {
      paperScoreFormula:
        "paper-score-v3: finalScore = 0.75 * normalized citation impact + 0.20 * recencyScore(10-year window) + 0.05 * metadataQualityScore. Citation impact uses OpenAlex citation_normalized_percentile + FWCI when available, then falls back to citations/year.",
      scoreBands: SCORE_BANDS,
    },
    corpus,
    checks,
  };
}

export function classifyPaperScoreRank(finalScore: number): EvaluationScoreBand {
  if (finalScore >= 0.7) return SCORE_BANDS[2]!;
  if (finalScore >= 0.4) return SCORE_BANDS[1]!;
  return SCORE_BANDS[0]!;
}

const SCORE_BANDS: EvaluationScoreBand[] = [
  {
    rank: 1,
    label: "Weak / needs review",
    range: "0.00-0.39",
    meaning:
      "Low intrinsic value signal: old, low-citation, or not yet useful for ranking. It can still appear by semantic relevance, but should not be treated as a strong source.",
  },
  {
    rank: 2,
    label: "Usable / moderate",
    range: "0.40-0.69",
    meaning:
      "Reasonable candidate: either recent, cited at a moderate rate, or both. Good for discovery, but claims should still be checked against evidence.",
  },
  {
    rank: 3,
    label: "Strong / high signal",
    range: "0.70-1.00",
    meaning:
      "Strong intrinsic signal: recent and/or cited at a high age-adjusted rate. Best suited for report evidence and top search results when semantically relevant.",
  },
];

async function getCorpusMetrics(repository: EvaluationRepository): Promise<EvaluationCorpusMetrics> {
  const [
    totalPapers,
    activePapers,
    analyzablePapers,
    embeddedPapers,
    aiAnalyzedPapers,
    readyReports,
    groundedReports,
    invalidCitationReports,
    activeGaps,
    evidenceBackedGaps,
    citationStats,
  ] = await Promise.all([
    repository.countPapers(),
    repository.countActivePapers(),
    repository.countAnalyzablePapers(),
    repository.countEmbeddedPapers(),
    repository.countAiAnalyzedPapers(),
    repository.countReadyReports(),
    repository.countGroundedReports(),
    repository.countReportsWithInvalidCitations(),
    repository.countActiveGaps(),
    repository.countEvidenceBackedGaps(),
    repository.reportCitationCoverage(),
  ]);

  return {
    totalPapers,
    activePapers,
    analyzablePapers,
    embeddedPapers,
    aiAnalyzedPapers,
    readyReports,
    groundedReports,
    invalidCitationReports,
    activeGaps,
    evidenceBackedGaps,
    citationCoverageReports: citationStats.reports,
    avgCitationCoveragePct: citationStats.avgPct,
    reportsWithUnsupportedPercents: citationStats.withUnsupportedPercents,
    embeddingCoveragePct: pct(embeddedPapers, analyzablePapers),
    aiAnalysisCoveragePct: pct(aiAnalyzedPapers, analyzablePapers),
    reportGroundingCoveragePct: pct(groundedReports, readyReports),
    reportCitationValidityPct: pct(Math.max(0, groundedReports - invalidCitationReports), groundedReports),
    gapEvidenceCoveragePct: pct(evidenceBackedGaps, activeGaps),
  };
}

function buildChecks(corpus: EvaluationCorpusMetrics, now: Date): EvaluationCheck[] {
  return [
    buildSearchReadinessCheck(corpus),
    buildTrendFormulaCheck(now),
    buildGapEvidenceCheck(),
    buildReportGroundingGuardCheck(),
    buildPaperScoreRubricCheck(now),
    buildStructuredKnowledgeCoverageCheck(corpus),
    buildReportCorpusGroundingCheck(corpus),
    buildReportCitationValidityCheck(corpus),
    buildGapCorpusEvidenceCheck(corpus),
    buildReportCitationCoverageCheck(corpus),
  ];
}

function buildSearchReadinessCheck(corpus: EvaluationCorpusMetrics): EvaluationCheck {
  const enoughCorpus = corpus.analyzablePapers >= 100;
  const enoughEmbedding = corpus.embeddingCoveragePct >= 70;
  const pass = enoughCorpus && enoughEmbedding;
  const hasNoUsableVectors = corpus.embeddedPapers === 0 || corpus.embeddingCoveragePct === 0;
  const partialScore = Math.min(8, Math.max(1, Math.round(corpus.embeddingCoveragePct / 10)));

  return {
    id: "search-retrieval-readiness",
    feature: "search",
    title: "Search relevance has enough embedded corpus",
    status: pass ? "pass" : corpus.analyzablePapers > 0 && !hasNoUsableVectors ? "warn" : "fail",
    score: pass ? 10 : corpus.analyzablePapers > 0 && !hasNoUsableVectors ? partialScore : 0,
    maxScore: 10,
    basis:
      "Semantic search can only rank papers that are active, AI-analyzable, and embedded. This check proves whether the search pool is large enough to evaluate relevance.",
    evidence: `${corpus.embeddedPapers}/${corpus.analyzablePapers} analyzable papers embedded (${corpus.embeddingCoveragePct}%). Target: >=100 analyzable papers and >=70% embedded.`,
    action:
      "Run embedding worker/backfill more papers before claiming production search quality. Use query-level relevance labels for deeper precision@k later.",
  };
}

function buildTrendFormulaCheck(now: Date): EvaluationCheck {
  const lastCompleteYear = now.getUTCFullYear() - 1;
  const series = [
    { year: lastCompleteYear - 3, count: 10 },
    { year: lastCompleteYear - 2, count: 20 },
    { year: lastCompleteYear - 1, count: 40 },
    { year: lastCompleteYear, count: 80 },
    { year: lastCompleteYear + 1, count: 7 },
  ];
  const metrics = computeMetrics(series, lastCompleteYear);
  const pass = metrics.growthRatePct === 100 && metrics.cagr3yPct === 100 && metrics.momentum > 0;

  return {
    id: "trend-formula-benchmark",
    feature: "trend",
    title: "Trend formulas exclude incomplete current-year data",
    status: pass ? "pass" : "fail",
    score: pass ? 10 : 0,
    maxScore: 10,
    basis:
      "Trend correctness is deterministic: growth = YoY last complete year, CAGR = last 3 complete years, momentum = least-squares slope.",
    evidence: `Fixture doubled yearly through ${lastCompleteYear} and has a partial YTD drop after it. Computed growth=${metrics.growthRatePct}%, cagr3y=${metrics.cagr3yPct}%, momentum=${metrics.momentum}.`,
    action: "If this fails, trend charts can mislead users and must not be trusted.",
  };
}

function buildGapEvidenceCheck(): EvaluationCheck {
  const thresholds = {
    minParentPapers: env.GAP_MIN_PARENT_PAPERS,
    maxRatio: env.GAP_UNDEREXPLORED_MAX_RATIO,
    alpha: env.GAP_UNDEREXPLORED_ALPHA,
  };
  // 2 papers where 8 would be expected (100 * 80 / 1000) is a significant shortfall.
  const shortfall = computeGapEvidence(
    { evidenceScopeSize: 1000, intersectionCount: 2, parentCounts: { a: 100, b: 80 }, probeCount: 1 },
    thresholds,
  );
  // 0 papers where 0.3 would be expected (20 * 15 / 1000) is what chance predicts in a small corpus.
  const chance = computeGapEvidence(
    { evidenceScopeSize: 1000, intersectionCount: 0, parentCounts: { a: 20, b: 15 }, probeCount: 1 },
    thresholds,
  );
  const pass = shortfall.underExplored && shortfall.evidenceConfidence >= 0.5 && !chance.underExplored && chance.evidenceConfidence < 0.5;

  return {
    id: "gap-evidence-benchmark",
    feature: "gap",
    title: "Under-explored ranking signal compares observed with expected co-occurrence",
    status: pass ? "pass" : "fail",
    score: pass ? 10 : 0,
    maxScore: 10,
    basis:
      "A low co-mention count is only a ranking signal, not proof that a gap is open. The signal compares the observed intersection with the count expected under independence (nA*nB/N) and requires a significant Poisson shortfall; the Gap Closure Protocol decides whether a gap is open.",
    evidence: `Shortfall fixture N=1000, parentCounts=100/80, intersection=2: expected=${shortfall.expected.toFixed(2)}, ratio=${shortfall.ratio.toFixed(2)}, p=${shortfall.pValue.toFixed(4)}, underExplored=${shortfall.underExplored}, score=${shortfall.evidenceConfidence}. Chance fixture N=1000, parentCounts=20/15, intersection=0: expected=${chance.expected.toFixed(2)}, p=${chance.pValue.toFixed(4)}, underExplored=${chance.underExplored}.`,
    action: "If this fails, gap ranking cannot tell a real shortfall from chance; treat gap generation as brainstorming only.",
  };
}

function buildReportGroundingGuardCheck(): EvaluationCheck {
  let caught = false;
  let message = "";
  try {
    assertCitationsInRange("This claim cites valid evidence [1] and invalid evidence [4].", 3);
  } catch (err) {
    caught = true;
    message = err instanceof Error ? err.message : String(err);
  }

  return {
    id: "report-grounding-guard",
    feature: "report",
    title: "Report citation guard rejects hallucinated evidence numbers",
    status: caught ? "pass" : "fail",
    score: caught ? 10 : 0,
    maxScore: 10,
    basis:
      "Report output must cite only the numbered retrieved evidence pack. Out-of-range citations indicate hallucination or prompt injection and are rejected.",
    evidence: caught ? `Guard caught out-of-range citation: ${message}` : "Guard did not reject citation [4] when only 3 evidence papers existed.",
    action: "If this fails, reports can cite papers that were never retrieved.",
  };
}

function buildPaperScoreRubricCheck(now: Date): EvaluationCheck {
  const currentYear = now.getUTCFullYear();
  const weak = computePaperScore(
    { publicationYear: currentYear - 16, citationCount: 0, dataQualityScore: 1 },
    currentYear,
    now.toISOString(),
  );
  const moderate = computePaperScore(
    { publicationYear: currentYear - 5, citationCount: 20, dataQualityScore: 1 },
    currentYear,
    now.toISOString(),
  );
  const strong = computePaperScore(
    { publicationYear: currentYear - 1, citationCount: 100, dataQualityScore: 1 },
    currentYear,
    now.toISOString(),
  );
  const ranks = [
    classifyPaperScoreRank(weak.finalScore).rank,
    classifyPaperScoreRank(moderate.finalScore).rank,
    classifyPaperScoreRank(strong.finalScore).rank,
  ];
  const pass = ranks.join(",") === "1,2,3";

  return {
    id: "paper-score-rubric",
    feature: "scoring",
    title: "Paper score rank 1-3 is explainable and reproducible",
    status: pass ? "pass" : "fail",
    score: pass ? 10 : 0,
    maxScore: 10,
    basis:
      "The rank is derived from deterministic backend paperScore, not an LLM opinion: OpenAlex-normalized citation impact when available, plus recency and a small metadata trust signal.",
    evidence: `Fixture scores weak=${weak.finalScore}->rank${ranks[0]}, moderate=${moderate.finalScore}->rank${ranks[1]}, strong=${strong.finalScore}->rank${ranks[2]}.`,
    action: "If this fails, the UI should not show score ranks until the rubric and formula are aligned.",
  };
}

function buildStructuredKnowledgeCoverageCheck(corpus: EvaluationCorpusMetrics): EvaluationCheck {
  const pass = corpus.analyzablePapers > 0 && corpus.aiAnalysisCoveragePct >= 70;
  const hasSomeCoverage = corpus.aiAnalysisCoveragePct > 0;

  return {
    id: "structured-knowledge-coverage",
    feature: "knowledge",
    title: "Structured paper knowledge coverage is high enough",
    status: pass ? "pass" : hasSomeCoverage ? "warn" : "fail",
    score: pass ? 10 : hasSomeCoverage ? Math.min(8, Math.max(1, Math.round(corpus.aiAnalysisCoveragePct / 10))) : 0,
    maxScore: 10,
    basis:
      "F2 structured knowledge makes downstream gaps, directions, reports, and chat smarter by extracting methods, findings, limitations, future work, and key terms once per paper.",
    evidence: `${corpus.aiAnalyzedPapers}/${corpus.analyzablePapers} analyzable papers have aiAnalysis (${corpus.aiAnalysisCoveragePct}%). Target: >=70%.`,
    action:
      "Run the paper-analysis worker/backfill before claiming the AI layer is strongly grounded in structured paper facts.",
  };
}

function buildReportCorpusGroundingCheck(corpus: EvaluationCorpusMetrics): EvaluationCheck {
  const hasReports = corpus.readyReports > 0;
  const pass = hasReports && corpus.reportGroundingCoveragePct >= 80;

  return {
    id: "report-corpus-grounding",
    feature: "report",
    title: "Saved reports keep grounding paper IDs",
    status: pass ? "pass" : "warn",
    score: pass ? 10 : hasReports ? 5 : 0,
    maxScore: 10,
    basis:
      "Production report correctness needs saved groundingPaperIds so users and reviewers can inspect what evidence the LLM received.",
    evidence: `${corpus.groundedReports}/${corpus.readyReports} ready reports have grounding paper IDs (${corpus.reportGroundingCoveragePct}%).`,
    action: "Generate reports after retrieval is healthy; inspect low-grounding reports before demos.",
  };
}

function buildReportCitationValidityCheck(corpus: EvaluationCorpusMetrics): EvaluationCheck {
  const hasGroundedReports = corpus.groundedReports > 0;
  const pass = hasGroundedReports && corpus.invalidCitationReports === 0;

  return {
    id: "report-saved-citation-validity",
    feature: "report",
    title: "Saved reports cite only their saved evidence pack",
    status: pass ? "pass" : hasGroundedReports ? "fail" : "warn",
    score: pass ? 10 : 0,
    maxScore: 10,
    basis:
      "A report is not fully trustworthy just because it stores groundingPaperIds. Its saved markdown must also avoid citations outside that evidence list.",
    evidence: `${corpus.invalidCitationReports}/${corpus.groundedReports} grounded ready reports contain out-of-range citations. Citation validity=${corpus.reportCitationValidityPct}%.`,
    action:
      "Regenerate or repair reports with invalid citations, and keep the runtime citation guard enabled for every report generation path.",
  };
}

function buildReportCitationCoverageCheck(corpus: EvaluationCorpusMetrics): EvaluationCheck {
  const hasReports = corpus.citationCoverageReports > 0;
  const pass = hasReports && corpus.avgCitationCoveragePct >= 70 && corpus.reportsWithUnsupportedPercents === 0;

  return {
    id: "report-citation-coverage",
    feature: "report",
    title: "Most report paragraphs carry a citation",
    status: pass ? "pass" : "warn",
    score: pass ? 10 : hasReports ? Math.min(9, Math.round(corpus.avgCitationCoveragePct / 10)) : 0,
    maxScore: 10,
    basis:
      "Valid citation numbers do not show that claims are cited. Coverage is the share of prose paragraphs and list items with at least one [n]; percentages in a report must also match the evidence or the trend metrics.",
    evidence: `Average citation coverage ${corpus.avgCitationCoveragePct}% over ${corpus.citationCoverageReports} ready reports (target >=70%); ${corpus.reportsWithUnsupportedPercents} reports state percentages not found in their evidence.`,
    action: "Inspect low-coverage reports and reports flagged with unmatched percentages before relying on them.",
  };
}

function buildGapCorpusEvidenceCheck(corpus: EvaluationCorpusMetrics): EvaluationCheck {
  const hasGaps = corpus.activeGaps > 0;
  const pass = hasGaps && corpus.gapEvidenceCoveragePct >= 70;

  return {
    id: "gap-corpus-evidence",
    feature: "gap",
    title: "Saved research gaps keep probe-backed quantitative signals",
    status: pass ? "pass" : "warn",
    score: pass ? 10 : hasGaps ? 5 : 0,
    maxScore: 10,
    basis:
      "A saved gap is easier to review when it carries supporting papers, a corpus-verifiable probe, and an evidenceConfidence ranking score, not just a fluent LLM description. These counts rank gaps; they do not prove a gap is open.",
    evidence: `${corpus.evidenceBackedGaps}/${corpus.activeGaps} active gaps carry a probe-backed ranking signal (${corpus.gapEvidenceCoveragePct}%).`,
    action: "Backfill or regenerate gaps through the probe-backed v2 evidence path and run a closure check before presenting a gap as open.",
  };
}

function resolveOverallStatus(
  overallScore: number,
  maxScore: number,
  corpus: EvaluationCorpusMetrics,
  checks: EvaluationCheck[],
): EvaluationSummary["overallStatus"] {
  if (corpus.totalPapers === 0 || corpus.analyzablePapers === 0) return "needs_data";
  if (checks.some((check) => check.status === "fail" || check.status === "warn")) return "at_risk";
  const ratio = maxScore === 0 ? 0 : overallScore / maxScore;
  return ratio >= 0.8 ? "healthy" : "at_risk";
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}
