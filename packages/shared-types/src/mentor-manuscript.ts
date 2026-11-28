/** Centralized effective PDF upload & validation limits for manuscript submissions. */
export const MANUSCRIPT_PDF_MAX_BYTES = 50 * 1024 * 1024; // 50 MiB (within nginx 61m limit)
export const MANUSCRIPT_PDF_MAX_MB = 50;
export const MANUSCRIPT_PDF_RECOMMENDED_BYTES = 10 * 1024 * 1024; // 10 MiB recommended for faster preview/upload
export const MANUSCRIPT_PDF_RECOMMENDED_MB = 10;
export const MANUSCRIPT_PDF_MAX_PAGES = 1000;

export type PdfValidationErrorCode =
  | "PDF_EMPTY"
  | "PDF_TOO_LARGE"
  | "PDF_INVALID_FORMAT"
  | "PDF_PASSWORD_PROTECTED"
  | "PDF_CORRUPTED"
  | "PDF_PAGE_LIMIT_EXCEEDED"
  | "PDF_VALIDATION_TIMEOUT"
  | "PDF_VALIDATION_RESOURCE_LIMIT"
  | "PDF_VALIDATION_UNAVAILABLE";

export interface MentorManuscriptSendInput {
  projectId: string; mentorId: string; clientKey: string; source: "SNAPSHOT" | "PDF";
  manuscriptSnapshotId?: string; compilationId?: string; submissionId?: string;
  expectedRevisionNumber?: number; title?: string; message?: string;
  responses?: Array<{ revisionItemId: string; responseText: string }>;
}
export interface MentorManuscriptSendResult {
  submissionId: string; revisionId: string; revisionNumber: number;
  requestId: string; assignmentId: string; reused: boolean;
}
export interface MentorManuscriptContext {
  submission: { id: string; title: string; currentRevisionNumber: number; sourceManuscriptId: string | null } | null;
  requests: Array<{
    id: string;
    mentorId: string;
    status: string;
    revisionId: string;
    items: Array<{
      id: string;
      description: string;
      priority: string;
      optional?: boolean;
      locator?: string | null;
      criterionKey?: string | null;
    }>;
  }>;
}
