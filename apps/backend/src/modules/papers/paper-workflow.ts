export const OPENALEX_PAPER_STATUS = "not-downloaded" as const;

/** Shortest abstract (in characters) that is worth embedding and AI analysis. */
export const AI_ANALYZABLE_MIN_ABSTRACT_CHARS = 250;

/**
 * `papers.is_ai_analyzable` is derived from the abstract alone and gates embedding.
 * Publication state is separate: embedding also requires dataStatus "active".
 */
export function isAiAnalyzableAbstract(text: string | null | undefined): boolean {
  return typeof text === "string" && text.length >= AI_ANALYZABLE_MIN_ABSTRACT_CHARS;
}

/** Why an imported record is "low-quality": it cannot be embedded or analysed. Stored in `papers.rejection_reason`. */
export function lowQualityReason(abstractText: string | null | undefined): string {
  return typeof abstractText === "string" && abstractText.trim().length > 0
    ? `Abstract shorter than ${AI_ANALYZABLE_MIN_ABSTRACT_CHARS} characters`
    : "No abstract from the provider";
}

type PaperOrigin = { primaryProvider?: string | null; requestedBy?: unknown; requestedById?: unknown };

/**
 * Provider data remains an imported corpus record even when a user originally
 * requested that it be synced. Older records may not have primaryProvider, so
 * keep the requestedBy fallback for backward compatibility.
 */
export function isImportedPaperRecord(paper: PaperOrigin): boolean {
  return paper.primaryProvider
    ? paper.primaryProvider !== "user"
    : !(paper.requestedBy ?? paper.requestedById);
}

export const PAPER_REQUEST_STATUSES = [
  "pending",
  "not-downloaded",
  "downloaded",
  "rejected",
  "pending-requester-acceptance",
] as const;

export type PaperRequestStatus = (typeof PAPER_REQUEST_STATUSES)[number];

/** Statuses an admin may move a paper to from each status (PATCH /papers/:id/status). */
const ADMIN_PAPER_STATUS_TRANSITIONS: Record<PaperRequestStatus, readonly PaperRequestStatus[]> = {
  pending: ["not-downloaded", "downloaded", "rejected", "pending-requester-acceptance"],
  "pending-requester-acceptance": ["not-downloaded", "downloaded", "rejected"],
  rejected: ["pending", "not-downloaded"],
  "not-downloaded": ["downloaded", "rejected"],
  downloaded: ["not-downloaded", "rejected"],
};

/** True when an admin may change a paper from `from` to `to`. Unknown legacy statuses are not restricted. */
export function isAllowedAdminPaperStatusChange(from: string | null | undefined, to: PaperRequestStatus): boolean {
  if (from === to) return true;
  const allowed = ADMIN_PAPER_STATUS_TRANSITIONS[from as PaperRequestStatus];
  return allowed ? allowed.includes(to) : true;
}

/**
 * A requester may cancel (and be refunded for) a request that never reached the corpus.
 * paperStatus alone is not enough: a new request without a PDF starts as "not-downloaded" (draft),
 * and an active paper turns "pending" again after a PDF upload. Only the data status says it is live.
 */
export function isCancellablePaperRequest(paper: { dataStatus?: string | null }): boolean {
  return paper.dataStatus !== "active";
}

export function isUserPaperRequest(
  paper: { paperStatus?: string; requestedBy?: unknown; uploadedBy?: unknown; requestedById?: unknown; uploadedById?: unknown },
): boolean {
  return paper.paperStatus === "pending" && Boolean(
    paper.requestedBy ?? paper.uploadedBy ?? paper.requestedById ?? paper.uploadedById,
  );
}
