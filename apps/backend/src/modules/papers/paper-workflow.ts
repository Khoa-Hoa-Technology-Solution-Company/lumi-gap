import type { FilterQuery } from "mongoose";
import type { PaperDoc } from "./models/paper.model.js";

export const OPENALEX_PAPER_STATUS = "not-downloaded" as const;

type PaperOrigin = Pick<PaperDoc, "primaryProvider" | "requestedBy">;

/**
 * Provider data remains an imported corpus record even when a user originally
 * requested that it be synced. Older records may not have primaryProvider, so
 * keep the requestedBy fallback for backward compatibility.
 */
export function isImportedPaperRecord(paper: PaperOrigin): boolean {
  return paper.primaryProvider
    ? paper.primaryProvider !== "user"
    : !paper.requestedBy;
}

const PAPER_REQUEST_STATUSES = [
  "pending",
  "not-downloaded",
  "downloaded",
  "rejected",
  "pending-requester-acceptance",
] as const;

/** Only papers with a user request or PDF contribution belong in the admin workflow. */
export function buildUserPaperRequestFilter(status?: string): FilterQuery<PaperDoc> {
  return {
    paperStatus: status ?? { $in: PAPER_REQUEST_STATUSES },
    $or: [
      { requestedBy: { $exists: true, $ne: null } },
      { uploadedBy: { $exists: true, $ne: null } },
    ],
  };
}

export function isUserPaperRequest(
  paper: Pick<PaperDoc, "paperStatus" | "requestedBy" | "uploadedBy">,
): boolean {
  return paper.paperStatus === "pending" && Boolean(paper.requestedBy || paper.uploadedBy);
}
