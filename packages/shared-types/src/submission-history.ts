export interface SubmittedVersionReviewResponse {
  criterionKey: string;
  criterionTitle?: string | null;
  weight?: number | null;
  maxScore?: number | null;
  comment: string;
  evidence: string | null;
  assessment: string | null;
  score: number | null;
  notApplicable: boolean;
}

export interface SubmittedVersionRevisionItem {
  id: string;
  description: string;
  priority: string;
  status: string;
  criterionKey?: string | null;
  locator?: string | null;
  quotation?: string | null;
  createdAt?: string | null;
  responses: Array<{
    id?: string;
    submissionRevisionId: string;
    responseText: string;
    status: string;
    createdAt?: string | null;
  }>;
}

export interface SubmittedVersionReview {
  id: string;
  reviewerId: string;
  reviewerName: string;
  reviewerAcademicRole: string | null;
  revisionId: string;
  roundNumber: number;
  templateVersionId: string | null;
  reviewMode?: string | null;
  weightedScore: number | null;
  overallAssessment: string | null;
  keyStrengths: string | null;
  keyConcerns: string | null;
  overallComment: string | null;
  integrityChecks?: Record<string, { status: string; note?: string }> | null;
  submittedAt: string | null;
  requestId?: string | null;
  responses: SubmittedVersionReviewResponse[];
  requiredRevisions: SubmittedVersionRevisionItem[];
}

export interface ResearchVersion {
  id: string;
  revisionNumber: number;
  contentType: string;
  contentSnapshot: string | null;
  checksumSha256: string | null;
  sizeBytes: number;
  originalFileName?: string | null;
  sourceRevisionId: string | null;
  manuscriptSnapshotId?: string | null;
  responseToReview: string | null;
  createdAt: string;
  hasPdf: boolean;
  reviews: SubmittedVersionReview[];
}

export interface AssignedMentor {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  role: string;
}

export interface SubmissionHistoryReviewRequest {
  id: string;
  reviewerId?: string;
  reviewerName: string;
  status: string;
  revisionNumber: number;
  revisionId?: string;
  origin?: string;
  createdAt?: string;
  updatedAt?: string;
  dueAt: string | null;
  canView: boolean;
}

export interface SubmissionHistory {
  canManage: boolean;
  /** Current team membership and a live, writable source; never an access grant. */
  sourceManuscriptWritable?: boolean;
  canProvideFeedback?: boolean;
  assignedMentor?: AssignedMentor | null;
  canRunAiPreReview?: boolean;
  canRequestReview?: boolean;
  reviewRequests?: SubmissionHistoryReviewRequest[];
  openForReview: boolean;
  currentRevisionId: string | null;
  currentRevisionNumber: number;
  latestReviewedRevisionId: string | null;
  versions: ResearchVersion[];
  contributions: Array<{ reviewerId: string; name: string; type: string; status?: string; rounds: Array<{ reviewId: string; revisionId: string; roundNumber: number; submittedAt: string | null; academicRole: string | null }> }>;
}
