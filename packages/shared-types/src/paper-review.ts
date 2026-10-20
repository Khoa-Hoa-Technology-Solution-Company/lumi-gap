export interface ReviewQuote {
  text: string;
  page: number;
}

export type ReviewIssueClassification = "Confirmed issue" | "Potential issue" | "Missing information" | "Reviewer suggestion";
export type ReviewIssueSeverity = "critical" | "high" | "medium" | "low";

export interface ReviewIssue {
  category: "novelty" | "methodology" | "experiment" | "reproducibility" | "writing" | "references";
  classification: ReviewIssueClassification;
  severity: ReviewIssueSeverity;
  finding: string;
  evidence: string;
  recommendation: string;
  quotes: ReviewQuote[];
}

export interface ReviewClaim {
  claim: string;
  evidence: string;
  assessment: "Supported" | "Partially Supported" | "Unsupported" | "Cannot Assess";
  quotes: ReviewQuote[];
}

export interface ReviewCriterionAnalysis {
  score: number;
  assessable: boolean;
  evidence: { en: string; vi: string };
  explanation: { en: string; vi: string };
  quotes: ReviewQuote[];
}

/** Evidence-checked findings stored with an AI paper review. Quotes were verified against the PDF text. */
export interface PaperReviewAnalysis {
  issues: ReviewIssue[];
  claims: ReviewClaim[];
  reproducibility?: { score: number; available: string[]; missing: string[] } | null;
  validation_warnings: string[];
  criteria?: Record<string, ReviewCriterionAnalysis>;
}
