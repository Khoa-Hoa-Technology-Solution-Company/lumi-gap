import crypto from "node:crypto";
import type { UserRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { hasPermission } from "../../common/authorization/permissions.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { pdfStorageService } from "../../infrastructure/pdf-storage.service.js";
import { auditService } from "../audit/audit.service.js";
import { capabilityService } from "../authorization/capability.service.js";
import { aiReviewerClient } from "../papers/ai-reviewer.client.js";

type UploadedPdf = { buffer: Buffer; originalname: string; size: number };
type CreateSubmissionInput = { projectId: string; title: string; abstract?: string; submissionType?: "RESEARCH_PROPOSAL" | "LITERATURE_REVIEW" | "THESIS_DRAFT" | "RESEARCH_PAPER" | "SOFTWARE_RESEARCH_PROJECT"; researchField?: string; researchGoal?: string; researchQuestions?: string[]; claimedResearchGap?: string; claimedContribution?: string; methodology?: string; scope?: string; keywords?: string[]; expectedReviewWorkload?: string; authorIds?: string[]; declaredConflictUserIds?: string[] };
type SubmissionRow = Awaited<ReturnType<typeof getSubmissionOrThrow>>;

function ids(values: string[] | undefined): string[] { return [...new Set(values ?? [])]; }
function idWhere(value: string): { id?: string; legacyMongoId?: string } { const parsed = parseDatabaseId(value); if (!parsed) throw AppError.badRequest("Invalid database identifier"); return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }; }
function isUniqueViolation(error: unknown): boolean { return (error as { code?: string }).code === "P2002"; }

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

