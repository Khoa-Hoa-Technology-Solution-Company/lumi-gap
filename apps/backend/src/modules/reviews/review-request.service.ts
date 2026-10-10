import crypto from "node:crypto";
import { assertAcademicRelationshipManager } from "../projects/academic-relationship-access.js";
import { env } from "../../config/env.js";
import type { CreateReviewRequestInput, ResubmitReviewRequestInput } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { auditService } from "../audit/audit.service.js";
import { assertPeerReviewer, assertReviewerInTransaction, assertReviewAdmission, lockReviewerAndSubmission, refreshSubmissionReviewStatus } from "./peer-review-access.js";
import { normalizeEmail } from "../identity/identity-foundation.rules.js";
import { notificationService } from "../notifications/notification.service.js";
import { createOpaqueToken, hashOpaqueToken } from "../auth/token.service.js";
import { hydrateReviewTemplateVersion } from "./review-template.service.js";
import { ACTIVE_REVIEW_REQUEST_STATUSES } from "./review.constants.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { canCancelReviewRequest, canResubmitReviewRequest, canReviewerDeclineRequest, canViewReviewRequest, eligiblePeerReviewer, reviewDeadline } from "./academic-review.rules.js";

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
  if (!isAuthor && project.ownerId !== actorId) throw AppError.forbidden("Only an author or project owner can request review");
  if (!submission.currentRevisionId) throw AppError.conflict("The submission has no reviewable revision");
  return submission;
}

