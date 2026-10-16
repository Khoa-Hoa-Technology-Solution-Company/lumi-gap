import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { verificationEvidenceStorage } from "../../academic-profiles/verification-evidence-storage.service.js";

/** Everything an academic-relationship integration suite created; ids are collected as the suite creates rows. */
export interface CreatedAcademicData {
  userIds: string[];
  institutionIds: string[];
  paperIds: string[];
}

export const newCreatedAcademicData = (): CreatedAcademicData => ({ userIds: [], institutionIds: [], paperIds: [] });

/**
 * Deletes everything the suite created, children before parents. Foreign keys to users, projects and institutions
 * are RESTRICT in many tables, so a bare `user.deleteMany` would fail (or leave projects behind).
 */
export async function removeCreatedAcademicData({ userIds, institutionIds, paperIds }: CreatedAcademicData) {
  const db = getPrisma();
  if (!userIds.length) return;
  for (const userId of userIds) {
    for (const source of await db.verificationEvidenceSource.findMany({ where: { request: { userId } } })) {
      if (source.storageKey) await verificationEvidenceStorage.remove(source.storageKey, userId);
    }
  }
  const projectIds = (await db.project.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } })).map((row) => row.id);
  // Audit rows and admin notifications point at requests, not at users, so collect those ids before the rows go.
  const requestIds = (await db.mentorshipRequest.findMany({ where: { OR: [{ projectId: { in: projectIds } }, { mentorUserId: { in: userIds } }, { requestedBy: { in: userIds } }] }, select: { id: true } })).map((row) => row.id);
  const evidenceIds = (await db.verificationEvidence.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map((row) => row.id);
  const relatedIds = [...userIds, ...projectIds, ...requestIds, ...evidenceIds];
  await db.auditLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { targetRecordId: { in: relatedIds } }] } });
  await db.notification.deleteMany({ where: { OR: [{ userId: { in: userIds } }, ...evidenceIds.map((id) => ({ eventKey: { endsWith: id } }))] } });
  await db.mentorRelationship.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { mentorUserId: { in: userIds } }] } });
  await db.mentorshipRequest.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { mentorUserId: { in: userIds } }, { requestedBy: { in: userIds } }] } });
  await db.projectInvitation.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { invitedById: { in: userIds } }] } });
  await db.projectActivity.deleteMany({ where: { projectId: { in: projectIds } } });
  await db.projectPaper.deleteMany({ where: { projectId: { in: projectIds } } });
  // Deleting projects cascades their owner memberships without breaking the canonical owner guard.
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.projectMember.deleteMany({ where: { userId: { in: userIds } } });
  if (paperIds.length) await db.paper.deleteMany({ where: { id: { in: paperIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  if (institutionIds.length) {
    await db.institutionDomain.deleteMany({ where: { institutionId: { in: institutionIds } } });
    await db.institution.deleteMany({ where: { id: { in: institutionIds } } });
  }
}
