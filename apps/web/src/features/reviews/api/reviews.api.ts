import type {
  AcademicReviewInput,
  ChangeReviewTemplateInput,
  EligibleReviewTemplatesPayload,
  ManuscriptSourceVersionLink,
  CreateReviewRequestInput,
  CreateReviewTemplateInput,
  ReviewAvailabilitySettings,
  ReviewIntegrityEvidenceMap,
  ReviewOpportunity,
  ReviewRequestStatus,
  ResubmitReviewRequestInput,
  ReviewTemplateSelectionState,
  ReviewTemplateSummary,
  ReviewTemplateVersionDetail,
  ReviewTemplateVersionInput,
} from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export interface ReviewAssignmentSummary {
  id: string;
  status: "assigned" | "accepted" | "declined" | "completed" | "cancelled";
  dueAt?: string;
  completedAt?: string;
  submissionId: {
    id: string;
    title: string;
    abstract?: string;
    submissionType?: string;
    researchField?: string;
    status: string;
    currentRevisionNumber: number;
    expectedReviewWorkload?: string;
  };
  review?: { status: "DRAFT" | "SUBMITTED"; roundNumber: number; updatedAt: string; submittedAt?: string };
}

export interface ReviewCenterItem {
  respondedAt?: string;
  origin?: string;
  mentorRelationshipActive?: boolean;
  id: string;
  status: ReviewRequestStatus;
  message?: string;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  requester: { id: string; fullName: string; avatarUrl?: string };
  reviewer: { id: string; fullName: string; avatarUrl?: string; institution?: string };
  assignment: { id: string; status: string; dueAt?: string };
  artifact: { submissionId: string; title: string; type?: string; projectId: string; projectTitle?: string; revisionId: string; revisionNumber: number; contentType: string; sourceReportId?: string };
  latestReview?: { id: string; roundNumber: number; status: string; overallAssessment?: string; submittedAt?: string };
}

export interface ReviewerCandidate {
  assignedMentor?: boolean;
  id: string;
  name: string;
  avatarUrl?: string;
  institution?: string;
  expertiseAreas: string[];
  availableForReview: boolean;
}

export interface PreviousReviewResponseItem {
  criterionKey: string;
  criterionTitle?: string;
  maxScore?: number;
  levelLabel?: string;
  comment: string;
  evidence?: string;
  assessment?: string;
  performanceLevelId?: string;
  score?: number;
  notApplicable: boolean;
}

export interface PreviousReviewRevisionItem {
  id: string;
  reviewId?: string;
  roundNumber?: number;
  revisionId?: string;
  revisionNumber?: number;
  priority?: "MAJOR" | "MINOR" | "SUGGESTION";
  criterionKey?: string;
  locator?: string;
  quotation?: string;
  description: string;
  status: string;
  createdAt?: string;
  responses: Array<{
    submissionRevisionId: string;
    submissionRevisionNumber?: number;
    responseText: string;
    status: string;
    createdAt?: string;
  }>;
}

export interface PreviousReviewRound {
  id: string;
  roundNumber: number;
  revisionId: string;
  revisionNumber?: number;
  reviewerName?: string;
  templateVersionId?: string;
  templateVersionNumber?: number;
  reviewMode?: string;
  guidelines?: string[];
  keyStrengths?: string;
  keyConcerns?: string;
  overallComment?: string;
  overallAssessment?: string;
  recommendation?: string;
  weightedScore?: number;
  integrityChecks?: AcademicReviewInput["integrityChecks"];
  responses?: PreviousReviewResponseItem[];
  revisionItems?: PreviousReviewRevisionItem[];
  submittedAt?: string;
}

export interface PreviousFeedbackPayload {
  assignmentId: string;
  submissionId: string;
  currentRoundNumber: number;
  currentRevisionId: string;
  rounds: PreviousReviewRound[];
}

