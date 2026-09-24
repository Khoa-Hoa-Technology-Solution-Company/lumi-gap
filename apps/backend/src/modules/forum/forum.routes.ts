import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { optionalAuth, requireAuth } from "../../common/middleware/auth.js";
import { requirePermission } from "../../common/middleware/permission.js";
import { validate } from "../../common/middleware/validate.js";
import { objectIdSchema, paginationSchema } from "../../common/validation/database-id.js";
import { forumService } from "./forum.service.js";

const referenceSchema = z.object({
  paperId: objectIdSchema.optional(),
  doi: z.string().trim().max(300).optional(),
  url: z.string().url().max(1000).refine((url) => new URL(url).protocol === "https:", "Only HTTPS URLs are allowed").optional(),
  title: z.string().trim().max(500).optional(),
}).strict().refine((value) => Object.values(value).some(Boolean), "A reference cannot be empty");

const postBaseSchema = z.object({
  type: z.enum(["discussion", "question"]).default("discussion"),
  title: z.string().trim().min(3).max(240),
  content: z.string().trim().min(1).max(20000).optional(),
  body: z.string().trim().min(1).max(20000).optional(),
  communityId: objectIdSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  linkedPaperId: objectIdSchema.optional(),
  linkedResearchGapId: objectIdSchema.optional(),
  linkedProjectId: objectIdSchema.optional(),
  paperIds: z.array(objectIdSchema).max(20).optional(),
  researchGapId: objectIdSchema.optional(),
  references: z.array(referenceSchema).max(30).default([]),
}).strict();

const postInputSchema = postBaseSchema
  .refine((value) => value.content || value.body, "Post content is required")
  .transform(({ body, content, paperIds, researchGapId, ...value }) => ({
    ...value,
    content: content ?? body!,
    linkedPaperId: value.linkedPaperId ?? paperIds?.[0],
    linkedResearchGapId: value.linkedResearchGapId ?? researchGapId,
  }));
const postUpdateSchema = postBaseSchema.partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required")
  .transform(({ body, content, paperIds, researchGapId, ...value }) => ({
    ...value,
    ...(content || body ? { content: content ?? body } : {}),
    ...(value.linkedPaperId || paperIds?.[0] ? { linkedPaperId: value.linkedPaperId ?? paperIds?.[0] } : {}),
    ...(value.linkedResearchGapId || researchGapId ? { linkedResearchGapId: value.linkedResearchGapId ?? researchGapId } : {}),
  }));
const postQuerySchema = paginationSchema.extend({
  communityId: objectIdSchema.optional(),
  linkedResearchGapId: objectIdSchema.optional(),
  researchGapId: objectIdSchema.optional(),
  type: z.enum(["discussion", "question"]).optional(),
  tag: z.string().trim().min(1).max(80).optional(),
});
const idParamsSchema = z.object({ id: objectIdSchema });
const postIdParamsSchema = z.object({ postId: objectIdSchema });
const acceptParamsSchema = z.object({ postId: objectIdSchema, commentId: objectIdSchema });
const commentSchema = z.object({
  content: z.string().trim().min(1).max(10000).optional(),
  body: z.string().trim().min(1).max(10000).optional(),
  parentCommentId: objectIdSchema.optional(),
  references: z.array(referenceSchema).max(30).default([]),
}).strict().refine((value) => value.content || value.body, "Comment content is required")
  .transform(({ body, content, ...value }) => ({ ...value, content: content ?? body! }));
const commentUpdateSchema = z.object({
  content: z.string().trim().min(1).max(10000),
  references: z.array(referenceSchema).max(30).optional(),
}).strict();
const voteSchema = z.object({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }).strict();
const moderatePostSchema = z.object({ status: z.enum(["active", "hidden", "locked", "deleted"]) }).strict();
const moderateCommentSchema = z.object({ status: z.enum(["active", "hidden"]) }).strict();
const reportSchema = z.object({
  targetType: z.enum(["post", "comment"]),
  targetId: objectIdSchema,
  reason: z.enum(["spam", "harassment", "misinformation", "copyright", "off_topic", "other"]),
  description: z.string().trim().max(2000).optional(),
}).strict();
const communityParamsSchema = z.object({ communityId: objectIdSchema });
const reviewReportSchema = z.object({
  status: z.enum(["reviewed", "resolved", "dismissed"]),
  moderationNote: z.string().trim().max(2000).optional(),
}).strict();

const forumWriteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous",
});
const validatePostInput = validate(postInputSchema as unknown as z.ZodSchema<unknown>);
const validatePostUpdate = validate(postUpdateSchema as unknown as z.ZodSchema<unknown>);
const validateCommentInput = validate(commentSchema as unknown as z.ZodSchema<unknown>);

