import type { StructuredSubmissionInput, SubmissionStatus, SubmissionType, SubmissionHistory } from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

// A disconnected API must expose retry instead of leaving this workspace loading indefinitely.
const readOptions = (signal?: AbortSignal) => ({ signal, timeout: 20_000 });

export interface ActiveMentorOption {
  id: string;
  fullName: string;
  email: string;
  institution?: string;
  avatarUrl?: string | null;
  mentorRole: string;
}

export interface MentorFeedbackPayload {
  result: "FEEDBACK_GIVEN" | "REVISION_REQUESTED" | "READY_TO_ADVANCE";
  overallComment: string;
  paragraphComments?: Array<{ criterionKey?: string; comment: string; evidence?: string }>;
  requestedInformation?: string;
}
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
  status: string;
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
  id: string;
  sourceRevisionId?: string;
  sourceRevisionNumber?: number;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  provider?: string;
  model?: string;
  summary?: string;
  goalAlignment?: { assessment: string; evidence_ids: string[] };
  rqCoverage: Array<{ research_question: string; assessment: string; evidence_ids: string[] }>;
  unsupportedClaims: Array<{ claim: string; quote?: string; reason: string; evidence_ids: string[] }>;
  citationIssues: string[];
  contributionComparison?: string;
  reviewFocusAreas: string[];
  limitations: string[];
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export const submissionsApi = {
  async history(id: string, signal?: AbortSignal): Promise<SubmissionHistory> { return (await api.get(API_ROUTES.submissions.history(id), readOptions(signal))).data.data; },
  async createVersion(id: string, input: { content?: string; sourceRevisionId?: string; expectedRevisionNumber: number; summary: string }): Promise<void> { await api.post(API_ROUTES.submissions.versions(id), input); },
  async setOpenForReview(id: string, enabled: boolean): Promise<void> { await api.patch(API_ROUTES.submissions.openReview(id), { enabled }); },
  async list(projectId?: string, signal?: AbortSignal): Promise<SubmissionSummary[]> {
    const response = await api.get(API_ROUTES.submissions.list, { ...readOptions(signal), params: projectId ? { projectId } : undefined });
    return response.data.data;
  },
  async detail(id: string, projectId?: string, signal?: AbortSignal): Promise<SubmissionSummary> {
    const response = await api.get(API_ROUTES.submissions.detail(id), { ...readOptions(signal), params: projectId ? { projectId } : undefined });
    return response.data.data;
  },
  async revisions(id: string, signal?: AbortSignal): Promise<SubmissionRevision[]> {
    const response = await api.get(API_ROUTES.submissions.revisions(id), readOptions(signal));
    return response.data.data;
  },
  async activeMentors(projectId: string): Promise<ActiveMentorOption[]> {
    const response = await api.get("/submissions/active-mentors", { params: { projectId } });
    return response.data.data;
  },
  async submitFeedback(id: string, payload: MentorFeedbackPayload): Promise<void> {
    await api.post(`/submissions/${id}/feedback`, payload);
  },
  async create(input: StructuredSubmissionInput & { mentorId?: string; contentSnapshot?: string; message?: string }, file?: File): Promise<{ submission: SubmissionSummary; revision: SubmissionRevision }> {
    const body = new FormData();
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      body.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
    }
    if (file) body.append("pdf", file);
    const response = await api.post(API_ROUTES.submissions.create, body);
    return response.data.data;
  },
  async addRevision(id: string, file: File, responseToReview?: string): Promise<void> {
    const body = new FormData();
    body.append("pdf", file);
    if (responseToReview) body.append("responseToReview", responseToReview);
    await api.post(API_ROUTES.submissions.revisions(id), body);
  },
  async aiPreReviews(id: string, signal?: AbortSignal): Promise<AiPreReview[]> {
    const response = await api.get(API_ROUTES.submissions.aiPreReviews(id), readOptions(signal));
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
