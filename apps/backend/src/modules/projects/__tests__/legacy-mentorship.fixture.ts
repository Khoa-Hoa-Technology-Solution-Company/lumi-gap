import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { initializeMentorAccess } from "../mentor-access.service.js";
import { mentorshipPreview, projectMentorshipService } from "../project-mentorship.service.js";
import { mentorshipNotification } from "../mentorship-notifications.js";
import type { MentorRole } from "@trend/shared-types";

/** Seed pre-pool lecturer-origin consent so compatibility tests do not submit a new application. */
export async function legacyMentorshipOffer(projectId: string, lecturerId: string, input: { message: string; mentorRole?: MentorRole; attachmentIds?: string[]; idempotencyKey?: string }) {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Legacy fixtures require an isolated test database");
  const db = getPrisma(), project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const preview = await projectMentorshipService.settings(projectId, project.ownerId);
  const row = await db.$transaction(async tx => {
    const row = await tx.mentorshipRequest.create({ data: { projectId, mentorUserId: lecturerId, requestedBy: lecturerId, direction: "LECTURER_TO_PROJECT", mentorRole: input.mentorRole ?? "PRIMARY", message: input.message, idempotencyKey: input.idempotencyKey, expiresAt: new Date(Date.now() + 86400000), invitationSnapshot: { project: mentorshipPreview(project), previewToken: preview.previewToken! } } });
    await initializeMentorAccess(tx, row, project.ownerId);
    if (input.attachmentIds?.length) await tx.mentorshipRequestAttachment.createMany({data:input.attachmentIds.map(attachmentId=>({requestId:row.id,attachmentId}))});
    await mentorshipNotification(tx,{event:"MENTORSHIP_OFFER_RECEIVED",recordId:row.id,projectId,projectTitle:project.title,actorId:lecturerId,recipients:[project.ownerId]});
    return row;
  });
  return projectMentorshipService.requestDetail(projectId,row.id,lecturerId);
}
