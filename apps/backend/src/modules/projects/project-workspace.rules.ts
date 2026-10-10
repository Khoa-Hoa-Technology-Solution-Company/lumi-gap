import { AppError } from "../../common/exceptions/app-error.js";

export type ProjectAccessRole = "OWNER" | "MEMBER" | undefined;
export type ProjectMutationAction = "EDIT_SETTINGS" | "MANAGE_MEMBERS" | "ARCHIVE" | "DELETE" | "CONTRIBUTE" | "LEAVE";

export function assertProjectActionAllowed(role: ProjectAccessRole, status: string, action: ProjectMutationAction) {
  if (!role) throw AppError.forbidden("Active project membership is required");
  if (["EDIT_SETTINGS", "MANAGE_MEMBERS", "ARCHIVE", "DELETE"].includes(action) && role !== "OWNER") throw AppError.forbidden("Only the project owner can perform this action");
  if (status === "ARCHIVED" && action !== "DELETE") throw AppError.conflict("Archived projects are read-only");
  if (action === "LEAVE" && role === "OWNER") throw AppError.conflict("Transfer ownership before leaving this project");
}

export function invitationBelongsToUser(
  invitation: { invitedUserId: string | null; email: string },
  user: { id: string; verifiedEmails: readonly string[] },
) {
  const invitedEmail = invitation.email.trim().toLowerCase();
  return user.verifiedEmails.some((email) => email.trim().toLowerCase() === invitedEmail);
}

/** Work in a project that a hard delete would destroy or orphan, beyond the owner's own drafts. */
export interface ProjectDeleteImpact {
  submissions: number;
  reportsByOthers: number;
  gapsByOthers: number;
  contributionsByOthers: number;
}

/**
 * Returns why the project cannot be hard-deleted, or null. Submissions carry reviewers' work and
 * other members' reports, gaps and contributions are theirs, so such projects can only be archived.
 */
export function projectDeleteError(impact: ProjectDeleteImpact): string | null {
  const blockers = [
    impact.submissions && `${impact.submissions} submission(s) with their review history`,
    impact.reportsByOthers && `${impact.reportsByOthers} report(s) by other members`,
    impact.gapsByOthers && `${impact.gapsByOthers} research gap(s) by other members`,
    impact.contributionsByOthers && `${impact.contributionsByOthers} contribution(s) by other members`,
  ].filter(Boolean);
  return blockers.length ? `This project still has ${blockers.join(", ")}. Archive it instead of deleting it.` : null;
}
