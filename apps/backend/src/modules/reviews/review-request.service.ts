import { createReviewNotification, dispatchReviewNotifications, reviewTeamRecipients } from "./review-notifications.js";
import crypto from "node:crypto";
import { assertAcademicRelationshipManager } from "../projects/academic-relationship-access.js";
import { env } from "../../config/env.js";
import type { CreateReviewRequestInput, ResubmitReviewRequestInput } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { auditService } from "../audit/audit.service.js";
import { defaultPeerReviewTemplate, assertPeerReviewer, assertReviewerInTransaction, assertReviewAdmission, lockReviewerAndSubmission, refreshSubmissionReviewStatus } from "./peer-review-access.js";
import { normalizeEmail } from "../identity/identity-foundation.rules.js";
import { createOpaqueToken, hashOpaqueToken } from "../auth/token.service.js";
import { hydrateReviewTemplateVersion } from "./review-template.service.js";
import { ACTIVE_REVIEW_REQUEST_STATUSES } from "./review.constants.js";
import { assertMentorReviewAccess, acceptedMentorReviewPolicy, visibleMentorReviewAssignments } from "./mentor-review-access.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { canCancelReviewRequest, canResubmitReviewRequest, canReviewerDeclineRequest, decodeFeedbackItem, eligiblePeerReviewer, isSuggestionRevisionItem, reviewDeadline } from "./academic-review.rules.js";

const ACTIVE_REQUEST_STATUSES = ACTIVE_REVIEW_REQUEST_STATUSES;

/** Cancelled/declined requests hand the artifact back to DRAFT when no review is active or completed. */
async function releaseArtifactReviewing(tx: Prisma.TransactionClient, submissionId: string, actorId: string) {
  const submission = await tx.submission.findUnique({ where: { id: submissionId }, select: { sourceReportId: true, projectId: true } });
  if (!submission?.sourceReportId) return;
  const report = await tx.report.findUnique({ where: { id: submission.sourceReportId } });
  if (!report || report.artifactStatus !== "REVIEWING") return;
  const [active, completed] = await Promise.all([
    tx.reviewRequest.count({ where: { submissionId, status: { in: ACTIVE_REQUEST_STATUSES } } }),
    tx.reviewRequest.count({ where: { submissionId, status: "COMPLETED" } }),
  ]);
  if (active > 0 || completed > 0) return;
  await tx.report.update({ where: { id: report.id }, data: { artifactStatus: "DRAFT" } });
  await tx.projectActivity.create({ data: { projectId: submission.projectId, actorId, type: "REPORT_STATUS_CHANGED", entityKind: "REPORT", entityId: publicDatabaseId(report), metadata: { title: report.topic ?? report.query, artifactStatus: "DRAFT" } } });
}

/** A report-backed artifact enters REVIEWING as soon as a review request exists. */
async function markArtifactReviewing(tx: Prisma.TransactionClient, submission: { sourceReportId: string | null; projectId: string }, actorId: string) {
  if (!submission.sourceReportId) return;
  const report = await tx.report.findUnique({ where: { id: submission.sourceReportId } });
  if (!report || report.artifactStatus === "REVIEWING") return;
  await tx.report.update({ where: { id: report.id }, data: { artifactStatus: "REVIEWING" } });
  await tx.projectActivity.create({ data: { projectId: submission.projectId, actorId, type: "REPORT_STATUS_CHANGED", entityKind: "REPORT", entityId: publicDatabaseId(report), metadata: { title: report.topic ?? report.query, artifactStatus: "REVIEWING" } } });
}
const EXTERNAL_REVIEW_INVITATION_DAYS = 14;
type CreateExternalReviewInvitationInput = Omit<CreateReviewRequestInput, "reviewerId"> & { reviewerEmail: string };

