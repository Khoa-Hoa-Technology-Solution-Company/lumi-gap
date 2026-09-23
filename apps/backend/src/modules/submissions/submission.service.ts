import crypto from "node:crypto";
import type { UserRole } from "@trend/shared-types";
import mongoose from "mongoose";
import { AppError } from "../../common/exceptions/app-error.js";
import { hasPermission } from "../../common/authorization/permissions.js";
import { pdfStorageService } from "../../infrastructure/pdf-storage.service.js";
import { auditService } from "../audit/audit.service.js";
import { UserModel } from "../auth/models/user.model.js";
import { ProjectModel } from "../projects/models/project.model.js";
import { canAccessProject } from "../projects/project-scope.js";
import { ReviewerAssignmentModel, SubmissionModel, SubmissionRevisionModel } from "./submission.model.js";
import { AiPreReviewModel } from "./ai-pre-review.model.js";
import { aiReviewerClient } from "../papers/ai-reviewer.client.js";

type UploadedPdf = { buffer: Buffer; originalname: string; size: number };

type CreateSubmissionInput = {
  projectId: string;
  title: string;
  abstract?: string;
  submissionType?: "RESEARCH_PROPOSAL" | "LITERATURE_REVIEW" | "THESIS_DRAFT" | "RESEARCH_PAPER" | "SOFTWARE_RESEARCH_PROJECT";
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
};

function ids(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])];
}

async function getProjectForAccess(projectId: string, userId: string, role: UserRole) {
  const project = await ProjectModel.findById(projectId).select("ownerId members").lean();
  if (!project) throw AppError.notFound("Project not found");
  if (!canAccessProject(project, userId) && !hasPermission(role, "review:assign")) {
    throw AppError.forbidden("Project membership is required");
  }
  return project;
}

async function getSubmissionOrThrow(submissionId: string) {
  const submission = await SubmissionModel.findById(submissionId);
  if (!submission) throw AppError.notFound("Submission not found");
  return submission;
}

async function canAccessFullSubmission(submission: { projectId: mongoose.Types.ObjectId; authorIds: mongoose.Types.ObjectId[] }, userId: string, role: UserRole) {
  if (hasPermission(role, "review:assign") || submission.authorIds.some((id) => id.toString() === userId)) return true;
  const project = await ProjectModel.findById(submission.projectId).select("ownerId members").lean();
  return Boolean(project && canAccessProject(project, userId));
}

async function assertSubmissionAccess(submission: { _id: mongoose.Types.ObjectId; projectId: mongoose.Types.ObjectId; authorIds: mongoose.Types.ObjectId[] }, userId: string, role: UserRole) {
  if (await canAccessFullSubmission(submission, userId, role)) return "full" as const;
  const assignment = await ReviewerAssignmentModel.exists({
    submissionId: submission._id,
    reviewerId: userId,
    status: { $nin: ["declined", "cancelled"] },
  });
  if (assignment) return "blind" as const;
  throw AppError.forbidden("You do not have access to this submission");
}

async function persistRevision(
  submissionId: mongoose.Types.ObjectId,
  revisionNumber: number,
  file: UploadedPdf,
  uploadedBy: string,
  responseToReview?: string,
) {
  const checksumSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const stored = await pdfStorageService.savePdf(file.buffer, file.originalname);
  try {
    return await SubmissionRevisionModel.create({
      submissionId,
      revisionNumber,
      uploadedBy,
      responseToReview,
      storageUri: stored.uri,
      checksumSha256,
      sizeBytes: file.size,
      originalFileName: file.originalname,
    });
  } catch (error) {
    await pdfStorageService.deletePdf(stored.uri).catch(() => undefined);
    throw error;
  }
}

function duplicateKey(error: unknown): boolean {
  return (error as { code?: number }).code === 11000;
}

