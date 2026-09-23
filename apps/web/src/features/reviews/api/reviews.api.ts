import type { HumanReviewInput, ReviewAvailabilitySettings, ReviewOpportunity } from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export interface ReviewAssignmentSummary {
  _id: string;
  status: "assigned" | "accepted" | "declined" | "completed";
  dueAt?: string;
  completedAt?: string;
  submissionId: {
    _id: string;
    title: string;
    abstract?: string;
    submissionType?: string;
    researchField?: string;
    status: string;
    currentRevisionNumber: number;
    expectedReviewWorkload?: string;
  };
  review?: { status: "DRAFT" | "SUBMITTED"; updatedAt: string; submittedAt?: string };
}

export interface ReviewWorkspace {
  assignment: ReviewAssignmentSummary;
  review?: { status: "DRAFT" | "SUBMITTED"; overallComment?: string; recommendation?: HumanReviewInput["recommendation"] };
  responses: Array<{ criterionKey: string; comment: string; evidence?: string; rating?: number }>;
  criteria: Array<{ key: string; label: string; description: string; order: number }>;
}

export const reviewsApi = {
  async availability(): Promise<ReviewAvailabilitySettings> {
    const response = await api.get(API_ROUTES.reviewAvailability.mine);
    return response.data.data;
  },
  async updateAvailability(input: Omit<ReviewAvailabilitySettings, "activeReviewCount">): Promise<ReviewAvailabilitySettings> {
    const response = await api.put(API_ROUTES.reviewAvailability.mine, input);
    return response.data.data;
  },
  async opportunities(params: Record<string, string | undefined> = {}): Promise<{ availability: ReviewAvailabilitySettings; opportunities: ReviewOpportunity[] }> {
    const response = await api.get(API_ROUTES.reviewOpportunities.list, { params });
    return response.data.data;
  },
  async accept(submissionId: string): Promise<void> {
    await api.post(API_ROUTES.reviewOpportunities.accept(submissionId), {});
  },
  async declareConflict(submissionId: string, reason: string): Promise<void> {
    await api.post(API_ROUTES.reviewOpportunities.conflict(submissionId), { reason });
  },
  async list(): Promise<ReviewAssignmentSummary[]> {
    const response = await api.get(API_ROUTES.reviews.list);
    return response.data.data;
  },
  async detail(assignmentId: string): Promise<ReviewWorkspace> {
    const response = await api.get(API_ROUTES.reviews.detail(assignmentId));
    return response.data.data;
  },
  async save(assignmentId: string, input: HumanReviewInput): Promise<ReviewWorkspace> {
    const response = await api.put(API_ROUTES.reviews.save(assignmentId), input);
    return response.data.data;
  },
  async submit(assignmentId: string, input: HumanReviewInput): Promise<ReviewWorkspace> {
    const response = await api.post(API_ROUTES.reviews.submit(assignmentId), input);
    return response.data.data;
  },
};
