export const MANUSCRIPT_TYPES = ["RESEARCH_PAPER", "RESEARCH_PROPOSAL", "THESIS", "TECHNICAL_REPORT"] as const;
export type ManuscriptType = typeof MANUSCRIPT_TYPES[number];
export const MANUSCRIPT_TEMPLATES = ["ARTICLE", "PROPOSAL", "REPORT"] as const;
export type ManuscriptTemplate = typeof MANUSCRIPT_TEMPLATES[number];
export interface ManuscriptSourceVersionLink { projectId: string; manuscriptId: string; snapshotId: string; }
export type ManuscriptFileKind = "TEXT" | "ASSET" | "FOLDER";
export interface ManuscriptFile {
  id: string; path: string; kind: ManuscriptFileKind; version: number; sequence: number;
  sizeBytes: number; mimeType: string | null; checksum: string | null; updatedAt: string;
}
export interface ManuscriptFeedbackSummary {
  snapshotId: string; snapshotLabel: string; requestedAt: string;
  status: "PENDING" | "RESPONDED" | "RESOLVED" | "ENDED";
}
export interface ManuscriptSummary {
  id: string; projectId: string; title: string; description: string; documentType: ManuscriptType;
  template: ManuscriptTemplate; version: number; mainFileId: string | null; archived: boolean;
  createdAt: string; updatedAt: string; canWrite: boolean;
  collaborators?: Array<{ id: string; name: string }>;
  latestFeedback?: ManuscriptFeedbackSummary | null;
}
export interface ManuscriptDetail extends ManuscriptSummary {
  files: ManuscriptFile[]; collaborators: Array<{ id: string; name: string }>;
  compiler: { available: boolean; reason: string };
}
export interface CreateManuscript {
  title: string; documentType: ManuscriptType; template: ManuscriptTemplate; description: string;
  clientKey: string; researchLink?: { kind: "QUESTION" | "GAP"; id: string } | null;
}
export interface SnapshotFile {
  id: string; path: string; kind: ManuscriptFileKind; sequence: number; checksum: string | null;
  text?: string; sizeBytes: number; mimeType: string | null;
}
export interface ManuscriptManifest { title: string; documentType: ManuscriptType; mainFileId: string; files: SnapshotFile[]; }
export interface ManuscriptSnapshot {
  id: string; label: string; sourceVersion: number; checksum: string; createdAt: string;
  createdBy: { id: string; name: string }; manifest?: ManuscriptManifest;
  canComment?: boolean; canResolve?: boolean; formalRevisionId?: string | null;
  formalAssignmentId?: string | null;
  submissionId?: string | null;
}
export interface ManuscriptReference {
  id: string; title: string; authors: string[]; year: number | null; doi: string | null; citationKey: string; bibtex: string;
}
export interface ManuscriptContext {
  references: ManuscriptReference[];
  plan: { title: string; objective: string; questions: unknown } | null;
  gaps: Array<{ id: string; title: string; description: string; status: string; limitations: string | null }>;
  evidence: Array<{ id: string; claim: string; interpretation: string; status: string; evidenceRole: string; limitations: string; gapId?: string }>;
}
export interface ManuscriptComment {
  id: string; title: string; body: string; status: "OPEN" | "RESOLVED"; version: number;
  author: { id: string; name: string }; context: { fileId?: string; snapshotId?: string; quote?: string; start?: unknown; end?: unknown };
  mentorRelationshipId: string | null; messages: Array<{ id: string; body: string; author: { id: string; name: string }; createdAt: string }>;
}
export type ManuscriptSyncState = "CONNECTING" | "SYNCING" | "SAVED" | "RECONNECTING" | "OFFLINE" | "SYNC_ERROR" | "READ_ONLY";
export interface CollaboratorPresence { clientId: number; user: { id: string; name: string; color: string; colorLight: string }; cursor: unknown | null; }
