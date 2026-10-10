/**
 * Expert validation of research gaps. PURE — no I/O.
 *
 * Requesting validation is the owner's consent to share the gap (and its evidence) with
 * verified experts; until then only the creator and the project's members can see it.
 */

/** Statuses in which an expert can still record a validation decision. */
export const OPEN_FOR_VALIDATION = ["UNDER_VALIDATION", "REFINED"] as const;

/** Statuses after the owner requested validation: shared with experts from then on. */
export const SHARED_WITH_EXPERTS = ["UNDER_VALIDATION", "REFINED", "VALIDATED", "REJECTED"] as const;

export interface GapValidationViewer {
  isCreator: boolean;
  /** Owner or active member of the gap's project. */
  isProjectMember: boolean;
  /** Active account with the GAP_VALIDATION capability. */
  isExpert: boolean;
}

export function canViewGapValidation(viewer: GapValidationViewer, validationStatus: string): boolean {
  if (viewer.isCreator || viewer.isProjectMember) return true;
  return viewer.isExpert && (SHARED_WITH_EXPERTS as readonly string[]).includes(validationStatus);
}

/** Returns why this expert may not validate the gap (conflict of interest), or null. */
export function gapValidationConflict(viewer: Pick<GapValidationViewer, "isCreator" | "isProjectMember">): string | null {
  if (viewer.isCreator) return "Owners cannot expert-validate their own research gap";
  if (viewer.isProjectMember) return "Members of the gap's project cannot expert-validate it";
  return null;
}

export type GapValidationOutcome = "UNDER_VALIDATION" | "REFINED" | "VALIDATED" | "REJECTED";

export interface GapValidationDecision {
  reviewerId: string;
  action: string;
  createdAt: Date;
}

/** Actions that stop a gap from being validated even when enough experts said VALIDATE. */
const BLOCKS_VALIDATION = ["CHALLENGE", "REJECT", "REQUEST_EVIDENCE"];

/**
 * Status of a gap after an expert decision. PURE — no I/O.
 *
 * `decisions` holds every decision of the gap including the one just recorded. Only each expert's latest decision
 * counts, so nobody gets two votes and changing one's mind replaces the earlier vote. A final status (VALIDATED or
 * REJECTED) needs `quorum` experts to agree; VALIDATED also needs no expert whose latest decision objects.
 */
export function resolveValidationStatus(decisions: GapValidationDecision[], incomingAction: string, quorum: number): GapValidationOutcome {
  if (incomingAction === "REFINE_SCOPE") return "REFINED";
  const latest = new Map<string, GapValidationDecision>();
  [...decisions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).forEach((decision) => latest.set(decision.reviewerId, decision));
  const current = [...latest.values()];
  const count = (action: string) => current.filter((decision) => decision.action === action).length;
  if (count("REJECT") >= quorum) return "REJECTED";
  if (count("VALIDATE") >= quorum && !current.some((decision) => BLOCKS_VALIDATION.includes(decision.action))) return "VALIDATED";
  return "UNDER_VALIDATION";
}
