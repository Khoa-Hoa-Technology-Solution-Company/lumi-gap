import type { StructuredSubmissionInput, SubmissionStatus, SubmissionType, SubmissionHistory } from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export interface SubmissionSummary {
  _id: string;
  projectId: string;
  title: string;
  abstract?: string;
  submissionType?: SubmissionType;
  researchField?: string;
  researchGoal?: string;
  researchQuestions: string[];
  claimedResearchGap?: string;
  claimedContribution?: string;
  methodology?: string;
  scope?: string;
  keywords: string[];
  expectedReviewWorkload?: string;
  status: Lowercase<SubmissionStatus> | "accepted";
  currentRevisionNumber: number;
  currentRevisionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionRevision {
  _id: string;
  contentType?: string;
  contentSnapshot?: string;
  submissionId: string;
  revisionNumber: number;
  responseToReview?: string;
  checksumSha256?: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AiPreReview {
  _id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  provider?: string;
  model?: string;
  summary?: string;
  goalAlignment?: { assessment: string; evidence_ids: string[] };
  rqCoverage: Array<{ research_question: string; assessment: string; evidence_ids: string[] }>;
  unsupportedClaims: Array<{ claim: string; reason: string; evidence_ids: string[] }>;
  citationIssues: string[];
  contributionComparison?: string;
  reviewFocusAreas: string[];
  limitations: string[];
  createdAt: string;
  completedAt?: string;
}

export const submissionsApi = {
  async history(id: string): Promise<SubmissionHistory> { return (await api.get(API_ROUTES.submissions.history(id))).data.data; },
  async createVersion(id: string, input: { content?: string; sourceRevisionId?: string; expectedRevisionNumber: number; summary: string }): Promise<void> { await api.post(API_ROUTES.submissions.versions(id), input); },
  async setOpenForReview(id: string, enabled: boolean): Promise<void> { await api.patch(API_ROUTES.submissions.openReview(id), { enabled }); },
  async list(): Promise<SubmissionSummary[]> {
    const response = await api.get(API_ROUTES.submissions.list);
    return response.data.data;
  },
  async detail(id: string): Promise<SubmissionSummary> {
    const response = await api.get(API_ROUTES.submissions.detail(id));
    return response.data.data;
  },
  async revisions(id: string): Promise<SubmissionRevision[]> {
    const response = await api.get(API_ROUTES.submissions.revisions(id));
    return response.data.data;
  },
  async create(input: StructuredSubmissionInput, file: File): Promise<{ submission: SubmissionSummary; revision: SubmissionRevision }> {
    const body = new FormData();
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      body.append(key, Array.isArray(value) ? JSON.stringify(value) : value);
    }
    body.append("file", file);
    const response = await api.post(API_ROUTES.submissions.create, body);
    return response.data.data;
  },
  async addRevision(id: string, file: File, responseToReview?: string): Promise<void> {
    const body = new FormData();
    body.append("file", file);
    if (responseToReview) body.append("responseToReview", responseToReview);
    await api.post(API_ROUTES.submissions.revisions(id), body);
  },
  async aiPreReviews(id: string): Promise<AiPreReview[]> {
    const response = await api.get(API_ROUTES.submissions.aiPreReviews(id));
    return response.data.data;
  },
  async runAiPreReview(id: string): Promise<AiPreReview> {
    const response = await api.post(API_ROUTES.submissions.runAiPreReview(id), {});
    return response.data.data;
  },
  async downloadRevision(id: string, revisionId: string, revisionNumber: number) {
    const response = await api.get(API_ROUTES.submissions.revisionDownload(id, revisionId), { responseType: "blob" });
    const url = URL.createObjectURL(response.data as Blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `submission-revision-${revisionNumber}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  },
};
