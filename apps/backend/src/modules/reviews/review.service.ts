import { createReviewNotification, dispatchReviewNotifications, reviewTeamRecipients } from "./review-notifications.js";
import type { AcademicReviewInput, ReviewAvailabilitySettings, SubmissionType, ManuscriptSourceVersionLink } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { auditService } from "../audit/audit.service.js";
import { assertPeerReviewer, assertReviewerInTransaction, lockReviewerAndSubmission, refreshSubmissionReviewStatus } from "./peer-review-access.js";
import { defaultReviewCriteria } from "./review.constants.js";
import { hydrateReviewTemplateVersion } from "./review-template.service.js";
import { reviewOutcome, weightedRubricScore } from "./academic-review.rules.js";
import { resolveFeaturedWorks } from "../academic-profiles/academic-featured-works.service.js";
import { createHash } from "node:crypto";
import { assertMentorReviewAccess, visibleMentorReviewAssignments } from "./mentor-review-access.js";
import { validateScientificIntegrity } from "./scientific-review.rules.js";

type AvailabilityInput = Omit<ReviewAvailabilitySettings, "activeReviewCount">;
type OpportunityFilters = { researchField?: string; topic?: string; submissionType?: SubmissionType; methodology?: string; dateFrom?: Date; sort?: "relevance" | "newest" };
type AvailabilityRecord = { enabled?: boolean; acceptedFields?: string[]; preferredTopics?: string[]; types?: string[]; maximumActiveReviews?: number; preferredReviewWorkload?: string; note?: string; temporarilyUnavailableUntil?: string | Date; autoRecommendationEnabled?: boolean };

const normalized = (value: string) => value.trim().toLocaleLowerCase();
const normalizedSet = (values: string[]) => new Set(values.map(normalized));

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
  const { user, profile } = await assertPeerReviewer(userInput);
  const activeReviewCount = await getPrisma().reviewerAssignment.count({ where: { reviewerId: user.id, status: { in: ["assigned", "accepted"] } } });
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


async function resolveSubmission(input: string) {
  const submission = await getPrisma().submission.findFirst({ where: idWhere(input) });
  if (!submission) throw AppError.notFound("Submission not found");
  return submission;
}


