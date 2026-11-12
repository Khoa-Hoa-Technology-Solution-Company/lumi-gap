import type { ManuscriptAttributionCheckView } from "./research-trust.js";

export type IntegrityEvidenceState = "VERIFIED" | "NEEDS_REVIEW" | "PENDING" | "DISPUTED" | "UNAVAILABLE" | "STALE";
export type IntegrityRecordKind = "CITATION_AUDIT" | "AI_DECLARATION" | "RIGHTS_DECLARATION" | "POLICY" | "READINESS_REPORT";
export const integrityAiCategories = ["LANGUAGE", "TRANSLATION", "LATEX_DEBUGGING", "STRUCTURE", "LITERATURE_DISCOVERY", "CITATION_SUGGESTIONS", "DRAFT_TEXT", "DATA_ANALYSIS", "OTHER"] as const;
export type IntegrityAiCategory = typeof integrityAiCategories[number];
export interface CitationFinding { code: string; key?: string; file?: string; message: string }
export interface CitationSourceEvidence {
  paperId: string; title: string; year: number; doi: string; provider: string; observedAt: string; authors?: string[];
  status: "RETRACTED" | "CORRECTED" | "UNKNOWN"; sourceRecordId?: string; statusNoticeDoi?: string;
}
export interface IntegrityCitationAudit {
  algorithm: "LATEX_CITATIONS_V1"; files: string[]; citedKeys: string[];
  entries: Array<{ key: string; file: string; title?: string; author?: string; year?: string; doi?: string; verifiedFields?: string[]; identity: "CONFIRMED" | "UNAVAILABLE"; metadata: "VERIFIED" | "NEEDS_REVIEW" | "UNAVAILABLE"; evidence?: CitationSourceEvidence }>;
  findings: CitationFinding[]; metadataDigest: string; claimSupport: "NOT_REVIEWED";
}
export interface IntegrityAiDeclarationInput {
  disclosure: string; venuePolicy: string;
  externalUsage: Array<{ tool: string; category: IntegrityAiCategory; purpose: string; affectedSections: string }>;
}
export interface IntegrityRightsInput {
  holders: string[]; basis: "INDIVIDUAL_AUTHORS" | "JOINT_CLAIM" | "INSTITUTIONAL_AGREEMENT" | "EMPLOYMENT" | "LICENSE_OR_ASSIGNMENT" | "UNDETERMINED";
  basisExplanation: string; institutionalArrangement: string; thirdPartyContent: string;
  restrictions: string; unresolvedQuestions: string; supportingReferences: string[];
  prohibitsInternalSubmission: boolean;
}
export interface IntegrityPolicyInput { requireAiAcknowledgement: boolean; requireRightsAcknowledgement: boolean; requireCitationAudit: boolean; requireCurrentSnapshot: boolean; reason: string }
export interface IntegrityStoredRecord {
  id: string; kind: IntegrityRecordKind; version: number; createdById: string; createdAt: string;
  evidenceDigest: string; checksum: string; content: unknown; acknowledgedBy: Array<{ userId: string; at: string }>;
}
export interface IntegrityAiOperation {
  id: string; actorId: string; actorName: string; category: IntegrityAiCategory; action: string; status: string;
  createdAt: string; acceptedEdits: Array<{ id: string; acceptedById: string; fileId: string; sequence: number; sourceVersion: number; createdAt: string; exactSourceCaptured: boolean }>;
}
export interface IntegrityCheck { area: "CITATIONS" | "AI" | "AUTHORSHIP" | "RIGHTS" | "MENTORSHIP" | "CASES" | "SNAPSHOT"; state: IntegrityEvidenceState; blocking: boolean; reason: string; href: string }
export interface IntegrityReadiness {
  schemaVersion: "LUMIGAP_INTEGRITY_V1"; algorithmVersion: "READINESS_V1";
  projectId: string; manuscriptId: string; snapshotId: string; snapshotVersion: number; snapshotChecksum: string; viewerId: string;
  evaluatedAt: string; evidenceDigest: string; state: IntegrityEvidenceState; maySubmit: boolean;
  currentSnapshot: boolean; policy: IntegrityPolicyInput; checks: IntegrityCheck[];
  evidenceVersions: Record<string, string | number | null>;
  supportingEvidenceRefs?: Array<{ id: string; kind: string; resourceId: string | null; version: string | null; checksum: string | null; recordedAt: string }>;
  authorship: ManuscriptAttributionCheckView;
  citations: IntegrityCitationAudit | null; aiOperations: IntegrityAiOperation[];
  legacyExternalAi: Array<{ id: string; tool: string; purpose: string; actorId: string | null; declaredAt: string }>;
  mentors: Array<{ id: string; userId: string; name: string; role: string; status: string; accessRevoked: boolean; acceptedAgreementIds: string[]; acceptedFeedbackRefs: Array<{ id: string; revisionRef: string | null }> }>;
  cases: Array<{ id: string; kind: string; status: string }>;
  records: Partial<Record<IntegrityRecordKind, IntegrityStoredRecord>>;
  history: Array<{ id: string; kind: IntegrityRecordKind; version: number; createdAt: string; checksum: string }>;
  permissions: { canManagePolicy: boolean; canDeclareRights: boolean; canWrite: boolean; canExport: boolean; canAcknowledge: boolean };
  notice: string;
}
