import crypto from "node:crypto";
import type { AcademicReviewInput, ReviewAvailabilitySettings, SubmissionType } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { auditService } from "../audit/audit.service.js";
import { capabilityService } from "../authorization/capability.service.js";
import { participantScopeForUser } from "../identity/participant-scope.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { defaultReviewCriteria } from "./review.constants.js";
import { basicConflictReason, reviewCapacityIssue } from "./review.rules.js";
import { hydrateReviewTemplateVersion } from "./review-template.service.js";
import { canUseOpenReviewOpportunities, reviewOutcome, weightedRubricScore } from "./academic-review.rules.js";

type AvailabilityInput = Omit<ReviewAvailabilitySettings, "activeReviewCount">;
type OpportunityFilters = { researchField?: string; topic?: string; submissionType?: SubmissionType; methodology?: string; dateFrom?: Date; sort?: "relevance" | "newest" };
type AvailabilityRecord = { enabled?: boolean; acceptedFields?: string[]; preferredTopics?: string[]; types?: string[]; maximumActiveReviews?: number; preferredReviewWorkload?: string; note?: string; temporarilyUnavailableUntil?: string | Date; autoRecommendationEnabled?: boolean };

const normalized = (value: string) => value.trim().toLocaleLowerCase();
const normalizedSet = (values: string[]) => new Set(values.map(normalized));
const isUniqueViolation = (error: unknown) => (error as { code?: string }).code === "P2002";

function idWhere(value: string): { id?: string; legacyMongoId?: string } {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid database identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

function jsonRecord(value: unknown): AvailabilityRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AvailabilityRecord : {};
}

function mapReviewTypes(types: string[]): SubmissionType[] {
  const allowed = new Set<SubmissionType>(["RESEARCH_PROPOSAL", "LITERATURE_REVIEW", "THESIS_DRAFT", "RESEARCH_PAPER", "SOFTWARE_RESEARCH_PROJECT"]);
  return types.filter((value): value is SubmissionType => allowed.has(value as SubmissionType));
}

async function resolveUser(input: string) {
  const user = await getPrisma().user.findFirst({ where: idWhere(input) });
  if (!user || !user.isActive) throw AppError.unauthorized();
  return user;
}

async function reviewerContext(userInput: string) {
  const user = await resolveUser(userInput);
  const [profile, activeReviewCount, capabilities] = await Promise.all([
    getPrisma().academicProfile.findUnique({ where: { userId: user.id } }),
    getPrisma().reviewerAssignment.count({ where: { reviewerId: user.id, status: "accepted" } }),
    capabilityService.list(user.id),
  ]);
  if (!capabilities.includes("STRUCTURED_REVIEW")) {
    throw AppError.forbidden("Verified academic identity and STRUCTURED_REVIEW capability are required");
  }
  return { user, profile, availability: jsonRecord(profile?.reviewAvailability), activeReviewCount };
}

function availabilityDto(context: Awaited<ReturnType<typeof reviewerContext>>): ReviewAvailabilitySettings {
  const value = context.availability;
  const unavailableUntil = value.temporarilyUnavailableUntil ? new Date(value.temporarilyUnavailableUntil) : undefined;
  return {
    availableForReview: value.enabled === true,
    acceptedFields: value.acceptedFields ?? context.profile?.expertiseAreas ?? [],
    acceptedTopics: value.preferredTopics ?? [],
    acceptedSubmissionTypes: mapReviewTypes(value.types ?? []),
    maximumActiveReviews: value.maximumActiveReviews ?? 3,
    preferredReviewWorkload: value.preferredReviewWorkload,
    availabilityNote: value.note,
    temporarilyUnavailableUntil: unavailableUntil && !Number.isNaN(unavailableUntil.getTime()) ? unavailableUntil.toISOString() : undefined,
    autoRecommendationEnabled: value.autoRecommendationEnabled !== false,
    activeReviewCount: context.activeReviewCount,
  };
}

function assertAvailable(settings: ReviewAvailabilitySettings) { const issue = reviewCapacityIssue(settings); if (issue) throw AppError.conflict(issue); }

