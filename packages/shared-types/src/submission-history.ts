export interface SubmittedVersionReview {
  id: string;
  reviewerId: string;
  reviewerName: string;
  reviewerAcademicRole: string | null;
  revisionId: string;
  roundNumber: number;
  templateVersionId: string | null;
  weightedScore: number | null;
  overallAssessment: string | null;
  keyStrengths: string | null;
  keyConcerns: string | null;
  overallComment: string | null;
  submittedAt: string | null;
  requestId?: string | null;
  responses: Array<{ criterionKey: string; comment: string; evidence: string | null; assessment: string | null; score: number | null; notApplicable: boolean }>;
  requiredRevisions: Array<{ id: string; description: string; priority: string; status: string; responses: Array<{ submissionRevisionId: string; responseText: string; status: string }> }>;
}

export interface ResearchVersion {
  id: string;
  revisionNumber: number;
  contentType: string;
  contentSnapshot: string | null;
  checksumSha256: string | null;
  sizeBytes: number;
  sourceRevisionId: string | null;
  responseToReview: string | null;
  createdAt: string;
  hasPdf: boolean;
  reviews: SubmittedVersionReview[];
}

export interface SubmissionHistory {
  canManage: boolean;
  openForReview: boolean;
  currentRevisionId: string | null;
  currentRevisionNumber: number;
  latestReviewedRevisionId: string | null;
  versions: ResearchVersion[];
  contributions: Array<{ reviewerId: string; name: string; type: string; status?: string; rounds: Array<{ reviewId: string; revisionId: string; roundNumber: number; submittedAt: string | null; academicRole: string | null }> }>;
}
