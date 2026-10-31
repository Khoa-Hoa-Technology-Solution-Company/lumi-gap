import { currentProjectMembership } from "../authorization/project-membership.js";

export async function canDeliverWorkspaceNotification(row: { type: string; userId: string | null; targetUuid: string | null; eventKey?: string | null }) {
  if (!row.type.startsWith("PROJECT_WORKSPACE_")) return true;
  if (!row.userId || !row.targetUuid) return false;
  // Legacy notices link to private team workspaces. MentorAccess feedback is
  // delivered through its separately authorized workspace, never these routes.
  return Boolean(await currentProjectMembership(row.targetUuid, row.userId));
}