async function assertTemplateAccess(templateId: string, actorId: string, projectId: string) {
  const template = await getPrisma().reviewTemplate.findUniqueOrThrow({ where: { id: templateId } });
  if (!template.active || template.status !== "PUBLISHED" || (template.source === "PERSONAL" && template.ownerId !== actorId) || (template.source === "PROJECT" && template.projectId !== projectId)) throw AppError.forbidden("This review template is not available for your research");
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
  const [assignment, submission, requester, revision, reviews, project] = await Promise.all([
    assignmentForRequest(row.id),
    prisma.submission.findUniqueOrThrow({ where: { id: row.submissionId } }),
    prisma.user.findUniqueOrThrow({ where: { id: row.requesterId }, select: { id: true, fullName: true, avatarUrl: true } }),
    prisma.submissionRevision.findUniqueOrThrow({ where: { id: row.artifactRevisionId } }),
    prisma.humanReview.findMany({ where: { assignmentId: (await assignmentForRequest(row.id)).id, ...(viewerId === (await assignmentForRequest(row.id)).reviewerId ? {} : { status: "SUBMITTED" }) }, orderBy: { roundNumber: "asc" } }),
    prisma.project.findUniqueOrThrow({ where: { id: row.projectId }, select: { id: true, legacyMongoId: true } }),
  ]);
  const [reviewer, sourceReport] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: assignment.reviewerId }, select: { id: true, fullName: true, avatarUrl: true, institution: true } }),
    submission.sourceReportId ? prisma.report.findUnique({ where: { id: submission.sourceReportId }, select: { id: true, legacyMongoId: true } }) : null,
  ]);
  return {
    id: publicDatabaseId(row), status: row.status, message: row.message ?? undefined, dueAt: row.dueAt ?? undefined,
    createdAt: row.createdAt, updatedAt: row.updatedAt, completedAt: row.completedAt ?? undefined,
    requester: { ...requester, id: publicDatabaseId(requester) }, reviewer: { ...reviewer, id: publicDatabaseId(reviewer) },
    mentorRelationshipActive: Boolean(await prisma.mentorRelationship.findFirst({ where: { projectId: submission.projectId, mentorUserId: assignment.reviewerId, status: "ACTIVE" } })),
    assignment: { id: publicDatabaseId(assignment), status: assignment.status, dueAt: assignment.dueAt ?? undefined },
    artifact: {
      submissionId: publicDatabaseId(submission), title: submission.title, type: submission.submissionType,
      projectId: publicDatabaseId(project), revisionId: publicDatabaseId(revision), revisionNumber: revision.revisionNumber,
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
      await notificationService.create({
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
    return users.map((user) => ({
      id: publicDatabaseId(user), name: user.fullName, avatarUrl: user.avatarUrl ?? undefined,
      institution: user.institution ?? undefined, expertiseAreas: profileMap.get(user.id)?.expertiseAreas ?? [],
      availableForReview: (profileMap.get(user.id)?.reviewAvailability as { enabled?: boolean } | null)?.enabled === true,
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
      const liveSubmission = await assertReviewAdmission(tx, submission.id, reviewer.id);
      const request = await tx.reviewRequest.create({ data: {
        submissionId: submission.id, projectId: submission.projectId, requesterId: actor.id,
        templateVersionId: version.id, artifactRevisionId: liveSubmission.currentRevisionId!,
        message: input.message?.trim() || undefined, dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        expiresAt: new Date(Date.now() + env.ACADEMIC_RELATIONSHIP_REQUEST_EXPIRY_DAYS * 86400000),
      } });
      const assignment = await tx.reviewerAssignment.create({ data: {
        submissionId: submission.id, reviewRequestId: request.id, artifactRevisionId: request.artifactRevisionId, reviewerId: reviewer.id, assignedById: actor.id,
        anonymousCode: `R-${crypto.randomBytes(12).toString("hex")}`, status: "assigned", dueAt: request.dueAt,
        conflictChecks: { selfOrAuthor: false, projectContributor: false, checkedAt: new Date().toISOString() },
      } });
      await tx.submission.update({ where: { id: submission.id }, data: { status: "under_review" } });
      await markArtifactReviewing(tx, submission, actor.id);
      return { request, assignment };
    });
    await Promise.all([
      auditService.log("REVIEW_REQUEST_CREATED", { userId: actor.id, targetTableName: "review_requests", targetRecordId: created.request.id, details: { submissionId: submission.id, reviewerId: reviewer.id, templateVersionId: version.id } }),
      notificationService.create({ userId: reviewer.id, title: "New academic review request", message: `${actor.fullName} invited you to review “${submission.title}”.`, type: "REVIEW_REQUESTED", targetKind: "project", targetId: submission.projectId }),
    ]);
    return summary(created.request);
  },

  async listCenter(actorInput: string) {
    const actor = await resolveUser(actorInput);
    const assignments = await getPrisma().reviewerAssignment.findMany({ where: { reviewerId: actor.id, reviewRequestId: { not: null } }, select: { reviewRequestId: true } });
    const incomingIds = assignments.flatMap((item) => item.reviewRequestId ? [item.reviewRequestId] : []);
    const sentIds = (await getPrisma().reviewRequest.findMany({ where: { requesterId: actor.id, status: "REQUESTED" }, select: { id: true } })).map(r => r.id);
    await expireReviewRequests([...incomingIds, ...sentIds]);
    const [incoming, sent] = await Promise.all([
      getPrisma().reviewRequest.findMany({ where: { id: { in: incomingIds } }, orderBy: { updatedAt: "desc" } }),
      getPrisma().reviewRequest.findMany({ where: { requesterId: actor.id }, orderBy: { updatedAt: "desc" } }),
    ]);
    return { incoming: await Promise.all(incoming.map((row) => summary(row, actor.id))), sent: await Promise.all(sent.map((row) => summary(row, actor.id))) };
  },

  async detail(requestInput: string, actorInput: string) {
    const actor = await resolveUser(actorInput);
    const request = await requestRecord(requestInput);
    const assignment = await assignmentForRequest(request.id);
    if (!canViewReviewRequest({ actorId: actor.id, requesterId: request.requesterId, reviewerId: assignment.reviewerId })) throw AppError.forbidden();
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
      responses: await prisma.reviewResponse.findMany({ where: { reviewId: review.id } }),
      requiredRevisions: await Promise.all((await prisma.reviewRevisionItem.findMany({ where: { reviewId: review.id }, orderBy: { position: "asc" } })).map(async (item) => ({ ...item, responses: await prisma.reviewRevisionResponse.findMany({ where: { revisionItemId: item.id }, orderBy: { createdAt: "asc" } }) }))),
    })));
    return {
      ...base, templateVersion, artifactContent: actor.id === assignment.reviewerId && !canWork ? undefined : revision.contentSnapshot ?? undefined,
      reviews: reviewDetails,
    };
  },

  async accept(requestInput: string, actorInput: string) {
    const actor = await resolveUser(actorInput); const request = await requestRecord(requestInput); const assignment = await assignmentForRequest(request.id);
    if (assignment.reviewerId !== actor.id) throw AppError.forbidden();
    await assertPeerReviewer(actor.id);
    if (request.status !== "REQUESTED" || assignment.status !== "assigned") throw AppError.conflict("This review request can no longer be accepted");
    await getPrisma().$transaction(async (tx) => {
      await lockReviewerAndSubmission(tx, actor.id, request.submissionId);
      await assertReviewAdmission(tx, request.submissionId, actor.id, { excludeAssignmentId: assignment.id });
      const claimed = await tx.reviewRequest.updateMany({ where: { id: request.id, status: "REQUESTED", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, data: { status: "ACCEPTED", respondedAt: new Date() } });
      if (claimed.count !== 1) throw AppError.conflict("This request was already handled");
      await tx.reviewerAssignment.update({ where: { id: assignment.id }, data: { status: "accepted", artifactRevisionId: request.artifactRevisionId } });
    });
    await Promise.all([
      auditService.log("REVIEW_REQUEST_ACCEPTED", { userId: actor.id, targetTableName: "review_requests", targetRecordId: request.id }),
      notificationService.create({ userId: request.requesterId, title: "Review request accepted", message: `${actor.fullName} accepted your academic review request.`, type: "REVIEW_REQUEST_ACCEPTED", targetKind: "review_request", targetId: request.id }),
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
      notificationService.create({
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
    const submittedReviews = await getPrisma().humanReview.count({ where: { assignmentId: assignment.id, status: "SUBMITTED" } });
    if (!canReviewerDeclineRequest(request.status as never, submittedReviews)) {
      throw AppError.conflict(submittedReviews ? "You already submitted a review round, so you can no longer withdraw from this review" : "This review request can no longer be declined");
    }
    const withdrawing = request.status !== "REQUESTED";
    await getPrisma().$transaction(async (tx) => {
      await lockReviewerAndSubmission(tx, assignment.reviewerId, request.submissionId);
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
    await Promise.all([
      auditService.log("REVIEW_REQUEST_DECLINED", { userId: actor.id, targetTableName: "review_requests", targetRecordId: request.id, details: {} }),
      notificationService.create({
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
    if (!canCancelReviewRequest({ status: request.status as never, dueAt: request.dueAt, createdAt: request.createdAt })) {
      throw AppError.conflict(["ACCEPTED", "IN_REVIEW"].includes(request.status)
        ? `The reviewer has accepted this request. You can cancel it only if the review is still not delivered after ${reviewDeadline(request).toISOString().slice(0, 10)}.`
        : "This review request can no longer be cancelled");
    }
    await getPrisma().$transaction(async (tx) => {
      await lockReviewerAndSubmission(tx, assignment.reviewerId, request.submissionId);
      await assertAcademicRelationshipManager(request.projectId, actor.id, tx);
      // Claim the exact status we validated: a request accepted in the meantime must not be cancelled.
      const changed = await tx.reviewRequest.updateMany({ where: { id: request.id, status: request.status }, data: { status: "CANCELLED", respondedAt: new Date() } });
      if (!changed.count) throw AppError.conflict("This request has already changed");
      await tx.reviewerAssignment.update({ where: { id: assignment.id }, data: { status: "cancelled" } });
      await refreshSubmissionReviewStatus(tx, request.submissionId);
      await releaseArtifactReviewing(tx, request.submissionId, actor.id);
    });
    await Promise.all([
      auditService.log("REVIEW_REQUEST_CANCELLED", { userId: actor.id, targetTableName: "review_requests", targetRecordId: request.id }),
      notificationService.create({ userId: assignment.reviewerId, title: "Review request cancelled", message: `${actor.fullName} cancelled the review request.`, type: "REVIEW_REQUEST_CANCELLED", targetKind: "review_request", targetId: request.id }),
    ]);
  },

  async resubmit(requestInput: string, actorInput: string, input: ResubmitReviewRequestInput) {
    const actor = await resolveUser(actorInput); const request = await requestRecord(requestInput); const assignment = await assignmentForRequest(request.id);
    await assertAcademicRelationshipManager(request.projectId, actor.id);
    const revision = await getPrisma().$transaction(async (tx) => {
      await lockReviewerAndSubmission(tx, assignment.reviewerId, request.submissionId);
      const current = await tx.reviewRequest.findUniqueOrThrow({ where: { id: request.id } });
      await assertAcademicRelationshipManager(request.projectId, actor.id, tx);
      if (!canResubmitReviewRequest(current.status as never)) throw AppError.conflict("This request is not waiting for a revision");
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
      const submittedReviews = await tx.humanReview.findMany({ where: { assignmentId: assignment.id, status: "SUBMITTED" }, select: { id: true } });
      if (!submittedReviews.length) throw AppError.conflict("No submitted review exists");
      const items = await tx.reviewRevisionItem.findMany({ where: { reviewId: { in: submittedReviews.map((review) => review.id) }, status: { in: ["OPEN", "REOPENED"] } } });
      const responseMap = new Map(input.responses.map((item) => [item.revisionItemId, item.responseText.trim()]));
      if (responseMap.size !== input.responses.length || input.responses.some((response) => !items.some((item) => item.id === response.revisionItemId || publicDatabaseId(item) === response.revisionItemId))) {
        throw AppError.badRequest("Revision responses must refer to this request's open revision items");
      }
      const missing = items.filter((item) => !responseMap.get(publicDatabaseId(item)) && !responseMap.get(item.id));
      if (missing.length) throw AppError.badRequest("Respond to every required revision before resubmitting", { missingRevisionItemIds: missing.map(publicDatabaseId) });
      for (const item of items) {
        await tx.reviewRevisionResponse.create({ data: { revisionItemId: item.id, submissionRevisionId: revised.id, responseText: responseMap.get(publicDatabaseId(item)) ?? responseMap.get(item.id)! } });
        await tx.reviewRevisionItem.update({ where: { id: item.id }, data: { status: "ADDRESSED" } });
      }
      await tx.reviewRequest.update({ where: { id: request.id }, data: { status: "RESUBMITTED", artifactRevisionId: revised.id } });
      await tx.reviewerAssignment.update({ where: { id: assignment.id }, data: { status: "accepted", completedAt: null, artifactRevisionId: revised.id } });
      await tx.submission.updateMany({ where: { id: submission.id, currentRevisionNumber: { lt: revised.revisionNumber } }, data: { currentRevisionId: revised.id, currentRevisionNumber: revised.revisionNumber } });
      await refreshSubmissionReviewStatus(tx, submission.id);
      return revised;
    });
    await Promise.all([
      auditService.log("REVISION_RESUBMITTED", { userId: actor.id, targetTableName: "review_requests", targetRecordId: request.id, details: { revisionId: revision.id } }),
      notificationService.create({ userId: assignment.reviewerId, title: "Revision resubmitted", message: `A revised version of the assigned artifact is ready for review.`, type: "REVISION_RESUBMITTED", targetKind: "project", targetId: request.projectId }),
    ]);
  },

  async resolveRevisionItem(requestInput: string, itemInput: string, status: "ACCEPTED" | "REOPENED", actorInput: string) {
    const { user } = await assertPeerReviewer(actorInput);
    const request = await requestRecord(requestInput); const assignment = await assignmentForRequest(request.id);
    if (assignment.reviewerId !== user.id || assignment.status !== "accepted" || !["RESUBMITTED", "IN_REVIEW"].includes(request.status)) throw AppError.forbidden("Only the assigned reviewer can verify changes during a new review round");
    await getPrisma().$transaction(async (tx) => {
      await lockReviewerAndSubmission(tx, user.id, request.submissionId);
      await assertReviewerInTransaction(tx, user.id);
      const live = await tx.reviewRequest.findUniqueOrThrow({ where: { id: request.id } });
      if (!["RESUBMITTED", "IN_REVIEW"].includes(live.status) || live.artifactRevisionId !== request.artifactRevisionId) throw AppError.conflict("The review round has changed; refresh before verifying");
      const reviews = await tx.humanReview.findMany({ where: { assignmentId: assignment.id, status: "SUBMITTED" }, select: { id: true } });
      const item = await tx.reviewRevisionItem.findFirst({ where: { ...whereId(itemInput), reviewId: { in: reviews.map((review) => review.id) } } });
      if (!item || !["ADDRESSED", "ACCEPTED", "REOPENED"].includes(item.status)) throw AppError.badRequest("This revision item has no author response to verify");
      await tx.reviewRevisionItem.update({ where: { id: item.id }, data: { status } });
      await tx.reviewRevisionResponse.updateMany({ where: { revisionItemId: item.id, submissionRevisionId: request.artifactRevisionId }, data: { status } });
    });
    await auditService.log("REVIEW_REVISION_VERIFIED", { userId: user.id, targetTableName: "review_revision_items", targetRecordId: itemInput, details: { status, requestId: request.id } });
  },
};
