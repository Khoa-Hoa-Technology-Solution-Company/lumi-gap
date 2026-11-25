import { currentProjectIds, currentProjectMembership } from "../authorization/project-membership.js";
import crypto from "node:crypto";
import type { UserRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { hasPermission } from "../../common/authorization/permissions.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { pdfStorageService } from "../../infrastructure/pdf-storage.service.js";
import { auditService } from "../audit/audit.service.js";
import { assertMentorReviewAccess, acceptedMentorReviewPolicy, readableReviewAssignments, visibleMentorReviewAssignments } from "../reviews/mentor-review-access.js";
import { researchLedgerService } from "../audit/research-ledger.service.js";
import { assertPeerReviewer, lockReviewerAndSubmission, refreshSubmissionReviewStatus } from "../reviews/peer-review-access.js";
import { reviewService } from "../reviews/review.service.js";
import { reviewRequestService } from "../reviews/review-request.service.js";
import { createAssignedMentorReview } from "../reviews/mentor-review-request.js";
import { dispatchReviewNotifications } from "../reviews/review-notifications.js";
import { aiReviewerClient } from "../papers/ai-reviewer.client.js";
import { extractPdfPages, readStoredPdf } from "../knowledge/knowledge.source.js";
import { retrieve } from "../retrieval/retriever.js";
import { logger } from "../../infrastructure/logger.js";
import { buildManuscriptText, MAX_MANUSCRIPT_CHARS } from "./pre-review-input.js";
import { aiJobsQueue } from "../../infrastructure/queue.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { lockProjectAccounts } from "../projects/project-transaction.js";
import { mentorManuscriptService } from "./mentor-manuscript.service.js";
import type { MentorManuscriptSendInput } from "@trend/shared-types";

type UploadedPdf = { buffer: Buffer; originalname: string; size: number };
/** Job name on the ai-jobs queue that runs one AI pre-review. */
export const AI_PRE_REVIEW_JOB = "submission-pre-review";
export interface AiPreReviewJob { preReviewId: string }
export const aiPreReviewJobId = (preReviewId: string) => `ai-pre-review-${preReviewId}`;
const AI_PRE_REVIEW_FAILURE = "AI pre-review failed. Please try again later.";
const AI_PRE_REVIEW_CLOSED_STATUSES = ["completed", "accepted", "rejected", "withdrawn"];
type CreateSubmissionInput = {
  projectId: string;
  title: string;
  abstract?: string;
  submissionType?:
    | "RESEARCH_PROPOSAL"
    | "LITERATURE_REVIEW"
    | "RESEARCH_GAP"
    | "METHODOLOGY"
    | "THESIS_CHAPTER"
    | "THESIS_DRAFT"
    | "RESEARCH_PAPER"
    | "SOFTWARE_RESEARCH_PROJECT";
  researchField?: string;
  researchGoal?: string;
  researchQuestions?: string[];
  claimedResearchGap?: string;
  claimedContribution?: string;
  methodology?: string;
  scope?: string;
  keywords?: string[];
  expectedReviewWorkload?: string;
  authorIds?: string[];
  declaredConflictUserIds?: string[];
  mentorId?: string;
  manuscriptSnapshotId?: string;
  contentSnapshot?: string;
  message?: string;
};
type SubmissionRow = Awaited<ReturnType<typeof getSubmissionOrThrow>>;

function ids(values: string[] | undefined): string[] { return [...new Set(values ?? [])]; }
function idWhere(value: string): { id?: string; legacyMongoId?: string } { const parsed = parseDatabaseId(value); if (!parsed) throw AppError.badRequest("Invalid database identifier"); return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }; }
function isUniqueViolation(error: unknown): boolean { return ["P2002", "P2034"].includes((error as { code?: string }).code ?? ""); }

async function resolveUser(input: string) {
  const user = await getPrisma().user.findFirst({ where: idWhere(input) });
  if (!user || !user.isActive) throw AppError.unauthorized();
  return user;
}

async function resolveUsers(inputs: string[]) {
  if (!inputs.length) return [];
  const parsed = inputs.map((value) => idWhere(value));
  const users = await getPrisma().user.findMany({ where: { isActive: true, OR: parsed } });
  if (users.length !== new Set(inputs).size) throw AppError.badRequest("One or more authors or declared conflicts are invalid");
  return users;
}

async function getProjectForAccess(projectInput: string, userId: string, role: UserRole, prisma: Prisma.TransactionClient = getPrisma()) {
  const project = await prisma.project.findFirst({ where: idWhere(projectInput) });
  if (!project || Boolean(project.deletedAt)) throw AppError.notFound("Project not found");
  if (project.ownerId !== userId && !hasPermission(role, "review:assign")) {
    const member = await prisma.projectMember.findFirst({ where: { projectId: project.id, userId, status: "ACTIVE" } });
    if (!member) throw AppError.forbidden("Project membership is required");
  }
  return project;
}

async function getSubmissionOrThrow(submissionInput: string) {
  const submission = await getPrisma().submission.findFirst({ where: idWhere(submissionInput) });
  if (!submission) throw AppError.notFound("Submission not found");
  return submission;
}

async function canAccessFullSubmission(submission: SubmissionRow, userId: string, role: UserRole) {
  if (hasPermission(role, "review:assign")) return true;
  const prisma = getPrisma();
  // Authorship is retained as attribution; current membership controls full workspace access.
  const project = await prisma.project.findUnique({ where: { id: submission.projectId } });
  if (!project || Boolean(project.deletedAt)) return false;
  if (project.ownerId === userId) return true;
  if (await prisma.projectMember.findFirst({ where: { projectId: submission.projectId, userId, status: "ACTIVE" } })) return true;
  if (typeof prisma.mentorRelationship?.findFirst === "function") {
    const activeMentor = await prisma.mentorRelationship.findFirst({ where: { projectId: submission.projectId, mentorUserId: userId, status: "ACTIVE" } });
    if (activeMentor) return false;
  }
  return false;
}

async function assertSubmissionAccess(submission: SubmissionRow, userId: string, role: UserRole) {
  if (await canAccessFullSubmission(submission, userId, role)) return "full" as const;
  const assignment = (await readableReviewAssignments(getPrisma(), submission.id, userId))[0];
  if (assignment) {
    await assertPeerReviewer(userId); return "blind" as const;
  }
  throw AppError.forbidden("You do not have access to this submission");
}

async function canManageSubmission(submission: SubmissionRow, userId: string, role: UserRole, prisma: Prisma.TransactionClient = getPrisma()) {
  const state = await prisma.project.findUnique({ where: { id: submission.projectId }, select: { status: true, deletedAt: true } });
  if (!state || state.status === "ARCHIVED" || Boolean(state.deletedAt)) return false;
  if (hasPermission(role, "review:assign")) return true;
  if (!await currentProjectMembership(submission.projectId, userId, prisma)) return false;
  if (submission.createdById === userId) return true;
  const [author, project] = await Promise.all([
    prisma.submissionAuthor.findUnique({ where: { submissionId_userId: { submissionId: submission.id, userId } } }),
    prisma.project.findUnique({ where: { id: submission.projectId } }),
  ]);
  return Boolean(author || project?.ownerId === userId);
}

async function accessibleRevisionIds(submissionId: string, userId: string) {
  const prisma = getPrisma();
  const assignments = await readableReviewAssignments(prisma, submissionId, userId);
  const reviews = await prisma.humanReview.findMany({ where: { assignmentId: { in: assignments.map((item) => item.id) }, status: "SUBMITTED" }, select: { revisionId: true } });
  return [...new Set([...assignments.flatMap((item) => item.artifactRevisionId ? [item.artifactRevisionId] : []), ...reviews.map((item) => item.revisionId)])];
}

