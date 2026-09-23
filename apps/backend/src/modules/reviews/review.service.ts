import crypto from "node:crypto";
import type { AcademicProfileType, HumanReviewInput, ReviewAvailabilitySettings, SubmissionType } from "@trend/shared-types";
import mongoose from "mongoose";
import { AppError } from "../../common/exceptions/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { AcademicProfileModel } from "../academic-profiles/academic-profile.model.js";
import { UserModel } from "../auth/models/user.model.js";
import { ProjectModel } from "../projects/models/project.model.js";
import { ReviewerAssignmentModel, SubmissionModel } from "../submissions/submission.model.js";
import { defaultReviewCriteria } from "./review.constants.js";
import {
  ContributionModel,
  HumanReviewModel,
  ReviewConflictModel,
  ReviewResponseModel,
} from "./review.model.js";
import { basicConflictReason, canUseReviewerWorkspace, reviewCapacityIssue } from "./review.rules.js";

type AvailabilityInput = Omit<ReviewAvailabilitySettings, "activeReviewCount">;
type OpportunityFilters = {
  researchField?: string;
  topic?: string;
  submissionType?: SubmissionType;
  methodology?: string;
  dateFrom?: Date;
  sort?: "relevance" | "newest";
};

const legacyAcademicType = (role: string): AcademicProfileType | undefined =>
  role === "student" || role === "researcher" || role === "lecturer" ? role : undefined;

const normalized = (value: string) => value.trim().toLocaleLowerCase();
const normalizedSet = (values: string[]) => new Set(values.map(normalized));
const duplicateKey = (error: unknown) => (error as { code?: number }).code === 11000;

function mapReviewTypes(types: string[]): SubmissionType[] {
  const allowed = new Set<SubmissionType>([
    "RESEARCH_PROPOSAL", "LITERATURE_REVIEW", "THESIS_DRAFT", "RESEARCH_PAPER", "SOFTWARE_RESEARCH_PROJECT",
  ]);
  return types.filter((value): value is SubmissionType => allowed.has(value as SubmissionType));
}

async function reviewerContext(userId: string) {
  const [user, profile, activeReviewCount] = await Promise.all([
    UserModel.findById(userId).select("role academicProfileType researchInterests institution isActive").lean(),
    AcademicProfileModel.findOne({ userId }).select("expertiseAreas reviewAvailability").lean(),
    ReviewerAssignmentModel.countDocuments({ reviewerId: userId, status: "accepted" }),
  ]);
  if (!user || user.isActive === false) throw AppError.unauthorized();
  const academicType = user.academicProfileType ?? legacyAcademicType(user.role);
  if (!canUseReviewerWorkspace(academicType)) {
    throw AppError.forbidden("Only lecturers and researchers can participate in peer review");
  }
  const availability = profile?.reviewAvailability;
  return { user, profile, availability, activeReviewCount };
}

function availabilityDto(context: Awaited<ReturnType<typeof reviewerContext>>): ReviewAvailabilitySettings {
  const value = context.availability;
  return {
    availableForReview: value?.enabled === true,
    acceptedFields: value?.acceptedFields ?? context.profile?.expertiseAreas ?? [],
    acceptedTopics: value?.preferredTopics ?? [],
    acceptedSubmissionTypes: mapReviewTypes(value?.types ?? []),
    maximumActiveReviews: value?.maximumActiveReviews ?? 3,
    preferredReviewWorkload: value?.preferredReviewWorkload ?? undefined,
    availabilityNote: value?.note ?? undefined,
    temporarilyUnavailableUntil: value?.temporarilyUnavailableUntil?.toISOString(),
    autoRecommendationEnabled: value?.autoRecommendationEnabled !== false,
    activeReviewCount: context.activeReviewCount,
  };
}

function assertAvailable(settings: ReviewAvailabilitySettings) {
  const issue = reviewCapacityIssue(settings);
  if (issue) throw AppError.conflict(issue);
}