export const forumRouter: Router = Router();
forumRouter.get("/posts", optionalAuth, validate(postQuerySchema, "query"), async (req, res) => {
  const { page, pageSize, researchGapId, linkedResearchGapId, ...filter } = req.query as unknown as z.infer<typeof postQuerySchema>;
  res.json({
    success: true,
    ...(await forumService.listPosts(
      { ...filter, linkedResearchGapId: linkedResearchGapId ?? researchGapId },
      page,
      pageSize,
      req.user?.sub,
      req.user?.role,
    )),
  });
});
forumRouter.post("/posts", requireAuth, requirePermission("forum:write"), forumWriteLimiter, validatePostInput, async (req, res) => {
  res.status(201).json({ success: true, data: await forumService.createPost(req.body, req.user!.sub) });
});
forumRouter.get("/posts/:id", optionalAuth, validate(idParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await forumService.getPost(req.params.id as string, req.user?.sub, req.user?.role) });
});
forumRouter.patch("/posts/:id", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), validatePostUpdate, async (req, res) => {
  res.json({ success: true, data: await forumService.updatePost(req.params.id as string, req.body, req.user!.sub) });
});
forumRouter.delete("/posts/:id", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), async (req, res) => {
  await forumService.deletePost(req.params.id as string, req.user!.sub, req.user!.role);
  res.json({ success: true, data: { deleted: true } });
});
forumRouter.patch("/posts/:id/moderation", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), validate(moderatePostSchema), async (req, res) => {
  res.json({ success: true, data: await forumService.moderatePost(req.params.id as string, req.body.status, req.user!.sub, req.user!.role) });
});
forumRouter.get("/posts/:postId/comments", optionalAuth, validate(postIdParamsSchema, "params"), validate(paginationSchema, "query"), async (req, res) => {
  const { page, pageSize } = req.query as unknown as z.infer<typeof paginationSchema>;
  res.json({ success: true, ...(await forumService.listComments(req.params.postId as string, page, pageSize, req.user?.sub, req.user?.role)) });
});
forumRouter.post("/posts/:postId/comments", requireAuth, forumWriteLimiter, validate(postIdParamsSchema, "params"), validateCommentInput, async (req, res) => {
  res.status(201).json({ success: true, data: await forumService.addComment(req.params.postId as string, req.body, req.user!.sub) });
});
forumRouter.patch("/comments/:id", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), validate(commentUpdateSchema), async (req, res) => {
  res.json({ success: true, data: await forumService.updateComment(req.params.id as string, req.body, req.user!.sub) });
});
forumRouter.delete("/comments/:id", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), async (req, res) => {
  await forumService.deleteComment(req.params.id as string, req.user!.sub, req.user!.role);
  res.json({ success: true, data: { deleted: true } });
});
forumRouter.patch("/comments/:id/moderation", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), validate(moderateCommentSchema), async (req, res) => {
  res.json({ success: true, data: await forumService.moderateComment(req.params.id as string, req.body.status, req.user!.sub, req.user!.role) });
});
forumRouter.post("/posts/:postId/accepted-answer/:commentId", requireAuth, forumWriteLimiter, validate(acceptParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await forumService.acceptAnswer(req.params.postId as string, req.params.commentId as string, req.user!.sub) });
});
forumRouter.post("/posts/:id/vote", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), validate(voteSchema), async (req, res) => {
  res.json({ success: true, data: await forumService.vote("post", req.params.id as string, req.body.value, req.user!.sub, req.user!.role) });
});
forumRouter.post("/comments/:id/vote", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), validate(voteSchema), async (req, res) => {
  res.json({ success: true, data: await forumService.vote("comment", req.params.id as string, req.body.value, req.user!.sub, req.user!.role) });
});
forumRouter.post("/reports", requireAuth, forumWriteLimiter, validate(reportSchema), async (req, res) => {
  const { targetType, targetId, ...input } = req.body;
  res.status(201).json({ success: true, data: await forumService.report(targetType, targetId, input, req.user!.sub) });
});
forumRouter.get("/communities/:communityId/reports", requireAuth, validate(communityParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await forumService.listReports(req.params.communityId as string, req.user!.sub, req.user!.role) });
});
forumRouter.patch("/reports/:id", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), validate(reviewReportSchema), async (req, res) => {
  res.json({ success: true, data: await forumService.reviewReport(req.params.id as string, req.body, req.user!.sub, req.user!.role) });
});

export const gapDiscussionRouter: Router = Router();
gapDiscussionRouter.post("/:id/discussions", requireAuth, requirePermission("forum:write"), forumWriteLimiter, validate(idParamsSchema, "params"), validatePostInput, async (req, res) => {
  res.status(201).json({
    success: true,
    data: await forumService.createPost({ ...req.body, linkedResearchGapId: req.params.id as string }, req.user!.sub),
  });
});