function whereId(value: string): { id?: string; legacyMongoId?: string } {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

async function resolveUser(input: string) {
  const user = await getPrisma().user.findFirst({ where: whereId(input) });
  if (!user?.isActive) throw AppError.unauthorized();
  return user;
}

async function projectAccess(projectId: string, userId: string) {
  return assertAcademicRelationshipManager(projectId, userId);
}

function reportSubmissionType(artifactType: string): string | undefined {
  if (["RESEARCH_PROPOSAL", "LITERATURE_REVIEW"].includes(artifactType)) return artifactType;
  return artifactType === "RESEARCH_PLAN" ? "SOFTWARE_RESEARCH_PROJECT" : undefined;
}

async function ensureReportSubmission(reportInput: string, actorId: string) {
  const prisma = getPrisma();
  const report = await prisma.report.findFirst({ where: whereId(reportInput) });
  if (!report?.projectId) throw AppError.badRequest("Only project research artifacts can be submitted for review");
  await projectAccess(report.projectId, actorId);
  const project = await prisma.project.findUniqueOrThrow({ where: { id: report.projectId } });
  if (project.deletedAt) throw AppError.notFound("Project not found");
  if (report.userId !== actorId && project.ownerId !== actorId) {
    throw AppError.forbidden("Only the artifact creator or project owner can submit it for review");
  }
  if (report.status !== "ready" || !report.markdown?.trim()) throw AppError.conflict("The research artifact must finish generating before review");
  const markdown = report.markdown;
  const checksum = crypto.createHash("sha256").update(markdown).digest("hex");
  let submission = await prisma.submission.findUnique({ where: { sourceReportId: report.id } });
  if (!submission) {
    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.submission.create({ data: {
        projectId: report.projectId!, sourceReportId: report.id, createdById: actorId,
        title: report.title ?? report.topic ?? report.query.slice(0, 300), abstractText: report.topic,
        submissionType: reportSubmissionType(report.artifactType), status: "ready_for_review", currentRevisionNumber: 1,
      } });
      await tx.submissionAuthor.create({ data: { submissionId: created.id, userId: actorId, position: 0 } });
      const revision = await tx.submissionRevision.create({ data: {
        submissionId: created.id, revisionNumber: 1, uploadedById: actorId,
        checksumSha256: checksum, contentSnapshot: markdown, contentType: "MARKDOWN", sizeBytes: Buffer.byteLength(markdown),
      } });
      return tx.submission.update({ where: { id: created.id }, data: { currentRevisionId: revision.id } });
    });
    submission = result;
  } else {
    submission = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM submissions WHERE id = ${submission!.id}::uuid FOR UPDATE`;
      const live = await tx.submission.findUniqueOrThrow({ where: { id: submission!.id } });
      if (["accepted", "rejected", "withdrawn"].includes(live.status)) throw AppError.conflict("This research is read-only");
      const current = live.currentRevisionId ? await tx.submissionRevision.findUnique({ where: { id: live.currentRevisionId } }) : null;
      if (current?.checksumSha256 === checksum) return live;
      const revision = await tx.submissionRevision.create({ data: {
        submissionId: live.id, revisionNumber: live.currentRevisionNumber + 1, uploadedById: actorId, sourceRevisionId: current?.id,
        checksumSha256: checksum, contentSnapshot: markdown, contentType: "MARKDOWN", sizeBytes: Buffer.byteLength(markdown),
      } });
      await tx.submission.update({ where: { id: live.id }, data: { currentRevisionId: revision.id, currentRevisionNumber: revision.revisionNumber, status: "revised" } });
      await refreshSubmissionReviewStatus(tx, live.id);
      return tx.submission.findUniqueOrThrow({ where: { id: live.id } });
    });
  }
  return submission;
}

async function resolveSubmission(input: Pick<CreateReviewRequestInput, "reportId" | "submissionId">, actorId: string) {
  if (input.reportId) return ensureReportSubmission(input.reportId, actorId);
  if (!input.submissionId) throw AppError.badRequest("Select a research artifact or submission");
  const submission = await getPrisma().submission.findFirst({ where: whereId(input.submissionId) });
  if (!submission) throw AppError.notFound("Submission not found");
  await projectAccess(submission.projectId, actorId);
  const isAuthor = await getPrisma().submissionAuthor.findUnique({ where: { submissionId_userId: { submissionId: submission.id, userId: actorId } } });
  const project = await getPrisma().project.findUniqueOrThrow({ where: { id: submission.projectId } });
  if (project.deletedAt) throw AppError.notFound("Project not found");
  if (!isAuthor && project.ownerId !== actorId) throw AppError.forbidden("Only an author or project owner can request review");
  if (!submission.currentRevisionId) throw AppError.conflict("The submission has no reviewable revision");
  return submission;
}

async function assertTemplateAccess(templateId: string, actorId: string, projectId: string) {
  const template = await getPrisma().reviewTemplate.findUniqueOrThrow({ where: { id: templateId } });
  if (!template.active || template.status !== "PUBLISHED" || (template.source === "PERSONAL" && template.ownerId !== actorId) || (template.source === "PROJECT" && template.projectId !== projectId)) throw AppError.forbidden("This review template is not available for your research");
}

/** Responding to existing feedback does not grant permission to invite/manage mentors. */
async function assertRevisionAuthor(projectId: string, submissionId: string, actorId: string, tx: Prisma.TransactionClient = getPrisma(), allowArchived = false) {
  const [project,user,author,member] = await Promise.all([
    tx.project.findUnique({where:{id:projectId}}), tx.user.findUnique({where:{id:actorId}}),
    tx.submissionAuthor.findUnique({where:{submissionId_userId:{submissionId,userId:actorId}}}),
    tx.projectMember.findFirst({where:{projectId,userId:actorId,status:"ACTIVE"}}),
  ]);
  if (!project || Boolean(project.deletedAt) || !user?.isActive || user.accountStatus !== "ACTIVE" || !user.emailVerifiedAt || (project.ownerId !== actorId && !(author && member))) throw AppError.forbidden("Only active project authors can respond to this manuscript review");
  if (!allowArchived && ["ARCHIVED", "COMPLETED"].includes(project.status)) throw AppError.conflict("Archived or completed projects are read-only");
}

async function requestRecord(input: string) {
  const row = await getPrisma().reviewRequest.findFirst({ where: whereId(input) });
  if (!row) throw AppError.notFound("Review request not found");
  await expireReviewRequests([row.id]);
  return getPrisma().reviewRequest.findUniqueOrThrow({ where: { id: row.id } });
}

async function expireReviewRequests(ids: string[]) {
  const db = getPrisma();
  const now = new Date();
  const rows = await db.reviewRequest.findMany({ where: { id: { in: ids }, status: "REQUESTED", expiresAt: { lte: now } } });
  for (const row of rows) {
    const assignment = await assignmentForRequest(row.id);
    await db.$transaction(async tx => {
      await lockReviewerAndSubmission(tx, assignment.reviewerId, row.submissionId);
      const changed = await tx.reviewRequest.updateMany({ where: { id: row.id, status: "REQUESTED", expiresAt: { lte: now } }, data: { status: "EXPIRED", respondedAt: now } });
      if (changed.count) {
        await tx.reviewerAssignment.updateMany({ where: { reviewRequestId: row.id, status: "assigned" }, data: { status: "cancelled" } });
        await refreshSubmissionReviewStatus(tx, row.submissionId);
      }
    });
  }
}

async function assignmentForRequest(requestId: string) {
  const assignment = await getPrisma().reviewerAssignment.findFirst({ where: { reviewRequestId: requestId } });
  if (!assignment) throw AppError.notFound("Review assignment not found");
  return assignment;
}

async function verifiedEmailsForUser(userId: string): Promise<string[]> {
  const user = await getPrisma().user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
  const linked = await getPrisma().userEmail.findMany({ where: { userId, verifiedAt: { not: null } }, select: { normalizedEmail: true } });
  return [
    ...(user?.emailVerifiedAt ? [normalizeEmail(user.email)] : []),
    ...linked.map((item) => normalizeEmail(item.normalizedEmail)),
  ];
}

async function externalInvitationByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw AppError.notFound("Review invitation not found");
  const invitation = await getPrisma().externalReviewInvitation.findFirst({ where: { tokenHash: hashOpaqueToken(token) } });
  if (!invitation) throw AppError.notFound("Review invitation not found");
  const now = new Date();
  if (invitation.status === "PENDING" && invitation.expiresAt <= now) {
    await getPrisma().externalReviewInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: { status: "EXPIRED", respondedAt: now },
    });
    return { ...invitation, status: "EXPIRED", respondedAt: now };
  }
  return invitation;
}

async function summary(row: Awaited<ReturnType<typeof requestRecord>>, viewerId?: string) {
  const prisma = getPrisma();
  const assignment = await assignmentForRequest(row.id);
  const [submission, requester, revision, reviews, project] = await Promise.all([
    prisma.submission.findUniqueOrThrow({ where: { id: row.submissionId } }),
    prisma.user.findUniqueOrThrow({ where: { id: row.requesterId }, select: { id: true, fullName: true, avatarUrl: true } }),
    prisma.submissionRevision.findUniqueOrThrow({ where: { id: row.artifactRevisionId } }),
    prisma.humanReview.findMany({ where: { assignmentId: assignment.id, ...(viewerId === assignment.reviewerId ? {} : { status: "SUBMITTED" }) }, orderBy: { roundNumber: "asc" } }),
    prisma.project.findUniqueOrThrow({ where: { id: row.projectId }, select: { id: true, legacyMongoId: true, title: true } }),
  ]);
  const [reviewer, sourceReport] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: assignment.reviewerId }, select: { id: true, fullName: true, avatarUrl: true, institution: true } }),
    submission.sourceReportId ? prisma.report.findUnique({ where: { id: submission.sourceReportId }, select: { id: true, legacyMongoId: true } }) : null,
  ]);
  return {
    id: publicDatabaseId(row), origin: row.origin, status: row.status, message: row.message ?? undefined, dueAt: row.dueAt ?? undefined,
    createdAt: row.createdAt, updatedAt: row.updatedAt, respondedAt: row.respondedAt ?? undefined, completedAt: row.completedAt ?? undefined,
    requester: { ...requester, id: publicDatabaseId(requester) }, reviewer: { ...reviewer, id: publicDatabaseId(reviewer) },
    mentorRelationshipActive: Boolean(await prisma.mentorRelationship.findFirst({ where: { projectId: submission.projectId, mentorUserId: assignment.reviewerId, status: "ACTIVE" } })),
    assignment: { id: publicDatabaseId(assignment), status: assignment.status, dueAt: assignment.dueAt ?? undefined },
    artifact: {
      submissionId: publicDatabaseId(submission), title: submission.title, type: submission.submissionType,
      projectId: publicDatabaseId(project), projectTitle: project.title, revisionId: publicDatabaseId(revision), revisionNumber: revision.revisionNumber,
      contentType: revision.contentType, sourceReportId: sourceReport ? publicDatabaseId(sourceReport) : undefined,
    },
    latestReview: reviews.at(-1) ? {
      id: publicDatabaseId(reviews.at(-1)!), roundNumber: reviews.at(-1)!.roundNumber,
      status: reviews.at(-1)!.status, overallAssessment: reviews.at(-1)!.overallAssessment,
      submittedAt: reviews.at(-1)!.submittedAt,
    } : undefined,
  };
}

export const reviewRequestService = {
  /** Upgrade only an explicitly assigned legacy mentor task; old reviews stay unchanged. */
  async prepareMentorReview(submissionInput: string, actorInput: string) {
    const { user } = await assertPeerReviewer(actorInput);
    const submission = await getPrisma().submission.findFirstOrThrow({ where: whereId(submissionInput) });
    return getPrisma().$transaction(async tx => {
      await lockReviewerAndSubmission(tx, user.id, submission.id);
      await tx.$queryRaw`SELECT id FROM projects WHERE id=${submission.projectId}::uuid FOR UPDATE`;
      const existing = await tx.reviewerAssignment.findFirst({ where: { submissionId: submission.id, reviewerId: user.id, status: { in: ["assigned", "accepted"] } }, orderBy: { createdAt: "desc" } });
      if (!existing) throw AppError.notFound("Ask the project owner to request mentor review for this revision");
      if (existing.reviewRequestId) {
        await assertMentorReviewAccess(tx, submission.projectId, user.id, submission.id, existing.id);
        const request = await tx.reviewRequest.findUniqueOrThrow({ where: { id: existing.reviewRequestId } });
        if (request.status === "REQUESTED") throw AppError.conflict("Accept this invitation in the Review Center before opening the review workspace");
        return { assignmentId: existing.id, requestId: existing.reviewRequestId };
      }
      if (!existing.anonymousCode.startsWith("mentor-")) throw AppError.forbidden("Only assigned mentor tasks can use this adapter");
      const policy = await acceptedMentorReviewPolicy(tx, submission.projectId, user.id);
      const sentTask = await tx.projectTask.findFirst({ where: { projectId: submission.projectId, targetKind: "submission", targetId: submission.id, assigneeId: user.id, createdById: existing.assignedById, title: { startsWith: "Cần góp ý bản thảo" }, deletedAt: null } });
      // A retained sender-created task is evidence of explicit manuscript delivery.
      // This adapter cannot grant access from a guessed ID or a mentorship alone.
      if (sentTask) await assertRevisionAuthor(submission.projectId, submission.id, existing.assignedById, tx);
      else await assertMentorReviewAccess(tx, submission.projectId, user.id, submission.id, existing.id);
      await assertReviewAdmission(tx, submission.id, user.id, { excludeAssignmentId: existing.id, mentorGuidance: true });
      const revisionId = existing.artifactRevisionId;
      if (!revisionId || !await tx.submissionRevision.findFirst({ where: { id: revisionId, submissionId: submission.id } })) throw AppError.conflict("The mentor task has no pinned manuscript revision");
      const template = await defaultPeerReviewTemplate(tx, submission.submissionType);
      const request = await tx.reviewRequest.create({ data: { submissionId: submission.id, projectId: submission.projectId, requesterId: existing.assignedById, templateVersionId: template.id, artifactRevisionId: revisionId, origin: "MENTOR_GUIDANCE", status: "ACCEPTED", respondedAt: new Date(), dueAt: existing.dueAt } });
      await tx.reviewerAssignment.update({ where: { id: existing.id }, data: { reviewRequestId: request.id, status: "accepted", mentorAccessId: sentTask ? policy.id : null } });
      await tx.submission.update({ where: { id: submission.id }, data: { status: "under_review" } });
      await tx.projectTask.updateMany({where:{projectId:submission.projectId,targetKind:"submission",targetId:submission.id,assigneeId:user.id,title:{startsWith:"Cần góp ý bản thảo"},status:"TODO"},data:{status:"IN_PROGRESS"}});
      await tx.auditLog.create({ data: { userId: user.id, actionName: "MENTOR_REVIEW_ACCESS_UPGRADED", targetTableName: "reviewer_assignments", targetRecordId: existing.id, details: { requestId: request.id, revisionId, senderId: existing.assignedById } } });
      return { assignmentId: existing.id, requestId: request.id };
    });
  },
  async externalInvitationPreview(token: string) {
    const invitation = await externalInvitationByToken(token);
    const [requester, submission, project, template] = await Promise.all([
      getPrisma().user.findUniqueOrThrow({ where: { id: invitation.requesterId }, select: { fullName: true, institution: true } }),
      getPrisma().submission.findUniqueOrThrow({ where: { id: invitation.submissionId }, select: { title: true, submissionType: true } }),
      getPrisma().project.findUniqueOrThrow({ where: { id: invitation.projectId }, select: { title: true } }),
      getPrisma().reviewTemplateVersion.findUniqueOrThrow({ where: { id: invitation.templateVersionId }, select: { reviewMode: true } }),
    ]);
    return {
      id: invitation.id,
      reviewerEmail: invitation.reviewerEmail,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      dueAt: invitation.dueAt?.toISOString(),
      message: invitation.message ?? undefined,
      requester,
      project: { title: project.title },
      artifact: { title: submission.title, type: submission.submissionType },
      reviewMode: template.reviewMode,
    };
  },

  async createExternalInvitation(input: CreateExternalReviewInvitationInput, actorInput: string) {
    const actor = await resolveUser(actorInput);
    const [submission, version] = await Promise.all([
      resolveSubmission(input, actor.id),
      getPrisma().reviewTemplateVersion.findFirst({ where: { ...whereId(input.templateVersionId), status: "PUBLISHED" } }),
    ]);
    if (!version) throw AppError.badRequest("Select a published review template version");
    await assertTemplateAccess(version.templateId, actor.id, submission.projectId);
    const reviewerEmail = normalizeEmail(input.reviewerEmail);
    const token = createOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EXTERNAL_REVIEW_INVITATION_DAYS * 24 * 60 * 60 * 1000);
    const existingUserEmail = await getPrisma().userEmail.findUnique({ where: { normalizedEmail: reviewerEmail }, select: { userId: true, verifiedAt: true } });
    const existingUser = existingUserEmail?.verifiedAt
      ? await getPrisma().user.findUnique({ where: { id: existingUserEmail.userId }, select: { id: true } })
      : await getPrisma().user.findUnique({ where: { email: reviewerEmail }, select: { id: true, emailVerifiedAt: true } });
    const invitation = await getPrisma().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${submission.projectId}::uuid FOR UPDATE`;
      await assertAcademicRelationshipManager(submission.projectId, actor.id, tx);
      await tx.externalReviewInvitation.updateMany({ where: { submissionId: submission.id, reviewerEmail, status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED", respondedAt: now } });
      if (await tx.externalReviewInvitation.findFirst({ where: { submissionId: submission.id, reviewerEmail, status: "PENDING" } })) throw AppError.conflict("A pending invitation already exists for this reviewer and artifact");
      const cutoff = new Date(now.getTime() - env.ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS * 3600000);
      if (await tx.externalReviewInvitation.findFirst({ where: { submissionId: submission.id, reviewerEmail, status: { in: ["DECLINED", "CANCELLED"] }, respondedAt: { gt: cutoff } } })) throw AppError.conflict("Wait before inviting this reviewer again");
      if (await tx.externalReviewInvitation.count({ where: { requesterId: actor.id, createdAt: { gt: new Date(now.getTime() - 3600000) } } }) >= env.ACADEMIC_RELATIONSHIP_REQUEST_LIMIT) throw AppError.conflict("Review invitation limit reached; try later");
      return tx.externalReviewInvitation.create({
      data: {
        tokenHash: hashOpaqueToken(token),
        reviewerEmail,
        invitedUserId: existingUser?.id,
        requesterId: actor.id,
        submissionId: submission.id,
        projectId: submission.projectId,
        templateVersionId: version.id,
        artifactRevisionId: submission.currentRevisionId!,
        message: input.message?.trim() || undefined,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        expiresAt,
      },
      });
    });
    await auditService.log("EXTERNAL_REVIEW_INVITATION_CREATED", {
      userId: actor.id,
      targetTableName: "external_review_invitations",
      targetRecordId: invitation.id,
      details: { submissionId: submission.id, templateVersionId: version.id },
    });
    if (existingUser?.id) {
      await createReviewNotification({
        userId: existingUser.id,
        title: "External academic review invitation",
        message: `${actor.fullName} invited you to review “${submission.title}”.`,
        type: "REVIEW_REQUESTED",
        targetKind: "project",
        targetId: submission.projectId,
      });
    }
    return { id: invitation.id, token, expiresAt: expiresAt.toISOString(), reviewerEmail };
  },

  async reviewerCandidates(actorInput: string, query?: string, scope: { reportId?: string; submissionId?: string } = {}) {
    const actor = await resolveUser(actorInput);
    // Owners and active members of the artifact's project are rejected at request time, so do not offer them.
    const scopedProjectId = scope.reportId
      ? (await getPrisma().report.findFirst({ where: whereId(scope.reportId), select: { projectId: true } }))?.projectId
      : scope.submissionId ? (await getPrisma().submission.findFirst({ where: whereId(scope.submissionId), select: { projectId: true } }))?.projectId : null;
    const contributorIds = new Set<string>();
    if (scopedProjectId) {
      const [project, members] = await Promise.all([
        getPrisma().project.findUnique({ where: { id: scopedProjectId }, select: { ownerId: true } }),
        getPrisma().projectMember.findMany({ where: { projectId: scopedProjectId, status: "ACTIVE" }, select: { userId: true } }),
      ]);
      if (project) contributorIds.add(project.ownerId);
      for (const member of members) contributorIds.add(member.userId);
    }
    const capabilities = await getPrisma().academicProfile.findMany({
      where: { academicRole: "LECTURER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED" },
      select: { userId: true }, take: 100,
    });
    const users = await getPrisma().user.findMany({
      where: {
        id: { in: capabilities.map((item) => item.userId).filter((id) => id !== actor.id && !contributorIds.has(id)) }, isActive: true, accountStatus: "ACTIVE",
        ...(query ? { OR: [{ fullName: { contains: query, mode: "insensitive" } }, { institution: { contains: query, mode: "insensitive" } }] } : {}),
      },
      select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true, institution: true }, take: 30,
    });
    const profiles = await getPrisma().academicProfile.findMany({ where: { userId: { in: users.map((item) => item.id) } }, select: { userId: true, expertiseAreas: true, reviewAvailability: true } });
    const profileMap = new Map(profiles.map((item) => [item.userId, item]));
    const assignedMentors = scopedProjectId ? await getPrisma().mentorRelationship.findMany({ where: { projectId: scopedProjectId, status: "ACTIVE" }, select: { mentorUserId: true } }) : [];
    return users.map((user) => ({
      id: publicDatabaseId(user), name: user.fullName, avatarUrl: user.avatarUrl ?? undefined,
      institution: user.institution ?? undefined, expertiseAreas: profileMap.get(user.id)?.expertiseAreas ?? [],
      availableForReview: (profileMap.get(user.id)?.reviewAvailability as { enabled?: boolean } | null)?.enabled === true,
      assignedMentor: assignedMentors.some(mentor => mentor.mentorUserId === user.id),
    }));
  },

  async create(input: CreateReviewRequestInput, actorInput: string) {
    const actor = await resolveUser(actorInput);
    const [submission, reviewer, version] = await Promise.all([
      resolveSubmission(input, actor.id), resolveUser(input.reviewerId),
      getPrisma().reviewTemplateVersion.findFirst({ where: { ...whereId(input.templateVersionId), status: "PUBLISHED" } }),
    ]);
    if (!version) throw AppError.badRequest("Select a published review template version");
    await assertTemplateAccess(version.templateId, actor.id, submission.projectId);
    if (reviewer.id === actor.id) throw AppError.conflict("You cannot review your own artifact");
    await assertPeerReviewer(reviewer.id);
    await expireReviewRequests((await getPrisma().reviewRequest.findMany({ where: { submissionId: submission.id, status: "REQUESTED" }, select: { id: true } })).map(r => r.id));
    const [membership, owned, duplicate] = await Promise.all([
      getPrisma().projectMember.findUnique({ where: { projectId_userId: { projectId: submission.projectId, userId: reviewer.id } } }),
      getPrisma().project.findFirst({ where: { id: submission.projectId, ownerId: reviewer.id } }),
      getPrisma().reviewRequest.findFirst({
        where: {
          submissionId: submission.id, status: { in: ACTIVE_REQUEST_STATUSES },
          id: { in: (await getPrisma().reviewerAssignment.findMany({ where: { reviewerId: reviewer.id, reviewRequestId: { not: null } }, select: { reviewRequestId: true } })).flatMap((item) => item.reviewRequestId ? [item.reviewRequestId] : []) },
        },
      }),
    ]);
    if (membership?.status === "ACTIVE" || owned) throw AppError.conflict("Project contributors cannot review this artifact");
    if (duplicate) throw AppError.conflict("This reviewer already has an active request for this artifact");
    const created = await getPrisma().$transaction(async (tx) => {
      await lockReviewerAndSubmission(tx, reviewer.id, submission.id);
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${submission.projectId}::uuid FOR UPDATE`;
      await assertAcademicRelationshipManager(submission.projectId, actor.id, tx);
      const cutoff = new Date(Date.now() - env.ACADEMIC_RELATIONSHIP_COOLDOWN_HOURS * 3600000);
      if (await tx.reviewRequest.count({ where: { requesterId: actor.id, createdAt: { gt: new Date(Date.now() - 3600000) } } }) >= env.ACADEMIC_RELATIONSHIP_REQUEST_LIMIT) throw AppError.conflict("Academic review request limit reached; try later");
      const priorIds = (await tx.reviewerAssignment.findMany({ where: { submissionId: submission.id, reviewerId: reviewer.id, reviewRequestId: { not: null } }, select: { reviewRequestId: true } })).flatMap(r => r.reviewRequestId ? [r.reviewRequestId] : []);
      if (await tx.reviewRequest.findFirst({ where: { id: { in: priorIds }, status: { in: ["DECLINED", "CANCELLED"] }, updatedAt: { gt: cutoff } } })) throw AppError.conflict("Wait before requesting this reviewer again");
      const mentorGuidance = input.purpose === "MENTOR_GUIDANCE" || Boolean(await tx.mentorRelationship.findFirst({where:{projectId:submission.projectId,mentorUserId:reviewer.id,status:"ACTIVE"}}));
      const legacy = mentorGuidance ? await tx.reviewerAssignment.findFirst({ where: { submissionId: submission.id, reviewerId: reviewer.id, reviewRequestId: null, anonymousCode: { startsWith: "mentor-" }, status: { in: ["assigned", "accepted"] } } }) : null;
      const liveSubmission = await assertReviewAdmission(tx, submission.id, reviewer.id, { mentorGuidance, excludeAssignmentId: legacy?.id });
      const mentorPolicy = mentorGuidance ? await acceptedMentorReviewPolicy(tx, submission.projectId, reviewer.id) : null;
      const revision = await tx.submissionRevision.findFirst({ where: { id: input.revisionId ?? liveSubmission.currentRevisionId ?? "", submissionId: submission.id } });
      if (!revision) throw AppError.badRequest("Select a saved manuscript revision before requesting review");
      const template = await tx.reviewTemplate.findUniqueOrThrow({ where: { id: version.templateId } });
      if (template.artifactType && template.artifactType !== "MANUSCRIPT" && submission.submissionType && template.artifactType !== submission.submissionType) throw AppError.badRequest("Choose a template appropriate to this artifact type");
      const request = await tx.reviewRequest.create({ data: {
        submissionId: submission.id, projectId: submission.projectId, requesterId: actor.id,
        templateVersionId: version.id, artifactRevisionId: revision.id,
        message: input.message?.trim() || undefined, dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        expiresAt: new Date(Date.now() + env.ACADEMIC_RELATIONSHIP_REQUEST_EXPIRY_DAYS * 86400000),
        origin: mentorGuidance ? "MENTOR_GUIDANCE" : "DIRECT_INVITATION",
      } });
      const assignmentData = {
        submissionId: submission.id, reviewRequestId: request.id, artifactRevisionId: request.artifactRevisionId, reviewerId: reviewer.id, assignedById: actor.id,
        mentorAccessId: mentorPolicy?.id ?? null,
        anonymousCode: `R-${crypto.randomBytes(12).toString("hex")}`, status: "assigned", dueAt: request.dueAt,
        conflictChecks: { selfOrAuthor: false, projectContributor: false, checkedAt: new Date().toISOString() },
      };
      const assignment = legacy ? await tx.reviewerAssignment.update({ where: { id: legacy.id }, data: assignmentData }) : await tx.reviewerAssignment.create({ data: assignmentData });
      if (legacy) await tx.projectTask.updateMany({ where: { projectId: submission.projectId, assigneeId: reviewer.id, targetKind: "submission", targetId: submission.id, title: { startsWith: "Cần góp ý bản thảo" }, status: { not: "DONE" } }, data: { status: "DONE", completedAt: new Date(), completedById: actor.id } });
      await tx.submission.update({ where: { id: submission.id }, data: { status: "under_review" } });
      await markArtifactReviewing(tx, submission, actor.id);
      const notification = await createReviewNotification({ userId: reviewer.id, title: "New academic review request", message: `${actor.fullName} invited you to review “${submission.title}”.`, type: "REVIEW_REQUESTED", targetKind: "review_request", targetId: request.id, eventKey: `REVIEW_REQUEST_CREATED:${request.id}` }, tx);
      return { request, assignment, notification };
    });
    await Promise.all([
      auditService.log("REVIEW_REQUEST_CREATED", { userId: actor.id, targetTableName: "review_requests", targetRecordId: created.request.id, details: { submissionId: submission.id, reviewerId: reviewer.id, templateVersionId: version.id, mentorAccessId: created.assignment.mentorAccessId, revisionId: created.request.artifactRevisionId } }),
      dispatchReviewNotifications([created.notification]),
    ]);
    return summary(created.request);
  },

  async listCenter(actorInput: string) {
    const actor = await resolveUser(actorInput);
    const assignments = await visibleMentorReviewAssignments(getPrisma(), await getPrisma().reviewerAssignment.findMany({ where: { reviewerId: actor.id, reviewRequestId: { not: null } } }));
    const incomingIds = assignments.flatMap((item) => item.reviewRequestId ? [item.reviewRequestId] : []);
    const sentIds = (await getPrisma().reviewRequest.findMany({ where: { requesterId: actor.id, status: "REQUESTED" }, select: { id: true } })).map(r => r.id);
    await expireReviewRequests([...incomingIds, ...sentIds]);
    const [incoming, rawSent] = await Promise.all([
      getPrisma().reviewRequest.findMany({ where: { id: { in: incomingIds } }, orderBy: { updatedAt: "desc" } }),
      getPrisma().reviewRequest.findMany({ where: { requesterId: actor.id }, orderBy: { updatedAt: "desc" } }),
    ]);
    const activeSentProjects = rawSent.length
      ? new Set((await getPrisma().project.findMany({ where: { id: { in: [...new Set(rawSent.map(r => r.projectId))] }, deletedAt: null }, select: { id: true } })).map(p => p.id))
      : new Set<string>();
    const sent = rawSent.filter(r => activeSentProjects.has(r.projectId));
    return { incoming: await Promise.all(incoming.map((row) => summary(row, actor.id))), sent: await Promise.all(sent.map((row) => summary(row, actor.id))) };
  },

  async detail(requestInput: string, actorInput: string) {
    const actor = await resolveUser(actorInput);
    const request = await requestRecord(requestInput);
    const project = await getPrisma().project.findUnique({ where: { id: request.projectId }, select: { deletedAt: true } });
    if (!project || project.deletedAt) throw AppError.notFound("Project not found");
    const assignment = await assignmentForRequest(request.id);
    if (actor.id !== assignment.reviewerId) await assertRevisionAuthor(request.projectId, request.submissionId, actor.id, getPrisma(), true);
    let canRespond = false;
    if (actor.id !== assignment.reviewerId) { try { await assertRevisionAuthor(request.projectId, request.submissionId, actor.id); canRespond = true; } catch { /* Historical reads do not grant write access. */ } }
    if (actor.id === assignment.reviewerId && request.origin === "MENTOR_GUIDANCE") await assertMentorReviewAccess(getPrisma(), request.projectId, actor.id, request.submissionId, assignment.id);
    const prisma = getPrisma();
    const reviewerProfile = actor.id === assignment.reviewerId ? await prisma.academicProfile.findUnique({ where: { userId: actor.id } }) : null;
    const canWork = ["accepted", "completed"].includes(assignment.status) && actor.id === assignment.reviewerId && actor.accountStatus === "ACTIVE" && Boolean(actor.emailVerifiedAt) && reviewerProfile?.positionStatus === "VERIFIED" && eligiblePeerReviewer(reviewerProfile?.academicRole, reviewerProfile?.roleVerificationStatus) && !["cancelled", "declined"].includes(assignment.status);
    const [base, revision, templateVersion, reviews] = await Promise.all([
      summary(request, canWork ? actor.id : undefined), prisma.submissionRevision.findUniqueOrThrow({ where: { id: request.artifactRevisionId } }),
      hydrateReviewTemplateVersion(request.templateVersionId),
      prisma.humanReview.findMany({ where: { assignmentId: assignment.id, ...(canWork ? {} : { status: "SUBMITTED" }) }, orderBy: { roundNumber: "asc" } }),
    ]);
    if (revision.submissionId !== request.submissionId || assignment.submissionId !== request.submissionId || assignment.artifactRevisionId !== request.artifactRevisionId) throw AppError.conflict("Review assignment does not match the target artifact");
    const reviewDetails = await Promise.all(reviews.map(async (review) => ({
      ...review, id: publicDatabaseId(review),
      artifactRevision: await prisma.submissionRevision.findFirstOrThrow({ where: { id: review.revisionId, submissionId: request.submissionId }, select: { id: true, revisionNumber: true, contentType: true } }),
      templateVersion: review.templateVersionId ? await hydrateReviewTemplateVersion(review.templateVersionId) : undefined,
      responses: await prisma.reviewResponse.findMany({ where: { reviewId: review.id } }),
      requiredRevisions: await Promise.all((await prisma.reviewRevisionItem.findMany({ where: { reviewId: review.id }, orderBy: { position: "asc" } })).map(async (item) => ({ ...decodeFeedbackItem(item), responses: await prisma.reviewRevisionResponse.findMany({ where: { revisionItemId: item.id, ...(actor.id === assignment.reviewerId ? { status: { not: "DRAFT" } } : {}) }, orderBy: { createdAt: "asc" } }) }))),
    })));
    return {
      ...base, canRespond, templateVersion, artifactContent: actor.id === assignment.reviewerId && !canWork ? undefined : revision.contentSnapshot ?? undefined,
      reviews: reviewDetails,
    };
  },

  async accept(requestInput: string, actorInput: string) {
    const actor = await resolveUser(actorInput); const request = await requestRecord(requestInput); const assignment = await assignmentForRequest(request.id);
    if (assignment.reviewerId !== actor.id) throw AppError.forbidden();
    await assertPeerReviewer(actor.id);
    if (request.origin === "MENTOR_GUIDANCE") await assertMentorReviewAccess(getPrisma(), request.projectId, actor.id, request.submissionId, assignment.id);
    if (["ACCEPTED","IN_REVIEW","REVISION_REQUESTED","RESUBMITTED","COMPLETED"].includes(request.status) && ["accepted","completed"].includes(assignment.status)) return;
    if (request.status !== "REQUESTED" || assignment.status !== "assigned") throw AppError.conflict("This review request can no longer be accepted");
    const changed = await getPrisma().$transaction(async (tx) => {
      await lockReviewerAndSubmission(tx, actor.id, request.submissionId);
      const live = await tx.reviewRequest.findUniqueOrThrow({where:{id:request.id}});
      if (["ACCEPTED","IN_REVIEW","REVISION_REQUESTED","RESUBMITTED","COMPLETED"].includes(live.status)) return false;
      await assertReviewAdmission(tx, request.submissionId, actor.id, { excludeAssignmentId: assignment.id, mentorGuidance: request.origin === "MENTOR_GUIDANCE" });
      if (request.origin === "MENTOR_GUIDANCE") await assertMentorReviewAccess(tx, request.projectId, actor.id, request.submissionId, assignment.id);
      const claimed = await tx.reviewRequest.updateMany({ where: { id: request.id, status: "REQUESTED", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, data: { status: "ACCEPTED", respondedAt: new Date() } });
      if (claimed.count !== 1) throw AppError.conflict("This request was already handled");
      await tx.reviewerAssignment.update({ where: { id: assignment.id }, data: { status: "accepted", artifactRevisionId: request.artifactRevisionId } });
      return true;
    });
    if (!changed) return;
    await Promise.all([
      auditService.log("REVIEW_REQUEST_ACCEPTED", { userId: actor.id, targetTableName: "review_requests", targetRecordId: request.id }),
      createReviewNotification({ userId: request.requesterId, title: "Review request accepted", message: `${actor.fullName} accepted your academic review request.`, type: "REVIEW_REQUEST_ACCEPTED", targetKind: "review_request", targetId: request.id }),
    ]);
  },

  async acceptExternalInvitation(token: string, actorInput: string) {
    const actor = await resolveUser(actorInput);
    const invitation = await externalInvitationByToken(token);
    if (invitation.status !== "PENDING") throw AppError.conflict("This review invitation is no longer pending");
    const ownsInvitedEmail = (await verifiedEmailsForUser(actor.id)).includes(normalizeEmail(invitation.reviewerEmail));
    if (!ownsInvitedEmail) throw AppError.forbidden("Verify the invited email address before accepting this review invitation");
    await assertPeerReviewer(actor.id);
    const submission = await getPrisma().submission.findUniqueOrThrow({ where: { id: invitation.submissionId } });
    if (await getPrisma().submissionAuthor.findUnique({ where: { submissionId_userId: { submissionId: submission.id, userId: actor.id } } })) {
      throw AppError.conflict("You cannot review your own artifact");
    }
    const [membership, owned, duplicate] = await Promise.all([
      getPrisma().projectMember.findUnique({ where: { projectId_userId: { projectId: submission.projectId, userId: actor.id } } }),
      getPrisma().project.findFirst({ where: { id: submission.projectId, ownerId: actor.id } }),
      getPrisma().reviewerAssignment.findFirst({ where: { submissionId: submission.id, reviewerId: actor.id, status: { notIn: ["declined", "cancelled", "completed"] } } }),
    ]);
    if (membership?.status === "ACTIVE" || owned) throw AppError.conflict("Project contributors cannot review this artifact");
    if (duplicate) throw AppError.conflict("This reviewer already has an active request for this artifact");
    const now = new Date();
    const created = await getPrisma().$transaction(async (tx) => {
      await lockReviewerAndSubmission(tx, actor.id, submission.id);
      await assertReviewAdmission(tx, submission.id, actor.id);
      const claimed = await tx.externalReviewInvitation.updateMany({
        where: { id: invitation.id, status: "PENDING", expiresAt: { gt: now } },
        data: { status: "ACCEPTED", invitedUserId: actor.id, respondedAt: now },
      });
      if (claimed.count !== 1) throw AppError.conflict("This review invitation was already handled");
      const request = await tx.reviewRequest.create({ data: {
        submissionId: submission.id,
        projectId: submission.projectId,
        requesterId: invitation.requesterId,
        templateVersionId: invitation.templateVersionId,
        artifactRevisionId: invitation.artifactRevisionId,
        status: "ACCEPTED",
        respondedAt: now,
        origin: "EXTERNAL_INVITATION",
        message: invitation.message,
        dueAt: invitation.dueAt,
      } });
      const assignment = await tx.reviewerAssignment.create({ data: {
        submissionId: submission.id,
        reviewRequestId: request.id,
        artifactRevisionId: request.artifactRevisionId,
        reviewerId: actor.id,
        assignedById: invitation.requesterId,
        anonymousCode: `R-${crypto.randomBytes(12).toString("hex")}`,
        status: "accepted",
        dueAt: invitation.dueAt,
        conflictChecks: { selfOrAuthor: false, projectContributor: false, checkedAt: now.toISOString() },
      } });
      await tx.submission.updateMany({ where: { id: submission.id, status: { in: ["submitted", "ready_for_review", "revised"] } }, data: { status: "under_review" } });
      await markArtifactReviewing(tx, submission, invitation.requesterId);
      return { request, assignment };
    });
    await Promise.all([
      auditService.log("EXTERNAL_REVIEW_INVITATION_ACCEPTED", {
        userId: actor.id,
        targetTableName: "external_review_invitations",
        targetRecordId: invitation.id,
        details: { reviewRequestId: created.request.id, assignmentId: created.assignment.id },
      }),
      createReviewNotification({
        userId: invitation.requesterId,
        title: "External review invitation accepted",
        message: `${actor.fullName} accepted your academic review invitation.`,
        type: "REVIEW_REQUEST_ACCEPTED",
        targetKind: "review_request",
        targetId: created.request.id,
      }),
    ]);
    return summary(created.request);
  },

  async decline(requestInput: string, actorInput: string, reason?: string) {
    const actor = await resolveUser(actorInput); const request = await requestRecord(requestInput); const assignment = await assignmentForRequest(request.id);
    if (assignment.reviewerId !== actor.id) throw AppError.forbidden();
    if (request.status === "DECLINED" && assignment.status === "declined") return;
    let replayed = false;
    const submittedReviews = await getPrisma().humanReview.count({ where: { assignmentId: assignment.id, status: "SUBMITTED" } });
    if (!canReviewerDeclineRequest(request.status as never, submittedReviews)) {
      throw AppError.conflict(submittedReviews ? "You already submitted a review round, so you can no longer withdraw from this review" : "This review request can no longer be declined");
    }
    const withdrawing = request.status !== "REQUESTED";
    await getPrisma().$transaction(async (tx) => {
      await lockReviewerAndSubmission(tx, assignment.reviewerId, request.submissionId);
      const liveRequest = await tx.reviewRequest.findUniqueOrThrow({where:{id:request.id}});
      if (liveRequest.status === "DECLINED") { replayed = true; return; }
      const liveSubmittedReviews = await tx.humanReview.count({ where: { assignmentId: assignment.id, status: "SUBMITTED" } });
      if (!canReviewerDeclineRequest(request.status as never, liveSubmittedReviews)) {
        throw AppError.conflict("You already submitted a review round, so you can no longer withdraw from this review");
      }
      // Claim the exact status we validated so a concurrent change is never overwritten.
      const now = new Date();
      const changed = await tx.reviewRequest.updateMany({
        where: { id: request.id, status: request.status,
          ...(request.status === "REQUESTED" ? { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } : {}) },
        data: { status: "DECLINED", respondedAt: now },
      });
      if (!changed.count) throw AppError.conflict("This request has already changed");
      await tx.reviewerAssignment.update({ where: { id: assignment.id }, data: { status: "declined", reviewText: reason?.trim() || undefined } });
      await refreshSubmissionReviewStatus(tx, request.submissionId);
      await releaseArtifactReviewing(tx, request.submissionId, request.requesterId);
    });
    if (replayed) return;
    await Promise.all([
      auditService.log("REVIEW_REQUEST_DECLINED", { userId: actor.id, targetTableName: "review_requests", targetRecordId: request.id, details: {} }),
      createReviewNotification({
        userId: request.requesterId,
        title: withdrawing ? "Reviewer withdrew" : "Review request declined",
        message: withdrawing ? `${actor.fullName} withdrew from the review. You can invite another reviewer.` : `${actor.fullName} declined the review request.`,
        type: "REVIEW_REQUEST_DECLINED", targetKind: "review_request", targetId: request.id,
      }),
    ]);
  },

  async cancel(requestInput: string, actorInput: string) {
    const actor = await resolveUser(actorInput); const request = await requestRecord(requestInput); const assignment = await assignmentForRequest(request.id);
    await assertAcademicRelationshipManager(request.projectId, actor.id);
    if (request.requesterId !== actor.id) throw AppError.forbidden();
    if (request.status === "CANCELLED" && assignment.status === "cancelled") return;
    let replayed = false;
    if (!canCancelReviewRequest({ status: request.status as never, dueAt: request.dueAt, createdAt: request.createdAt })) {
      throw AppError.conflict(["ACCEPTED", "IN_REVIEW"].includes(request.status)
        ? `The reviewer has accepted this request. You can cancel it only if the review is still not delivered after ${reviewDeadline(request).toISOString().slice(0, 10)}.`
        : "This review request can no longer be cancelled");
    }
    await getPrisma().$transaction(async (tx) => {
      await lockReviewerAndSubmission(tx, assignment.reviewerId, request.submissionId);
      await assertAcademicRelationshipManager(request.projectId, actor.id, tx);
      if ((await tx.reviewRequest.findUniqueOrThrow({where:{id:request.id}})).status === "CANCELLED") { replayed = true; return; }
      // Claim the exact status we validated: a request accepted in the meantime must not be cancelled.
      const changed = await tx.reviewRequest.updateMany({ where: { id: request.id, status: request.status }, data: { status: "CANCELLED", respondedAt: new Date() } });
      if (!changed.count) throw AppError.conflict("This request has already changed");
      await tx.reviewerAssignment.update({ where: { id: assignment.id }, data: { status: "cancelled" } });
      await refreshSubmissionReviewStatus(tx, request.submissionId);
      await releaseArtifactReviewing(tx, request.submissionId, actor.id);
    });
    if (replayed) return;
    await Promise.all([
      auditService.log("REVIEW_REQUEST_CANCELLED", { userId: actor.id, targetTableName: "review_requests", targetRecordId: request.id }),
      createReviewNotification({ userId: assignment.reviewerId, title: "Review request cancelled", message: `${actor.fullName} cancelled the review request.`, type: "REVIEW_REQUEST_CANCELLED", targetKind: "review_request", targetId: request.id }),
    ]);
  },

  async saveResponseDrafts(requestInput: string, actorInput: string, input: ResubmitReviewRequestInput) {
    const actor = await resolveUser(actorInput); const request = await requestRecord(requestInput); const assignment = await assignmentForRequest(request.id);
    await assertRevisionAuthor(request.projectId, request.submissionId, actor.id);
    await getPrisma().$transaction(async tx => {
      await lockReviewerAndSubmission(tx, assignment.reviewerId, request.submissionId);
      await assertRevisionAuthor(request.projectId, request.submissionId, actor.id, tx);
      const current = await tx.reviewRequest.findUniqueOrThrow({where:{id:request.id}});
      if (current.status !== "REVISION_REQUESTED") throw AppError.conflict("This request is not waiting for author responses");
      const revision = input.revisionId ? await tx.submissionRevision.findFirst({where:{...whereId(input.revisionId),submissionId:request.submissionId}}) : null;
      const previous = await tx.submissionRevision.findUniqueOrThrow({where:{id:current.artifactRevisionId}});
      if (!revision || revision.revisionNumber <= previous.revisionNumber) throw AppError.badRequest("Select a newer artifact revision");
      if (new Set(input.responses.map(r=>r.revisionItemId)).size !== input.responses.length) throw AppError.badRequest("Duplicate response item");
      const reviews = await tx.humanReview.findMany({where:{assignmentId:assignment.id,status:"SUBMITTED"},select:{id:true}});
      for (const response of input.responses) {
        const item = await tx.reviewRevisionItem.findFirst({where:{...whereId(response.revisionItemId),reviewId:{in:reviews.map(r=>r.id)},status:{in:["OPEN","REOPENED"]}}});
        if (!item) throw AppError.badRequest("Respond only to this request's open revision items");
        const key = {revisionItemId:item.id,submissionRevisionId:revision.id};
        const saved = await tx.reviewRevisionResponse.findUnique({where:{revisionItemId_submissionRevisionId:key}});
        if (saved && saved.status !== "DRAFT") throw AppError.conflict("Submitted responses are immutable");
        if (!response.responseText.trim()) { if (saved) await tx.reviewRevisionResponse.delete({where:{id:saved.id}}); continue; }
        await tx.reviewRevisionResponse.upsert({where:{revisionItemId_submissionRevisionId:key},create:{...key,responseText:response.responseText.trim(),status:"DRAFT"},update:{responseText:response.responseText.trim()}});
      }
    });
    await auditService.log("REVIEW_RESPONSE_DRAFT_SAVED",{userId:actor.id,targetTableName:"review_requests",targetRecordId:request.id,details:{revisionId:input.revisionId}});
  },

  async resubmit(requestInput: string, actorInput: string, input: ResubmitReviewRequestInput) {
    const actor = await resolveUser(actorInput); const request = await requestRecord(requestInput); const assignment = await assignmentForRequest(request.id);
    await assertRevisionAuthor(request.projectId, request.submissionId, actor.id);
    let replayed = false;
    const pendingNotifications: Awaited<ReturnType<typeof createReviewNotification>>[] = [];
    const revision = await getPrisma().$transaction(async (tx) => {
      await lockReviewerAndSubmission(tx, assignment.reviewerId, request.submissionId);
      await tx.$queryRaw`SELECT id FROM projects WHERE id=${request.projectId}::uuid FOR UPDATE`;
      const current = await tx.reviewRequest.findUniqueOrThrow({ where: { id: request.id } });
      await assertRevisionAuthor(request.projectId, request.submissionId, actor.id, tx);
      if (current.origin === "MENTOR_GUIDANCE") await assertMentorReviewAccess(tx, current.projectId, assignment.reviewerId, current.submissionId, assignment.id);
      if (!canResubmitReviewRequest(current.status as never)) {
        const repeated = input.revisionId === current.artifactRevisionId && ["RESUBMITTED", "IN_REVIEW"].includes(current.status);
        const reviewIds = repeated ? (await tx.humanReview.findMany({where:{assignmentId:assignment.id,status:"SUBMITTED"},select:{id:true}})).map(r=>r.id) : [];
        const itemIds = repeated ? (await tx.reviewRevisionItem.findMany({where:{reviewId:{in:reviewIds}},select:{id:true}})).map(r=>r.id) : [];
        const saved = repeated ? await tx.reviewRevisionResponse.findMany({ where: { submissionRevisionId: current.artifactRevisionId, revisionItemId: { in: itemIds }, status:{not:"DRAFT"} } }) : [];
        if (repeated && saved.length === input.responses.length && new Set(input.responses.map(r => r.revisionItemId)).size === input.responses.length && input.responses.every(r => saved.some(s => s.revisionItemId === r.revisionItemId && s.responseText === r.responseText.trim()))) { replayed = true; return tx.submissionRevision.findUniqueOrThrow({ where: { id: current.artifactRevisionId } }); }
        throw AppError.conflict("This request is not waiting for a revision");
      }
      const submission = await tx.submission.findUniqueOrThrow({ where: { id: request.submissionId } });
      const previous = await tx.submissionRevision.findUniqueOrThrow({ where: { id: current.artifactRevisionId } });
      let revised = input.revisionId ? await tx.submissionRevision.findFirst({ where: { ...whereId(input.revisionId), submissionId: request.submissionId } }) : null;
      if (input.reportId) {
        const report = await tx.report.findFirst({ where: whereId(input.reportId) });
        if (!report || report.id !== submission.sourceReportId || report.projectId !== request.projectId || report.status !== "ready" || !report.markdown?.trim()) {
          throw AppError.badRequest("Select an updated version of the original research artifact");
        }
        const checksum = crypto.createHash("sha256").update(report.markdown).digest("hex");
        if (previous.checksumSha256 === checksum) throw AppError.badRequest("The revised artifact must differ from the reviewed version");
        revised = await tx.submissionRevision.create({ data: { submissionId: submission.id,
          revisionNumber: submission.currentRevisionNumber + 1, uploadedById: actor.id, sourceRevisionId: previous.id,
          checksumSha256: checksum, contentSnapshot: report.markdown, contentType: "MARKDOWN", sizeBytes: Buffer.byteLength(report.markdown),
          responseToReview: "Updated research artifact submitted for another review round." } });
      }
      if (!revised || revised.revisionNumber <= previous.revisionNumber) throw AppError.badRequest("Select a newer artifact revision");
      if (revised.checksumSha256 && revised.checksumSha256 === previous.checksumSha256) throw AppError.badRequest("The revised manuscript must differ from the reviewed version");
      const submittedReviews = await tx.humanReview.findMany({ where: { assignmentId: assignment.id, status: "SUBMITTED" }, select: { id: true } });
      if (!submittedReviews.length) throw AppError.conflict("No submitted review exists");
      const items = await tx.reviewRevisionItem.findMany({ where: { reviewId: { in: submittedReviews.map((review) => review.id) }, status: { in: ["OPEN", "REOPENED"] } } });
      const responseMap = new Map(input.responses.map((item) => [item.revisionItemId, item.responseText.trim()]));
      if (responseMap.size !== input.responses.length || input.responses.some((response) => !items.some((item) => item.id === response.revisionItemId || publicDatabaseId(item) === response.revisionItemId))) {
        throw AppError.badRequest("Revision responses must refer to this request's open revision items");
      }
      const missing = items.filter((item) => !isSuggestionRevisionItem(item) && !responseMap.get(publicDatabaseId(item)) && !responseMap.get(item.id));
      if (missing.length) throw AppError.badRequest("Respond to every required revision before resubmitting", { missingRevisionItemIds: missing.map(publicDatabaseId) });
      for (const item of items) {
        const text = responseMap.get(publicDatabaseId(item)) ?? responseMap.get(item.id);
        if (!text && isSuggestionRevisionItem(item)) continue;
        const existingResponse = await tx.reviewRevisionResponse.findUnique({where:{revisionItemId_submissionRevisionId:{revisionItemId:item.id,submissionRevisionId:revised.id}}});
        if (existingResponse && existingResponse.status !== "DRAFT") throw AppError.conflict("A submitted response is immutable");
        await tx.reviewRevisionResponse.upsert({where:{revisionItemId_submissionRevisionId:{revisionItemId:item.id,submissionRevisionId:revised.id}}, create:{revisionItemId:item.id,submissionRevisionId:revised.id,responseText:text!,status:"ADDRESSED"},update:{responseText:text!,status:"ADDRESSED"}});
        await tx.reviewRevisionItem.update({ where: { id: item.id }, data: { status: "ADDRESSED" } });
      }
      await tx.reviewRequest.update({ where: { id: request.id }, data: { status: "RESUBMITTED", artifactRevisionId: revised.id } });
      await tx.reviewerAssignment.update({ where: { id: assignment.id }, data: { status: "accepted", completedAt: null, artifactRevisionId: revised.id } });
      await tx.submission.updateMany({ where: { id: submission.id, currentRevisionNumber: { lt: revised.revisionNumber } }, data: { currentRevisionId: revised.id, currentRevisionNumber: revised.revisionNumber } });
      await refreshSubmissionReviewStatus(tx, submission.id);
      pendingNotifications.push(await createReviewNotification({ userId: assignment.reviewerId, title: "Revision resubmitted", message: "A revised version of the assigned artifact is ready for review.", type: "REVISION_RESUBMITTED", targetKind: "review_request", targetId: request.id, eventKey: `REVISION_RESUBMITTED:${request.id}:${revised.id}` }, tx));
      return revised;
    });
    if (replayed) return;
    await Promise.all([
      auditService.log("REVISION_RESUBMITTED", { userId: actor.id, targetTableName: "review_requests", targetRecordId: request.id, details: { revisionId: revision.id } }),
      dispatchReviewNotifications(pendingNotifications),
    ]);
  },

  async resolveRevisionItem(requestInput: string, itemInput: string, status: "ACCEPTED" | "REOPENED", actorInput: string, expectedRevisionInput?: string) {
    const { user } = await assertPeerReviewer(actorInput);
    const request = await requestRecord(requestInput); const assignment = await assignmentForRequest(request.id);
    if (assignment.reviewerId !== user.id || assignment.status !== "accepted" || !["RESUBMITTED", "IN_REVIEW"].includes(request.status)) throw AppError.forbidden("Only the assigned reviewer can verify changes during a new review round");
    if (request.origin === "MENTOR_GUIDANCE" && !expectedRevisionInput) throw AppError.badRequest("Identify the manuscript revision whose response you are verifying");
    if (expectedRevisionInput && request.artifactRevisionId !== expectedRevisionInput) throw AppError.conflict("The manuscript revision has changed; read the latest author response before verifying");
    let changed = false;
    await getPrisma().$transaction(async (tx) => {
      await lockReviewerAndSubmission(tx, user.id, request.submissionId);
      await tx.$queryRaw`SELECT id FROM projects WHERE id=${request.projectId}::uuid FOR UPDATE`;
      const project = await tx.project.findUniqueOrThrow({ where: { id: request.projectId } });
      if (["ARCHIVED", "COMPLETED"].includes(project.status) || project.deletedAt) throw AppError.conflict("This project is read-only");
      await assertReviewerInTransaction(tx, user.id);
      const live = await tx.reviewRequest.findUniqueOrThrow({ where: { id: request.id } });
      if (live.origin === "MENTOR_GUIDANCE") await assertMentorReviewAccess(tx, live.projectId, user.id, live.submissionId, assignment.id);
      if (!["RESUBMITTED", "IN_REVIEW"].includes(live.status) || live.artifactRevisionId !== request.artifactRevisionId) throw AppError.conflict("The review round has changed; refresh before verifying");
      const reviews = await tx.humanReview.findMany({ where: { assignmentId: assignment.id, status: "SUBMITTED" }, select: { id: true } });
      const item = await tx.reviewRevisionItem.findFirst({ where: { ...whereId(itemInput), reviewId: { in: reviews.map((review) => review.id) } } });
      if (!item || !["ADDRESSED", "ACCEPTED", "REOPENED"].includes(item.status)) throw AppError.badRequest("This revision item has no author response to verify");
      if (item.status === status) return;
      changed = true;
      await tx.reviewRevisionItem.update({ where: { id: item.id }, data: { status } });
      await tx.reviewRevisionResponse.updateMany({ where: { revisionItemId: item.id, submissionRevisionId: request.artifactRevisionId }, data: { status } });
    });
    if (!changed) return;
    for (const userId of await reviewTeamRecipients(request.projectId, request.submissionId)) await createReviewNotification({ userId, title: status === "ACCEPTED" ? "Revision change accepted" : "Revision issue reopened", message: "Your mentor has verified a response. Open the review history to see the decision.", type: "REVIEW_REVISION_VERIFIED", targetKind: "review_request", targetId: request.id });
    await auditService.log("REVIEW_REVISION_VERIFIED", { userId: user.id, targetTableName: "review_revision_items", targetRecordId: itemInput, details: { status, requestId: request.id } });
  },
};