export const submissionService = {
  async create(input: CreateSubmissionInput, file: UploadedPdf, actorId: string, actorRole: UserRole) {
    await getProjectForAccess(input.projectId, actorId, actorRole);
    const authorIds = ids([actorId, ...(input.authorIds ?? [])]);
    const conflictIds = ids(input.declaredConflictUserIds).filter((id) => !authorIds.includes(id));
    const existingUsers = await UserModel.countDocuments({ _id: { $in: [...authorIds, ...conflictIds] }, isActive: true });
    if (existingUsers !== new Set([...authorIds, ...conflictIds]).size) {
      throw AppError.badRequest("One or more authors or declared conflicts are invalid");
    }

    const submission = await SubmissionModel.create({
      projectId: input.projectId,
      createdBy: actorId,
      authorIds,
      declaredConflictUserIds: conflictIds,
      title: input.title,
      abstract: input.abstract,
      submissionType: input.submissionType,
      researchField: input.researchField,
      researchGoal: input.researchGoal,
      researchQuestions: ids(input.researchQuestions),
      claimedResearchGap: input.claimedResearchGap,
      claimedContribution: input.claimedContribution,
      methodology: input.methodology,
      scope: input.scope,
      keywords: ids(input.keywords),
      expectedReviewWorkload: input.expectedReviewWorkload,
      currentRevisionNumber: 1,
    });

    try {
      const revision = await persistRevision(submission._id, 1, file, actorId);
      submission.currentRevisionId = revision._id;
      await submission.save();
      await auditService.log("submission.created", {
        userId: actorId,
        targetTableName: "submissions",
        targetRecordId: submission.id,
        details: { projectId: input.projectId, revisionNumber: 1, checksumSha256: revision.checksumSha256 },
      });
      return { submission, revision: revision.toObject({ useProjection: true }) };
    } catch (error) {
      await submission.deleteOne().catch(() => undefined);
      throw error;
    }
  },

  async listMine(actorId: string, actorRole: UserRole) {
    const filter = hasPermission(actorRole, "review:assign")
      ? {}
      : { $or: [{ createdBy: actorId }, { authorIds: actorId }] };
    return SubmissionModel.find(filter)
      .select("projectId title abstract submissionType researchField researchGoal researchQuestions claimedResearchGap claimedContribution methodology scope keywords expectedReviewWorkload status currentRevisionNumber currentRevisionId createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
  },

  async listAiPreReviews(submissionId: string, actorId: string, actorRole: UserRole) {
    const submission = await getSubmissionOrThrow(submissionId);
    await assertSubmissionAccess(submission, actorId, actorRole);
    return AiPreReviewModel.find({ submissionId })
      .select("provider model status summary goalAlignment rqCoverage unsupportedClaims citationIssues contributionComparison reviewFocusAreas limitations completedAt createdAt")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
  },

  async runAiPreReview(submissionId: string, actorId: string, actorRole: UserRole) {
    const submission = await getSubmissionOrThrow(submissionId);
    if (!(await canAccessFullSubmission(submission, actorId, actorRole))) throw AppError.forbidden();
    if (!submission.authorIds.some((id) => id.toString() === actorId) && !hasPermission(actorRole, "review:assign")) {
      throw AppError.forbidden("Only an author or review manager can request AI pre-review");
    }
    if (["completed", "accepted", "rejected", "withdrawn"].includes(submission.status)) {
      throw AppError.conflict("This submission no longer accepts pre-review analysis");
    }
    const active = await AiPreReviewModel.exists({ submissionId, status: { $in: ["QUEUED", "PROCESSING"] } });
    if (active) throw AppError.conflict("An AI pre-review is already running");
    const previousStatus = submission.status;
    const record = await AiPreReviewModel.create({ submissionId, requestedBy: actorId, status: "PROCESSING" });
    await SubmissionModel.updateOne({ _id: submissionId }, { $set: { status: "ai_pre_review" } });
    try {
      const result = await aiReviewerClient.preReview({
        title: submission.title,
        abstract: submission.abstract ?? undefined,
        submission_type: submission.submissionType ?? undefined,
        research_goal: submission.researchGoal ?? undefined,
        research_questions: submission.researchQuestions,
        claimed_gap: submission.claimedResearchGap ?? undefined,
        claimed_contribution: submission.claimedContribution ?? undefined,
        methodology: submission.methodology ?? undefined,
        // Evidence is resolved by LumiGap, never accepted as arbitrary IDs from this API caller.
        related_evidence: [],
      });
      const analysis = result.analysis;
      Object.assign(record, {
        provider: result.provider,
        model: result.model,
        status: "COMPLETED",
        summary: analysis.summary,
        goalAlignment: analysis.goal_alignment,
        rqCoverage: analysis.rq_coverage,
        unsupportedClaims: analysis.unsupported_claims,
        citationIssues: analysis.citation_issues,
        contributionComparison: analysis.contribution_comparison,
        reviewFocusAreas: analysis.review_focus_areas,
        limitations: analysis.limitations,
        rawStructuredOutput: analysis,
        completedAt: new Date(),
      });
      await record.save();
      await SubmissionModel.updateOne({ _id: submissionId, status: "ai_pre_review" }, { $set: { status: "ready_for_review" } });
      await auditService.log("submission.ai_pre_review.completed", { userId: actorId, targetTableName: "ai_pre_reviews", targetRecordId: record.id, details: { submissionId, provider: result.provider, model: result.model } });
      return record.toObject({ useProjection: true });
    } catch (error) {
      record.status = "FAILED";
      record.errorMessage = error instanceof Error ? error.message.slice(0, 1000) : "AI pre-review failed";
      await record.save();
      await SubmissionModel.updateOne({ _id: submissionId, status: "ai_pre_review" }, { $set: { status: previousStatus } });
      throw error;
    }
  },

  async get(submissionId: string, actorId: string, actorRole: UserRole) {
    const submission = await getSubmissionOrThrow(submissionId);
    const access = await assertSubmissionAccess(submission, actorId, actorRole);
    if (access === "blind") return this.getReviewerView(submissionId, actorId, actorRole);
    return SubmissionModel.findById(submissionId)
      .populate("authorIds", "fullName email institution avatarUrl")
      .populate("createdBy", "fullName email")
      .lean();
  },

  async addRevision(submissionId: string, responseToReview: string | undefined, file: UploadedPdf, actorId: string, actorRole: UserRole) {
    const submission = await getSubmissionOrThrow(submissionId);
    if (!(await canAccessFullSubmission(submission, actorId, actorRole))) throw AppError.forbidden();
    if (["completed", "accepted", "rejected", "withdrawn"].includes(submission.status)) {
      throw AppError.conflict("This submission no longer accepts revisions");
    }

    const nextRevision = submission.currentRevisionNumber + 1;
    let revision;
    try {
      revision = await persistRevision(submission._id, nextRevision, file, actorId, responseToReview);
    } catch (error) {
      if (duplicateKey(error)) throw AppError.conflict("Another revision was uploaded at the same time; retry the request");
      throw error;
    }

    const updated = await SubmissionModel.findOneAndUpdate(
      { _id: submission._id, currentRevisionNumber: submission.currentRevisionNumber },
      { $set: { currentRevisionId: revision._id, status: "revised" }, $inc: { currentRevisionNumber: 1 } },
      { new: true },
    );
    if (!updated) {
      await SubmissionRevisionModel.deleteOne({ _id: revision._id });
      await pdfStorageService.deletePdf(revision.storageUri).catch(() => undefined);
      throw AppError.conflict("Another revision was uploaded at the same time; retry the request");
    }
    await auditService.log("submission.revision.created", {
      userId: actorId,
      targetTableName: "submission_revisions",
      targetRecordId: revision.id,
      details: { submissionId, revisionNumber: nextRevision, checksumSha256: revision.checksumSha256 },
    });
    return { submission: updated, revision: revision.toObject({ useProjection: true }) };
  },

  async listRevisions(submissionId: string, actorId: string, actorRole: UserRole) {
    const submission = await getSubmissionOrThrow(submissionId);
    const access = await assertSubmissionAccess(submission, actorId, actorRole);
    return SubmissionRevisionModel.find({ submissionId })
      .select(access === "blind"
        ? "submissionId revisionNumber responseToReview checksumSha256 sizeBytes createdAt"
        : "submissionId revisionNumber uploadedBy responseToReview checksumSha256 sizeBytes createdAt")
      .sort({ revisionNumber: -1 })
      .lean();
  },

  async resolveDownload(submissionId: string, revisionId: string, actorId: string, actorRole: UserRole) {
    const submission = await getSubmissionOrThrow(submissionId);
    await assertSubmissionAccess(submission, actorId, actorRole);
    const revision = await SubmissionRevisionModel.findOne({ _id: revisionId, submissionId }).select("+originalFileName");
    if (!revision) throw AppError.notFound("Submission revision not found");
    const signedUrl = await pdfStorageService.getSignedDownloadUrl(revision.storageUri);
    if (signedUrl) return { kind: "redirect" as const, url: signedUrl };
    const localPath = pdfStorageService.resolveLocalPath(revision.storageUri);
    if (!localPath) throw AppError.notFound("Submission file is not available");
    return { kind: "local" as const, path: localPath, filename: `submission-revision-${revision.revisionNumber}.pdf` };
  },

  async assignReviewer(
    submissionId: string,
    input: { reviewerId: string; dueAt?: Date; enforceInstitutionConflict?: boolean },
    actorId: string,
  ) {
    const submission = await getSubmissionOrThrow(submissionId);
    const reviewer = await UserModel.findOne({ _id: input.reviewerId, isActive: true }).select("role institution").lean();
    if (!reviewer || !["reviewer", "moderator", "admin"].includes(reviewer.role)) {
      throw AppError.badRequest("Reviewer must be an active user with a review-capable role");
    }
    const selfOrAuthor = submission.authorIds.some((id) => id.toString() === input.reviewerId);
    const declared = submission.declaredConflictUserIds.some((id) => id.toString() === input.reviewerId);
    let sameInstitution = false;
    if (input.enforceInstitutionConflict !== false && reviewer.institution?.trim()) {
      const normalized = reviewer.institution.trim().toLocaleLowerCase();
      const authorInstitutions = await UserModel.distinct("institution", { _id: { $in: submission.authorIds } });
      sameInstitution = authorInstitutions.some((value) => value?.trim().toLocaleLowerCase() === normalized);
    }
    if (selfOrAuthor || declared || sameInstitution) {
      throw AppError.conflict("Reviewer assignment conflicts with the submission", {
        selfOrAuthor,
        declared,
        sameInstitution,
      });
    }

    try {
      const assignment = await ReviewerAssignmentModel.create({
        submissionId,
        reviewerId: input.reviewerId,
        assignedBy: actorId,
        anonymousCode: `R-${crypto.randomBytes(12).toString("hex")}`,
        dueAt: input.dueAt,
        conflictChecks: { selfOrAuthor, declared, sameInstitution, checkedAt: new Date() },
      });
      await SubmissionModel.updateOne({ _id: submissionId, status: "submitted" }, { $set: { status: "under_review" } });
      await auditService.log("submission.reviewer.assigned", {
        userId: actorId,
        targetTableName: "reviewer_assignments",
        targetRecordId: assignment.id,
        details: { submissionId, reviewerId: input.reviewerId },
      });
      return assignment.toObject({ useProjection: true });
    } catch (error) {
      if (duplicateKey(error)) throw AppError.conflict("This reviewer is already assigned to the submission");
      throw error;
    }
  },

  async listAssignments(submissionId: string) {
    await getSubmissionOrThrow(submissionId);
    return ReviewerAssignmentModel.find({ submissionId })
      .populate("reviewerId", "fullName email institution role")
      .sort({ createdAt: -1 })
      .lean();
  },

  async listMyAssignments(reviewerId: string) {
    return ReviewerAssignmentModel.find({ reviewerId, status: { $nin: ["cancelled"] } })
      .select("submissionId status decision dueAt completedAt createdAt updatedAt")
      .populate("submissionId", "title abstract status currentRevisionNumber updatedAt")
      .sort({ createdAt: -1 })
      .lean();
  },

  async updateAssignment(
    submissionId: string,
    assignmentId: string,
    input: { status: "accepted" | "declined" | "completed" | "cancelled"; decision?: "accept" | "minor_revision" | "major_revision" | "reject"; reviewText?: string },
    actorId: string,
    actorRole: UserRole,
  ) {
    const assignment = await ReviewerAssignmentModel.findOne({ _id: assignmentId, submissionId });
    if (!assignment) throw AppError.notFound("Reviewer assignment not found");
    const isReviewer = assignment.reviewerId.toString() === actorId;
    const canAssign = hasPermission(actorRole, "review:assign");
    if (!isReviewer && !canAssign) throw AppError.forbidden();
    if (input.status === "cancelled" && !canAssign) throw AppError.forbidden("Only review managers can cancel assignments");
    if (input.status === "completed" && (!input.decision || !input.reviewText)) {
      throw AppError.badRequest("A completed review requires a decision and review text");
    }
    if (["declined", "completed", "cancelled"].includes(assignment.status)) throw AppError.conflict("This assignment is already final");

    assignment.status = input.status;
    if (input.decision !== undefined) assignment.decision = input.decision;
    if (input.reviewText !== undefined) assignment.reviewText = input.reviewText;
    if (input.status === "completed") assignment.completedAt = new Date();
    await assignment.save();
    if (input.status === "completed" && ["minor_revision", "major_revision"].includes(input.decision ?? "")) {
      await SubmissionModel.updateOne(
        { _id: submissionId, status: { $nin: ["accepted", "rejected", "withdrawn"] } },
        { $set: { status: "revision_requested" } },
      );
    }
    await auditService.log("submission.review.updated", {
      userId: actorId,
      targetTableName: "reviewer_assignments",
      targetRecordId: assignment.id,
      details: { submissionId, status: input.status, decision: input.decision },
    });
    return assignment.toObject({ useProjection: true });
  },

  async getReviewerView(submissionId: string, actorId: string, actorRole: UserRole) {
    const submission = await getSubmissionOrThrow(submissionId);
    if (!hasPermission(actorRole, "review:assign")) {
      const assigned = await ReviewerAssignmentModel.exists({
        submissionId,
        reviewerId: actorId,
        status: { $nin: ["declined", "cancelled"] },
      });
      if (!assigned) throw AppError.forbidden("An active reviewer assignment is required");
    }
    const revisions = await SubmissionRevisionModel.find({ submissionId })
      .select("_id revisionNumber responseToReview checksumSha256 sizeBytes createdAt")
      .sort({ revisionNumber: -1 })
      .lean();
    return {
      id: submission.id,
      title: submission.title,
      abstract: submission.abstract,
      status: submission.status,
      currentRevisionNumber: submission.currentRevisionNumber,
      revisions,
      doubleBlind: true,
    };
  },
};
