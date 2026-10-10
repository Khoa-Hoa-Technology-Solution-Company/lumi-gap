import { AppError } from "../../common/exceptions/app-error.js";

export type ProjectAccessRole = "OWNER" | "MEMBER" | undefined;
export type ProjectMutationAction = "EDIT_SETTINGS" | "MANAGE_MEMBERS" | "ARCHIVE" | "DELETE" | "CONTRIBUTE" | "LEAVE";

export function canReadProjectContent(project: { id: string; ownerId: string }, viewerId?: string, activeProjectIds: ReadonlySet<string> = new Set()): boolean {
  return Boolean(viewerId && (project.ownerId === viewerId || activeProjectIds.has(project.id)));
}
export function canReadProjectSummary(visibility: string, hasMembership: boolean): boolean {
  return hasMembership || visibility === "PUBLIC_SUMMARY";
}

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