export const reviewService = {
  async getAvailability(userId: string) { return availabilityDto(await reviewerContext(userId)); },

  async listMyReviews(userIdInput: string) {
    const user = await resolveUser(userIdInput);
    const prisma = getPrisma();
    const assignments = await visibleMentorReviewAssignments(prisma, await prisma.reviewerAssignment.findMany({ where: { reviewerId: user.id, status: { not: "cancelled" } }, orderBy: { updatedAt: "desc" } }));
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
    const submissions = await prisma.submission.findMany({ where: { openForReview: true, status: { in: ["submitted", "ready_for_review", "revised"] }, id: { notIn: blockedSubmissions }, projectId: { notIn: blockedProjects }, ...(filters.researchField ? { researchField: { contains: filters.researchField, mode: "insensitive" } } : {}), ...(filters.topic ? { keywords: { has: filters.topic } } : {}), ...(filters.submissionType ? { submissionType: filters.submissionType } : settings.acceptedSubmissionTypes.length ? { submissionType: { in: settings.acceptedSubmissionTypes } } : {}), ...(filters.methodology ? { methodology: { contains: filters.methodology, mode: "insensitive" } } : {}), ...(filters.dateFrom ? { createdAt: { gte: filters.dateFrom } } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
    const fields = normalizedSet(settings.acceptedFields), topics = normalizedSet(settings.acceptedTopics), expertise = normalizedSet(context.profile?.expertiseAreas ?? []), interests = normalizedSet(context.user.researchInterests);
    const opportunities = submissions.map((submission) => {
      const reasons: string[] = []; let score = 0;
      if (submission.researchField && (fields.has(normalized(submission.researchField)) || expertise.has(normalized(submission.researchField)))) { score += 45; reasons.push("Research field matches your expertise"); }
      const matchingKeywords = submission.keywords.filter((keyword) => topics.has(normalized(keyword)) || interests.has(normalized(keyword)) || expertise.has(normalized(keyword)));
      if (matchingKeywords.length) { score += Math.min(40, matchingKeywords.length * 10); reasons.push(`Topic match: ${matchingKeywords.slice(0, 3).join(", ")}`); }
      if (settings.acceptedSubmissionTypes.includes(submission.submissionType as SubmissionType)) { score += 15; reasons.push("Accepted submission type"); }
      return { id: publicDatabaseId(submission), title: submission.title, abstract: submission.abstractText, submissionType: submission.submissionType, researchField: submission.researchField, researchGoal: submission.researchGoal, claimedResearchGap: submission.claimedResearchGap, methodology: submission.methodology, keywords: submission.keywords, status: submission.status.toUpperCase(), currentRevisionNumber: submission.currentRevisionNumber, expectedWorkload: submission.expectedReviewWorkload, matchReasons: reasons, matchScore: score, submittedAt: submission.createdAt, authorVisibility: "SUMMARY_ONLY" as const };
    });
    opportunities.sort(filters.sort === "newest" ? (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime() : (a, b) => b.matchScore - a.matchScore || b.submittedAt.getTime() - a.submittedAt.getTime());
    return { availability: settings, opportunities };
  },

  async acceptOpportunity(_submissionInput: string, _reviewerInput: string) {
    throw AppError.forbidden("Formal review requires a project request and Lecturer acceptance; self-assignment is disabled");
  },

  async declareConflict(submissionInput: string, reviewerInput: string, reason: string) {
    const context = await reviewerContext(reviewerInput); const submission = await resolveSubmission(submissionInput);
    const conflict = await getPrisma().reviewConflict.upsert({ where: { submissionId_reviewerId: { submissionId: submission.id, reviewerId: context.user.id } }, create: { submissionId: submission.id, reviewerId: context.user.id, status: "DECLARED", reason, detectedBy: "REVIEWER" }, update: { status: "DECLARED", reason, detectedBy: "REVIEWER", resolvedById: null, resolvedAt: null } });
    await auditService.log("review.conflict.declared", { userId: context.user.id, targetTableName: "review_conflicts", targetRecordId: conflict.id, details: { submissionId: submission.id } }); return conflict;
  },

  async saveReview(assignmentInput: string, reviewerInput: string, input: AcademicReviewInput, submit: boolean) {
    const { user: reviewer } = await assertPeerReviewer(reviewerInput); const prisma = getPrisma();
    const assignment = await prisma.reviewerAssignment.findFirst({ where: { ...idWhere(assignmentInput), reviewerId: reviewer.id } });
    if (!assignment) throw AppError.notFound("Review assignment not found");
    if (!assignment.reviewRequestId && assignment.anonymousCode.startsWith("mentor-")) throw AppError.conflict("Open the canonical mentor review workspace before saving feedback");
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    if (submit && input.clientKey) {
      const prior = await prisma.humanReview.findFirst({ where: { assignmentId: assignment.id, clientKey: input.clientKey, status: "SUBMITTED" } });
      if (prior) {
        if (prior.submissionHash !== requestHash) throw AppError.conflict("This submission key was already used for different feedback");
        if (assignment.reviewRequestId) { const linked = await prisma.reviewRequest.findUniqueOrThrow({ where: { id: assignment.reviewRequestId } }); if (linked.origin === "MENTOR_GUIDANCE") await assertMentorReviewAccess(prisma, linked.projectId, reviewer.id, linked.submissionId, assignment.id); }
        return { review: prior, responses: await prisma.reviewResponse.findMany({ where: { reviewId: prior.id } }), requiredRevisions: await prisma.reviewRevisionItem.findMany({ where: { reviewId: prior.id } }) };
      }
    }
    if (assignment.status !== "accepted") throw AppError.conflict("Only accepted assignments can be reviewed");
    const submission = await prisma.submission.findUnique({ where: { id: assignment.submissionId } });
    if (!submission?.currentRevisionId) throw AppError.conflict("Submission has no reviewable revision");
    const request = assignment.reviewRequestId ? await prisma.reviewRequest.findUnique({ where: { id: assignment.reviewRequestId } }) : null;
    if (assignment.reviewRequestId && (!request || !["ACCEPTED", "IN_REVIEW", "RESUBMITTED", "REVISION_REQUESTED", "COMPLETED"].includes(request.status))) throw AppError.forbidden("This review request is no longer accessible");
    const version = request ? await prisma.reviewTemplateVersion.findUnique({ where: { id: request.templateVersionId } }) : null;
    if (request?.origin === "MENTOR_GUIDANCE" && (!input.expectedRevisionId || !input.expectedRoundNumber)) throw AppError.badRequest("Mentor feedback must identify the assigned manuscript revision and review round");
    if (input.commentOnly && request?.origin !== "MENTOR_GUIDANCE") throw AppError.badRequest("Comment-only feedback is available for assigned mentor guidance only");
    if (input.commentOnly && (input.overallAssessment || input.requiredRevisions?.length)) throw AppError.badRequest("Comments do not include readiness approval or required changes; choose the corresponding outcome");
    validateScientificIntegrity(input, version?.guidelines ?? [], request?.origin, submit && !input.commentOnly);
    const criteria = version
      ? await prisma.reviewCriterion.findMany({ where: { versionId: version.id }, orderBy: { order: "asc" } })
      : defaultReviewCriteria.map(([key, label, description], order) => ({ id: key, key, label, description, order, required: true, allowNotApplicable: false, weight: null }));
    const allowedKeys = new Set(criteria.map((criterion) => criterion.key));
    if (new Set(input.responses.map((response) => response.criterionKey)).size !== input.responses.length) throw AppError.badRequest("Each criterion can only appear once");
    if (input.responses.some((response) => (response.notApplicable || response.assessment === "NOT_APPLICABLE") && !criteria.find((item) => item.key === response.criterionKey)?.allowNotApplicable)) throw AppError.badRequest("This criterion cannot be marked not applicable");
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
      if (!input.commentOnly && missing.length) throw AppError.badRequest("Complete every required review criterion before submitting", { missing });
      const commentsMissing = input.responses.filter((response) => ["MAJOR_ISSUES", "NEEDS_IMPROVEMENT"].includes(response.assessment ?? "") && !response.comment?.trim());
      if (commentsMissing.length) throw AppError.badRequest("Major issues and needs-improvement assessments require a comment");
      if (!input.overallAssessment && !input.commentOnly) throw AppError.badRequest("Select an overall assessment before submitting");
      if (!input.overallComment?.trim()) throw AppError.badRequest("Explain the overall assessment before submitting");
    }
    const reviews = await prisma.humanReview.findMany({ where: { assignmentId: assignment.id }, orderBy: { roundNumber: "desc" } });
    const existing = reviews.find((review) => review.status === "DRAFT");
    const roundNumber = existing?.roundNumber ?? (reviews[0]?.roundNumber ?? 0) + 1;
    const revisionId = request?.artifactRevisionId ?? assignment.artifactRevisionId;
    if (!revisionId) throw AppError.conflict("This assignment has no pinned revision");
    if ((input.expectedRevisionId && input.expectedRevisionId !== revisionId) || (input.expectedRoundNumber && input.expectedRoundNumber !== roundNumber)) throw AppError.conflict("The assigned revision or round has changed. Refresh before saving.");
    const levels = version?.reviewMode === "RUBRIC_ASSESSMENT" ? await prisma.reviewCriterionLevel.findMany({ where: { criterionId: { in: criteria.map((item) => item.id) } } }) : [];
    const levelMap = new Map(levels.map((level) => [level.id, level]));
    for (const response of input.responses) if (response.performanceLevelId && levelMap.get(response.performanceLevelId)?.criterionId !== criteria.find((item) => item.key === response.criterionKey)?.id) throw AppError.badRequest("Review contains an invalid performance level");
    if (submit && input.responses.some(response => !response.notApplicable && response.performanceLevelId && (levelMap.get(response.performanceLevelId)?.score ?? 5) <= 2 && !response.comment?.trim())) throw AppError.badRequest("Low ratings require actionable academic comments");
    const scored = input.responses.flatMap((response) => {
      if (response.notApplicable || !response.performanceLevelId) return [];
      const level = levelMap.get(response.performanceLevelId); const criterion = criteria.find((item) => item.key === response.criterionKey);
      return level && criterion ? [{ score: level.score, weight: criterion.weight ?? 1 }] : [];
    });
    const weightedScore = weightedRubricScore(scored);
    const persistable = input.responses.filter((response) => response.comment?.trim() || response.assessment || response.performanceLevelId || response.notApplicable);
    const now = new Date();
    let outcome = reviewOutcome(input.overallAssessment, input.requiredRevisions?.length ?? 0);
    let replayed = false;
    const pendingNotifications: Awaited<ReturnType<typeof createReviewNotification>>[] = [];
    const review = await prisma.$transaction(async (tx) => {
      await lockReviewerAndSubmission(tx, reviewer.id, submission.id);
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${submission.projectId}::uuid FOR UPDATE`;
      const liveProfile = await assertReviewerInTransaction(tx, reviewer.id);
      const live = await tx.reviewerAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
      const liveRequest = request ? await tx.reviewRequest.findUniqueOrThrow({ where: { id: request.id } }) : null;
      if (liveRequest?.origin === "MENTOR_GUIDANCE") await assertMentorReviewAccess(tx, liveRequest.projectId, reviewer.id, liveRequest.submissionId, assignment.id);
      if (submit && input.clientKey) {
        const prior = await tx.humanReview.findFirst({ where: { assignmentId: assignment.id, clientKey: input.clientKey, status: "SUBMITTED" } });
        if (prior) { if (prior.submissionHash !== requestHash) throw AppError.conflict("This submission key was already used for different feedback"); replayed = true; return prior; }
      }
      const liveProject = await tx.project.findUniqueOrThrow({ where: { id: submission.projectId } });
      const revision = await tx.submissionRevision.findFirst({ where: { id: revisionId, submissionId: submission.id } });
      if (["ARCHIVED", "COMPLETED"].includes(liveProject.status) || Boolean(liveProject.deletedAt)) throw AppError.conflict("Archived or completed projects are read-only");
      if (!revision || live.submissionId !== submission.id || live.reviewerId !== reviewer.id
        || (liveRequest && (liveRequest.submissionId !== submission.id || liveRequest.projectId !== submission.projectId || live.artifactRevisionId !== liveRequest.artifactRevisionId))) throw AppError.conflict("Review assignment does not match the target artifact");
      if (live.status !== "accepted" || (liveRequest && !["ACCEPTED", "RESUBMITTED", "IN_REVIEW"].includes(liveRequest.status)) || (liveRequest?.artifactRevisionId ?? live.artifactRevisionId) !== revisionId) throw AppError.conflict("This round has changed or was already submitted; refresh the workspace");
      const storedRound = await tx.humanReview.findUnique({ where: { assignmentId_roundNumber: { assignmentId: assignment.id, roundNumber } } });
      if (storedRound?.status === "SUBMITTED") throw AppError.conflict("Submitted review rounds are immutable");
      let pendingRevisionCount = 0;
      if (submit) {
        const previousReviews = await tx.humanReview.findMany({ where: { assignmentId: assignment.id, status: "SUBMITTED" }, select: { id: true } });
        const unresolved = await tx.reviewRevisionItem.findMany({ where: { reviewId: { in: previousReviews.map((item) => item.id) }, status: { not: "ACCEPTED" } } });
        if (unresolved.some((item) => item.status === "ADDRESSED")) throw AppError.conflict("Accept or reopen every author response before submitting");
        pendingRevisionCount = unresolved.length;
        if (input.commentOnly && pendingRevisionCount) throw AppError.conflict("Resolve required changes before closing this round with comments only");
        if (["NOT_READY", "MINOR_REVISION", "MAJOR_REVISION"].includes(input.overallAssessment ?? "") && !input.requiredRevisions?.length && !pendingRevisionCount) throw AppError.badRequest("Revision assessments require at least one actionable revision item");
        if (input.overallAssessment === "STRONG" && (pendingRevisionCount || input.requiredRevisions?.length)) throw AppError.conflict("Resolve required changes before marking this revision ready to advance");
      }
      for (const item of input.requiredRevisions ?? []) {
        if (item.criterionKey && !allowedKeys.has(item.criterionKey)) throw AppError.badRequest("Revision item references an unknown criterion");
        if (item.quotation && (!revision.contentSnapshot || !revision.contentSnapshot.includes(item.quotation))) throw AppError.badRequest("Quoted excerpt must match this exact manuscript revision; use a page/section locator for PDFs");
      }
      const reviewData = { reviewerAcademicRole: submit ? liveProfile.academicRole : undefined, reviewerId: reviewer.id, submissionId: assignment.submissionId, revisionId, templateId: version?.templateId, templateVersionId: version?.id, overallComment: input.overallComment ?? null, keyStrengths: input.keyStrengths ?? null, keyConcerns: input.keyConcerns ?? null, overallAssessment: input.overallAssessment ?? null, recommendation: input.overallAssessment ?? null, weightedScore: weightedScore ?? null, status: submit ? "SUBMITTED" : "DRAFT", submittedAt: submit ? now : null };
      // Keep the explicit comment-only choice in the existing recommendation field,
      // including drafts, without treating it as a readiness assessment.
      const metadata = { recommendation: input.commentOnly ? "COMMENT_ONLY" : input.overallAssessment ?? null, integrityChecks: input.integrityChecks ?? {}, ...(submit ? { clientKey: input.clientKey ?? null, submissionHash: requestHash } : {}) };
      const saved = await tx.humanReview.upsert({ where: { assignmentId_roundNumber: { assignmentId: assignment.id, roundNumber } }, create: { assignmentId: assignment.id, roundNumber, ...reviewData, ...metadata }, update: { ...reviewData, ...metadata } });
      for (const response of persistable) {
        const level = response.performanceLevelId ? levelMap.get(response.performanceLevelId) : undefined;
        await tx.reviewResponse.upsert({ where: { reviewId_criterionKey: { reviewId: saved.id, criterionKey: response.criterionKey } }, create: { reviewId: saved.id, criterionKey: response.criterionKey, comment: response.comment?.trim() ?? "", evidence: response.evidence?.trim() || null, assessment: response.assessment ?? null, performanceLevelId: response.notApplicable ? null : level?.id ?? null, score: response.notApplicable ? null : level?.score ?? null, notApplicable: response.notApplicable ?? false }, update: { comment: response.comment?.trim() ?? "", evidence: response.evidence?.trim() || null, assessment: response.assessment ?? null, performanceLevelId: response.notApplicable ? null : level?.id ?? null, score: response.notApplicable ? null : level?.score ?? null, notApplicable: response.notApplicable ?? false } });
      }
      await tx.reviewResponse.deleteMany({ where: { reviewId: saved.id, criterionKey: { notIn: persistable.map((response) => response.criterionKey) } } });
      await tx.reviewRevisionItem.deleteMany({ where: { reviewId: saved.id } });
      if (input.requiredRevisions?.length) await tx.reviewRevisionItem.createMany({ data: input.requiredRevisions.map((item, position) => ({ reviewId: saved.id, position, priority: item.priority, description: item.description.trim(), criterionKey: item.criterionKey, locator: item.locator, quotation: item.quotation })) });
      if (request && !submit && ["ACCEPTED", "RESUBMITTED"].includes(request.status)) await tx.reviewRequest.update({ where: { id: request.id }, data: { status: "IN_REVIEW" } });
      if (submit) {
        outcome = reviewOutcome(input.overallAssessment, (input.requiredRevisions?.length ?? 0) + pendingRevisionCount);
        await tx.reviewerAssignment.update({ where: { id: assignment.id }, data: { status: outcome.assignmentStatus, decision: input.overallAssessment?.toLowerCase(), reviewText: input.overallComment ?? input.keyConcerns, completedAt: outcome.requestStatus === "COMPLETED" ? now : null } });
        if (request) await tx.reviewRequest.update({ where: { id: request.id }, data: { status: outcome.requestStatus, completedAt: outcome.requestStatus === "COMPLETED" ? now : null } });
        await refreshSubmissionReviewStatus(tx, submission.id);
        if (liveRequest?.origin === "MENTOR_GUIDANCE") await tx.projectActivity.upsert({
          where: { projectId_idempotencyKey: { projectId: submission.projectId, idempotencyKey: `research:review:${saved.id}` } },
          create: { projectId: submission.projectId, actorId: reviewer.id, type: "MENTOR_REVIEW_SUBMITTED", entityKind: "HUMAN_REVIEW", entityId: saved.id,
            sourceModule: "REVIEW", idempotencyKey: `research:review:${saved.id}`, artifactVersion: roundNumber,
            metadata: { submissionId: submission.id, revisionId, reviewId: saved.id, roundNumber }, createdAt: now }, update: {},
        });
        if (liveRequest?.origin === "MENTOR_GUIDANCE") await tx.projectTask.updateMany({where:{projectId:submission.projectId,targetKind:"submission",targetId:submission.id,assigneeId:reviewer.id,title:{startsWith:"Cần góp ý bản thảo"},status:{not:"DONE"}},data:{status:"DONE",completedAt:now,completedById:reviewer.id}});
        if (liveRequest?.origin === "MENTOR_GUIDANCE" && outcome.requestStatus === "COMPLETED" && input.overallAssessment === "STRONG") {
          await tx.submission.updateMany({ where: { id: submission.id, currentRevisionId: revisionId, status: "completed" }, data: { status: "READY_TO_ADVANCE" } });
        }
        const contribution = await tx.researchContribution.findFirst({ where: { contributorId: reviewer.id, submissionId: submission.id, contributionType: "REVIEW" } });
        const evidence = `Latest submitted review ${saved.id}; revision ${revisionId}; round ${roundNumber}`;
        if (contribution) await tx.researchContribution.update({ where: { id: contribution.id }, data: { evidence, verifiedAt: now, visibility: "PRIVATE" } });
        else await tx.researchContribution.create({ data: { contributorId: reviewer.id, projectId: submission.projectId, submissionId: submission.id, contributionType: "REVIEW", description: `Peer review of “${submission.title}”`, evidence, provenance: "LUMIGAP_REVIEW", verificationStatus: "VERIFIED_BY_LUMIGAP", visibility: "PRIVATE", verifiedById: reviewer.id, verifiedAt: now, sourceReviewAssignmentId: assignment.id } });
        if (request) for (const userId of await reviewTeamRecipients(submission.projectId, submission.id, tx)) pendingNotifications.push(await createReviewNotification({ userId, title: "Academic review submitted", message: `Feedback for “${submission.title}” is ready.`, type: outcome.requestStatus === "REVISION_REQUESTED" ? "REVISION_REQUESTED" : "REVIEW_SUBMITTED", targetKind: "review_request", targetId: request.id, eventKey: `REVIEW_SUBMITTED:${saved.id}:${userId}` }, tx));
      }
      return saved;
    });
    if (submit && !replayed) {
      await auditService.log("REVIEW_SUBMITTED", { userId: reviewer.id, targetTableName: "human_reviews", targetRecordId: review.id, details: { assignmentId: assignment.id, submissionId: assignment.submissionId, roundNumber } });
      await auditService.log(outcome.requestStatus === "REVISION_REQUESTED" ? "REVISION_REQUESTED" : "REVIEW_COMPLETED", { userId: reviewer.id, targetTableName: "review_requests", targetRecordId: request?.id, details: { reviewId: review.id, roundNumber } });
      await dispatchReviewNotifications(pendingNotifications);
    } else if (!submit && !existing) await auditService.log("REVIEW_STARTED", { userId: reviewer.id, targetTableName: "human_reviews", targetRecordId: review.id, details: { assignmentId: assignment.id, roundNumber } });
    return { review, responses: await prisma.reviewResponse.findMany({ where: { reviewId: review.id }, orderBy: { createdAt: "asc" } }), requiredRevisions: await prisma.reviewRevisionItem.findMany({ where: { reviewId: review.id }, orderBy: { position: "asc" } }) };
  },

  async getReview(assignmentInput: string, reviewerInput: string) {
    const reviewer = await resolveUser(reviewerInput); const prisma = getPrisma(); const assignment = await prisma.reviewerAssignment.findFirst({ where: { ...idWhere(assignmentInput), reviewerId: reviewer.id } });
    if (!assignment) throw AppError.notFound("Review assignment not found");
    if (!["accepted", "completed"].includes(assignment.status)) throw AppError.forbidden("Accept the review request before accessing the artifact");
    await assertPeerReviewer(reviewer.id);
    const request = assignment.reviewRequestId ? await prisma.reviewRequest.findUnique({ where: { id: assignment.reviewRequestId } }) : null;
    if (assignment.reviewRequestId && (!request || !["ACCEPTED", "IN_REVIEW", "RESUBMITTED", "REVISION_REQUESTED", "COMPLETED"].includes(request.status))) throw AppError.forbidden("This review request is no longer accessible");
    if (request?.origin === "MENTOR_GUIDANCE") await assertMentorReviewAccess(prisma, request.projectId, reviewer.id, request.submissionId, assignment.id);
    const reviews = await prisma.humanReview.findMany({ where: { assignmentId: assignment.id }, orderBy: { roundNumber: "desc" } });
    const pinnedRevisionId = request?.artifactRevisionId ?? assignment.artifactRevisionId;
    const review = reviews.find((item) => item.status === "DRAFT" && item.revisionId === pinnedRevisionId) ?? reviews.find((item) => item.revisionId === pinnedRevisionId);
    const templateVersion = request ? await hydrateReviewTemplateVersion(request.templateVersionId) : undefined;
    const submission = await prisma.submission.findUniqueOrThrow({ where: { id: assignment.submissionId } });
    const project = await prisma.project.findUnique({ where: { id: submission.projectId }, select: { deletedAt: true } });
    if (!project || project.deletedAt) throw AppError.notFound("Project not found");
    if (!request && assignment.anonymousCode.startsWith("mentor-")) await assertMentorReviewAccess(prisma, submission.projectId, reviewer.id, submission.id, assignment.id);
    const revision = pinnedRevisionId ? await prisma.submissionRevision.findFirst({ where: { id: pinnedRevisionId, submissionId: assignment.submissionId } }) : null;
    if (!revision || (request && (request.submissionId !== assignment.submissionId || request.projectId !== submission.projectId || assignment.artifactRevisionId !== request.artifactRevisionId))) throw AppError.conflict("Review assignment does not match the target artifact");
    const oldRevisionIds = [...new Set(reviews.filter(review => review.status === "SUBMITTED").map(review => review.revisionId))];
    const previousVersions = await prisma.submissionRevision.findMany({ where: { submissionId: assignment.submissionId, id: { in: oldRevisionIds } }, orderBy: { revisionNumber: "asc" } });
    const manuscriptSnapshot = revision.manuscriptSnapshotId ? await prisma.manuscriptSnapshot.findUnique({ where: { id: revision.manuscriptSnapshotId }, select: { id: true, projectId: true, workspaceId: true } }) : null;
    const manuscriptSource: ManuscriptSourceVersionLink | undefined = manuscriptSnapshot ? { projectId: manuscriptSnapshot.projectId, manuscriptId: manuscriptSnapshot.workspaceId, snapshotId: manuscriptSnapshot.id } : undefined;
    const authorLinks = request?.origin === "MENTOR_GUIDANCE" ? await prisma.submissionAuthor.findMany({ where: { submissionId: submission.id }, orderBy: { position: "asc" }, select: { userId: true } }) : [];
    const authorPeople = authorLinks.length ? await prisma.user.findMany({ where: { id: { in: authorLinks.map(row => row.userId) } }, select: { id: true, fullName: true } }) : [];
    return {
      previousReviews: reviews.filter(item => item.status === "SUBMITTED" && item.revisionId !== pinnedRevisionId).map(item => ({ id: item.id, roundNumber: item.roundNumber, revisionId: item.revisionId, revisionNumber: previousVersions.find(version => version.id === item.revisionId)?.revisionNumber, overallComment: item.overallComment ?? undefined, overallAssessment: item.overallAssessment ?? undefined, recommendation: item.recommendation ?? undefined, weightedScore: item.weightedScore ?? undefined, submittedAt: item.submittedAt?.toISOString() })),
      assignment: { ...assignment, id: publicDatabaseId(assignment), submissionId: submissionDto(submission) },
      request: request ? { id: publicDatabaseId(request), origin: request.origin, status: request.status, message: request.message, dueAt: request.dueAt } : undefined,
      review, responses: review ? await prisma.reviewResponse.findMany({ where: { reviewId: review.id } }) : [],
      requiredRevisions: review ? await prisma.reviewRevisionItem.findMany({ where: { reviewId: review.id }, orderBy: { position: "asc" } }) : [],
      templateVersion,
      criteria: templateVersion?.criteria ?? defaultReviewCriteria.map(([key, label, description], order) => ({ key, title: label, description, order, required: true, allowNotApplicable: false, levels: [] })),
      artifactContent: revision?.contentSnapshot ?? undefined,
      artifactRevision: revision ? { id: revision.id, revisionNumber: revision.revisionNumber, contentType: revision.contentType } : undefined,
      manuscriptSource,
      delivery: request?.origin === "MENTOR_GUIDANCE" ? { sentAt: request.createdAt.toISOString(), authors: authorLinks.map(row => authorPeople.find(person => person.id === row.userId)?.fullName).filter(Boolean) } : undefined,
      comparisonVersions: [...previousVersions, ...(previousVersions.some(item => item.id === revision.id) ? [] : [revision])].map(item => ({ id: item.id, revisionNumber: item.revisionNumber, contentType: item.contentType, contentSnapshot: item.contentSnapshot, checksumSha256: item.checksumSha256, sizeBytes: item.sizeBytes, sourceRevisionId: item.sourceRevisionId, responseToReview: item.responseToReview, createdAt: item.createdAt.toISOString(), hasPdf: Boolean(item.storageUri), reviews: [] })),
      previousRevisionItems: await Promise.all((await prisma.reviewRevisionItem.findMany({ where: { reviewId: { in: reviews.filter((item) => item.status === "SUBMITTED" && item.revisionId !== pinnedRevisionId).map((item) => item.id) } }, orderBy: { createdAt: "asc" } })).map(async (item) => ({ ...item, responses: await prisma.reviewRevisionResponse.findMany({ where: { revisionItemId: item.id, status: { not: "DRAFT" } }, orderBy: { createdAt: "desc" } }) }))),
      roundNumber: review?.roundNumber ?? (reviews[0]?.roundNumber ?? 0) + 1,
    };
  },

  async listContributions(userInput: string, viewerInput?: string) {
    const user = await resolveUser(userInput); let viewerId: string | undefined;
    if (viewerInput) viewerId = (await resolveUser(viewerInput)).id;
    const prisma = getPrisma(); const rows = await prisma.researchContribution.findMany({ where: { contributorId: user.id, ...(user.id === viewerId ? {} : { visibility: "PUBLIC" }) }, orderBy: [{ verifiedAt: "desc" }, { createdAt: "desc" }] });
    const works = await resolveFeaturedWorks(rows.flatMap(row => [
      ...(row.projectId ? [{ kind: "PROJECT" as const, source: "LUMIGAP" as const, projectId: row.projectId }] : []),
      ...(row.submissionId ? [{ kind: "RESEARCH_ARTIFACT" as const, source: "LUMIGAP" as const, submissionId: row.submissionId }] : []),
    ]), viewerId);
    const projectMap = new Map(works.filter(work => work.projectId).map(work => [work.projectId!, { id: work.projectId!, title: work.title }]));
    const submissionMap = new Map(works.filter(work => work.submissionId).map(work => [work.submissionId!, { id: work.submissionId!, title: work.title }]));
    const sources = await prisma.project.findMany({ where: { id: { in: rows.flatMap(row => row.projectId ? [row.projectId] : []) } }, select: { id: true, legacyMongoId: true, title: true } });
    const artifacts = await prisma.submission.findMany({ where: { id: { in: rows.flatMap(row => row.submissionId ? [row.submissionId] : []) } }, select: { id: true, legacyMongoId: true } });
    const projectTitles = new Map(sources.map(row => [row.id, { id: publicDatabaseId(row), title: row.title }]));
    const projects = new Map(sources.map(row => [row.id, projectMap.get(publicDatabaseId(row))]));
    const submissions = new Map(artifacts.map(row => [row.id, submissionMap.get(publicDatabaseId(row))]));
    return rows.flatMap(row => {
      const project = row.projectId ? (projects.get(row.projectId) ?? (viewerId === user.id && row.contributionType !== "REVIEW" ? projectTitles.get(row.projectId) : undefined)) : undefined;
      const submission = row.submissionId ? submissions.get(row.submissionId) : undefined;
      // A PUBLIC contribution never publishes its underlying private artifact.
      if ((row.projectId && !project) || (row.submissionId && !submission)) return [];
      return [{ id: publicDatabaseId(row), contributorId: publicDatabaseId(user), contributionType: row.contributionType,
        provenance: row.provenance, verificationStatus: row.verificationStatus, visibility: row.visibility,
        verifiedAt: row.verifiedAt, createdAt: row.createdAt, updatedAt: row.updatedAt, projectId: project, submissionId: submission,
        ...(viewerId === user.id ? { description: row.description, evidence: row.evidence } : {}),
      }];
    });
  },
};

function submissionDto(row: { id: string; legacyMongoId: string | null; title: string; abstractText: string | null; submissionType: string | null; researchField: string | null; status: string; currentRevisionNumber: number; expectedReviewWorkload: string | null; updatedAt: Date }) {
  return { id: publicDatabaseId(row), title: row.title, abstract: row.abstractText, submissionType: row.submissionType, researchField: row.researchField, status: row.status, currentRevisionNumber: row.currentRevisionNumber, expectedReviewWorkload: row.expectedReviewWorkload, updatedAt: row.updatedAt };
}