async function detectConflict(submission: mongoose.HydratedDocument<Record<string, unknown>>, reviewerId: string) {
  const authorIds = (submission.get("authorIds") as mongoose.Types.ObjectId[]).map(String);
  const declared = (submission.get("declaredConflictUserIds") as mongoose.Types.ObjectId[]).map(String);
  const immediate = basicConflictReason({ reviewerId, authorIds, declaredConflictUserIds: declared, isProjectContributor: false });
  if (immediate) return immediate;
  const existing = await ReviewConflictModel.findOne({ submissionId: submission._id, reviewerId, status: { $in: ["DECLARED", "SYSTEM_DETECTED", "BLOCKED"] } }).lean();
  if (existing) return existing.reason || "A conflict of interest blocks this review";
  const project = await ProjectModel.findById(submission.get("projectId")).select("ownerId members").lean();
  const isProjectContributor = Boolean(project && (String(project.ownerId) === reviewerId || project.members.some((member) => String(member.targetId) === reviewerId)));
  if (isProjectContributor) {
    await ReviewConflictModel.findOneAndUpdate(
      { submissionId: submission._id, reviewerId },
      { $set: { status: "SYSTEM_DETECTED", reason: "Reviewer is a contributor to the related project", detectedBy: "SYSTEM" } },
      { upsert: true },
    );
    return basicConflictReason({ reviewerId, authorIds, declaredConflictUserIds: declared, isProjectContributor });
  }
  return undefined;
}