async function resolveSubmission(input: string) {
  const submission = await getPrisma().submission.findFirst({ where: idWhere(input) });
  if (!submission) throw AppError.notFound("Submission not found");
  return submission;
}

async function detectConflict(submissionId: string, projectId: string, reviewerId: string) {
  const prisma = getPrisma();
  const [authors, declared, existing, project, membership] = await Promise.all([
    prisma.submissionAuthor.findMany({ where: { submissionId }, select: { userId: true } }),
    prisma.submissionDeclaredConflict.findMany({ where: { submissionId }, select: { userId: true } }),
    prisma.reviewConflict.findUnique({ where: { submissionId_reviewerId: { submissionId, reviewerId } } }),
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.projectMember.findFirst({ where: { projectId, userId: reviewerId, status: "ACTIVE" } }),
  ]);
  const immediate = basicConflictReason({ reviewerId, authorIds: authors.map((row) => row.userId), declaredConflictUserIds: declared.map((row) => row.userId), isProjectContributor: false });
  if (immediate) return immediate;
  if (existing && ["DECLARED", "SYSTEM_DETECTED", "BLOCKED"].includes(existing.status)) return existing.reason || "A conflict of interest blocks this review";
  const isProjectContributor = project?.ownerId === reviewerId || Boolean(membership);
  if (isProjectContributor) {
    await prisma.reviewConflict.upsert({ where: { submissionId_reviewerId: { submissionId, reviewerId } }, create: { submissionId, reviewerId, status: "SYSTEM_DETECTED", reason: "Reviewer is a contributor to the related project", detectedBy: "SYSTEM" }, update: { status: "SYSTEM_DETECTED", reason: "Reviewer is a contributor to the related project", detectedBy: "SYSTEM" } });
    return basicConflictReason({ reviewerId, authorIds: authors.map((row) => row.userId), declaredConflictUserIds: declared.map((row) => row.userId), isProjectContributor });
  }
  return undefined;
}

