import { Router } from "express";
import { z } from "zod";
import { requireAuth, optionalAuth } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { objectIdSchema } from "../../common/validation/database-id.js";
import { defaultReviewCriteria } from "./review.constants.js";
import { reviewService } from "./review.service.js";

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
  comment: z.string().trim().max(10000),
  evidence: z.string().trim().max(10000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
}).strict();
const draftReviewSchema = z.object({
  overallComment: z.string().trim().max(20000),
  recommendation: z.enum(["ACCEPT", "MINOR_REVISION", "MAJOR_REVISION", "REJECT"]),
  responses: z.array(reviewResponseSchema).max(20).refine(
    (items) => new Set(items.map((item) => item.criterionKey)).size === items.length,
    "Each review criterion may only appear once",
  ),
}).strict();
const submittedReviewSchema = draftReviewSchema.superRefine((review, context) => {
  if (review.overallComment.length < 20) context.addIssue({ code: z.ZodIssueCode.custom, path: ["overallComment"], message: "Overall comment must contain at least 20 characters" });
  for (const [index, response] of review.responses.entries()) {
    if (response.comment.length < 3) context.addIssue({ code: z.ZodIssueCode.custom, path: ["responses", index, "comment"], message: "Criterion assessment is required" });
  }
});

export const reviewAvailabilityRouter: Router = Router();
reviewAvailabilityRouter.use(requireAuth);
reviewAvailabilityRouter.get("/me", async (req, res) => {
  res.json({ success: true, data: await reviewService.getAvailability(req.user!.sub) });
});
reviewAvailabilityRouter.put("/me", validate(availabilitySchema), async (req, res) => {
  res.json({ success: true, data: await reviewService.updateAvailability(req.user!.sub, req.body) });
});

export const reviewOpportunityRouter: Router = Router();
reviewOpportunityRouter.use(requireAuth);
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
humanReviewRouter.use(requireAuth);
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

export const contributionRouter: Router = Router();
contributionRouter.use(optionalAuth);
contributionRouter.get("/users/:userId", validate(userParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await reviewService.listContributions(String(req.params.userId), req.user?.sub) });
});
