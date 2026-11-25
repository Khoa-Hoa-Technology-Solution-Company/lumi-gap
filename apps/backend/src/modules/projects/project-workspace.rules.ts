import { PROJECT_TRASH_RETENTION_DAYS } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";

export type ProjectAccessRole = "OWNER" | "MEMBER" | undefined;
export type ProjectMutationAction = "EDIT_SETTINGS" | "MANAGE_MEMBERS" | "ARCHIVE" | "DELETE" | "CONTRIBUTE" | "LEAVE" | "RESTORE" | "PERMANENT_DELETE";

export function canReadProjectContent(project: { id: string; ownerId: string }, viewerId?: string, activeProjectIds: ReadonlySet<string> = new Set()): boolean {
  return Boolean(viewerId && (project.ownerId === viewerId || activeProjectIds.has(project.id)));
}
export function canReadProjectSummary(visibility: string, hasMembership: boolean): boolean {
  return hasMembership || visibility === "PUBLIC_SUMMARY" || visibility === "PUBLIC";
}

export function assertProjectActionAllowed(role: ProjectAccessRole, status: string, action: ProjectMutationAction) {
  if (!role) throw AppError.forbidden("Active project membership is required");
  if (["EDIT_SETTINGS", "MANAGE_MEMBERS", "ARCHIVE", "DELETE", "RESTORE", "PERMANENT_DELETE"].includes(action) && role !== "OWNER") throw AppError.forbidden("Only the project owner can perform this action");
  if (status === "ARCHIVED" && !["DELETE", "LEAVE", "RESTORE", "PERMANENT_DELETE"].includes(action)) throw AppError.conflict("Archived projects are read-only");
  if (action === "LEAVE" && role === "OWNER") throw AppError.conflict("Transfer ownership before leaving this project");
}

export function computeTrashPurgeDate(deletedAt: Date, retentionDays = PROJECT_TRASH_RETENTION_DAYS): Date {
  return new Date(deletedAt.getTime() + retentionDays * 86_400_000);
}

export function trashDaysRemaining(purgeAt: Date, now = new Date()): number {
  const diff = purgeAt.getTime() - now.getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / 86_400_000);
}

export function assertTrashedProjectActionAllowed(
  role: ProjectAccessRole,
  project: { deletedAt?: Date | null; purgeAt?: Date | null },
  action: "RESTORE" | "PERMANENT_DELETE",
  now = new Date(),
) {
  if (role !== "OWNER") throw AppError.forbidden("Only the project owner can perform this action");
  if (!project.deletedAt) throw AppError.conflict("This project is not in the trash");
  const purgeAt = project.purgeAt ?? computeTrashPurgeDate(project.deletedAt);
  const expired = purgeAt.getTime() <= now.getTime();
  if (action === "RESTORE" && expired) {
    throw new AppError(410, "RETENTION_EXPIRED", "The 30-day restore window has expired. This project is scheduled for permanent deletion");
  }
  if (action === "PERMANENT_DELETE" && !expired) {
    throw AppError.conflict(`Projects in Trash are retained for ${PROJECT_TRASH_RETENTION_DAYS} days and cannot be permanently deleted before ${purgeAt.toISOString().slice(0, 10)}`);
  }
}

export function invitationBelongsToUser(
  invitation: { invitedUserId: string | null; email: string },
  user: { id: string; verifiedEmails: readonly string[] },
) {
  const invitedEmail = invitation.email.trim().toLowerCase();
  return (!invitation.invitedUserId || invitation.invitedUserId === user.id)
    && user.verifiedEmails.some((email) => email.trim().toLowerCase() === invitedEmail);
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
