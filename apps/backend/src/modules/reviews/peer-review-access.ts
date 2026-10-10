import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { capabilityService } from "../authorization/capability.service.js";
import { eligiblePeerReviewer, submissionReviewStatus } from "./academic-review.rules.js";
import { reviewCapacityIssue } from "./review.rules.js";

export async function assertPeerReviewer(input: string) {
  const parsed = parseDatabaseId(input);
  if (!parsed) throw AppError.unauthorized();
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value } });
  if (!user || !user.isActive || user.accountStatus !== "ACTIVE") throw AppError.forbidden("An active reviewer account is required");
  const profile = await prisma.academicProfile.findUnique({ where: { userId: user.id } });
  if (!user.emailVerifiedAt || profile?.positionStatus !== "VERIFIED" || !eligiblePeerReviewer(profile?.academicRole, profile?.roleVerificationStatus)) {
    throw AppError.forbidden("Formal Academic Review requires a verified Lecturer position and an explicit assignment.");
  }
  let capabilities = await capabilityService.list(user.id);
  if (!capabilities.includes("STRUCTURED_REVIEW")) capabilities = await capabilityService.evaluate(user.id);
  if (!capabilities.includes("STRUCTURED_REVIEW")) throw AppError.forbidden("Peer-review capability is required");
  return { user, profile: profile! };
}

/** Locks must always be acquired reviewer first, then submission. */
export async function lockReviewerAndSubmission(tx: Prisma.TransactionClient, reviewerId: string, submissionId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${reviewerId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM submissions WHERE id = ${submissionId}::uuid FOR UPDATE`;
}

export async function assertReviewerInTransaction(tx: Prisma.TransactionClient, reviewerId: string) {
  await tx.$queryRaw`SELECT user_id FROM academic_profiles WHERE user_id = ${reviewerId}::uuid FOR SHARE`;
  const [user, profile] = await Promise.all([
    tx.user.findUnique({ where: { id: reviewerId } }),
    tx.academicProfile.findUnique({ where: { userId: reviewerId } }),
  ]);
  if (!user?.isActive || user.accountStatus !== "ACTIVE" || (!user.emailVerifiedAt || profile?.positionStatus !== "VERIFIED" || !eligiblePeerReviewer(profile?.academicRole, profile?.roleVerificationStatus))) throw AppError.forbidden("An active, email-verified Lecturer with verified position is required");
  return profile!;
}

export async function assertReviewAdmission(tx: Prisma.TransactionClient, submissionId: string, reviewerId: string, options: { excludeAssignmentId?: string; requireAvailable?: boolean } = {}) {
  await assertReviewerInTransaction(tx, reviewerId);
  const submission = await tx.submission.findUniqueOrThrow({ where: { id: submissionId } });
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${submission.projectId}::uuid FOR UPDATE`;
  const [author, declared, conflict, project, member, duplicate, profile, workload] = await Promise.all([
    tx.submissionAuthor.findUnique({ where: { submissionId_userId: { submissionId, userId: reviewerId } } }),
    tx.submissionDeclaredConflict.findUnique({ where: { submissionId_userId: { submissionId, userId: reviewerId } } }),
    tx.reviewConflict.findUnique({ where: { submissionId_reviewerId: { submissionId, reviewerId } } }),
    tx.project.findUniqueOrThrow({ where: { id: submission.projectId } }),
    tx.projectMember.findFirst({ where: { projectId: submission.projectId, userId: reviewerId, status: "ACTIVE" } }),
    tx.reviewerAssignment.findFirst({ where: { submissionId, reviewerId, status: { in: ["assigned", "accepted"] }, ...(options.excludeAssignmentId ? { id: { not: options.excludeAssignmentId } } : {}) } }),
    tx.academicProfile.findUnique({ where: { userId: reviewerId } }),
    tx.reviewerAssignment.count({ where: { reviewerId, status: { in: ["assigned", "accepted"] }, ...(options.excludeAssignmentId ? { id: { not: options.excludeAssignmentId } } : {}) } }),
  ]);
  if (project.status === "ARCHIVED" || ["withdrawn", "accepted", "rejected"].includes(submission.status)) throw AppError.conflict("This research no longer accepts reviews");
  if (submission.createdById === reviewerId || author || declared || project.ownerId === reviewerId || member || (conflict && ["DECLARED", "SYSTEM_DETECTED", "BLOCKED"].includes(conflict.status))) {
    throw AppError.conflict("Authors, project contributors and reviewers with a declared conflict cannot review this research");
  }
  if (duplicate) throw AppError.conflict("This reviewer already has an active assignment for this research");
  if (profile?.positionStatus !== "VERIFIED" || !eligiblePeerReviewer(profile?.academicRole, profile?.roleVerificationStatus)) throw AppError.forbidden("Lecturer position verification is required");
  const availability = profile?.reviewAvailability as { enabled?: boolean; maximumActiveReviews?: number; temporarilyUnavailableUntil?: string } | null;
  const issue = reviewCapacityIssue({ availableForReview: options.requireAvailable ? availability?.enabled === true : true,
    maximumActiveReviews: availability?.maximumActiveReviews ?? 3, activeReviewCount: workload,
    temporarilyUnavailableUntil: availability?.temporarilyUnavailableUntil, acceptedFields: [], acceptedTopics: [], acceptedSubmissionTypes: [], autoRecommendationEnabled: true });
  if (issue) throw AppError.conflict(issue);
  return submission;
}

export async function refreshSubmissionReviewStatus(tx: Prisma.TransactionClient, submissionId: string) {
  const submission = await tx.submission.findUniqueOrThrow({ where: { id: submissionId } });
  if (["withdrawn", "rejected", "accepted"].includes(submission.status)) return;
  const assignments = await tx.reviewerAssignment.findMany({ where: { submissionId } });
  const requests = await tx.reviewRequest.findMany({ where: { submissionId } });
  const statuses = new Map(requests.map((request) => [request.id, request.status]));
  let status = submissionReviewStatus(assignments.map((assignment) => ({ ...assignment, requestStatus: assignment.reviewRequestId ? statuses.get(assignment.reviewRequestId) : null })));
  if (status === "completed" && !await tx.humanReview.findFirst({ where: { submissionId, revisionId: submission.currentRevisionId ?? "", status: "SUBMITTED" } })) status = "revised";
  await tx.submission.update({ where: { id: submissionId }, data: { status } });
}

export async function defaultPeerReviewTemplate(tx: Prisma.TransactionClient, submissionType: string | null) {
  const templates = await tx.reviewTemplate.findMany({ where: { source: "SYSTEM", status: "PUBLISHED", active: true, activeVersionId: { not: null } }, orderBy: { createdAt: "asc" } });
  const template = templates.find((item) => item.artifactType === submissionType || item.submissionType === submissionType)
    ?? templates.find((item) => !item.artifactType && !item.submissionType)
    ?? ([null, "THESIS_DRAFT", "SOFTWARE_RESEARCH_PROJECT"].includes(submissionType) ? templates.find((item) => item.submissionType === "RESEARCH_PAPER") : undefined);
  const version = template?.activeVersionId ? await tx.reviewTemplateVersion.findUnique({ where: { id: template.activeVersionId } }) : null;
  if (!version || version.status !== "PUBLISHED") throw AppError.conflict("Publish a suitable system review template before assigning reviewers");
  return version;
}