export interface ReviewWorkspace {
  projectTitle?: string;
  delivery?: { sentAt: string; authors: string[] };
  comparisonVersions?: import("@trend/shared-types").ResearchVersion[];
  assignment: ReviewAssignmentSummary;
  request?: { id: string; origin?: string; status: ReviewRequestStatus; message?: string; dueAt?: string };
  review?: {
    recommendation?: string | null;
    integrityChecks?: AcademicReviewInput["integrityChecks"];
    id: string; status: "DRAFT" | "SUBMITTED"; roundNumber: number; keyStrengths?: string; keyConcerns?: string;
    overallComment?: string; overallAssessment?: AcademicReviewInput["overallAssessment"]; weightedScore?: number;
  };
  responses: Array<{ criterionKey: string; comment: string; evidence?: string; assessment?: string; performanceLevelId?: string; score?: number; notApplicable: boolean }>;
  requiredRevisions: Array<{ id: string; priority: "MAJOR" | "MINOR" | "SUGGESTION"; description: string; locator?: string; criterionKey?: string; quotation?: string; status: string; responses?: Array<{ submissionRevisionId: string; responseText: string; status: string }> }>;
  templateVersion?: ReviewTemplateVersionDetail;
  templateSelection?: ReviewTemplateSelectionState;
  criteria: ReviewTemplateVersionDetail["criteria"];
  artifactContent?: string;
  artifactRevision?: { id: string; revisionNumber: number; contentType: string };
  manuscriptSource?: ManuscriptSourceVersionLink;
  integrityEvidence?: ReviewIntegrityEvidenceMap;
  previousReviews?: PreviousReviewRound[];
  previousRevisionItems: PreviousReviewRevisionItem[];
  roundNumber: number;
}

export interface ReviewRequestDetail extends ReviewCenterItem {
  canRespond?: boolean;
  templateVersion: ReviewTemplateVersionDetail;
  templateSelection?: ReviewTemplateSelectionState;
  artifactContent?: string;
  reviews: Array<{
    assignmentId?: string; templateVersionId?: string;
    artifactRevision?: { id: string; revisionNumber: number; contentType: string };
    templateVersion?: ReviewTemplateVersionDetail;
    id: string; revisionId: string; weightedScore?: number | null; roundNumber: number; status: string; keyStrengths?: string; keyConcerns?: string; overallComment?: string;
    recommendation?: string | null;
    integrityChecks?: AcademicReviewInput["integrityChecks"];
    overallAssessment?: string; submittedAt?: string; responses: ReviewWorkspace["responses"];
    requiredRevisions: Array<{ id: string; priority: "MAJOR" | "MINOR" | "SUGGESTION"; description: string; locator?: string; criterionKey?: string; quotation?: string; status: string; responses?: Array<{ submissionRevisionId: string; responseText: string; status: string }> }>;
  }>;
}

