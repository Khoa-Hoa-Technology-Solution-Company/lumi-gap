import type { ISODateString } from "./common.js";

export type SubmissionType =
  | "RESEARCH_PROPOSAL"
  | "LITERATURE_REVIEW"
  | "THESIS_DRAFT"
  | "RESEARCH_PAPER"
  | "SOFTWARE_RESEARCH_PROJECT";

export type SubmissionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "AI_PRE_REVIEW"
  | "READY_FOR_REVIEW"
  | "UNDER_REVIEW"
  | "REVISION_REQUESTED"
  | "REVISED"
  | "COMPLETED"
  | "REJECTED"
  | "WITHDRAWN";

export interface ReviewAvailabilitySettings {
  availableForReview: boolean;
  acceptedFields: string[];
  acceptedTopics: string[];
  acceptedSubmissionTypes: SubmissionType[];
  maximumActiveReviews: number;
  preferredReviewWorkload?: string;
  availabilityNote?: string;
  temporarilyUnavailableUntil?: ISODateString;
  autoRecommendationEnabled: boolean;
  activeReviewCount: number;
}

export interface ReviewOpportunity {
  id: string;
  title: string;
  abstract?: string;
  submissionType?: SubmissionType;
  researchField?: string;
  researchGoal?: string;
  claimedResearchGap?: string;
  methodology?: string;
  keywords: string[];
  status: SubmissionStatus;
  currentRevisionNumber: number;
  expectedWorkload?: string;
  matchReasons: string[];
  matchScore: number;
  submittedAt: ISODateString;
  authorVisibility: "DOUBLE_BLIND";
}

export interface StructuredSubmissionInput {
  projectId: string;
  title: string;
  abstract?: string;
  submissionType?: SubmissionType;
  researchField?: string;
  researchGoal?: string;
  researchQuestions?: string[];
  claimedResearchGap?: string;
  claimedContribution?: string;
  methodology?: string;
  scope?: string;
  keywords?: string[];
  expectedReviewWorkload?: string;
  authorIds?: string[];
  declaredConflictUserIds?: string[];
}

export type HumanReviewRecommendation =
  | "ACCEPT"
  | "MINOR_REVISION"
  | "MAJOR_REVISION"
  | "REJECT";

export interface ReviewCriterionDefinition {
  id: string;
  key: string;
  label: string;
  description?: string;
  order: number;
}

export interface ReviewResponseInput {
  criterionKey: string;
  comment: string;
  evidence?: string;
  rating?: number;
}

export interface HumanReviewInput {
  overallComment: string;
  recommendation: HumanReviewRecommendation;
  responses: ReviewResponseInput[];
}

export type ContributionVerificationStatus =
  | "SELF_DECLARED"
  | "PENDING_CONFIRMATION"
  | "VERIFIED_BY_LUMIGAP"
  | "EXTERNALLY_VERIFIED"
  | "REJECTED";
