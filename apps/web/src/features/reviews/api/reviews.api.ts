import type {
  AcademicReviewInput,
  CreateReviewRequestInput,
  CreateReviewTemplateInput,
  ReviewAvailabilitySettings,
  ReviewOpportunity,
  ReviewRequestStatus,
  ResubmitReviewRequestInput,
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
  artifact: { submissionId: string; title: string; type?: string; projectId: string; revisionId: string; revisionNumber: number; contentType: string };
  latestReview?: { id: string; roundNumber: number; status: string; overallAssessment?: string; submittedAt?: string };
}

export interface ReviewerCandidate {
  id: string;
  name: string;
  avatarUrl?: string;
  institution?: string;
  expertiseAreas: string[];
  availableForReview: boolean;
}

export interface ReviewWorkspace {
  assignment: ReviewAssignmentSummary;
  request?: { id: string; status: ReviewRequestStatus; message?: string; dueAt?: string };
  review?: {
    id: string; status: "DRAFT" | "SUBMITTED"; roundNumber: number; keyStrengths?: string; keyConcerns?: string;
    overallComment?: string; overallAssessment?: AcademicReviewInput["overallAssessment"]; weightedScore?: number;
  };
  responses: Array<{ criterionKey: string; comment: string; evidence?: string; assessment?: string; performanceLevelId?: string; score?: number; notApplicable: boolean }>;
  requiredRevisions: Array<{ id: string; priority: "MINOR" | "MAJOR"; description: string; status: string }>;
  templateVersion?: ReviewTemplateVersionDetail;
  criteria: ReviewTemplateVersionDetail["criteria"];
  artifactContent?: string;
  roundNumber: number;
}

export interface ReviewRequestDetail extends ReviewCenterItem {
  templateVersion: ReviewTemplateVersionDetail;
  artifactContent?: string;
  reviews: Array<{
    id: string; roundNumber: number; status: string; keyStrengths?: string; keyConcerns?: string; overallComment?: string;
    overallAssessment?: string; submittedAt?: string; responses: ReviewWorkspace["responses"];
    requiredRevisions: Array<{ id: string; priority: "MINOR" | "MAJOR"; description: string; status: string }>;
  }>;
}

export const reviewsApi = {
  async availability(): Promise<ReviewAvailabilitySettings> { const response = await api.get(API_ROUTES.reviewAvailability.mine); return response.data.data; },
  async updateAvailability(input: Omit<ReviewAvailabilitySettings, "activeReviewCount">): Promise<ReviewAvailabilitySettings> { const response = await api.put(API_ROUTES.reviewAvailability.mine, input); return response.data.data; },
  async opportunities(params: Record<string, string | undefined> = {}): Promise<{ availability: ReviewAvailabilitySettings; opportunities: ReviewOpportunity[] }> { const response = await api.get(API_ROUTES.reviewOpportunities.list, { params }); return response.data.data; },
  async acceptOpportunity(submissionId: string): Promise<void> { await api.post(API_ROUTES.reviewOpportunities.accept(submissionId), {}); },
  async declareConflict(submissionId: string, reason: string): Promise<void> { await api.post(API_ROUTES.reviewOpportunities.conflict(submissionId), { reason }); },
  async listAssignments(): Promise<ReviewAssignmentSummary[]> { const response = await api.get(API_ROUTES.reviews.list); return response.data.data; },
  async detail(assignmentId: string): Promise<ReviewWorkspace> { const response = await api.get(API_ROUTES.reviews.detail(assignmentId)); return response.data.data; },
  async save(assignmentId: string, input: AcademicReviewInput): Promise<ReviewWorkspace> { const response = await api.put(API_ROUTES.reviews.save(assignmentId), input); return response.data.data; },
  async submit(assignmentId: string, input: AcademicReviewInput): Promise<ReviewWorkspace> { const response = await api.post(API_ROUTES.reviews.submit(assignmentId), input); return response.data.data; },
  async templates(): Promise<ReviewTemplateSummary[]> { const response = await api.get(API_ROUTES.reviewTemplates.list); return response.data.data; },
  async template(templateId: string): Promise<ReviewTemplateSummary & { versions: ReviewTemplateVersionDetail[] }> { const response = await api.get(API_ROUTES.reviewTemplates.detail(templateId)); return response.data.data; },
  async createTemplate(input: CreateReviewTemplateInput): Promise<ReviewTemplateSummary> { const response = await api.post(API_ROUTES.reviewTemplates.list, input); return response.data.data; },
  async saveTemplateVersion(templateId: string, input: ReviewTemplateVersionInput): Promise<ReviewTemplateVersionDetail> { const response = await api.put(API_ROUTES.reviewTemplates.versions(templateId), input); return response.data.data; },
  async publishTemplate(templateId: string): Promise<ReviewTemplateSummary> { const response = await api.post(API_ROUTES.reviewTemplates.publish(templateId), {}); return response.data.data; },
  async duplicateTemplate(templateId: string): Promise<ReviewTemplateSummary> { const response = await api.post(API_ROUTES.reviewTemplates.duplicate(templateId), {}); return response.data.data; },
  async archiveTemplate(templateId: string): Promise<void> { await api.post(API_ROUTES.reviewTemplates.archive(templateId), {}); },
  async center(): Promise<{ incoming: ReviewCenterItem[]; sent: ReviewCenterItem[] }> { const response = await api.get(API_ROUTES.reviewRequests.list); return response.data.data; },
  async requestDetail(requestId: string): Promise<ReviewRequestDetail> { const response = await api.get(API_ROUTES.reviewRequests.detail(requestId)); return response.data.data; },
  async reviewerCandidates(q?: string): Promise<ReviewerCandidate[]> { const response = await api.get(API_ROUTES.reviewRequests.reviewers, { params: q ? { q } : undefined }); return response.data.data; },
  async createRequest(input: CreateReviewRequestInput): Promise<ReviewCenterItem> { const response = await api.post(API_ROUTES.reviewRequests.list, input); return response.data.data; },
  async acceptRequest(requestId: string): Promise<void> { await api.post(API_ROUTES.reviewRequests.accept(requestId), {}); },
  async declineRequest(requestId: string, reason?: string): Promise<void> { await api.post(API_ROUTES.reviewRequests.decline(requestId), { reason }); },
  async cancelRequest(requestId: string): Promise<void> { await api.post(API_ROUTES.reviewRequests.cancel(requestId), {}); },
  async resubmit(requestId: string, input: ResubmitReviewRequestInput): Promise<void> { await api.post(API_ROUTES.reviewRequests.resubmit(requestId), input); },
};
