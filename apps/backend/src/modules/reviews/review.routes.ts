import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { env } from "../../config/env.js";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, optionalAuth } from "../../common/middleware/auth.js";
import { requireResearchWorkflow } from "../authorization/authorization.middleware.js";
import { validate } from "../../common/middleware/validate.js";
import { objectIdSchema } from "../../common/validation/database-id.js";
import { defaultReviewCriteria } from "./review.constants.js";
import { reviewService } from "./review.service.js";
import { reviewRequestService } from "./review-request.service.js";
import { reviewTemplateService } from "./review-template.service.js";

const submissionTypes = z.enum([
  "RESEARCH_PROPOSAL", "LITERATURE_REVIEW", "THESIS_DRAFT", "RESEARCH_PAPER", "SOFTWARE_RESEARCH_PROJECT",
]);
const textList = (max: number) => z.array(z.string().trim().min(1).max(160)).max(max)
  .transform((items) => [...new Set(items)]);
const availabilitySchema = z.object({
  availableForReview: z.boolean(),
  acceptedFields: textList(30),
  acceptedTopics: textList(40),
  acceptedSubmissionTypes: z.array(submissionTypes).max(10).transform((items) => [...new Set(items)]),
  maximumActiveReviews: z.number().int().min(1).max(20),
  preferredReviewWorkload: z.string().trim().max(160).optional(),
  availabilityNote: z.string().trim().max(1000).optional(),
  temporarilyUnavailableUntil: z.string().datetime().nullable().optional(),
  autoRecommendationEnabled: z.boolean(),
}).strict();
const opportunityQuerySchema = z.object({
  researchField: z.string().trim().max(200).optional(),
  topic: z.string().trim().max(120).optional(),
  submissionType: submissionTypes.optional(),
  methodology: z.string().trim().max(200).optional(),
  dateFrom: z.coerce.date().optional(),
  sort: z.enum(["relevance", "newest"]).default("relevance"),
}).strict();
const submissionParamsSchema = z.object({ submissionId: objectIdSchema }).strict();
const assignmentParamsSchema = z.object({ assignmentId: objectIdSchema }).strict();
const userParamsSchema = z.object({ userId: objectIdSchema }).strict();
const conflictSchema = z.object({ reason: z.string().trim().min(10).max(1000) }).strict();
const reviewResponseSchema = z.object({
  criterionKey: z.string().trim().min(1).max(80),
  comment: z.string().trim().max(10000).optional(),
  evidence: z.string().trim().max(10000).optional(),
  assessment: z.enum(["MAJOR_ISSUES", "NEEDS_IMPROVEMENT", "ADEQUATE", "STRONG", "NOT_APPLICABLE"]).optional(),
  performanceLevelId: objectIdSchema.optional(),
  notApplicable: z.boolean().optional(),
}).strict();
const draftReviewSchema = z.object({
  expectedRevisionId: objectIdSchema.optional(),
  expectedRoundNumber: z.number().int().min(1).optional(),
  keyStrengths: z.string().trim().max(20000).optional(),
  keyConcerns: z.string().trim().max(20000).optional(),
  overallComment: z.string().trim().max(20000).optional(),
  overallAssessment: z.enum(["STRONG", "MINOR_REVISION", "MAJOR_REVISION", "NOT_READY"]).optional(),
  responses: z.array(reviewResponseSchema).max(60).refine(
    (items) => new Set(items.map((item) => item.criterionKey)).size === items.length,
    "Each review criterion may only appear once",
  ),
  requiredRevisions: z.array(z.object({
    priority: z.enum(["MINOR", "MAJOR"]),
    description: z.string().trim().min(3).max(5000),
  }).strict()).max(30).optional(),
}).strict();
const submittedReviewSchema = draftReviewSchema;

const criterionLevelSchema = z.object({
  label: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).optional(), score: z.number().int().min(0).max(100),
}).strict();
const templateCriterionSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/).optional(),
  title: z.string().trim().min(2).max(160), description: z.string().trim().max(4000).optional(),
  required: z.boolean().default(true), allowNotApplicable: z.boolean().default(false),
  weight: z.number().positive().max(100).optional(), levels: z.array(criterionLevelSchema).min(2).max(10).optional(),
}).strict();
const templateVersionSchema = z.object({
  reviewMode: z.enum(["GUIDED_FEEDBACK", "STRUCTURED_REVIEW", "RUBRIC_ASSESSMENT"]),
  description: z.string().trim().max(5000).optional(),
  guidelines: z.array(z.string().trim().min(2).max(1000)).max(30).default([]),
  criteria: z.array(templateCriterionSchema).min(1).max(60),
}).strict().superRefine((value, context) => {
  if (value.reviewMode === "RUBRIC_ASSESSMENT") value.criteria.forEach((criterion, index) => {
    if (!criterion.levels?.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["criteria", index, "levels"], message: "Rubric criteria require performance levels" });
  });
});
const createTemplateSchema = templateVersionSchema.and(z.object({
  name: z.string().trim().min(3).max(200), artifactType: z.string().trim().max(40).optional(),
  source: z.enum(["SYSTEM", "PERSONAL", "PROJECT"]), projectId: objectIdSchema.optional(), publish: z.boolean().optional(),
}).strict());
const templateParamsSchema = z.object({ templateId: objectIdSchema }).strict();
const MAX_REVIEW_DUE_DAYS = 180;
// A due date is what lets an abandoned accepted review be cancelled, so it must be a real future date.
const reviewDueAtSchema = z.string().datetime()
  .refine((value) => new Date(value).getTime() > Date.now(), "The due date must be in the future")
  .refine((value) => new Date(value).getTime() <= Date.now() + MAX_REVIEW_DUE_DAYS * 24 * 60 * 60 * 1000, `The due date must be within ${MAX_REVIEW_DUE_DAYS} days`);
