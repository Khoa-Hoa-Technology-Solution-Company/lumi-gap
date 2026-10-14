import { getPrisma } from "../../infrastructure/database/prisma.js";
import { currentProjectMembership } from "../authorization/project-membership.js";
import { canAccessProjectAsMentor } from "./academic-relationship-access.js";

export async function canDeliverWorkspaceNotification(row: { type: string; userId: string | null; targetUuid: string | null; eventKey?: string | null }) {
  if (!row.type.startsWith("PROJECT_WORKSPACE_")) return true;
  if (!row.userId || !row.targetUuid) return false;
  if (await currentProjectMembership(row.targetUuid, row.userId)) return true;
  const gapGuidance = row.type === "PROJECT_WORKSPACE_GAP_GUIDANCE" || (row.type === "PROJECT_WORKSPACE_MENTOR_FEEDBACK" && row.eventKey?.startsWith("WORKSPACE:GAP_GUIDANCE:"));
  if (!gapGuidance && !["PROJECT_WORKSPACE_PLAN_SHARED", "PROJECT_WORKSPACE_MENTOR_QUESTION"].includes(row.type)) return false;
  if (!await canAccessProjectAsMentor(row.targetUuid, row.userId)) return false;
  const db = getPrisma();
  if (gapGuidance) {
    const activityId = row.eventKey?.split(":")[2];
    return Boolean(activityId && await db.projectActivity.findFirst({ where: { id: activityId, projectId: row.targetUuid, type: "MENTOR_GUIDANCE", entityKind: "GAP" } }));
  }
  const relations = await db.mentorRelationship.findMany({ where: { projectId: row.targetUuid, mentorUserId: row.userId, status: "ACTIVE" }, select: { id: true } });
  const relationshipIds = relations.map(relation => relation.id);
  const entityId = row.eventKey?.split(":")[2];
  if (row.type === "PROJECT_WORKSPACE_MENTOR_QUESTION") {
    if (!entityId) return false;
    const thread = await db.projectDiscussion.findFirst({ where: { id: entityId, projectId: row.targetUuid, category: "MENTOR_QUESTION", mentorRelationshipId: { in: relationshipIds }, targetKind: "PLAN_REVISION" } });
    if (!thread?.targetId) return false;
    return Boolean(await db.planShare.findFirst({ where: { projectId: row.targetUuid, relationshipId: thread.mentorRelationshipId!, revisionId: thread.targetId, revokedAt: null } }));
  }
  return Boolean(await db.planShare.findFirst({ where: { ...(entityId ? { id: entityId } : {}), projectId: row.targetUuid, relationshipId: { in: relationshipIds }, revokedAt: null } }));
}