async function getProjectForAccess(projectInput: string, userId: string, role: UserRole) {
  const prisma = getPrisma();
  const project = await prisma.project.findFirst({ where: idWhere(projectInput) });
  if (!project) throw AppError.notFound("Project not found");
  if (project.ownerId !== userId && !hasPermission(role, "review:assign")) {
    const member = await prisma.projectMember.findFirst({ where: { projectId: project.id, userId, status: "active" } });
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
  if (await prisma.submissionAuthor.findUnique({ where: { submissionId_userId: { submissionId: submission.id, userId } } })) return true;
  const project = await prisma.project.findUnique({ where: { id: submission.projectId } });
  if (project?.ownerId === userId) return true;
  return Boolean(await prisma.projectMember.findFirst({ where: { projectId: submission.projectId, userId, status: "active" } }));
}

async function assertSubmissionAccess(submission: SubmissionRow, userId: string, role: UserRole) {
  if (await canAccessFullSubmission(submission, userId, role)) return "full" as const;
  const assignment = await getPrisma().reviewerAssignment.findFirst({ where: { submissionId: submission.id, reviewerId: userId, status: { notIn: ["declined", "cancelled"] } } });
  if (assignment) return "blind" as const;
  throw AppError.forbidden("You do not have access to this submission");
}

async function persistFile(file: UploadedPdf) {
  const checksumSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const stored = await pdfStorageService.savePdf(file.buffer, file.originalname);
  return { checksumSha256, stored };
}

function submissionDto(row: SubmissionRow) { return { ...row, id: publicDatabaseId(row), projectId: row.projectId, createdBy: row.createdById, abstract: row.abstractText, currentRevisionId: row.currentRevisionId ?? undefined }; }
function revisionDto(row: { id: string; legacyMongoId: string | null; submissionId: string; revisionNumber: number; uploadedById: string; responseToReview: string | null; checksumSha256: string; sizeBytes: number; originalFileName: string; createdAt: Date; updatedAt: Date }) { return { ...row, id: publicDatabaseId(row), uploadedBy: row.uploadedById, responseToReview: row.responseToReview ?? undefined }; }
function aiReviewDto(row: { id: string; legacyMongoId: string | null; [key: string]: unknown }) { return { ...row, id: publicDatabaseId(row) }; }

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

export const submissionService = {
  async create(input: CreateSubmissionInput, file: UploadedPdf, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const project = await getProjectForAccess(input.projectId, actor.id, actorRole);
    const requestedAuthorInputs = ids([actorInput, ...(input.authorIds ?? [])]); const conflictInputs = ids(input.declaredConflictUserIds).filter((id) => !requestedAuthorInputs.includes(id));
    const users = await resolveUsers([...requestedAuthorInputs, ...conflictInputs]);
    const byPublicId = new Map<string, string>(); for (const user of users) { byPublicId.set(user.id, user.id); if (user.legacyMongoId) byPublicId.set(user.legacyMongoId, user.id); }
    const authorIds = requestedAuthorInputs.map((value) => byPublicId.get(value)!).filter(Boolean); const conflictIds = conflictInputs.map((value) => byPublicId.get(value)!).filter(Boolean);
    const { checksumSha256, stored } = await persistFile(file);
    try {
      const result = await getPrisma().$transaction(async (tx) => {
        const submission = await tx.submission.create({ data: { projectId: project.id, createdById: actor.id, title: input.title, abstractText: input.abstract, submissionType: input.submissionType, researchField: input.researchField, researchGoal: input.researchGoal, researchQuestions: ids(input.researchQuestions), claimedResearchGap: input.claimedResearchGap, claimedContribution: input.claimedContribution, methodology: input.methodology, scope: input.scope, keywords: ids(input.keywords), expectedReviewWorkload: input.expectedReviewWorkload, currentRevisionNumber: 1 } });
        await tx.submissionAuthor.createMany({ data: authorIds.map((userId, position) => ({ submissionId: submission.id, userId, position })) });
        if (conflictIds.length) await tx.submissionDeclaredConflict.createMany({ data: conflictIds.map((userId) => ({ submissionId: submission.id, userId })) });
        const revision = await tx.submissionRevision.create({ data: { submissionId: submission.id, revisionNumber: 1, uploadedById: actor.id, storageUri: stored.uri, checksumSha256, sizeBytes: file.size, originalFileName: file.originalname } });
        const updated = await tx.submission.update({ where: { id: submission.id }, data: { currentRevisionId: revision.id } });
        return { submission: updated, revision };
      });
      await auditService.log("submission.created", { userId: actor.id, targetTableName: "submissions", targetRecordId: result.submission.id, details: { projectId: project.id, revisionNumber: 1, checksumSha256 } });
      return { submission: submissionDto(result.submission), revision: revisionDto(result.revision) };
    } catch (error) { await pdfStorageService.deletePdf(stored.uri).catch(() => undefined); throw error; }
  },

  async listMine(actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const prisma = getPrisma();
    const authorLinks = hasPermission(actorRole, "review:assign") ? [] : await prisma.submissionAuthor.findMany({ where: { userId: actor.id }, select: { submissionId: true } });
    const rows = await prisma.submission.findMany({ where: hasPermission(actorRole, "review:assign") ? {} : { OR: [{ createdById: actor.id }, { id: { in: authorLinks.map((row) => row.submissionId) } }] }, orderBy: { updatedAt: "desc" }, take: 100 });
    return rows.map(submissionDto);
  },

  async listAiPreReviews(submissionInput: string, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput); await assertSubmissionAccess(submission, actor.id, actorRole);
    return (await getPrisma().aiPreReview.findMany({ where: { submissionId: submission.id }, orderBy: { createdAt: "desc" }, take: 20 })).map(aiReviewDto);
  },

  async runAiPreReview(submissionInput: string, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput);
    if (!(await canAccessFullSubmission(submission, actor.id, actorRole))) throw AppError.forbidden();
    const isAuthor = Boolean(await getPrisma().submissionAuthor.findUnique({ where: { submissionId_userId: { submissionId: submission.id, userId: actor.id } } }));
    if (!isAuthor && !hasPermission(actorRole, "review:assign")) throw AppError.forbidden("Only an author or review manager can request AI pre-review");
    if (["completed", "accepted", "rejected", "withdrawn"].includes(submission.status)) throw AppError.conflict("This submission no longer accepts pre-review analysis");
    if (await getPrisma().aiPreReview.findFirst({ where: { submissionId: submission.id, status: { in: ["QUEUED", "PROCESSING"] } } })) throw AppError.conflict("An AI pre-review is already running");
    const record = await getPrisma().aiPreReview.create({ data: { submissionId: submission.id, requestedById: actor.id, status: "PROCESSING" } });
    await getPrisma().submission.update({ where: { id: submission.id }, data: { status: "ai_pre_review" } });
    try {
      const result = await aiReviewerClient.preReview({ title: submission.title, abstract: submission.abstractText ?? undefined, submission_type: submission.submissionType ?? undefined, research_goal: submission.researchGoal ?? undefined, research_questions: submission.researchQuestions, claimed_gap: submission.claimedResearchGap ?? undefined, claimed_contribution: submission.claimedContribution ?? undefined, methodology: submission.methodology ?? undefined, related_evidence: [] });
      const analysis = result.analysis; const completedAt = new Date();
      const completed = await getPrisma().$transaction(async (tx) => { const updated = await tx.aiPreReview.update({ where: { id: record.id }, data: { provider: result.provider, model: result.model, status: "COMPLETED", summary: analysis.summary, goalAlignment: analysis.goal_alignment as never, rqCoverage: analysis.rq_coverage as never, unsupportedClaims: analysis.unsupported_claims as never, citationIssues: analysis.citation_issues, contributionComparison: analysis.contribution_comparison, reviewFocusAreas: analysis.review_focus_areas, limitations: analysis.limitations, rawStructuredOutput: analysis as never, completedAt } }); await tx.submission.updateMany({ where: { id: submission.id, status: "ai_pre_review" }, data: { status: "ready_for_review" } }); return updated; });
      await auditService.log("submission.ai_pre_review.completed", { userId: actor.id, targetTableName: "ai_pre_reviews", targetRecordId: completed.id, details: { submissionId: submission.id, provider: result.provider, model: result.model } }); return aiReviewDto(completed);
    } catch (error) { await getPrisma().$transaction([getPrisma().aiPreReview.update({ where: { id: record.id }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "AI pre-review failed" } }), getPrisma().submission.updateMany({ where: { id: submission.id, status: "ai_pre_review" }, data: { status: submission.status } })]); throw error; }
  },

  async get(submissionInput: string, actorInput: string, actorRole: UserRole) { const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput); const access = await assertSubmissionAccess(submission, actor.id, actorRole); return access === "blind" ? this.getReviewerView(submissionInput, actorInput, actorRole) : hydrateSubmission(submission); },

  async addRevision(submissionInput: string, responseToReview: string | undefined, file: UploadedPdf, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput);
    if (!(await canAccessFullSubmission(submission, actor.id, actorRole))) throw AppError.forbidden();
    if (["completed", "accepted", "rejected", "withdrawn"].includes(submission.status)) throw AppError.conflict("This submission no longer accepts revisions");
    const { checksumSha256, stored } = await persistFile(file); const nextRevision = submission.currentRevisionNumber + 1;
    try {
      const result = await getPrisma().$transaction(async (tx) => { const revision = await tx.submissionRevision.create({ data: { submissionId: submission.id, revisionNumber: nextRevision, uploadedById: actor.id, responseToReview, storageUri: stored.uri, checksumSha256, sizeBytes: file.size, originalFileName: file.originalname } }); const changed = await tx.submission.updateMany({ where: { id: submission.id, currentRevisionNumber: submission.currentRevisionNumber }, data: { currentRevisionId: revision.id, currentRevisionNumber: { increment: 1 }, status: "revised" } }); if (!changed.count) throw AppError.conflict("Another revision was uploaded at the same time; retry the request"); const updated = await tx.submission.findUniqueOrThrow({ where: { id: submission.id } }); return { submission: updated, revision }; }, { isolationLevel: "Serializable" });
      await auditService.log("submission.revision.created", { userId: actor.id, targetTableName: "submission_revisions", targetRecordId: result.revision.id, details: { submissionId: submission.id, revisionNumber: nextRevision, checksumSha256 } }); return { submission: submissionDto(result.submission), revision: revisionDto(result.revision) };
    } catch (error) { await pdfStorageService.deletePdf(stored.uri).catch(() => undefined); if (isUniqueViolation(error)) throw AppError.conflict("Another revision was uploaded at the same time; retry the request"); throw error; }
  },

  async listRevisions(submissionInput: string, actorInput: string, actorRole: UserRole) { const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput); const access = await assertSubmissionAccess(submission, actor.id, actorRole); const rows = await getPrisma().submissionRevision.findMany({ where: { submissionId: submission.id }, orderBy: { revisionNumber: "desc" } }); return rows.map((row) => { const dto = revisionDto(row); if (access === "blind") { const { uploadedById: _uploadedById, uploadedBy: _uploadedBy, originalFileName: _originalFileName, ...safe } = dto; return safe; } return dto; }); },

  async resolveDownload(submissionInput: string, revisionInput: string, actorInput: string, actorRole: UserRole) { const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput); await assertSubmissionAccess(submission, actor.id, actorRole); const revision = await getPrisma().submissionRevision.findFirst({ where: { ...idWhere(revisionInput), submissionId: submission.id } }); if (!revision) throw AppError.notFound("Submission revision not found"); const signedUrl = await pdfStorageService.getSignedDownloadUrl(revision.storageUri); if (signedUrl) return { kind: "redirect" as const, url: signedUrl }; const localPath = pdfStorageService.resolveLocalPath(revision.storageUri); if (!localPath) throw AppError.notFound("Submission file is not available"); return { kind: "local" as const, path: localPath, filename: `submission-revision-${revision.revisionNumber}.pdf` }; },

  async assignReviewer(submissionInput: string, input: { reviewerId: string; dueAt?: Date; enforceInstitutionConflict?: boolean }, actorInput: string) {
    const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput); const reviewer = await resolveUser(input.reviewerId);
    const reviewerCapabilities = await capabilityService.list(reviewer.id);
    if (!reviewerCapabilities.includes("STRUCTURED_REVIEW")) throw AppError.badRequest("Reviewer must have the STRUCTURED_REVIEW capability");
    const prisma = getPrisma(); const [selfOrAuthor, declared, authorLinks] = await Promise.all([prisma.submissionAuthor.findUnique({ where: { submissionId_userId: { submissionId: submission.id, userId: reviewer.id } } }), prisma.submissionDeclaredConflict.findUnique({ where: { submissionId_userId: { submissionId: submission.id, userId: reviewer.id } } }), prisma.submissionAuthor.findMany({ where: { submissionId: submission.id }, select: { userId: true } })]);
    let sameInstitution = false; if (input.enforceInstitutionConflict !== false && reviewer.institution?.trim()) { const authors = await prisma.user.findMany({ where: { id: { in: authorLinks.map((row) => row.userId) } }, select: { institution: true } }); const value = reviewer.institution.trim().toLocaleLowerCase(); sameInstitution = authors.some((row) => row.institution?.trim().toLocaleLowerCase() === value); }
    if (selfOrAuthor || declared || sameInstitution) throw AppError.conflict("Reviewer assignment conflicts with the submission", { selfOrAuthor: Boolean(selfOrAuthor), declared: Boolean(declared), sameInstitution });
    try { const assignment = await prisma.$transaction(async (tx) => { const created = await tx.reviewerAssignment.create({ data: { submissionId: submission.id, reviewerId: reviewer.id, assignedById: actor.id, anonymousCode: `R-${crypto.randomBytes(12).toString("hex")}`, dueAt: input.dueAt, conflictChecks: { selfOrAuthor: false, declared: false, sameInstitution, checkedAt: new Date().toISOString() } } }); await tx.submission.updateMany({ where: { id: submission.id, status: "submitted" }, data: { status: "under_review" } }); return created; }); await auditService.log("submission.reviewer.assigned", { userId: actor.id, targetTableName: "reviewer_assignments", targetRecordId: assignment.id, details: { submissionId: submission.id, reviewerId: reviewer.id } }); return assignment; } catch (error) { if (isUniqueViolation(error)) throw AppError.conflict("This reviewer is already assigned to the submission"); throw error; }
  },

  async listAssignments(submissionInput: string) { const submission = await getSubmissionOrThrow(submissionInput); const prisma = getPrisma(); const rows = await prisma.reviewerAssignment.findMany({ where: { submissionId: submission.id }, orderBy: { createdAt: "desc" } }); const users = await prisma.user.findMany({ where: { id: { in: rows.map((row) => row.reviewerId) } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, institution: true, role: true } }); const map = new Map(users.map((user) => [user.id, { ...user, id: publicDatabaseId(user) }])); return rows.map((row) => ({ ...row, id: publicDatabaseId(row), reviewerId: map.get(row.reviewerId) })); },

  async listMyAssignments(reviewerInput: string) { const reviewer = await resolveUser(reviewerInput); const prisma = getPrisma(); const rows = await prisma.reviewerAssignment.findMany({ where: { reviewerId: reviewer.id, status: { not: "cancelled" } }, orderBy: { createdAt: "desc" } }); const submissions = await prisma.submission.findMany({ where: { id: { in: rows.map((row) => row.submissionId) } } }); const map = new Map(submissions.map((row) => [row.id, submissionDto(row)])); return rows.map((row) => ({ ...row, id: publicDatabaseId(row), submissionId: map.get(row.submissionId) })); },

  async updateAssignment(submissionInput: string, assignmentInput: string, input: { status: "accepted" | "declined" | "completed" | "cancelled"; decision?: "accept" | "minor_revision" | "major_revision" | "reject"; reviewText?: string }, actorInput: string, actorRole: UserRole) {
    const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput); const assignment = await getPrisma().reviewerAssignment.findFirst({ where: { ...idWhere(assignmentInput), submissionId: submission.id } }); if (!assignment) throw AppError.notFound("Reviewer assignment not found");
    const canAssign = hasPermission(actorRole, "review:assign"); if (assignment.reviewerId !== actor.id && !canAssign) throw AppError.forbidden(); if (input.status === "cancelled" && !canAssign) throw AppError.forbidden("Only review managers can cancel assignments"); if (input.status === "completed" && (!input.decision || !input.reviewText)) throw AppError.badRequest("A completed review requires a decision and review text"); if (["declined", "completed", "cancelled"].includes(assignment.status)) throw AppError.conflict("This assignment is already final");
    const updated = await getPrisma().$transaction(async (tx) => { const row = await tx.reviewerAssignment.update({ where: { id: assignment.id }, data: { status: input.status, decision: input.decision, reviewText: input.reviewText, completedAt: input.status === "completed" ? new Date() : undefined } }); if (input.status === "completed" && ["minor_revision", "major_revision"].includes(input.decision ?? "")) await tx.submission.updateMany({ where: { id: submission.id, status: { notIn: ["accepted", "rejected", "withdrawn"] } }, data: { status: "revision_requested" } }); return row; });
    await auditService.log("submission.review.updated", { userId: actor.id, targetTableName: "reviewer_assignments", targetRecordId: updated.id, details: { submissionId: submission.id, status: input.status, decision: input.decision } }); return updated;
  },

  async getReviewerView(submissionInput: string, actorInput: string, actorRole: UserRole) { const actor = await resolveUser(actorInput); const submission = await getSubmissionOrThrow(submissionInput); if (!hasPermission(actorRole, "review:assign") && !await getPrisma().reviewerAssignment.findFirst({ where: { submissionId: submission.id, reviewerId: actor.id, status: { notIn: ["declined", "cancelled"] } } })) throw AppError.forbidden("An active reviewer assignment is required"); const revisions = await getPrisma().submissionRevision.findMany({ where: { submissionId: submission.id }, orderBy: { revisionNumber: "desc" }, select: { id: true, legacyMongoId: true, revisionNumber: true, responseToReview: true, checksumSha256: true, sizeBytes: true, createdAt: true } }); return { id: publicDatabaseId(submission), title: submission.title, abstract: submission.abstractText, status: submission.status, currentRevisionNumber: submission.currentRevisionNumber, revisions: revisions.map((row) => ({ ...row, id: publicDatabaseId(row) })), doubleBlind: true }; },
};