const createRequestSchema = z.object({
  submissionId: objectIdSchema.optional(), reportId: objectIdSchema.optional(), reviewerId: objectIdSchema,
  templateVersionId: objectIdSchema, message: z.string().trim().max(3000).optional(), dueAt: reviewDueAtSchema,
}).strict().refine((value) => Boolean(value.submissionId) !== Boolean(value.reportId), "Select exactly one artifact source");
const createExternalInvitationSchema = z.object({
  submissionId: objectIdSchema.optional(), reportId: objectIdSchema.optional(),
  reviewerEmail: z.string().trim().email().max(320),
  templateVersionId: objectIdSchema, message: z.string().trim().max(3000).optional(), dueAt: reviewDueAtSchema.optional(),
}).strict().refine((value) => Boolean(value.submissionId) !== Boolean(value.reportId), "Select exactly one artifact source");
const requestParamsSchema = z.object({ requestId: objectIdSchema }).strict();
const externalInvitationTokenParamsSchema = z.object({ token: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/) }).strict();
const declineRequestSchema = z.object({ reason: z.string().trim().max(2000).optional() }).strict();
const reviewerQuerySchema = z.object({ q: z.string().trim().max(120).optional(), reportId: objectIdSchema.optional(), submissionId: objectIdSchema.optional() }).strict();
const resubmitSchema = z.object({
  revisionId: objectIdSchema.optional(), reportId: objectIdSchema.optional(),
  responses: z.array(z.object({ revisionItemId: objectIdSchema, responseText: z.string().trim().min(3).max(10000) }).strict()).max(30),
}).strict().refine((value) => Boolean(value.revisionId) !== Boolean(value.reportId), "Select exactly one revised artifact version");

export const reviewAvailabilityRouter: Router = Router();
reviewAvailabilityRouter.use(requireAuth);
reviewAvailabilityRouter.get("/me", async (req, res) => {
  res.json({ success: true, data: await reviewService.getAvailability(req.user!.sub) });
});
reviewAvailabilityRouter.put("/me", validate(availabilitySchema), async (req, res) => {
  res.json({ success: true, data: await reviewService.updateAvailability(req.user!.sub, req.body) });
});

export const reviewOpportunityRouter: Router = Router();
reviewOpportunityRouter.use(requireAuth, requireResearchWorkflow);
reviewOpportunityRouter.get("/", validate(opportunityQuerySchema, "query"), async (req, res) => {
  res.json({ success: true, data: await reviewService.listOpportunities(req.user!.sub, req.query as never) });
});
reviewOpportunityRouter.post("/:submissionId/accept", validate(submissionParamsSchema, "params"), async (req, res) => {
  const data = await reviewService.acceptOpportunity(String(req.params.submissionId), req.user!.sub);
  res.status(201).json({ success: true, data });
});
reviewOpportunityRouter.post("/:submissionId/conflicts", validate(submissionParamsSchema, "params"), validate(conflictSchema), async (req, res) => {
  const data = await reviewService.declareConflict(String(req.params.submissionId), req.user!.sub, req.body.reason);
  res.status(201).json({ success: true, data });
});

export const humanReviewRouter: Router = Router();
humanReviewRouter.use(requireAuth, requireResearchWorkflow);
humanReviewRouter.get("/", async (req, res) => {
  res.json({ success: true, data: await reviewService.listMyReviews(req.user!.sub) });
});
humanReviewRouter.get("/rubric/default", (_req, res) => {
  res.json({ success: true, data: defaultReviewCriteria.map(([key, label, description], order) => ({ key, label, description, order })) });
});
humanReviewRouter.get("/:assignmentId", validate(assignmentParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await reviewService.getReview(String(req.params.assignmentId), req.user!.sub) });
});
humanReviewRouter.put("/:assignmentId", validate(assignmentParamsSchema, "params"), validate(draftReviewSchema), async (req, res) => {
  res.json({ success: true, data: await reviewService.saveReview(String(req.params.assignmentId), req.user!.sub, req.body, false) });
});
humanReviewRouter.post("/:assignmentId/submit", validate(assignmentParamsSchema, "params"), validate(submittedReviewSchema), async (req, res) => {
  res.json({ success: true, data: await reviewService.saveReview(String(req.params.assignmentId), req.user!.sub, req.body, true) });
});