export const reviewService = {
  async getAvailability(userId: string) {
    return availabilityDto(await reviewerContext(userId));
  },

  async listMyReviews(userId: string) {
    await reviewerContext(userId);
    const assignments = await ReviewerAssignmentModel.find({ reviewerId: userId, status: { $ne: "cancelled" } })
      .select("submissionId status decision dueAt completedAt createdAt updatedAt")
      .populate("submissionId", "title abstract submissionType researchField status currentRevisionNumber expectedReviewWorkload updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
    const reviewByAssignment = new Map((await HumanReviewModel.find({ assignmentId: { $in: assignments.map((item) => item._id) } })
      .select("assignmentId status submittedAt updatedAt")
      .lean()).map((review) => [String(review.assignmentId), review]));
    return assignments.map((assignment) => ({ ...assignment, review: reviewByAssignment.get(String(assignment._id)) }));
  },

  async updateAvailability(userId: string, input: AvailabilityInput) {
    await reviewerContext(userId);
    const profile = await AcademicProfileModel.findOneAndUpdate(
      { userId },
      { $set: {
        reviewAvailability: {
          enabled: input.availableForReview,
          acceptedFields: input.acceptedFields,
          preferredTopics: input.acceptedTopics,
          types: input.acceptedSubmissionTypes,
          maximumActiveReviews: input.maximumActiveReviews,
          preferredReviewWorkload: input.preferredReviewWorkload,
          note: input.availabilityNote,
          temporarilyUnavailableUntil: input.temporarilyUnavailableUntil ? new Date(input.temporarilyUnavailableUntil) : undefined,
          autoRecommendationEnabled: input.autoRecommendationEnabled,
          updatedAt: new Date(),
        },
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await auditService.log("review.availability.updated", {
      userId,
      targetTableName: "academic_profiles",
      targetRecordId: profile.id,
      details: { availableForReview: input.availableForReview, maximumActiveReviews: input.maximumActiveReviews },
    });
    return availabilityDto(await reviewerContext(userId));
  },

  async listOpportunities(userId: string, filters: OpportunityFilters) {
    const context = await reviewerContext(userId);
    const settings = availabilityDto(context);
    if (!settings.availableForReview) return { availability: settings, opportunities: [] };

    const query: Record<string, unknown> = {
      status: { $in: ["submitted", "ready_for_review", "revised"] },
      authorIds: { $ne: new mongoose.Types.ObjectId(userId) },
      declaredConflictUserIds: { $ne: new mongoose.Types.ObjectId(userId) },
    };
    if (filters.researchField) query.researchField = new RegExp(filters.researchField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (filters.topic) query.keywords = { $in: [new RegExp(filters.topic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")] };
    if (filters.submissionType) query.submissionType = filters.submissionType;
    if (filters.methodology) query.methodology = new RegExp(filters.methodology.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (filters.dateFrom) query.createdAt = { $gte: filters.dateFrom };
    if (settings.acceptedSubmissionTypes.length) query.submissionType = query.submissionType ?? { $in: settings.acceptedSubmissionTypes };

    const [submissions, assignments, conflicts, contributedProjects] = await Promise.all([
      SubmissionModel.find(query).sort({ createdAt: -1 }).limit(200),
      ReviewerAssignmentModel.find({ reviewerId: userId }).distinct("submissionId"),
      ReviewConflictModel.find({ reviewerId: userId, status: { $in: ["DECLARED", "SYSTEM_DETECTED", "BLOCKED"] } }).distinct("submissionId"),
      ProjectModel.find({ $or: [{ ownerId: userId }, { members: { $elemMatch: { targetId: userId } } }] }).distinct("_id"),
    ]);
    const blockedSubmissionIds = new Set([...assignments, ...conflicts].map(String));
    const blockedProjectIds = new Set(contributedProjects.map(String));
    const fields = normalizedSet(settings.acceptedFields);
    const topics = normalizedSet(settings.acceptedTopics);
    const expertise = normalizedSet(context.profile?.expertiseAreas ?? []);
    const interests = normalizedSet(context.user.researchInterests ?? []);

    const opportunities = submissions
      .filter((submission) => !blockedSubmissionIds.has(submission.id) && !blockedProjectIds.has(String(submission.projectId)))
      .map((submission) => {
        const reasons: string[] = [];
        let score = 0;
        if (submission.researchField && (fields.has(normalized(submission.researchField)) || expertise.has(normalized(submission.researchField)))) {
          score += 45; reasons.push("Research field matches your expertise");
        }
        const matchingKeywords = submission.keywords.filter((keyword) => topics.has(normalized(keyword)) || interests.has(normalized(keyword)) || expertise.has(normalized(keyword)));
        if (matchingKeywords.length) { score += Math.min(40, matchingKeywords.length * 10); reasons.push(`Topic match: ${matchingKeywords.slice(0, 3).join(", ")}`); }
        if (settings.acceptedSubmissionTypes.includes(submission.submissionType as SubmissionType)) {
          score += 15; reasons.push("Accepted submission type");
        }
        return {
          id: submission.id,
          title: submission.title,
          abstract: submission.abstract,
          submissionType: submission.submissionType,
          researchField: submission.researchField,
          researchGoal: submission.researchGoal,
          claimedResearchGap: submission.claimedResearchGap,
          methodology: submission.methodology,
          keywords: submission.keywords,
          status: submission.status.toUpperCase(),
          currentRevisionNumber: submission.currentRevisionNumber,
          expectedWorkload: submission.expectedReviewWorkload,
          matchReasons: reasons,
          matchScore: score,
          submittedAt: submission.createdAt,
          authorVisibility: "DOUBLE_BLIND" as const,
        };
      });
    opportunities.sort(filters.sort === "newest"
      ? (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime()
      : (a, b) => b.matchScore - a.matchScore || b.submittedAt.getTime() - a.submittedAt.getTime());
    return { availability: settings, opportunities };
  },

  async acceptOpportunity(submissionId: string, reviewerId: string) {
    const settings = availabilityDto(await reviewerContext(reviewerId));
    assertAvailable(settings);
    const submission = await SubmissionModel.findById(submissionId);
    if (!submission) throw AppError.notFound("Submission not found");
    if (!["submitted", "ready_for_review", "revised"].includes(submission.status)) {
      throw AppError.conflict("This submission is not accepting reviewers");
    }
    const conflict = await detectConflict(submission as never, reviewerId);
    if (conflict) throw AppError.conflict(conflict);
    try {
      const assignment = await ReviewerAssignmentModel.create({
        submissionId,
        reviewerId,
        assignedBy: reviewerId,
        anonymousCode: `R-${crypto.randomBytes(12).toString("hex")}`,
        status: "accepted",
        conflictChecks: { selfOrAuthor: false, declared: false, sameInstitution: false, checkedAt: new Date() },
      });
      await SubmissionModel.updateOne({ _id: submissionId, status: { $in: ["submitted", "ready_for_review", "revised"] } }, { $set: { status: "under_review" } });
      await auditService.log("review.opportunity.accepted", { userId: reviewerId, targetTableName: "reviewer_assignments", targetRecordId: assignment.id, details: { submissionId } });
      return assignment.toObject({ useProjection: true });
    } catch (error) {
      if (duplicateKey(error)) throw AppError.conflict("You already have an assignment for this submission");
      throw error;
    }
  },

  async declareConflict(submissionId: string, reviewerId: string, reason: string) {
    await reviewerContext(reviewerId);
    if (!await SubmissionModel.exists({ _id: submissionId })) throw AppError.notFound("Submission not found");
    const conflict = await ReviewConflictModel.findOneAndUpdate(
      { submissionId, reviewerId },
      { $set: { status: "DECLARED", reason, detectedBy: "REVIEWER" } },
      { upsert: true, new: true },
    );
    await auditService.log("review.conflict.declared", { userId: reviewerId, targetTableName: "review_conflicts", targetRecordId: conflict.id, details: { submissionId } });
    return conflict;
  },

  async saveReview(assignmentId: string, reviewerId: string, input: HumanReviewInput, submit: boolean) {
    const assignment = await ReviewerAssignmentModel.findOne({ _id: assignmentId, reviewerId });
    if (!assignment) throw AppError.notFound("Review assignment not found");
    if (assignment.status !== "accepted") throw AppError.conflict("Only accepted assignments can be reviewed");
    const submission = await SubmissionModel.findById(assignment.submissionId).select("currentRevisionId projectId title").lean();
    if (!submission?.currentRevisionId) throw AppError.conflict("Submission has no reviewable revision");
    const keys = new Set(input.responses.map((response) => response.criterionKey));
    const allowedKeys = new Set(defaultReviewCriteria.map(([key]) => key));
    if (input.responses.some((response) => !allowedKeys.has(response.criterionKey as never))) {
      throw AppError.badRequest("Review contains an unknown rubric criterion");
    }
    if (submit) {
      const missing = defaultReviewCriteria.filter(([key]) => !keys.has(key)).map(([, label]) => label);
      if (missing.length) throw AppError.badRequest("Complete every review criterion before submitting", { missing });
    }
    let review = await HumanReviewModel.findOne({ assignmentId });
    if (review?.status === "SUBMITTED") throw AppError.conflict("A completed review is immutable");
    review ??= new HumanReviewModel({ assignmentId, reviewerId, submissionId: assignment.submissionId, revisionId: submission.currentRevisionId });
    review.overallComment = input.overallComment;
    review.recommendation = input.recommendation;
    if (submit) { review.status = "SUBMITTED"; review.submittedAt = new Date(); }
    await review.save();
    const persistableResponses = input.responses.filter((response) => response.comment.trim().length > 0);
    await Promise.all(persistableResponses.map((response) => ReviewResponseModel.findOneAndUpdate(
      { reviewId: review!._id, criterionKey: response.criterionKey },
      { $set: response },
      { upsert: true, new: true, runValidators: true },
    )));
    await ReviewResponseModel.deleteMany({
      reviewId: review._id,
      criterionKey: { $nin: persistableResponses.map((response) => response.criterionKey) },
    });
    if (submit) {
      assignment.status = "completed";
      assignment.decision = input.recommendation.toLowerCase() as typeof assignment.decision;
      assignment.reviewText = input.overallComment;
      assignment.completedAt = new Date();
      await assignment.save();
      const nextStatus = input.recommendation === "ACCEPT" ? "completed"
        : input.recommendation === "REJECT" ? "rejected" : "revision_requested";
      await SubmissionModel.updateOne({ _id: assignment.submissionId }, { $set: { status: nextStatus } });
      await ContributionModel.updateOne(
        { sourceReviewAssignmentId: assignment._id },
        { $setOnInsert: {
          contributorId: reviewerId,
          projectId: submission.projectId,
          submissionId: assignment.submissionId,
          contributionType: "REVIEW",
          description: `Peer review of “${submission.title}”`,
          evidence: `Completed review assignment ${assignment.id}`,
          provenance: "LUMIGAP_REVIEW",
          verificationStatus: "VERIFIED_BY_LUMIGAP",
          visibility: "PUBLIC",
          verifiedBy: reviewerId,
          verifiedAt: new Date(),
        } },
        { upsert: true },
      );
      await auditService.log("review.submitted", { userId: reviewerId, targetTableName: "human_reviews", targetRecordId: review.id, details: { assignmentId, submissionId: String(assignment.submissionId) } });
    }
    return { review: review.toObject(), responses: await ReviewResponseModel.find({ reviewId: review._id }).sort({ createdAt: 1 }).lean() };
  },

  async getReview(assignmentId: string, reviewerId: string) {
    const assignment = await ReviewerAssignmentModel.findOne({ _id: assignmentId, reviewerId }).lean();
    if (!assignment) throw AppError.notFound("Review assignment not found");
    const review = await HumanReviewModel.findOne({ assignmentId }).lean();
    return {
      assignment,
      review,
      responses: review ? await ReviewResponseModel.find({ reviewId: review._id }).lean() : [],
      criteria: defaultReviewCriteria.map(([key, label, description], order) => ({ key, label, description, order })),
    };
  },

  async listContributions(userId: string, viewerId?: string) {
    const visibility = userId === viewerId ? {} : { visibility: "PUBLIC" };
    return ContributionModel.find({ contributorId: userId, ...visibility })
      .populate("submissionId", "title")
      .populate("projectId", "title")
      .sort({ verifiedAt: -1, createdAt: -1 })
      .lean();
  },
};
