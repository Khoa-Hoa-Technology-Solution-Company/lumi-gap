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
  requests: Array<{ id: string; mentorId: string; status: string; revisionId: string;
    items: Array<{ id: string; description: string; priority: string }> }>;
}