export const reviewTemplateRouter: Router = Router();
reviewTemplateRouter.use(requireAuth);
reviewTemplateRouter.get("/", async (req, res) => {
  res.json({ success: true, data: await reviewTemplateService.list(req.user!.sub) });
});
reviewTemplateRouter.post("/", validate(createTemplateSchema), async (req, res) => {
  const data = await reviewTemplateService.create(req.body, req.user!.sub, req.user!.systemRole);
  res.status(201).json({ success: true, data });
});
reviewTemplateRouter.get("/:templateId", validate(templateParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await reviewTemplateService.detail(String(req.params.templateId), req.user!.sub) });
});
reviewTemplateRouter.put("/:templateId/versions", validate(templateParamsSchema, "params"), validate(templateVersionSchema), async (req, res) => {
  res.json({ success: true, data: await reviewTemplateService.saveVersion(String(req.params.templateId), req.body, req.user!.sub, req.user!.systemRole) });
});
reviewTemplateRouter.post("/:templateId/publish", validate(templateParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await reviewTemplateService.publish(String(req.params.templateId), req.user!.sub, req.user!.systemRole) });
});
reviewTemplateRouter.post("/:templateId/duplicate", validate(templateParamsSchema, "params"), async (req, res) => {
  const data = await reviewTemplateService.duplicate(String(req.params.templateId), req.user!.sub, req.user!.systemRole);
  res.status(201).json({ success: true, data });
});
reviewTemplateRouter.post("/:templateId/archive", validate(templateParamsSchema, "params"), async (req, res) => {
  await reviewTemplateService.archive(String(req.params.templateId), req.user!.sub, req.user!.systemRole);
  res.status(204).send();
});

export const reviewRequestRouter: Router = Router();
const requestLimiter = createRateLimiter("reviews:requestLimiter", { windowMs: 3600000, limit: env.ACADEMIC_RELATIONSHIP_REQUEST_LIMIT, standardHeaders: true, legacyHeaders: false, keyGenerator: req => req.user!.sub });
reviewRequestRouter.get("/external-invitations/:token", validate(externalInvitationTokenParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await reviewRequestService.externalInvitationPreview(String(req.params.token)) });
});
reviewRequestRouter.use(requireAuth, requireResearchWorkflow);
reviewRequestRouter.post("/external-invitations", requestLimiter, validate(createExternalInvitationSchema), async (req, res) => {
  const data = await reviewRequestService.createExternalInvitation(req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
});
reviewRequestRouter.post("/external-invitations/:token/accept", validate(externalInvitationTokenParamsSchema, "params"), async (req, res) => {
  const data = await reviewRequestService.acceptExternalInvitation(String(req.params.token), req.user!.sub);
  res.json({ success: true, data });
});
reviewRequestRouter.get("/reviewers", validate(reviewerQuerySchema, "query"), async (req, res) => {
  res.json({ success: true, data: await reviewRequestService.reviewerCandidates(req.user!.sub, String(req.query.q ?? "") || undefined, { reportId: req.query.reportId ? String(req.query.reportId) : undefined, submissionId: req.query.submissionId ? String(req.query.submissionId) : undefined }) });
});
reviewRequestRouter.get("/", async (req, res) => {
  res.json({ success: true, data: await reviewRequestService.listCenter(req.user!.sub) });
});
reviewRequestRouter.post("/", requestLimiter, validate(createRequestSchema), async (req, res) => {
  const data = await reviewRequestService.create(req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
});
reviewRequestRouter.get("/:requestId", validate(requestParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await reviewRequestService.detail(String(req.params.requestId), req.user!.sub) });
});
reviewRequestRouter.post("/:requestId/accept", validate(requestParamsSchema, "params"), async (req, res) => {
  await reviewRequestService.accept(String(req.params.requestId), req.user!.sub); res.status(204).send();
});
reviewRequestRouter.post("/:requestId/decline", validate(requestParamsSchema, "params"), validate(declineRequestSchema), async (req, res) => {
  await reviewRequestService.decline(String(req.params.requestId), req.user!.sub, req.body.reason); res.status(204).send();
});
reviewRequestRouter.post("/:requestId/cancel", validate(requestParamsSchema, "params"), async (req, res) => {
  await reviewRequestService.cancel(String(req.params.requestId), req.user!.sub); res.status(204).send();
});
reviewRequestRouter.post("/:requestId/resubmit", validate(requestParamsSchema, "params"), validate(resubmitSchema), async (req, res) => {
  await reviewRequestService.resubmit(String(req.params.requestId), req.user!.sub, req.body); res.status(204).send();
});

reviewRequestRouter.patch("/:requestId/revision-items/:itemId", validate(z.object({ requestId: objectIdSchema, itemId: objectIdSchema }), "params"), validate(z.object({ status: z.enum(["ACCEPTED", "REOPENED"]) }).strict()), async (req, res) => {
  await reviewRequestService.resolveRevisionItem(String(req.params.requestId), String(req.params.itemId), req.body.status, req.user!.sub);
  res.status(204).send();
});

export const contributionRouter: Router = Router();
contributionRouter.use(optionalAuth);
contributionRouter.get("/users/:userId", validate(userParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await reviewService.listContributions(String(req.params.userId), req.user?.sub) });
});
