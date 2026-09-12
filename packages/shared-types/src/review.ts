// Shared types for AI Scientific Paper Reviewer and Format Checker

export type ReviewStrictness = "lenient" | "balanced" | "strict";

export type ReviewRecommendation =
  | "Strong Reject"
  | "Reject"
  | "Borderline"
  | "Accept"
  | "Strong Accept";

export interface BilingualText {
  en: string;
  vi: string;
}

export interface CriterionScore {
  score: number;
  comment: BilingualText;
}

export interface ReviewScores {
  scientific_quality: CriterionScore;
  originality: CriterionScore;
  quality_of_writing: CriterionScore;
  topical_suitability: CriterionScore;
  completeness_of_references: CriterionScore;
  innovation_potential: CriterionScore;
  implementation_viability: CriterionScore;
  personal_expertise: CriterionScore;
}

export interface PaperReviewSummary {
  strengths: BilingualText[];
  weaknesses: BilingualText[];
  detailed_feedback: BilingualText;
}

export interface PaperProfileExtracted {
  title?: string;
  authors?: string;
  paper_type?: string;
  abstract?: string;
}

export interface PaperReviewResult {
  id?: string;
  paperId?: string;
  userId?: string;
  strictness: ReviewStrictness;
  model: string;
  recommendation: ReviewRecommendation;
  scores: ReviewScores;
  profile: PaperProfileExtracted;
  bilingualReview: PaperReviewSummary;
  reportMarkdown: string;
  artifactsDir?: string;
  createdAt?: string;
}

export interface FormatCheckResult {
  preset: string;
  passed: boolean;
  summary: string;
  measurements: Record<string, unknown>;
  reportMarkdown: string;
}

export interface FormatPresetInfo {
  name: string;
  description: string;
  source_url?: string;
}
