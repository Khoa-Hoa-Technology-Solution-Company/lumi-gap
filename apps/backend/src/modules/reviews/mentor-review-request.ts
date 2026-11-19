import type { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { acceptedMentorReviewPolicy } from "./mentor-review-access.js";
import { assertReviewAdmission, defaultPeerReviewTemplate } from "./peer-review-access.js";
import { createReviewNotification } from "./review-notifications.js";

/** Called inside the sender's transaction, after project/account authorization. */
export async function createAssignedMentorReview(tx: Prisma.TransactionClient, input: {
  submissionId: string; reviewerId: string; senderId: string; revisionId: string; message?: string;
}) {
  const submission = await assertReviewAdmission(tx, input.submissionId, input.reviewerId, { mentorGuidance: true });
  const policy = await acceptedMentorReviewPolicy(tx, submission.projectId, input.reviewerId);
  const revision = await tx.submissionRevision.findFirst({ where: { id: input.revisionId, submissionId: submission.id } });
  if (!revision) throw AppError.badRequest("Select a saved manuscript revision before requesting review");
  const template = await defaultPeerReviewTemplate(tx, submission.submissionType);
  const request = await tx.reviewRequest.create({ data: {
    submissionId: submission.id, projectId: submission.projectId, requesterId: input.senderId,
    templateVersionId: template.id, artifactRevisionId: revision.id, origin: "MENTOR_GUIDANCE",
    message: input.message?.trim() || null,
    expiresAt: new Date(Date.now() + env.ACADEMIC_RELATIONSHIP_REQUEST_EXPIRY_DAYS * 86400000),
  } });
  const assignment = await tx.reviewerAssignment.create({ data: {
    submissionId: submission.id, reviewRequestId: request.id, artifactRevisionId: revision.id,
    reviewerId: input.reviewerId, assignedById: input.senderId, mentorAccessId: policy.id,
    anonymousCode: `mentor-${request.id}`, status: "assigned",
  } });
  await tx.submission.update({ where: { id: submission.id }, data: { status: "under_review" } });
  const notification = await createReviewNotification({ userId: input.reviewerId, type: "REVIEW_REQUESTED", title: "New mentor manuscript review", message: `Your team requested feedback on “${submission.title}” (v${revision.revisionNumber}).`, targetKind: "review_request", targetId: request.id, eventKey: `MENTOR_REVIEW_REQUEST:${request.id}` }, tx);
  return { request, assignment, notification };
}