export const reviewsApi = {
  async saveResponseDrafts(requestId: string, input: ResubmitReviewRequestInput): Promise<void> { await api.put(`/review-requests/${encodeURIComponent(requestId)}/responses`, input); },
  async verifyRevision(requestId: string, itemId: string, status: "ACCEPTED" | "REOPENED", expectedRevisionId?: string): Promise<void> { await api.patch(API_ROUTES.reviewRequests.revisionItem(requestId, itemId), { status, expectedRevisionId }); },
  async availability(): Promise<ReviewAvailabilitySettings> { const response = await api.get(API_ROUTES.reviewAvailability.mine); return response.data.data; },
  async updateAvailability(input: Omit<ReviewAvailabilitySettings, "activeReviewCount">): Promise<ReviewAvailabilitySettings> { const response = await api.put(API_ROUTES.reviewAvailability.mine, input); return response.data.data; },
  async opportunities(params: Record<string, string | undefined> = {}): Promise<{ availability: ReviewAvailabilitySettings; opportunities: ReviewOpportunity[] }> { const response = await api.get(API_ROUTES.reviewOpportunities.list, { params }); return response.data.data; },
  async acceptOpportunity(submissionId: string): Promise<void> { await api.post(API_ROUTES.reviewOpportunities.accept(submissionId), {}); },
  async declareConflict(submissionId: string, reason: string): Promise<void> { await api.post(API_ROUTES.reviewOpportunities.conflict(submissionId), { reason }); },
  async listAssignments(): Promise<ReviewAssignmentSummary[]> { const response = await api.get(API_ROUTES.reviews.list); return response.data.data; },
  async detail(assignmentId: string): Promise<ReviewWorkspace> { const response = await api.get(API_ROUTES.reviews.detail(assignmentId)); return response.data.data; },
  async previousFeedback(assignmentId: string, signal?: AbortSignal): Promise<PreviousFeedbackPayload> { const response = await api.get(API_ROUTES.reviews.previousFeedback(assignmentId), { signal }); return response.data.data; },
  async save(assignmentId: string, input: AcademicReviewInput): Promise<ReviewWorkspace> { const response = await api.put(API_ROUTES.reviews.save(assignmentId), input); return response.data.data; },
  async submit(assignmentId: string, input: AcademicReviewInput): Promise<ReviewWorkspace> { const response = await api.post(API_ROUTES.reviews.submit(assignmentId), input); return response.data.data; },
  async templates(options: { includeArchived?: boolean } = {}): Promise<ReviewTemplateSummary[]> {
    const response = await api.get(API_ROUTES.reviewTemplates.list, {
      params: options.includeArchived ? { includeArchived: "true" } : undefined,
    });
    return response.data.data;
  },
  async template(templateId: string): Promise<ReviewTemplateSummary & { versions: ReviewTemplateVersionDetail[] }> { const response = await api.get(API_ROUTES.reviewTemplates.detail(templateId)); return response.data.data; },
  async createTemplate(input: CreateReviewTemplateInput): Promise<ReviewTemplateSummary> { const response = await api.post(API_ROUTES.reviewTemplates.list, input); return response.data.data; },
  async saveTemplateVersion(templateId: string, input: ReviewTemplateVersionInput): Promise<ReviewTemplateVersionDetail> { const response = await api.put(API_ROUTES.reviewTemplates.versions(templateId), input); return response.data.data; },
  async publishTemplate(templateId: string): Promise<ReviewTemplateSummary> { const response = await api.post(API_ROUTES.reviewTemplates.publish(templateId), {}); return response.data.data; },
  async duplicateTemplate(templateId: string): Promise<ReviewTemplateSummary> { const response = await api.post(API_ROUTES.reviewTemplates.duplicate(templateId), {}); return response.data.data; },
  async archiveTemplate(templateId: string): Promise<void> { await api.post(API_ROUTES.reviewTemplates.archive(templateId), {}); },
  async center(): Promise<{ incoming: ReviewCenterItem[]; sent: ReviewCenterItem[] }> { const response = await api.get(API_ROUTES.reviewRequests.list); return response.data.data; },
  async requestDetail(requestId: string): Promise<ReviewRequestDetail> { const response = await api.get(API_ROUTES.reviewRequests.detail(requestId)); return response.data.data; },
  async eligibleTemplates(requestId: string): Promise<EligibleReviewTemplatesPayload> { const response = await api.get(API_ROUTES.reviewRequests.eligibleTemplates(requestId)); return response.data.data; },
  async changeRequestTemplate(requestId: string, input: ChangeReviewTemplateInput): Promise<ReviewRequestDetail> { const response = await api.patch(API_ROUTES.reviewRequests.changeTemplate(requestId), input); return response.data.data; },
  async reviewerCandidates(q?: string, scope: { reportId?: string; submissionId?: string } = {}): Promise<ReviewerCandidate[]> { const response = await api.get(API_ROUTES.reviewRequests.reviewers, { params: { ...(q ? { q } : {}), ...(scope.reportId ? { reportId: scope.reportId } : {}), ...(scope.submissionId ? { submissionId: scope.submissionId } : {}) } }); return response.data.data; },
  async createRequest(input: CreateReviewRequestInput): Promise<ReviewCenterItem> { const response = await api.post(API_ROUTES.reviewRequests.list, input); return response.data.data; },
  async acceptRequest(requestId: string): Promise<void> { await api.post(API_ROUTES.reviewRequests.accept(requestId), {}); },
  async declineRequest(requestId: string, reason?: string): Promise<void> { await api.post(API_ROUTES.reviewRequests.decline(requestId), { reason }); },
  async cancelRequest(requestId: string): Promise<void> { await api.post(API_ROUTES.reviewRequests.cancel(requestId), {}); },
  async resubmit(requestId: string, input: ResubmitReviewRequestInput): Promise<void> { await api.post(API_ROUTES.reviewRequests.resubmit(requestId), input); },
};