export const reviewService = {
  async getAvailability(userId: string) { return availabilityDto(await reviewerContext(userId)); },

  async listMyReviews(userIdInput: string) {
    const user = await resolveUser(userIdInput);
    const prisma = getPrisma();
    const assignments = await prisma.reviewerAssignment.findMany({ where: { reviewerId: user.id, status: { not: "cancelled" } }, orderBy: { updatedAt: "desc" } });
    const submissionIds = assignments.map((row) => row.submissionId);
    const [submissions, reviews] = await Promise.all([
      prisma.submission.findMany({ where: { id: { in: submissionIds } } }),
      prisma.humanReview.findMany({ where: { assignmentId: { in: assignments.map((row) => row.id) } }, orderBy: { roundNumber: "desc" } }),
    ]);
    const submissionMap = new Map(submissions.map((row) => [row.id, row]));
    const reviewMap = new Map<string, (typeof reviews)[number]>();
    for (const review of reviews) if (!reviewMap.has(review.assignmentId)) reviewMap.set(review.assignmentId, review);
    return assignments.map((assignment) => ({ ...assignment, id: publicDatabaseId(assignment), submissionId: submissionMap.get(assignment.submissionId) ? submissionDto(submissionMap.get(assignment.submissionId)!) : assignment.submissionId, review: reviewMap.get(assignment.id) }));
  },

  async updateAvailability(userIdInput: string, input: AvailabilityInput) {
    const context = await reviewerContext(userIdInput);
    const reviewAvailability = { enabled: input.availableForReview, acceptedFields: input.acceptedFields, preferredTopics: input.acceptedTopics, types: input.acceptedSubmissionTypes, maximumActiveReviews: input.maximumActiveReviews, preferredReviewWorkload: input.preferredReviewWorkload, note: input.availabilityNote, temporarilyUnavailableUntil: input.temporarilyUnavailableUntil ?? null, autoRecommendationEnabled: input.autoRecommendationEnabled, updatedAt: new Date().toISOString() };
    const profile = await getPrisma().academicProfile.upsert({ where: { userId: context.user.id }, create: { userId: context.user.id, reviewAvailability }, update: { reviewAvailability } });
    await auditService.log("review.availability.updated", { userId: context.user.id, targetTableName: "academic_profiles", targetRecordId: profile.id, details: { availableForReview: input.availableForReview, maximumActiveReviews: input.maximumActiveReviews } });
    return availabilityDto(await reviewerContext(context.user.id));
  },

  async listOpportunities(userIdInput: string, filters: OpportunityFilters) {
    const context = await reviewerContext(userIdInput);
    if (!canUseOpenReviewOpportunities(await participantScopeForUser(context.user.id))) {
      return { availability: availabilityDto(context), opportunities: [] };
    }
    const settings = availabilityDto(context);
    if (!settings.availableForReview) return { availability: settings, opportunities: [] };
    const prisma = getPrisma();
    const [authored, declared, assignments, conflicts, ownedProjects, memberships] = await Promise.all([
      prisma.submissionAuthor.findMany({ where: { userId: context.user.id }, select: { submissionId: true } }),
      prisma.submissionDeclaredConflict.findMany({ where: { userId: context.user.id }, select: { submissionId: true } }),
      prisma.reviewerAssignment.findMany({ where: { reviewerId: context.user.id }, select: { submissionId: true } }),
      prisma.reviewConflict.findMany({ where: { reviewerId: context.user.id, status: { in: ["DECLARED", "SYSTEM_DETECTED", "BLOCKED"] } }, select: { submissionId: true } }),
      prisma.project.findMany({ where: { ownerId: context.user.id }, select: { id: true } }),
      prisma.projectMember.findMany({ where: { userId: context.user.id, status: "ACTIVE" }, select: { projectId: true } }),
    ]);
    const blockedSubmissions = [...authored, ...declared, ...assignments, ...conflicts].map((row) => row.submissionId);
    const blockedProjects = [...ownedProjects.map((row) => row.id), ...memberships.map((row) => row.projectId)];
    const submissions = await prisma.submission.findMany({ where: { status: { in: ["submitted", "ready_for_review", "revised"] }, id: { notIn: blockedSubmissions }, projectId: { notIn: blockedProjects }, ...(filters.researchField ? { researchField: { contains: filters.researchField, mode: "insensitive" } } : {}), ...(filters.topic ? { keywords: { has: filters.topic } } : {}), ...(filters.submissionType ? { submissionType: filters.submissionType } : settings.acceptedSubmissionTypes.length ? { submissionType: { in: settings.acceptedSubmissionTypes } } : {}), ...(filters.methodology ? { methodology: { contains: filters.methodology, mode: "insensitive" } } : {}), ...(filters.dateFrom ? { createdAt: { gte: filters.dateFrom } } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
    const fields = normalizedSet(settings.acceptedFields), topics = normalizedSet(settings.acceptedTopics), expertise = normalizedSet(context.profile?.expertiseAreas ?? []), interests = normalizedSet(context.user.researchInterests);
    const opportunities = submissions.map((submission) => {
      const reasons: string[] = []; let score = 0;
      if (submission.researchField && (fields.has(normalized(submission.researchField)) || expertise.has(normalized(submission.researchField)))) { score += 45; reasons.push("Research field matches your expertise"); }
      const matchingKeywords = submission.keywords.filter((keyword) => topics.has(normalized(keyword)) || interests.has(normalized(keyword)) || expertise.has(normalized(keyword)));
      if (matchingKeywords.length) { score += Math.min(40, matchingKeywords.length * 10); reasons.push(`Topic match: ${matchingKeywords.slice(0, 3).join(", ")}`); }
      if (settings.acceptedSubmissionTypes.includes(submission.submissionType as SubmissionType)) { score += 15; reasons.push("Accepted submission type"); }
      return { id: publicDatabaseId(submission), title: submission.title, abstract: submission.abstractText, submissionType: submission.submissionType, researchField: submission.researchField, researchGoal: submission.researchGoal, claimedResearchGap: submission.claimedResearchGap, methodology: submission.methodology, keywords: submission.keywords, status: submission.status.toUpperCase(), currentRevisionNumber: submission.currentRevisionNumber, expectedWorkload: submission.expectedReviewWorkload, matchReasons: reasons, matchScore: score, submittedAt: submission.createdAt, authorVisibility: "DOUBLE_BLIND" as const };
    });
    opportunities.sort(filters.sort === "newest" ? (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime() : (a, b) => b.matchScore - a.matchScore || b.submittedAt.getTime() - a.submittedAt.getTime());
    return { availability: settings, opportunities };
  },

  async acceptOpportunity(submissionInput: string, reviewerInput: string) {
    const context = await reviewerContext(reviewerInput); const settings = availabilityDto(context); assertAvailable(settings);
    if (!canUseOpenReviewOpportunities(await participantScopeForUser(context.user.id))) {
      throw AppError.forbidden("External reviewers can only accept explicit review invitations");
    }
    const submission = await resolveSubmission(submissionInput);
    if (!["submitted", "ready_for_review", "revised"].includes(submission.status)) throw AppError.conflict("This submission is not accepting reviewers");
    const conflict = await detectConflict(submission.id, submission.projectId, context.user.id); if (conflict) throw AppError.conflict(conflict);
    if (await getPrisma().reviewerAssignment.findFirst({ where: { submissionId: submission.id, reviewerId: context.user.id, status: { notIn: ["declined", "cancelled", "completed"] } } })) throw AppError.conflict("You already have an active assignment for this submission");
    try {
      const assignment = await getPrisma().$transaction(async (tx) => { const created = await tx.reviewerAssignment.create({ data: { submissionId: submission.id, reviewerId: context.user.id, assignedById: context.user.id, anonymousCode: `R-${crypto.randomBytes(12).toString("hex")}`, status: "accepted", conflictChecks: { selfOrAuthor: false, declared: false, sameInstitution: false, checkedAt: new Date().toISOString() } } }); await tx.submission.updateMany({ where: { id: submission.id, status: { in: ["submitted", "ready_for_review", "revised"] } }, data: { status: "under_review" } }); return created; });
      await auditService.log("review.opportunity.accepted", { userId: context.user.id, targetTableName: "reviewer_assignments", targetRecordId: assignment.id, details: { submissionId: submission.id } }); return assignment;
    } catch (error) { if (isUniqueViolation(error)) throw AppError.conflict("You already have an assignment for this submission"); throw error; }
  },

  async declareConflict(submissionInput: string, reviewerInput: string, reason: string) {
    const context = await reviewerContext(reviewerInput); const submission = await resolveSubmission(submissionInput);
    const conflict = await getPrisma().reviewConflict.upsert({ where: { submissionId_reviewerId: { submissionId: submission.id, reviewerId: context.user.id } }, create: { submissionId: submission.id, reviewerId: context.user.id, status: "DECLARED", reason, detectedBy: "REVIEWER" }, update: { status: "DECLARED", reason, detectedBy: "REVIEWER", resolvedById: null, resolvedAt: null } });
    await auditService.log("review.conflict.declared", { userId: context.user.id, targetTableName: "review_conflicts", targetRecordId: conflict.id, details: { submissionId: submission.id } }); return conflict;
  },

  async saveReview(assignmentInput: string, reviewerInput: string, input: AcademicReviewInput, submit: boolean) {
    const reviewer = await resolveUser(reviewerInput); const prisma = getPrisma();
    if (!(await capabilityService.list(reviewer.id)).includes("STRUCTURED_REVIEW")) {
      throw AppError.forbidden("Verified academic review capability is required to write reviews");
    }
    const assignment = await prisma.reviewerAssignment.findFirst({ where: { ...idWhere(assignmentInput), reviewerId: reviewer.id } });
    if (!assignment) throw AppError.notFound("Review assignment not found");
    if (assignment.status !== "accepted") throw AppError.conflict("Only accepted assignments can be reviewed");
    const submission = await prisma.submission.findUnique({ where: { id: assignment.submissionId } });
    if (!submission?.currentRevisionId) throw AppError.conflict("Submission has no reviewable revision");
    const request = assignment.reviewRequestId ? await prisma.reviewRequest.findUnique({ where: { id: assignment.reviewRequestId } }) : null;
    const version = request ? await prisma.reviewTemplateVersion.findUnique({ where: { id: request.templateVersionId } }) : null;
    const criteria = version
      ? await prisma.reviewCriterion.findMany({ where: { versionId: version.id }, orderBy: { order: "asc" } })
      : defaultReviewCriteria.map(([key, label, description], order) => ({ id: key, key, label, description, order, required: true, allowNotApplicable: false, weight: null }));
    const allowedKeys = new Set(criteria.map((criterion) => criterion.key));
    if (input.responses.some((response) => !allowedKeys.has(response.criterionKey))) throw AppError.badRequest("Review contains an unknown criterion");
    const responsesByKey = new Map(input.responses.map((response) => [response.criterionKey, response]));
    if (submit) {
      const missing = criteria.filter((criterion) => {
        if (!criterion.required) return false;
        const response = responsesByKey.get(criterion.key);
        if (!response) return true;
        if (response.notApplicable) return !criterion.allowNotApplicable;
        if (version?.reviewMode === "RUBRIC_ASSESSMENT") return !response.performanceLevelId;
        if (version?.reviewMode === "STRUCTURED_REVIEW") return !response.assessment || !response.comment?.trim();
        return !response.comment?.trim();
      }).map((criterion) => criterion.label);
      if (missing.length) throw AppError.badRequest("Complete every required review criterion before submitting", { missing });
      const commentsMissing = input.responses.filter((response) => ["MAJOR_ISSUES", "NEEDS_IMPROVEMENT"].includes(response.assessment ?? "") && !response.comment?.trim());
      if (commentsMissing.length) throw AppError.badRequest("Major issues and needs-improvement assessments require a comment");
      if (!input.overallAssessment) throw AppError.badRequest("Select an overall assessment before submitting");
    }
    const reviews = await prisma.humanReview.findMany({ where: { assignmentId: assignment.id }, orderBy: { roundNumber: "desc" } });
    const existing = reviews.find((review) => review.status === "DRAFT");
    const roundNumber = existing?.roundNumber ?? (reviews[0]?.roundNumber ?? 0) + 1;
    const revisionId = request?.artifactRevisionId ?? submission.currentRevisionId;
    const levels = version?.reviewMode === "RUBRIC_ASSESSMENT" ? await prisma.reviewCriterionLevel.findMany({ where: { criterionId: { in: criteria.map((item) => item.id) } } }) : [];
    const levelMap = new Map(levels.map((level) => [level.id, level]));
    for (const response of input.responses) if (response.performanceLevelId && !levelMap.has(response.performanceLevelId)) throw AppError.badRequest("Review contains an invalid performance level");
    const scored = input.responses.flatMap((response) => {
      if (response.notApplicable || !response.performanceLevelId) return [];
      const level = levelMap.get(response.performanceLevelId); const criterion = criteria.find((item) => item.key === response.criterionKey);
      return level && criterion ? [{ score: level.score, weight: criterion.weight ?? 1 }] : [];
    });
    const weightedScore = weightedRubricScore(scored);
    const persistable = input.responses.filter((response) => response.comment?.trim() || response.assessment || response.performanceLevelId || response.notApplicable);
    const now = new Date();
    const review = await prisma.$transaction(async (tx) => {
      const reviewData = { reviewerId: reviewer.id, submissionId: assignment.submissionId, revisionId, templateId: version?.templateId, templateVersionId: version?.id, overallComment: input.overallComment, keyStrengths: input.keyStrengths, keyConcerns: input.keyConcerns, overallAssessment: input.overallAssessment, recommendation: input.overallAssessment, weightedScore, status: submit ? "SUBMITTED" : "DRAFT", submittedAt: submit ? now : null };
      const saved = await tx.humanReview.upsert({ where: { assignmentId_roundNumber: { assignmentId: assignment.id, roundNumber } }, create: { assignmentId: assignment.id, roundNumber, ...reviewData }, update: reviewData });
      for (const response of persistable) {
        const level = response.performanceLevelId ? levelMap.get(response.performanceLevelId) : undefined;
        await tx.reviewResponse.upsert({ where: { reviewId_criterionKey: { reviewId: saved.id, criterionKey: response.criterionKey } }, create: { reviewId: saved.id, criterionKey: response.criterionKey, comment: response.comment?.trim() ?? "", evidence: response.evidence?.trim(), assessment: response.assessment, performanceLevelId: level?.id, score: level?.score, notApplicable: response.notApplicable ?? false }, update: { comment: response.comment?.trim() ?? "", evidence: response.evidence?.trim(), assessment: response.assessment, performanceLevelId: level?.id, score: level?.score, notApplicable: response.notApplicable ?? false } });
      }
      await tx.reviewResponse.deleteMany({ where: { reviewId: saved.id, criterionKey: { notIn: persistable.map((response) => response.criterionKey) } } });
      await tx.reviewRevisionItem.deleteMany({ where: { reviewId: saved.id } });
      if (input.requiredRevisions?.length) await tx.reviewRevisionItem.createMany({ data: input.requiredRevisions.map((item, position) => ({ reviewId: saved.id, position, priority: item.priority, description: item.description.trim() })) });
      if (request && !submit && ["ACCEPTED", "RESUBMITTED"].includes(request.status)) await tx.reviewRequest.update({ where: { id: request.id }, data: { status: "IN_REVIEW" } });
      if (submit) {
        const outcome = reviewOutcome(input.overallAssessment, input.requiredRevisions?.length ?? 0);
        await tx.reviewerAssignment.update({ where: { id: assignment.id }, data: { status: outcome.assignmentStatus, decision: input.overallAssessment?.toLowerCase(), reviewText: input.overallComment ?? input.keyConcerns, completedAt: outcome.requestStatus === "COMPLETED" ? now : null } });
        await tx.submission.update({ where: { id: assignment.submissionId }, data: { status: outcome.submissionStatus } });
        if (request) await tx.reviewRequest.update({ where: { id: request.id }, data: { status: outcome.requestStatus, completedAt: outcome.requestStatus === "COMPLETED" ? now : null } });
        await tx.researchContribution.upsert({ where: { sourceReviewAssignmentId: assignment.id }, create: { contributorId: reviewer.id, projectId: submission.projectId, submissionId: assignment.submissionId, contributionType: "REVIEW", description: `Peer review of “${submission.title}”`, evidence: `Completed review assignment ${publicDatabaseId(assignment)}`, provenance: "LUMIGAP_REVIEW", verificationStatus: "VERIFIED_BY_LUMIGAP", visibility: "PUBLIC", verifiedById: reviewer.id, verifiedAt: now, sourceReviewAssignmentId: assignment.id }, update: {} });
      }
      return saved;
    });
    if (submit) {
      const outcome = reviewOutcome(input.overallAssessment, input.requiredRevisions?.length ?? 0);
      await auditService.log("REVIEW_SUBMITTED", { userId: reviewer.id, targetTableName: "human_reviews", targetRecordId: review.id, details: { assignmentId: assignment.id, submissionId: assignment.submissionId, roundNumber } });
      await auditService.log(outcome.requestStatus === "REVISION_REQUESTED" ? "REVISION_REQUESTED" : "REVIEW_COMPLETED", { userId: reviewer.id, targetTableName: "review_requests", targetRecordId: request?.id, details: { reviewId: review.id, roundNumber } });
      if (request) await notificationService.create({ userId: request.requesterId, title: "Academic review submitted", message: `Feedback for “${submission.title}” is ready.`, type: input.requiredRevisions?.length ? "REVISION_REQUESTED" : "REVIEW_SUBMITTED", targetKind: "project", targetId: submission.projectId });
    } else if (!existing) await auditService.log("REVIEW_STARTED", { userId: reviewer.id, targetTableName: "human_reviews", targetRecordId: review.id, details: { assignmentId: assignment.id, roundNumber } });
    return { review, responses: await prisma.reviewResponse.findMany({ where: { reviewId: review.id }, orderBy: { createdAt: "asc" } }), requiredRevisions: await prisma.reviewRevisionItem.findMany({ where: { reviewId: review.id }, orderBy: { position: "asc" } }) };
  },

  async getReview(assignmentInput: string, reviewerInput: string) {
    const reviewer = await resolveUser(reviewerInput); const prisma = getPrisma(); const assignment = await prisma.reviewerAssignment.findFirst({ where: { ...idWhere(assignmentInput), reviewerId: reviewer.id } });
    if (!assignment) throw AppError.notFound("Review assignment not found");
    if (!(await capabilityService.list(reviewer.id)).includes("STRUCTURED_REVIEW")) {
      throw AppError.forbidden("Verified academic review capability is required to view assigned artifacts");
    }
    const request = assignment.reviewRequestId ? await prisma.reviewRequest.findUnique({ where: { id: assignment.reviewRequestId } }) : null;
    const reviews = await prisma.humanReview.findMany({ where: { assignmentId: assignment.id }, orderBy: { roundNumber: "desc" } });
    const review = reviews.find((item) => item.status === "DRAFT") ?? reviews[0];
    const templateVersion = request ? await hydrateReviewTemplateVersion(request.templateVersionId) : undefined;
    const submission = await prisma.submission.findUniqueOrThrow({ where: { id: assignment.submissionId } });
    const revision = await prisma.submissionRevision.findUnique({ where: { id: request?.artifactRevisionId ?? submission.currentRevisionId! } });
    return {
      assignment: { ...assignment, id: publicDatabaseId(assignment), submissionId: submissionDto(submission) },
      request: request ? { id: publicDatabaseId(request), status: request.status, message: request.message, dueAt: request.dueAt } : undefined,
      review, responses: review ? await prisma.reviewResponse.findMany({ where: { reviewId: review.id } }) : [],
      requiredRevisions: review ? await prisma.reviewRevisionItem.findMany({ where: { reviewId: review.id }, orderBy: { position: "asc" } }) : [],
      templateVersion,
      criteria: templateVersion?.criteria ?? defaultReviewCriteria.map(([key, label, description], order) => ({ key, title: label, description, order, required: true, allowNotApplicable: false, levels: [] })),
      artifactContent: revision?.contentSnapshot ?? undefined,
      roundNumber: review?.roundNumber ?? (reviews[0]?.roundNumber ?? 0) + 1,
    };
  },

  async listContributions(userInput: string, viewerInput?: string) {
    const user = await resolveUser(userInput); let viewerId: string | undefined;
    if (viewerInput) viewerId = (await resolveUser(viewerInput)).id;
    const prisma = getPrisma(); const rows = await prisma.researchContribution.findMany({ where: { contributorId: user.id, ...(user.id === viewerId ? {} : { visibility: "PUBLIC" }) }, orderBy: [{ verifiedAt: "desc" }, { createdAt: "desc" }] });
    const submissions = await prisma.submission.findMany({ where: { id: { in: rows.flatMap((row) => row.submissionId ? [row.submissionId] : []) } }, select: { id: true, legacyMongoId: true, title: true } });
    const projects = await prisma.project.findMany({ where: { id: { in: rows.flatMap((row) => row.projectId ? [row.projectId] : []) } }, select: { id: true, legacyMongoId: true, title: true } });
    const submissionMap = new Map(submissions.map((row) => [row.id, { id: publicDatabaseId(row), title: row.title }])); const projectMap = new Map(projects.map((row) => [row.id, { id: publicDatabaseId(row), title: row.title }]));
    return rows.map((row) => ({ ...row, id: publicDatabaseId(row), submissionId: row.submissionId ? submissionMap.get(row.submissionId) : undefined, projectId: row.projectId ? projectMap.get(row.projectId) : undefined }));
  },
};

function submissionDto(row: { id: string; legacyMongoId: string | null; title: string; abstractText: string | null; submissionType: string | null; researchField: string | null; status: string; currentRevisionNumber: number; expectedReviewWorkload: string | null; updatedAt: Date }) {
  return { id: publicDatabaseId(row), title: row.title, abstract: row.abstractText, submissionType: row.submissionType, researchField: row.researchField, status: row.status, currentRevisionNumber: row.currentRevisionNumber, expectedReviewWorkload: row.expectedReviewWorkload, updatedAt: row.updatedAt };
}