async function persistFile(file: UploadedPdf) {
  const checksumSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const stored = await pdfStorageService.savePdf(file.buffer, file.originalname);
  return { checksumSha256, stored };
}

function submissionDto(row: SubmissionRow) { return { ...row, _id: publicDatabaseId(row), id: publicDatabaseId(row), projectId: row.projectId, createdBy: row.createdById, abstract: row.abstractText, currentRevisionId: row.currentRevisionId ?? undefined }; }
function revisionDto(row: { id: string; legacyMongoId: string | null; submissionId: string; revisionNumber: number; uploadedById: string; responseToReview: string | null; checksumSha256: string | null; sizeBytes: number; originalFileName: string | null; storageUri?: string | null; contentSnapshot?: string | null; contentType?: string; createdAt: Date; updatedAt: Date }) { return { ...row, _id: publicDatabaseId(row), id: publicDatabaseId(row), storageUri: undefined, uploadedBy: row.uploadedById, responseToReview: row.responseToReview ?? undefined }; }
// Keep the immutable input revision alongside the existing structured output, including while queued.
function preReviewSource(raw: unknown): { sourceRevisionId?: string; sourceRevisionNumber?: number } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const value = raw as Record<string, unknown>;
  return typeof value.sourceRevisionId === "string" && typeof value.sourceRevisionNumber === "number"
    ? { sourceRevisionId: value.sourceRevisionId, sourceRevisionNumber: value.sourceRevisionNumber } : {};
}
function aiReviewDto(row: { id: string; legacyMongoId: string | null; [key: string]: unknown }) { return { ...row, ...preReviewSource(row.rawStructuredOutput), id: publicDatabaseId(row) }; }

async function hydrateSubmission(submission: SubmissionRow) {
  const prisma = getPrisma();
  const [authors, creator] = await Promise.all([
    prisma.submissionAuthor.findMany({ where: { submissionId: submission.id }, orderBy: { position: "asc" } }),
    prisma.user.findUnique({ where: { id: submission.createdById }, select: { id: true, legacyMongoId: true, fullName: true, email: true } }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: authors.map((row) => row.userId) } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, institution: true, avatarUrl: true } });
  const byId = new Map(users.map((user) => [user.id, { ...user, id: publicDatabaseId(user) }]));
  return { ...submissionDto(submission), authorIds: authors.flatMap((author) => { const user = byId.get(author.userId); return user ? [user] : []; }), createdBy: creator ? { ...creator, id: publicDatabaseId(creator) } : undefined };
}

/** Manuscript of the current revision, or undefined when it cannot be read: a pre-review without a manuscript is still useful, and throwing would only make BullMQ retry for nothing. */
async function loadManuscriptText(submission: { id: string; currentRevisionId: string | null }): Promise<string | undefined> {
  try {
    const revision = submission.currentRevisionId
      ? await getPrisma().submissionRevision.findUnique({ where: { id: submission.currentRevisionId } })
      : await getPrisma().submissionRevision.findFirst({ where: { submissionId: submission.id }, orderBy: { revisionNumber: "desc" } });
    if (!revision) return undefined;
    if (["MARKDOWN", "LATEX"].includes(revision.contentType) && revision.contentSnapshot) return revision.contentSnapshot.slice(0, MAX_MANUSCRIPT_CHARS);
    if (!revision.storageUri) return undefined;
    const extracted = await extractPdfPages(await readStoredPdf(revision.storageUri));
    return buildManuscriptText(extracted.pages) || undefined;
  } catch (err) {
    logger.warn({ err, submissionId: submission.id }, "pre-review manuscript unavailable");
    return undefined;
  }
}

async function loadRelatedEvidence(submission: { title: string; abstractText: string | null }) {
  try {
    const papers = await retrieve({ queryText: [submission.title, submission.abstractText].filter(Boolean).join("\n"), topK: 8, fullText: true });
    return papers.map((paper) => ({ id: paper.id, title: paper.title, excerpt: paper.abstractText?.slice(0, 800) }));
  } catch (err) {
    logger.warn({ err, title: submission.title }, "pre-review related evidence unavailable");
    return [];
  }
}

async function preReviewUnavailableReason(submission: SubmissionRow | null, requesterId: string, prisma: Prisma.TransactionClient = getPrisma()) {
  if (!submission || AI_PRE_REVIEW_CLOSED_STATUSES.includes(submission.status)) return "The submission was closed before the pre-review completed.";
  const [project, requester] = await Promise.all([
    prisma.project.findUnique({ where: { id: submission.projectId } }),
    prisma.user.findUnique({ where: { id: requesterId } }),
  ]);
  if (!project || project.status === "ARCHIVED") return "The project was archived before the pre-review completed.";
  if (!requester?.isActive || requester.accountStatus !== "ACTIVE") return "The requester no longer has access to this submission.";
  if (requester.systemRole === "ADMIN") return null;
  if (!await currentProjectMembership(submission.projectId, requesterId, prisma) || !await prisma.submissionAuthor.findUnique({ where: { submissionId_userId: { submissionId: submission.id, userId: requesterId } } })) return "The requester no longer has access to this submission.";
  return null;
}


async function syncRevisionWithMentorWorkflow(
  tx: Prisma.TransactionClient,
  submission: { id: string; projectId: string; title: string },
  newRevision: { id: string; revisionNumber: number },
  actorId: string
) {
  // Canonical requests advance only when the author explicitly submits responses.
  if (await tx.reviewRequest.findFirst({where:{submissionId:submission.id,origin:"MENTOR_GUIDANCE"}})) return;
  // Complete student's legacy revision task
  await tx.projectTask.updateMany({
    where: {
      projectId: submission.projectId,
      targetKind: "submission",
      targetId: submission.id,
      assigneeId: actorId,
      status: { not: "DONE" },
    },
    data: {
      status: "DONE",
      completedAt: new Date(),
      completedById: actorId,
    },
  });

  // Check if there was an assigned mentor with an active mentorship relationship
  if (typeof tx.mentorRelationship?.findFirst !== "function") return;

  const prevAssignment = await tx.reviewerAssignment.findFirst({
    where: {
      submissionId: submission.id,
      reviewRequestId: null,
      anonymousCode: { startsWith: "mentor-" },
    },
    orderBy: { createdAt: "desc" },
  });
  if (prevAssignment) {
    const mentorId = prevAssignment.reviewerId;
    const activeRel = await tx.mentorRelationship.findFirst({
      where: { projectId: submission.projectId, mentorUserId: mentorId, status: "ACTIVE" },
    });
    if (!activeRel) return;

    await tx.submission.update({
      where: { id: submission.id },
      data: { status: "WAITING_FEEDBACK" },
    });
    await tx.reviewerAssignment.create({
      data: {
        submissionId: submission.id,
        reviewerId: mentorId,
        assignedById: actorId,
        anonymousCode: `mentor-${submission.id}-${mentorId}-v${newRevision.revisionNumber}`,
        status: "assigned",
        artifactRevisionId: newRevision.id,
      },
    });
    await tx.projectTask.create({
      data: {
        projectId: submission.projectId,
        title: `Cần góp ý bản thảo (v${newRevision.revisionNumber}): ${submission.title}`,
        description: `Sinh viên đã gửi phiên bản v${newRevision.revisionNumber} cho bản thảo "${submission.title}" cần bạn góp ý.`,
        status: "TODO",
        priority: "HIGH",
        assigneeId: mentorId,
        createdById: actorId,
        targetKind: "submission",
        targetId: submission.id,
        clientKey: crypto.randomUUID(),
      },
    });
    try {
      await tx.notification.create({
        data: {
          userId: mentorId,
          type: "SUBMISSION_REVISED",
          title: `Bản thảo đã được cập nhật (v${newRevision.revisionNumber})`,
          message: `Sinh viên đã nộp phiên bản mới cho bản thảo "${submission.title}".`,
        },
      });
    } catch {
      // Non-fatal
    }
  }
}

