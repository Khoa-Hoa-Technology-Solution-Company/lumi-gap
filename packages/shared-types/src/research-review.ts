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

export type AcademicReviewMode =
  | "GUIDED_FEEDBACK"
  | "STRUCTURED_REVIEW"
  | "RUBRIC_ASSESSMENT";

export type ReviewTemplateSource = "SYSTEM" | "PERSONAL" | "PROJECT";
export type ReviewTemplateStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ReviewRequestStatus =
  | "REQUESTED"
  | "ACCEPTED"
  | "IN_REVIEW"
  | "SUBMITTED"
  | "REVISION_REQUESTED"
  | "RESUBMITTED"
  | "COMPLETED"
  | "DECLINED"
  | "CANCELLED"
  | "EXPIRED";

export type StructuredAssessment =
  | "MAJOR_ISSUES"
  | "NEEDS_IMPROVEMENT"
  | "ADEQUATE"
  | "STRONG"
  | "NOT_APPLICABLE";

export type OverallAcademicAssessment =
  | "STRONG"
  | "MINOR_REVISION"
  | "MAJOR_REVISION"
  | "NOT_READY";

export type ReviewRevisionStatus = "OPEN" | "ADDRESSED" | "ACCEPTED" | "REOPENED";

export interface ReviewCriterionLevelInput {
  label: string;
  description?: string;
  score: number;
}

export interface ReviewTemplateCriterionInput {
  key?: string;
  title: string;
  description?: string;
  required: boolean;
  allowNotApplicable: boolean;
  weight?: number;
  levels?: ReviewCriterionLevelInput[];
}

export interface ReviewTemplateVersionInput {
  reviewMode: AcademicReviewMode;
  description?: string;
  guidelines: string[];
  criteria: ReviewTemplateCriterionInput[];
}

export interface CreateReviewTemplateInput extends ReviewTemplateVersionInput {
  name: string;
  artifactType?: string;
  source: ReviewTemplateSource;
  projectId?: string;
  publish?: boolean;
}

export interface ReviewTemplateSummary {
  id: string;
  name: string;
  source: ReviewTemplateSource;
  artifactType?: string;
  status: ReviewTemplateStatus;
  ownerId?: string;
  projectId?: string;
  activeVersion?: ReviewTemplateVersionDetail;
  updatedAt: ISODateString;
}

export interface ReviewTemplateVersionDetail {
  id: string;
  versionNumber: number;
  reviewMode: AcademicReviewMode;
  description?: string;
  guidelines: string[];
  status: "DRAFT" | "PUBLISHED";
  publishedAt?: ISODateString;
  criteria: Array<Omit<ReviewTemplateCriterionInput, "levels"> & {
    id: string;
    key: string;
    order: number;
    levels: Array<ReviewCriterionLevelInput & { id: string; position: number }>;
  }>;
}

export interface CreateReviewRequestInput {
  submissionId?: string;
  reportId?: string;
  reviewerId: string;
  templateVersionId: string;
  message?: string;
  dueAt?: ISODateString;
}

export interface ResubmitReviewRequestInput {
  revisionId?: string;
  reportId?: string;
  responses: Array<{ revisionItemId: string; responseText: string }>;
}

export interface ReviewCriterionResponseInput {
  criterionKey: string;
  comment?: string;
  evidence?: string;
  assessment?: StructuredAssessment;
  performanceLevelId?: string;
  notApplicable?: boolean;
}

export interface RequiredRevisionInput {
  priority: "MINOR" | "MAJOR";
  description: string;
}

export interface AcademicReviewInput {
  keyStrengths?: string;
  keyConcerns?: string;
  overallComment?: string;
  overallAssessment?: OverallAcademicAssessment;
  responses: ReviewCriterionResponseInput[];
  requiredRevisions?: RequiredRevisionInput[];
}

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
