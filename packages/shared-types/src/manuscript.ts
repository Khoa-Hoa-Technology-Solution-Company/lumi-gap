export interface ManuscriptPdfImport {
  mode?: "layout" | "structured";
  id: string;
  status: "queued" | "processing" | "ready" | "failed";
  phase?: "converting" | "compiling" | "comparing";
  compilation?: { status: "success" | "failed" | "unavailable"; diagnostics?: string };
  expiresAt: string;
  pageCount?: number;
  wordCount?: number;
  warnings?: string[];
  preview?: string;
  error?: string;
  layout?: { pageCount: number; tableCount: number; blockCount: number; unmappedBlocks: number; warnings?: string[] };
  comparison?: {
    status: "compared" | "unavailable";
    sourcePages?: number; generatedPages?: number; comparedPages?: number;
    textCoverage?: number; numericCoverage?: number; visualSimilarity?: number; contentBoundsDeviation?: number;
    warnings?: string[];
  };
}

export const MANUSCRIPT_TYPES = ["RESEARCH_PAPER", "RESEARCH_PROPOSAL", "THESIS", "TECHNICAL_REPORT"] as const;
export type ManuscriptType = typeof MANUSCRIPT_TYPES[number];
export const MANUSCRIPT_TEMPLATES = ["ARTICLE", "PROPOSAL", "REPORT", "IEEE_CONFERENCE", "PRESENTATION", "THESIS", "ELSEVIER", "SPRINGER", "APS", "BLANK"] as const;
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
  canDelete?: boolean;
  collaborators?: Array<{ id: string; name: string }>;
  latestFeedback?: ManuscriptFeedbackSummary | null;
}
export interface ManuscriptDetail extends ManuscriptSummary {
  compilerSettings?: { engine: ManuscriptEngine; texLiveVersion: ManuscriptTexLive; revision: number };
  files: ManuscriptFile[]; collaborators: Array<{ id: string; name: string }>;
  compiler: { available: boolean; reason: string; versions?: ManuscriptTexLive[] };
}
export type ManuscriptTexLive = "2022" | "2025";
export type ManuscriptEngine = "pdflatex" | "xelatex" | "lualatex";
export type ManuscriptSyncQuery = { direction: "forward"; path: string; line: number } | { direction: "inverse"; page: number; x: number; y: number };
export interface ManuscriptSyncLocation { path?: string; line?: number; page?: number; x?: number; y?: number }
export interface ManuscriptCompilation {
  id: string; snapshotId: string; sourceVersion: number; engine: ManuscriptEngine; texLiveVersion?: ManuscriptTexLive;
  status: "QUEUED" | "COMPILING" | "SUCCESS" | "FAILED" | "BLOCKED" | "TIMED_OUT";
  diagnostics: string; toolchain: string | null; checksum: string | null;
  createdAt: string; completedAt: string | null;
}
export interface ManuscriptCompilationState {
  latest: ManuscriptCompilation | null;
  successful: ManuscriptCompilation | null;
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
export interface CreateManuscriptSnapshot {
  label: string; clientKey: string; minimumSequences: Record<string, number>;
  /** Reuse an identical saved source version when compiling repeatedly. */
  reuseUnchanged?: boolean;
}
export interface ManuscriptSnapshot {
  collaboration?: { comments: number; suggestions: number } | null;
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
  conclusion?: string;
  author: { id: string; name: string }; context: { fileId?: string; snapshotId?: string; quote?: string; start?: unknown; end?: unknown };
  mentorRelationshipId: string | null; messages: Array<{ id: string; body: string; author: { id: string; name: string }; createdAt: string }>;
  hasMoreMessages?: boolean;
}
export interface ManuscriptCommentPage { items: ManuscriptComment[]; nextCursor: string | null }
export type ManuscriptSyncState = "CONNECTING" | "SYNCING" | "SAVED" | "RECONNECTING" | "OFFLINE" | "SYNC_ERROR" | "READ_ONLY";
export interface CreateManuscriptSuggestion {
  fileId: string; sourceSequence: number; from: number; to: number;
  original: string; replacement: string; note: string; clientKey: string;
}
export interface ManuscriptSuggestion {
  anchor?: { start: Record<string, unknown>; end: Record<string, unknown>; before: string; after: string } | null;
  id: string; fileId: string; path: string; original: string; replacement: string; note: string;
  revision: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED"; createdAt: string; resolvedAt: string | null;
  author: { id: string; name: string }; resolvedBy: { id: string; name: string } | null;
}
export interface CollaboratorPresence { clientId: number; user: { id: string; name: string; color: string; colorLight: string }; cursor: unknown | null; }

export const MANUSCRIPT_AI_ACTIONS = ["improve", "continue", "rewrite", "expand", "shorten", "grammar", "translate", "repair", "explain", "citations", "custom"] as const;
export type ManuscriptAiAction = typeof MANUSCRIPT_AI_ACTIONS[number];
export interface ManuscriptAiInput {
  fileId: string; action: ManuscriptAiAction; from: number; to: number; original: string;
  sourceSequence?: number;
  regenerateOf?: string;
  instruction: string; language: string;
}
export interface ManuscriptAiResult {
  text: string; explanation: string;
  needsContext?: boolean;
  citations: Array<ManuscriptReference & { reason: string; evidenceStatus: "PROJECT_SOURCE" | "REVIEWED_EVIDENCE"; support?: { quote: string; locator: string; kind: "ABSTRACT" | "REVIEWED_EXCERPT" } }>;
  warnings: string[];
  scope?: { fileId: string; path: string; sourceSequence: number; sourceVersion: number };
  /** Server assessment; compiler success is never inferred from model prose. */
  repair?: { outcome: "COMPILED" | "WARNINGS" | "NO_CHANGE" | "PROPOSED_FIX"; sourceVersion: number; compilationId: string | null };
}
export interface ManuscriptAiRun {
  id: string; status: "queued" | "running" | "completed" | "failed" | "cancelled";
  input: ManuscriptAiInput; result: ManuscriptAiResult | null; error: string | null;
}