export const submissionService = {
  async mentorFeedbackContext(input: { projectId: string; manuscriptId?: string; submissionId?: string }, actor: string, role: UserRole) {
    return mentorManuscriptService.context(input, actor, role, { user: resolveUser, project: getProjectForAccess, manage: canManageSubmission });
  },
  async sendMentorFeedback(input: MentorManuscriptSendInput, file: UploadedPdf | undefined, actor: string, role: UserRole) {
    return mentorManuscriptService.send(input, file, actor, role, { user: resolveUser, project: getProjectForAccess, manage: canManageSubmission });
  },
  async create(input: CreateSubmissionInput, file: UploadedPdf | undefined, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const project = await getProjectForAccess(input.projectId, actor.id, actorRole);
    if (project.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
    const requestedAuthorInputs = ids([actorInput, ...(input.authorIds ?? [])]); const conflictInputs = ids(input.declaredConflictUserIds).filter((id) => !requestedAuthorInputs.includes(id));
    const users = await resolveUsers([...requestedAuthorInputs, ...conflictInputs]);
    const byPublicId = new Map<string, string>(); for (const user of users) { byPublicId.set(user.id, user.id); if (user.legacyMongoId) byPublicId.set(user.legacyMongoId, user.id); }
    const authorIds = requestedAuthorInputs.map((value) => byPublicId.get(value)!).filter(Boolean); const conflictIds = conflictInputs.map((value) => byPublicId.get(value)!).filter(Boolean);
    if (!file && !input.contentSnapshot && !input.manuscriptSnapshotId) throw AppError.badRequest("PDF file or manuscript snapshot is required");
    const mentor = input.mentorId ? await resolveUser(input.mentorId) : null;
    const persisted = file ? await persistFile(file) : null;
    let checksumSha256: string | null = persisted?.checksumSha256 ?? null;
    const stored = persisted?.stored ?? null;
    try {
      const result = await getPrisma().$transaction(async (tx) => {
        await lockProjectAccounts(tx, [actor.id, ...(mentor ? [mentor.id] : [])], project.id);
        const liveProject = await getProjectForAccess(project.id, actor.id, actorRole, tx);
        if (liveProject.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
        const projectProposals = await tx.projectContributionProposal.findMany({ where: { projectId: project.id }, select: { id: true, proposedById: true } });
        const [memberRows, periodRows, participantRows, mentorRows] = await Promise.all([
          tx.projectMember.findMany({ where: { projectId: project.id, userId: { in: authorIds } }, select: { userId: true } }),
          tx.projectMembershipPeriod.findMany({ where: { projectId: project.id, userId: { in: authorIds } }, select: { userId: true } }),
          projectProposals.length ? tx.contributionParticipant.findMany({ where: { userId: { in: authorIds }, proposalId: { in: projectProposals.map((p) => p.id) } }, select: { userId: true } }) : Promise.resolve([]),
          tx.mentorRelationship.findMany({ where: { projectId: project.id, mentorUserId: { in: authorIds } }, select: { mentorUserId: true } }),
        ]);
        const eligibleAuthors = new Set<string>([liveProject.ownerId, ...projectProposals.map((p) => p.proposedById), ...memberRows.map((r) => r.userId), ...periodRows.map((r) => r.userId), ...participantRows.map((r) => r.userId), ...mentorRows.map((r) => r.mentorUserId)]);
        if (authorIds.some((uid) => !eligibleAuthors.has(uid))) throw AppError.badRequest("Declared authors must be current or historical project contributors");
        const submission = await tx.submission.create({ data: { projectId: project.id, createdById: actor.id, title: input.title, abstractText: input.abstract, submissionType: input.submissionType, researchField: input.researchField, researchGoal: input.researchGoal, researchQuestions: ids(input.researchQuestions), claimedResearchGap: input.claimedResearchGap, claimedContribution: input.claimedContribution, methodology: input.methodology, scope: input.scope, keywords: ids(input.keywords), expectedReviewWorkload: input.expectedReviewWorkload, currentRevisionNumber: 1 } });
        await tx.submissionAuthor.createMany({ data: authorIds.map((userId, position) => ({ submissionId: submission.id, userId, position })) });
        if (conflictIds.length) await tx.submissionDeclaredConflict.createMany({ data: conflictIds.map((userId) => ({ submissionId: submission.id, userId })) });
        let snapshotContent = input.contentSnapshot ?? null;
        let snapshotContentType: "PDF" | "MARKDOWN" | "LATEX" = persisted ? "PDF" : "MARKDOWN";
        let resolvedSnapshotId: string | null = null;
        if (input.manuscriptSnapshotId && typeof tx.manuscriptSnapshot?.findFirst === "function") {
          const msSnapshot = await tx.manuscriptSnapshot.findFirst({ where: { id: input.manuscriptSnapshotId, projectId: project.id } });
          if (!msSnapshot) throw AppError.notFound("Manuscript snapshot not found in this project");
          resolvedSnapshotId = msSnapshot.id;
          snapshotContentType = "LATEX";
          const manifest = msSnapshot.manifest as { files?: Array<{ path?: string; text?: string; content?: string }> } | null;
          const sourceFiles = (manifest?.files ?? []).map(file => ({ path: file.path, text: file.text ?? file.content }));
          snapshotContent = sourceFiles.filter(file => typeof file.text === "string" && file.text.trim()).map(file => `% File: ${file.path ?? "main.tex"}\n${file.text}`).join("\n\n");
          if (!snapshotContent) throw AppError.conflict("This manuscript snapshot has no readable source content");
          checksumSha256 = checksumSha256 ?? msSnapshot.checksum;
        } else if (!persisted && snapshotContent) {
          checksumSha256 = crypto.createHash("sha256").update(snapshotContent).digest("hex");
        }
        const revision = await tx.submissionRevision.create({ data: { submissionId: submission.id, revisionNumber: 1, uploadedById: actor.id, storageUri: stored?.uri ?? null, checksumSha256, sizeBytes: file ? file.size : snapshotContent ? Buffer.byteLength(snapshotContent) : 0, originalFileName: file ? file.originalname : resolvedSnapshotId ? `snapshot-${resolvedSnapshotId.slice(0, 8)}.tex` : null, ...(snapshotContent ? { contentSnapshot: snapshotContent } : {}), ...( !file ? { contentType: snapshotContentType } : {}), ...(resolvedSnapshotId ? { manuscriptSnapshotId: resolvedSnapshotId } : {}), ...(input.message ? { responseToReview: input.message } : {}) } });
        let updated = await tx.submission.update({ where: { id: submission.id }, data: { currentRevisionId: revision.id } });
        const review = mentor ? await createAssignedMentorReview(tx, { submissionId: submission.id, reviewerId: mentor.id, senderId: actor.id, revisionId: revision.id, message: input.message }) : null;
        if (review) updated = await tx.submission.findUniqueOrThrow({ where: { id: submission.id } });
        return { submission: updated, revision, review };
      });
      await auditService.log("submission.created", { userId: actor.id, targetTableName: "submissions", targetRecordId: result.submission.id, details: { projectId: project.id, revisionNumber: 1, checksumSha256 } });
      if (result.review) {
        await auditService.log("MENTOR_REVIEW_ACCESS_GRANTED", { userId: actor.id, targetTableName: "reviewer_assignments", targetRecordId: result.review.assignment.id, details: { requestId: result.review.request.id, revisionId: result.revision.id, mentorAccessId: result.review.assignment.mentorAccessId } });
        await dispatchReviewNotifications([result.review.notification]);
      }
      return { submission: submissionDto(result.submission), revision: revisionDto(result.revision) };
    } catch (error) { if (stored) await pdfStorageService.deletePdf(stored.uri).catch(() => undefined); throw error; }
  },

  async listMine(actorInput: string, actorRole: UserRole, projectInput?: string) {
    const actor = await resolveUser(actorInput); const prisma = getPrisma();
    if (projectInput) {
      const project = await getProjectForAccess(projectInput, actor.id, actorRole);
      const rows = await prisma.submission.findMany({ where: { projectId: project.id }, orderBy: { updatedAt: "desc" }, take: 100 });
      return rows.map(submissionDto);
    }
    const authorLinks = hasPermission(actorRole, "review:assign") ? [] : await prisma.submissionAuthor.findMany({ where: { userId: actor.id }, select: { submissionId: true } });
    const projects = hasPermission(actorRole, "review:assign") ? undefined : await currentProjectIds(actor.id);
    const rows = await prisma.submission.findMany({ where: projects ? { projectId: { in: projects }, OR: [{ createdById: actor.id }, { id: { in: authorLinks.map((row) => row.submissionId) } }] } : {}, orderBy: { updatedAt: "desc" }, take: 100 });
    return rows.map(submissionDto);
  },

  async listAiPreReviews(submissionInput: string, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput); const access = await assertSubmissionAccess(submission, actor.id, actorRole);
    const allowed = access === "blind" ? await accessibleRevisionIds(submission.id, actor.id) : undefined;
    return (await getPrisma().aiPreReview.findMany({ where: { submissionId: submission.id, ...(allowed ? { OR: allowed.map(revisionId => ({ rawStructuredOutput: { path: ["sourceRevisionId"], equals: revisionId } })) } : {}) }, orderBy: { createdAt: "desc" }, take: 20 })).map(aiReviewDto);
  },

  /** Queue an advisory AI pre-review; the ai-jobs worker runs it (processAiPreReview). Returns the QUEUED record. */
  async runAiPreReview(submissionInput: string, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput);
    if (!(await canAccessFullSubmission(submission, actor.id, actorRole))) throw AppError.forbidden();
    const isAuthor = Boolean(await getPrisma().submissionAuthor.findUnique({ where: { submissionId_userId: { submissionId: submission.id, userId: actor.id } } }));
    if (!isAuthor && !hasPermission(actorRole, "review:assign")) throw AppError.forbidden("Only an author or review manager can request AI pre-review");
    if (AI_PRE_REVIEW_CLOSED_STATUSES.includes(submission.status)) throw AppError.conflict("This submission no longer accepts pre-review analysis");
    // Lock the submission row so two clicks cannot both see "nothing running" and queue twice.
    const record = await getPrisma().$transaction(async (tx) => {
      await lockProjectAccounts(tx, [actor.id]);
      await tx.$queryRaw`SELECT id FROM submissions WHERE id = ${submission.id}::uuid FOR UPDATE`;
      const live = await tx.submission.findUniqueOrThrow({ where: { id: submission.id } });
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${live.projectId}::uuid FOR SHARE`;
      const project = await tx.project.findUniqueOrThrow({ where: { id: live.projectId } });
      if (project.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
      if (!hasPermission(actorRole, "review:assign")) {
        if (!await currentProjectMembership(live.projectId, actor.id, tx)) throw AppError.forbidden("Project membership is required");
        if (!await tx.submissionAuthor.findUnique({ where: { submissionId_userId: { submissionId: live.id, userId: actor.id } } })) throw AppError.forbidden("Only an author or review manager can request AI pre-review");
      }
      if (AI_PRE_REVIEW_CLOSED_STATUSES.includes(live.status)) throw AppError.conflict("This submission no longer accepts pre-review analysis");
      if (await tx.aiPreReview.findFirst({ where: { submissionId: submission.id, status: { in: ["QUEUED", "PROCESSING"] } } })) throw AppError.conflict("An AI pre-review is already running");
      return tx.aiPreReview.create({ data: { submissionId: submission.id, requestedById: actor.id, status: "QUEUED", ...(live.currentRevisionId ? { rawStructuredOutput: { sourceRevisionId: live.currentRevisionId, sourceRevisionNumber: live.currentRevisionNumber } } : {}) } });
    });
    try {
      await aiJobsQueue.add(AI_PRE_REVIEW_JOB, { preReviewId: record.id } satisfies AiPreReviewJob, { jobId: aiPreReviewJobId(record.id), attempts: 3, backoff: { type: "exponential", delay: 5000 } });
    } catch (error) {
      await getPrisma().aiPreReview.update({ where: { id: record.id }, data: { status: "FAILED", errorMessage: AI_PRE_REVIEW_FAILURE } });
      throw error;
    }
    await auditService.log("submission.ai_pre_review.requested", { userId: actor.id, targetTableName: "ai_pre_reviews", targetRecordId: record.id, details: { submissionId: submission.id } });
    return aiReviewDto(record);
  },

  /** Worker side of an AI pre-review. Throws on transient errors so BullMQ retries; never changes a reviewed submission's status. */
  async processAiPreReview(job: AiPreReviewJob) {
    const claimed = await getPrisma().aiPreReview.updateMany({ where: { id: job.preReviewId, status: { in: ["QUEUED", "PROCESSING"] } }, data: { status: "PROCESSING" } });
    if (!claimed.count) return;
    const record = await getPrisma().aiPreReview.findUniqueOrThrow({ where: { id: job.preReviewId } });
    const submission = await getPrisma().submission.findUnique({ where: { id: record.submissionId } });
    const unavailable = await preReviewUnavailableReason(submission, record.requestedById);
    if (!submission || unavailable) {
      await getPrisma().aiPreReview.updateMany({ where: { id: record.id, status: "PROCESSING" }, data: { status: "CANCELLED", errorMessage: unavailable } });
      return;
    }
    const source = preReviewSource(record.rawStructuredOutput);
    const sourceRevision = await getPrisma().submissionRevision.findFirst({ where: { submissionId: submission.id, ...(source.sourceRevisionId ? { id: source.sourceRevisionId } : submission.currentRevisionId ? { id: submission.currentRevisionId } : {}) }, orderBy: { revisionNumber: "desc" } });
    if (source.sourceRevisionId && !sourceRevision) {
      await getPrisma().aiPreReview.update({ where: { id: record.id }, data: { status: "CANCELLED", errorMessage: "The source revision is no longer available." } });
      return;
    }
    const sourceContext = sourceRevision ? { sourceRevisionId: sourceRevision.id, sourceRevisionNumber: sourceRevision.revisionNumber } : {};
    const manuscriptText = await loadManuscriptText({ id: submission.id, currentRevisionId: sourceRevision?.id ?? null });
    const relatedEvidence = await loadRelatedEvidence(submission);
    // Extraction and evidence retrieval can outlive project membership or archival.
    const beforeProvider = await preReviewUnavailableReason(await getPrisma().submission.findUnique({ where: { id: submission.id } }), record.requestedById);
    if (beforeProvider) {
      await getPrisma().aiPreReview.updateMany({ where: { id: record.id, status: "PROCESSING" }, data: { status: "CANCELLED", errorMessage: beforeProvider } });
      return;
    }
    const result = await aiReviewerClient.preReview({ title: submission.title, abstract: submission.abstractText ?? undefined, submission_type: submission.submissionType ?? undefined, research_goal: submission.researchGoal ?? undefined, research_questions: submission.researchQuestions, claimed_gap: submission.claimedResearchGap ?? undefined, claimed_contribution: submission.claimedContribution ?? undefined, methodology: submission.methodology ?? undefined, ...(manuscriptText ? { manuscript_text: manuscriptText } : {}), related_evidence: relatedEvidence });
    const analysis = result.analysis;
    const completed = await getPrisma().$transaction(async (tx) => {
      await lockProjectAccounts(tx, [record.requestedById]);
      await tx.$queryRaw`SELECT id FROM submissions WHERE id = ${submission.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${submission.projectId}::uuid FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM ai_pre_reviews WHERE id = ${record.id}::uuid FOR UPDATE`;
      const current = await tx.aiPreReview.findUnique({ where: { id: record.id } });
      if (current?.status !== "PROCESSING") return null;
      const afterProvider = await preReviewUnavailableReason(await tx.submission.findUnique({ where: { id: submission.id } }), record.requestedById, tx);
      if (afterProvider) {
        await tx.aiPreReview.update({ where: { id: record.id }, data: { status: "CANCELLED", errorMessage: afterProvider } });
        return null;
      }
      const updated = await tx.aiPreReview.update({ where: { id: record.id }, data: { provider: result.provider, model: result.model, status: "COMPLETED", summary: analysis.summary, goalAlignment: analysis.goal_alignment as never, rqCoverage: analysis.rq_coverage as never, unsupportedClaims: analysis.unsupported_claims as never, citationIssues: analysis.citation_issues, contributionComparison: analysis.contribution_comparison, reviewFocusAreas: analysis.review_focus_areas, limitations: analysis.limitations, rawStructuredOutput: { ...analysis, ...sourceContext } as never, errorMessage: null, completedAt: new Date() } });
      // Only a fresh submission moves forward; one already under review or revised keeps its status.
      await tx.submission.updateMany({ where: { id: submission.id, status: "submitted" }, data: { status: "ready_for_review" } });
      return updated;
    });
    if (!completed) return;
    await auditService.log("submission.ai_pre_review.completed", { userId: record.requestedById, targetTableName: "ai_pre_reviews", targetRecordId: completed.id, details: { submissionId: submission.id, provider: result.provider, model: result.model } });
  },

  /** Final failure of a pre-review job: a safe message for the user; the raw error stays in the worker log. */
  async failAiPreReview(preReviewId: string, message = AI_PRE_REVIEW_FAILURE) {
    await getPrisma().aiPreReview.updateMany({ where: { id: preReviewId, status: { in: ["QUEUED", "PROCESSING"] } }, data: { status: "FAILED", errorMessage: message.slice(0, 1000) } });
  },

  async get(submissionInput: string, actorInput: string, actorRole: UserRole, projectInput?: string) {
    const actor = await resolveUser(actorInput);
    const submission = await getSubmissionOrThrow(submissionInput);
    if (projectInput) {
      const project = await getProjectForAccess(projectInput, actor.id, actorRole);
      if (submission.projectId !== project.id) throw AppError.notFound("Submission not found in this project");
    }
    const access = await assertSubmissionAccess(submission, actor.id, actorRole);
    return access === "blind" ? this.getReviewerView(submissionInput, actorInput, actorRole) : hydrateSubmission(submission);
  },

  async history(submissionInput: string, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput);
    const access = await assertSubmissionAccess(submission, actor.id, actorRole); const prisma = getPrisma();
    const allowed = access === "blind" ? await accessibleRevisionIds(submission.id, actor.id) : undefined;
    const reviews = await prisma.humanReview.findMany({ where: { submissionId: submission.id, status: "SUBMITTED", ...(access === "blind" ? { reviewerId: actor.id } : {}) }, orderBy: [{ submittedAt: "asc" }, { roundNumber: "asc" }] });
    const assignments = await prisma.reviewerAssignment.findMany({ where: { submissionId: submission.id } });
    const visibleAssignments = access === "blind" ? assignments.filter((item) => item.reviewerId === actor.id) : assignments;
    const requests = await prisma.reviewRequest.findMany({ where: { submissionId: submission.id, ...(access === "blind" ? { id: { in: visibleAssignments.flatMap((item) => item.reviewRequestId ? [item.reviewRequestId] : []) } } : {}) }, orderBy: { createdAt: "desc" } });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set([...reviews.map((item) => item.reviewerId), ...visibleAssignments.map((item) => item.reviewerId)])] } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true, role: true } });
    const userMap = new Map(users.map((item) => [item.id, item.fullName]));
    const versions = await prisma.submissionRevision.findMany({ where: { submissionId: submission.id, ...(allowed ? { id: { in: allowed } } : {}) }, orderBy: { revisionNumber: "desc" } });
    const reviewIds = reviews.map(review => review.id);
    const [responses, revisionItems] = await Promise.all([
      prisma.reviewResponse.findMany({ where: { reviewId: { in: reviewIds } } }),
      prisma.reviewRevisionItem.findMany({ where: { reviewId: { in: reviewIds } }, orderBy: { position: "asc" } }),
    ]);
    const revisionResponses = await prisma.reviewRevisionResponse.findMany({ where: { revisionItemId: { in: revisionItems.map(item => item.id) }, ...(access === "blind" ? { status: { not: "DRAFT" } } : {}) }, orderBy: { createdAt: "asc" } });
    const reviewDetails = reviews.map(review => ({ id: review.id, reviewerId: review.reviewerId, reviewerName: access === "blind" ? "Your review" : userMap.get(review.reviewerId) ?? "Reviewer", reviewerAcademicRole: review.reviewerAcademicRole, revisionId: review.revisionId, roundNumber: review.roundNumber, templateVersionId: review.templateVersionId, weightedScore: review.weightedScore, overallAssessment: review.overallAssessment, keyStrengths: review.keyStrengths, keyConcerns: review.keyConcerns, overallComment: review.overallComment, submittedAt: review.submittedAt, requestId: assignments.find(item => item.id === review.assignmentId)?.reviewRequestId,
      responses: responses.filter(response => response.reviewId === review.id),
      requiredRevisions: revisionItems.filter(item => item.reviewId === review.id).map(item => ({ ...item, responses: revisionResponses.filter(response => response.revisionItemId === item.id) })),
    }));
    const [project, author] = await Promise.all([
      prisma.project.findUniqueOrThrow({ where: { id: submission.projectId } }),
      prisma.submissionAuthor.findUnique({ where: { submissionId_userId: { submissionId: submission.id, userId: actor.id } } }),
    ]);
    const writable = access === "full" && project.status !== "ARCHIVED";
    const source = writable && submission.sourceManuscriptId ? await prisma.draftWorkspace.findFirst({ where: { id: submission.sourceManuscriptId, projectId: project.id, writingMode: "LATEX", archivedAt: null, deletedAt: null }, select: { id: true } }) : null;
    const sourceManuscriptWritable = Boolean(source && (project.ownerId === actor.id || await prisma.projectMember.count({ where: { projectId: project.id, userId: actor.id, status: "ACTIVE" } })));
    const assignmentByRequest = new Map(visibleAssignments.flatMap((item) => item.reviewRequestId ? [[item.reviewRequestId, item] as const] : []));
    const revisionNumbers = new Map(versions.map((item) => [item.id, item.revisionNumber]));
    const mentorRequestIds = new Set(requests.filter(r=>r.origin === "MENTOR_GUIDANCE").map(r=>r.id));
    const mentorAssignmentRow = [...assignments].reverse().find(a => a.anonymousCode.startsWith("mentor-") || (a.reviewRequestId && mentorRequestIds.has(a.reviewRequestId)));
    const mentorUserObj = mentorAssignmentRow ? users.find((u) => u.id === mentorAssignmentRow.reviewerId) : undefined;
    const assignedMentor = mentorUserObj ? { id: publicDatabaseId(mentorUserObj), fullName: mentorUserObj.fullName, email: mentorUserObj.email ?? "", avatarUrl: mentorUserObj.avatarUrl ?? null, role: mentorUserObj.role ?? "MENTOR" } : null;
    let canProvideFeedback = project.status !== "ARCHIVED" && assignments.some(a=>a.reviewerId === actor.id && ["assigned","accepted"].includes(a.status));
    if (canProvideFeedback) {
      try { await assertPeerReviewer(actor.id); await assertMentorReviewAccess(prisma, submission.projectId, actor.id, submission.id); }
      catch { canProvideFeedback = false; }
    }
    return {
      sourceManuscriptWritable, canManage: await canManageSubmission(submission, actor.id, actorRole),
      canProvideFeedback,
      assignedMentor,
      canRunAiPreReview: writable && !AI_PRE_REVIEW_CLOSED_STATUSES.includes(submission.status) && Boolean(author || hasPermission(actorRole, "review:assign")),
      canRequestReview: writable && !["accepted", "rejected", "withdrawn"].includes(submission.status) && Boolean(submission.currentRevisionId) && project.ownerId === actor.id && actor.accountStatus === "ACTIVE" && Boolean(actor.emailVerifiedAt),
      reviewRequests: requests.flatMap((request) => {
        const assignment = assignmentByRequest.get(request.id);
        const revisionNumber = revisionNumbers.get(request.artifactRevisionId);
        if (!assignment || revisionNumber === undefined) return [];
        return [{
          id: request.id,
          reviewerId: access === "blind" ? undefined : assignment.reviewerId,
          reviewerName: access === "blind" ? "Your review" : userMap.get(assignment.reviewerId) ?? "Reviewer",
          status: request.status === "REQUESTED" && request.expiresAt && request.expiresAt <= new Date() ? "EXPIRED" : request.status,
          revisionNumber,
          revisionId: request.artifactRevisionId,
          origin: request.origin,
          createdAt: request.createdAt.toISOString(),
          updatedAt: request.updatedAt.toISOString(),
          dueAt: request.dueAt,
          canView: request.requesterId === actor.id || assignment.reviewerId === actor.id,
        }];
      }),
      openForReview: submission.openForReview, currentRevisionId: access === "blind" ? versions[0]?.id : submission.currentRevisionId, currentRevisionNumber: access === "blind" ? versions[0]?.revisionNumber : submission.currentRevisionNumber,
      latestReviewedRevisionId: versions.find((item) => reviews.some((review) => review.revisionId === item.id))?.id ?? null,
      versions: versions.map((item) => ({
        id: item.id,
        revisionNumber: item.revisionNumber,
        contentType: item.contentType,
        contentSnapshot: item.contentSnapshot,
        checksumSha256: item.checksumSha256,
        sizeBytes: item.sizeBytes,
        originalFileName: access === "blind" ? null : item.originalFileName ?? null,
        sourceRevisionId: item.sourceRevisionId,
        manuscriptSnapshotId: item.manuscriptSnapshotId,
        responseToReview: item.responseToReview,
        createdAt: item.createdAt,
        hasPdf: Boolean(item.storageUri),
        reviews: reviewDetails.filter((review) => review.revisionId === item.id),
      })),
      contributions: [...new Set(reviews.map((item) => item.reviewerId))].map((reviewerId) => ({ reviewerId, name: userMap.get(reviewerId) ?? "Reviewer", type: "REVIEW", status: assignments.some((item) => item.reviewerId === reviewerId && item.status === "accepted" && item.decision?.includes("revision")) ? "FOLLOWING_REVISION" : assignments.some((item) => item.reviewerId === reviewerId && ["assigned", "accepted"].includes(item.status)) ? "IN_REVIEW" : "COMPLETED", rounds: reviewDetails.filter((item) => item.reviewerId === reviewerId).map((item) => ({ reviewId: item.id, revisionId: item.revisionId, roundNumber: item.roundNumber, submittedAt: item.submittedAt, academicRole: item.reviewerAcademicRole })) })),
    };
  },

  async setOpenForReview(submissionInput: string, enabled: boolean, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput);
    if (!await canManageSubmission(submission, actor.id, actorRole)) throw AppError.forbidden();
    await getPrisma().$transaction(async (tx) => {
      await lockProjectAccounts(tx, [actor.id]);
      await tx.$queryRaw`SELECT id FROM submissions WHERE id = ${submission.id}::uuid FOR UPDATE`;
      const live = await tx.submission.findUniqueOrThrow({ where: { id: submission.id } });
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${live.projectId}::uuid FOR SHARE`;
      const project = await tx.project.findUniqueOrThrow({ where: { id: live.projectId } });
      if (project.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
      if (!await canManageSubmission(live, actor.id, actorRole, tx)) throw AppError.forbidden();
      if (enabled && ["accepted", "rejected", "withdrawn"].includes(live.status)) throw AppError.conflict("This research no longer accepts reviews");
      await tx.submission.update({ where: { id: submission.id }, data: { openForReview: enabled } });
    });
    await auditService.log("submission.open_review.changed", { userId: actor.id, targetTableName: "submissions", targetRecordId: submission.id, details: { enabled } });
  },

  async createVersion(submissionInput: string, input: { content?: string; sourceRevisionId?: string; expectedRevisionNumber: number; summary: string }, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput);
    if (!await canManageSubmission(submission, actor.id, actorRole)) throw AppError.forbidden();
    const revision = await getPrisma().$transaction(async (tx) => {
      await lockProjectAccounts(tx, [actor.id]);
      await tx.$queryRaw`SELECT id FROM submissions WHERE id = ${submission.id}::uuid FOR UPDATE`;
      const live = await tx.submission.findUniqueOrThrow({ where: { id: submission.id } });
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${live.projectId}::uuid FOR SHARE`;
      const project = await tx.project.findUniqueOrThrow({ where: { id: live.projectId } });
      if (project.status === "ARCHIVED" || ["accepted", "rejected", "withdrawn"].includes(live.status)) throw AppError.conflict("Research is read-only");
      if (!await canManageSubmission(live, actor.id, actorRole, tx)) throw AppError.forbidden();
      if (live.currentRevisionNumber !== input.expectedRevisionNumber) throw AppError.conflict("A newer version exists. Refresh before saving.");
      const source = input.sourceRevisionId ? await tx.submissionRevision.findFirst({ where: { ...idWhere(input.sourceRevisionId), submissionId: submission.id } }) : null;
      if (input.sourceRevisionId && !source) throw AppError.notFound("Source revision not found");
      const content = input.content ?? source?.contentSnapshot;
      if (!content && !source?.storageUri) throw AppError.badRequest("Provide Markdown content or an existing revision to restore");
      const created = await tx.submissionRevision.create({ data: { submissionId: live.id, revisionNumber: live.currentRevisionNumber + 1, uploadedById: actor.id, sourceRevisionId: source?.id ?? live.currentRevisionId, responseToReview: input.summary,
        contentSnapshot: content, contentType: input.content !== undefined ? "MARKDOWN" : source?.contentType ?? "MARKDOWN", storageUri: input.content !== undefined ? null : source?.storageUri, manuscriptSnapshotId: input.content !== undefined ? null : source?.manuscriptSnapshotId,
        attributionCheckId: input.content !== undefined ? null : source?.attributionCheckId, integrityReportId: input.content !== undefined ? null : source?.integrityReportId,
        checksumSha256: content ? crypto.createHash("sha256").update(content).digest("hex") : source?.checksumSha256, sizeBytes: content ? Buffer.byteLength(content) : source?.sizeBytes ?? 0, originalFileName: input.content !== undefined ? null : source?.originalFileName,
      } });
      await tx.submission.update({ where: { id: live.id }, data: { currentRevisionId: created.id, currentRevisionNumber: created.revisionNumber, status: "revised" } });
      await refreshSubmissionReviewStatus(tx, live.id);
      if (typeof tx.projectTask?.updateMany === "function") await syncRevisionWithMentorWorkflow(tx, live, created, actor.id);
      return created;
    });
    await auditService.log("submission.version.created", { userId: actor.id, targetTableName: "submission_revisions", targetRecordId: revision.id, details: { submissionId: submission.id, sourceRevisionId: revision.sourceRevisionId } });
    return revisionDto(revision);
  },

  async addRevision(submissionInput: string, responseToReview: string | undefined, file: UploadedPdf, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput);
    if (!(await canManageSubmission(submission, actor.id, actorRole))) throw AppError.forbidden();
    if (["accepted", "rejected", "withdrawn"].includes(submission.status)) throw AppError.conflict("This submission no longer accepts revisions");
    const { checksumSha256, stored } = await persistFile(file); const nextRevision = submission.currentRevisionNumber + 1;
    try {
      const result = await getPrisma().$transaction(async (tx) => {
        await lockProjectAccounts(tx, [actor.id]);
        await tx.$queryRaw`SELECT id FROM submissions WHERE id = ${submission.id}::uuid FOR UPDATE`;
        const live = await tx.submission.findUniqueOrThrow({ where: { id: submission.id } });
        await tx.$queryRaw`SELECT id FROM projects WHERE id = ${live.projectId}::uuid FOR SHARE`;
        const project = await tx.project.findUniqueOrThrow({ where: { id: live.projectId } });
        if (project.status === "ARCHIVED" || ["accepted", "rejected", "withdrawn"].includes(live.status) || live.currentRevisionNumber !== submission.currentRevisionNumber) throw AppError.conflict("The research is read-only or its version changed; refresh before uploading");
        if (!await canManageSubmission(live, actor.id, actorRole, tx)) throw AppError.forbidden();
        const revision = await tx.submissionRevision.create({ data: { sourceRevisionId: submission.currentRevisionId, submissionId: submission.id, revisionNumber: nextRevision, uploadedById: actor.id, responseToReview, storageUri: stored.uri, checksumSha256, sizeBytes: file.size, originalFileName: file.originalname } });
        const changed = await tx.submission.updateMany({ where: { id: submission.id, currentRevisionNumber: submission.currentRevisionNumber }, data: { currentRevisionId: revision.id, currentRevisionNumber: { increment: 1 }, status: "revised" } });
        if (!changed.count) throw AppError.conflict("Another revision was uploaded at the same time; retry the request");
        await refreshSubmissionReviewStatus(tx, submission.id);
        if (typeof tx.projectTask?.updateMany === "function") await syncRevisionWithMentorWorkflow(tx, live, revision, actor.id);
        const updated = await tx.submission.findUniqueOrThrow({ where: { id: submission.id } });
        return { submission: updated, revision };
      }, { isolationLevel: "Serializable" });
      await auditService.log("submission.revision.created", { userId: actor.id, targetTableName: "submission_revisions", targetRecordId: result.revision.id, details: { submissionId: submission.id, revisionNumber: nextRevision, checksumSha256 } }); return { submission: submissionDto(result.submission), revision: revisionDto(result.revision) };
    } catch (error) { await pdfStorageService.deletePdf(stored.uri).catch(() => undefined); if (isUniqueViolation(error)) throw AppError.conflict("Another revision was uploaded at the same time; retry the request"); throw error; }
  },

  async listRevisions(submissionInput: string, actorInput: string, actorRole: UserRole) { const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput); const access = await assertSubmissionAccess(submission, actor.id, actorRole); const allowed = access === "blind" ? await accessibleRevisionIds(submission.id, actor.id) : undefined; const rows = await getPrisma().submissionRevision.findMany({ where: { submissionId: submission.id, ...(allowed ? { id: { in: allowed } } : {}) }, orderBy: { revisionNumber: "desc" } }); return rows.map((row) => { const dto = revisionDto(row); if (access === "blind") { const { uploadedById: _uploadedById, uploadedBy: _uploadedBy, originalFileName: _originalFileName, ...safe } = dto; return safe; } return dto; }); },

  async resolveDownload(submissionInput: string, revisionInput: string, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput), submission = await getSubmissionOrThrow(submissionInput);
    const access = await assertSubmissionAccess(submission, actor.id, actorRole);
    const allowed = access === "blind" ? await accessibleRevisionIds(submission.id, actor.id) : undefined;
    const revision = await getPrisma().submissionRevision.findFirst({ where: { ...idWhere(revisionInput), submissionId: submission.id, ...(allowed ? { AND: { id: { in: allowed } } } : {}) } });
    if (!revision) throw AppError.notFound("Submission revision not found");
    if (!revision.storageUri) throw AppError.badRequest("This artifact revision is displayed in LumiGap and has no PDF download");
    await researchLedgerService.record({ projectId: submission.projectId, actorId: actor.id, eventType: "SUBMISSION_REVISION_DOWNLOADED", resourceKind: "SUBMISSION_REVISION", resourceId: revision.id, checksumSha256: revision.checksumSha256 ?? null, visibility: "PROJECT_TEAM", retentionClass: "SECURITY_AUDIT", metadata: { submissionId: submission.id, revisionNumber: revision.revisionNumber, accessMode: access } });
    const filename = "submission-revision-" + revision.revisionNumber + ".pdf";
    if (access === "blind") {
      // A reviewer receives bytes, never a reusable storage capability. The
      // existing bounded reader validates remote PDF responses and public DNS.
      let content: Buffer;
      try { content = await readStoredPdf(revision.storageUri); }
      catch { throw AppError.notFound("Submission file is not available"); }
      // Storage can be slow: a revoked assignment must not authorize a response
      // using the permission check made before the storage request.
      const currentAccess = await assertSubmissionAccess(await getSubmissionOrThrow(submission.id), actor.id, actorRole);
      if (currentAccess === "blind" && !(await accessibleRevisionIds(submission.id, actor.id)).includes(revision.id)) throw AppError.notFound("Submission revision not found");
      return { kind: "buffer" as const, content, filename };
    }
    const signedUrl = await pdfStorageService.getSignedDownloadUrl(revision.storageUri);
    if (signedUrl) return { kind: "redirect" as const, url: signedUrl };
    const localPath = pdfStorageService.resolveLocalPath(revision.storageUri);
    if (!localPath) throw AppError.notFound("Submission file is not available");
    return { kind: "local" as const, path: localPath, filename };
  },

  async assignReviewer(_submissionInput: string, _input: { reviewerId: string; dueAt?: Date; enforceInstitutionConflict?: boolean }, _actorInput: string) {
    throw AppError.conflict("Use an Academic Review Request; new direct Admin assignments are disabled");
  },

  async listAssignments(submissionInput: string) { const submission = await getSubmissionOrThrow(submissionInput); const prisma = getPrisma(); const rows = await prisma.reviewerAssignment.findMany({ where: { submissionId: submission.id }, orderBy: { createdAt: "desc" } }); const users = await prisma.user.findMany({ where: { id: { in: rows.map((row) => row.reviewerId) } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, institution: true, role: true } }); const map = new Map(users.map((user) => [user.id, { ...user, id: publicDatabaseId(user) }])); return rows.map((row) => ({ ...row, id: publicDatabaseId(row), reviewerId: map.get(row.reviewerId) })); },

  async listMyAssignments(reviewerInput: string) {
    const reviewer = await resolveUser(reviewerInput);
    const prisma = getPrisma();
    const rows = await visibleMentorReviewAssignments(
      prisma,
      await prisma.reviewerAssignment.findMany({ where: { reviewerId: reviewer.id, status: { not: "cancelled" } }, orderBy: { createdAt: "desc" } }),
    );
    const submissions = await prisma.submission.findMany({ where: { id: { in: rows.map(row => row.submissionId) } }, select: { id: true, legacyMongoId: true, title: true, submissionType: true, projectId: true, status: true } });
    const map = new Map(submissions.map(row => [row.id, { ...row, id: publicDatabaseId(row), _id: publicDatabaseId(row) }]));
    return rows.filter(row => map.has(row.submissionId)).map(row => ({ ...row, id: publicDatabaseId(row), submissionId: map.get(row.submissionId) }));
  },

  async updateAssignment(submissionInput: string, assignmentInput: string, input: { status: "accepted" | "declined" | "completed" | "cancelled"; reviewText?: string }, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput); const assignment = await getPrisma().reviewerAssignment.findFirst({ where: { ...idWhere(assignmentInput), submissionId: submission.id } }); if (!assignment) throw AppError.notFound("Reviewer assignment not found");
    if (assignment.reviewerId !== actor.id && !hasPermission(actorRole, "review:assign")) throw AppError.forbidden();
    if (input.status === "completed") throw AppError.conflict("Submit a structured review in the review workspace to complete this assignment");
    if (!assignment.reviewRequestId) throw AppError.conflict("Legacy assignment requires migration to a review request");
    if (input.status === "accepted") await reviewRequestService.accept(assignment.reviewRequestId, actorInput);
    else if (input.status === "declined") await reviewRequestService.decline(assignment.reviewRequestId, actorInput, input.reviewText);
    else {
      if (!hasPermission(actorRole, "review:assign")) throw AppError.forbidden();
      await getPrisma().$transaction(async (tx) => {
        await lockReviewerAndSubmission(tx, assignment.reviewerId, submission.id);
        const live = await tx.reviewRequest.findUniqueOrThrow({ where: { id: assignment.reviewRequestId! } });
        if (!["REQUESTED", "ACCEPTED"].includes(live.status)) throw AppError.conflict("This request can no longer be cancelled");
        await tx.reviewRequest.update({ where: { id: live.id }, data: { status: "CANCELLED" } });
        await tx.reviewerAssignment.update({ where: { id: assignment.id }, data: { status: "cancelled" } });
        await refreshSubmissionReviewStatus(tx, submission.id);
      });
    }
    await auditService.log("submission.review.updated", { userId: actor.id, targetTableName: "reviewer_assignments", targetRecordId: assignment.id, details: { submissionId: submission.id, status: input.status } });
    return getPrisma().reviewerAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
  },



  async prepareMentorReview(submissionInput: string, actorInput: string) {
    return reviewRequestService.prepareMentorReview(submissionInput, actorInput);
  },

  /** Preserve legacy feedback as a canonical draft; only the complete template can be submitted. */
  async submitFeedback(submissionInput: string, input: {
    result: "FEEDBACK_GIVEN" | "REVISION_REQUESTED" | "READY_TO_ADVANCE"; overallComment: string;
    paragraphComments?: Array<{criterionKey?:string;comment:string;evidence?:string}>;
    rubricScores?: Array<{criterionKey:string;score?:number;assessment?:string;comment?:string}>;
    requestedInformation?:string;
  }, actorInput: string, _actorRole: UserRole) {
    await assertPeerReviewer(actorInput);
    const prepared = await reviewRequestService.prepareMentorReview(submissionInput, actorInput);
    const workspace = await reviewService.getReview(prepared.assignmentId, actorInput);
    // Legacy criteria do not correspond one-to-one to the published rubric. Keep
    // their exact values as attributed notes, never invent new rubric selections.
    const legacyNotes = [
      ...(input.paragraphComments ?? []).map(item=>`[Legacy paragraph feedback${item.criterionKey ? ": "+item.criterionKey : ""}] ${item.comment}${item.evidence ? "\nReference supplied by reviewer: "+item.evidence : ""}`),
      ...(input.rubricScores ?? []).map(item=>`[Legacy criterion: ${item.criterionKey}] ${item.score ?? item.assessment ?? "Unassessed"}${item.comment ? "\n"+item.comment : ""}`),
      ...(input.requestedInformation ? ["Requested clarification: "+input.requestedInformation] : []),
    ];
    if (workspace.review?.status === "DRAFT" && (workspace.responses.length || Object.keys(workspace.review.integrityChecks ?? {}).length)) throw AppError.conflict("Continue the existing structured draft in the review workspace",prepared);
    const saved = await reviewService.saveReview(prepared.assignmentId, actorInput, {
      expectedRevisionId:workspace.artifactRevision!.id,expectedRoundNumber:workspace.roundNumber,
      overallComment:[input.overallComment,...legacyNotes].join("\n\n"),
      overallAssessment:input.result === "READY_TO_ADVANCE" ? "STRONG" : input.result === "REVISION_REQUESTED" ? "MAJOR_REVISION" : undefined,
      integrityChecks:{},
      responses:[],
      requiredRevisions:workspace.requiredRevisions.map(item=>({priority:item.priority as "MINOR"|"MAJOR",description:item.description,criterionKey:item.criterionKey ?? undefined,locator:item.locator ?? undefined,quotation:item.quotation ?? undefined})),
    },false);
    return {success:true,...prepared,reviewId:saved.review.id,submitted:false,requiresCompletion:true,message:"Feedback saved as a draft. Complete the published rubric and integrity checklist in the review workspace before submitting."};
  },

  async listActiveMentors(projectInput: string, actorInput: string) {
    const actor = await resolveUser(actorInput);
    const project = await getProjectForAccess(projectInput, actor.id, "USER");
    const prisma = getPrisma();
    const relationships = await prisma.mentorRelationship.findMany({
      where: { projectId: project.id, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    let activeRelationships = relationships;
    if (relationships.length && typeof prisma.mentorAccess?.findMany === "function") {
      const validIds = new Set<string>();
      for (const rel of relationships) {
        try {
          await acceptedMentorReviewPolicy(prisma, project.id, rel.mentorUserId);
          validIds.add(rel.mentorUserId);
        } catch {
          // Exclude mentors whose access policy was revoked, expired, or unverified.
        }
      }
      activeRelationships = relationships.filter((r) => validIds.has(r.mentorUserId));
    }
    const users = await prisma.user.findMany({
      where: { id: { in: activeRelationships.map((r) => r.mentorUserId) } },
      select: { id: true, legacyMongoId: true, fullName: true, email: true, institution: true, avatarUrl: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return activeRelationships.flatMap((rel) => {
      const u = userMap.get(rel.mentorUserId);
      if (!u) return [];
      return [{
        id: publicDatabaseId(u),
        canonicalId: u.id,
        fullName: u.fullName,
        email: u.email,
        institution: u.institution,
        avatarUrl: u.avatarUrl,
        mentorRole: rel.mentorRole,
      }];
    });
  },

  async getReviewerView(submissionInput: string, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput);
    const access = await assertSubmissionAccess(submission, actor.id, actorRole);
    const allowed = access === "blind" ? await accessibleRevisionIds(submission.id, actor.id) : undefined;
    const revisions = await getPrisma().submissionRevision.findMany({ where: { submissionId: submission.id, ...(allowed ? { id: { in: allowed } } : {}) }, orderBy: { revisionNumber: "desc" }, select: { id: true, legacyMongoId: true, revisionNumber: true, contentType: true, responseToReview: true, checksumSha256: true, sizeBytes: true, createdAt: true } });
    return { id: publicDatabaseId(submission), _id: publicDatabaseId(submission), title: submission.title, abstract: submission.abstractText, status: submission.status, currentRevisionNumber: access === "blind" ? revisions[0]?.revisionNumber : submission.currentRevisionNumber, revisions: revisions.map((row) => ({ ...row, id: publicDatabaseId(row), _id: publicDatabaseId(row) })), doubleBlind: false };
  },
};
