import type { EvidenceSourceScope, EvidenceVerificationStatus, PlanQuestion } from "@trend/shared-types";
import { sourceFingerprint } from "../knowledge/knowledge.text.js";

export function evidenceSourceChanged(snapshot: Record<string, unknown>, paper: Parameters<typeof sourceFingerprint>[0] | undefined, document?: { status: string; contentHash: string | null; sourceHash: string }) {
  if (!paper) return true;
  const fingerprint = sourceFingerprint(paper);
  if (typeof snapshot.paperFingerprint === "string" && snapshot.paperFingerprint !== fingerprint) return true;
  if (typeof snapshot.sourceFingerprint === "string" && snapshot.sourceFingerprint !== fingerprint) return true;
  if (snapshot.analysisId && (!document || document.status !== "ready" || document.sourceHash !== fingerprint || document.contentHash !== snapshot.contentHash)) return true;
  if (snapshot.chunkId && (!document || document.status !== "ready" || document.sourceHash !== fingerprint || snapshot.documentHash && document.contentHash !== snapshot.documentHash)) return true;
  if (!snapshot.analysisId && !snapshot.chunkId && snapshot.sourceKind === "ABSTRACT" && typeof snapshot.sourceText === "string" && snapshot.sourceText !== paper.abstractText) return true;
  return false;
}

export function evidenceScope(snapshot: Record<string, unknown>): EvidenceSourceScope {
  const kind = String(snapshot.sourceKind ?? snapshot.documentSourceKind ?? "").toUpperCase();
  if (kind === "ABSTRACT") return "ABSTRACT";
  if (kind.includes("PDF") || typeof snapshot.pageNumber === "number") return "FULL_TEXT";
  return snapshot.declaredSourceScope === "ABSTRACT" || snapshot.declaredSourceScope === "FULL_TEXT" ? snapshot.declaredSourceScope : "UNSPECIFIED";
}
export function evidenceStatus(row: { reviewState: string; reviewRationale: string; sourceSnapshot: unknown }, needsReview: boolean): EvidenceVerificationStatus {
  if (needsReview || row.reviewState === "REJECTED" || row.reviewState === "PENDING" && Boolean(row.reviewRationale)) return "REVISIT";
  if (row.reviewState === "ACCEPTED") return "VERIFIED";
  const snapshot = row.sourceSnapshot as Record<string, unknown>;
  return snapshot.draft === true ? "DRAFT" : "NEEDS_VERIFICATION";
}
export function extractionQuestions(snapshot: Record<string, unknown>, questions: PlanQuestion[], revisionIds: Set<string>) {
  const explicit = new Set(Array.isArray(snapshot.questionIds) ? snapshot.questionIds : []);
  return questions.filter(question => explicit.has(question.id) || question.sourceEvidenceRevisionIds?.some(id => revisionIds.has(id))).map(({ id, text }) => ({ id, text }));
}
