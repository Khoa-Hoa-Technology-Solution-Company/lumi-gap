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
