export type EvaluationStatus = "pass" | "warn" | "fail";
export type EvaluationOverallStatus = "healthy" | "needs_data" | "at_risk";

export interface EvaluationScoreBand {
  rank: 1 | 2 | 3;
  label: string;
  range: string;
  meaning: string;
}

export interface EvaluationRubric {
  paperScoreFormula: string;
  scoreBands: EvaluationScoreBand[];
}

export interface EvaluationCorpusMetrics {
  totalPapers: number;
  activePapers: number;
  analyzablePapers: number;
  embeddedPapers: number;
  aiAnalyzedPapers: number;
  readyReports: number;
  groundedReports: number;
  invalidCitationReports: number;
  activeGaps: number;
  evidenceBackedGaps: number;
  embeddingCoveragePct: number;
  aiAnalysisCoveragePct: number;
  reportGroundingCoveragePct: number;
  reportCitationValidityPct: number;
  gapEvidenceCoveragePct: number;
}

export interface EvaluationCheck {
  id: string;
  feature: "search" | "trend" | "gap" | "report" | "scoring" | "knowledge";
  title: string;
  status: EvaluationStatus;
  score: number;
  maxScore: number;
  basis: string;
  evidence: string;
  action: string;
}

export interface EvaluationSummary {
  generatedAt: string;
  overallStatus: EvaluationOverallStatus;
  overallScore: number;
  maxScore: number;
  rubric: EvaluationRubric;
  corpus: EvaluationCorpusMetrics;
  checks: EvaluationCheck[];
}
