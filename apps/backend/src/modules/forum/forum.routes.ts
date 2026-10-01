import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { optionalAuth, requireAuth } from "../../common/middleware/auth.js";
import { requirePermission } from "../../common/middleware/permission.js";
import { validate } from "../../common/middleware/validate.js";
import { objectIdSchema, paginationSchema } from "../../common/validation/database-id.js";
import { forumService } from "./forum.service.js";
import { isAllowedForumUrl, isValidForumDoi } from "./forum.rules.js";

const referenceSchema = z.object({
  paperId: objectIdSchema.optional(),
  doi: z.string().trim().toLowerCase().max(300).refine(isValidForumDoi, "Enter a valid DOI").optional(),
  url: z.string().url().max(1000).refine(isAllowedForumUrl, "Only HTTP or HTTPS URLs without embedded credentials are allowed").optional(),
  title: z.string().trim().max(500).optional(),
  authors: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  year: z.number().int().min(1000).max(new Date().getFullYear() + 1).optional(),
}).strict().refine((value) => Object.values(value).some(Boolean), "A reference cannot be empty")
  .refine((value) => Boolean(value.paperId || (value.doi && value.title)), "A DOI citation requires confirmed title metadata");

const postBaseSchema = z.object({
  type: z.enum(["QUESTION", "DISCUSSION", "PAPER_DISCUSSION", "RESEARCH_GAP_DISCUSSION"]).default("DISCUSSION"),
  title: z.string().trim().min(3).max(240),
  content: z.string().trim().min(1).max(20000).optional(),
  body: z.string().trim().min(1).max(20000).optional(),
  communityId: objectIdSchema,
  tags: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
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
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(20),
  // Read filters accept stable slugs; write contracts still require database IDs.
  communityId: z.union([objectIdSchema, z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]).optional(),
  linkedResearchGapId: objectIdSchema.optional(),
  researchGapId: objectIdSchema.optional(),
  linkedPaperId: objectIdSchema.optional(),
  type: z.enum(["QUESTION", "DISCUSSION", "PAPER_DISCUSSION", "RESEARCH_GAP_DISCUSSION"]).optional(),
  tag: z.string().trim().min(1).max(80).optional(),
  query: z.string().trim().min(1).max(240).optional(),
  sort: z.enum(["latest", "popular", "unanswered", "following"]).default("latest"),
  feed: z.enum(["latest", "popular", "unanswered", "following"]).optional(),
  includeModerated: z.enum(["true", "false"]).optional(),
});
const commentsPaginationSchema = paginationSchema.extend({
  pageSize: z.coerce.number().int().min(1).max(30).default(25),
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
const moderatePostSchema = z.object({ action: z.enum(["THREAD_PINNED", "THREAD_UNPINNED", "THREAD_LOCKED", "THREAD_UNLOCKED", "THREAD_HIDDEN", "THREAD_RESTORED"]), reason: z.string().trim().min(3).max(2000).optional() }).strict();
const moderateCommentSchema = z.object({ action: z.enum(["RESPONSE_HIDDEN", "RESPONSE_RESTORED"]), reason: z.string().trim().min(3).max(2000).optional() }).strict();
const reportSchema = z.object({
  targetType: z.enum(["post", "comment"]),
  targetId: objectIdSchema,
  reason: z.enum(["SPAM", "OFF_TOPIC", "HARASSMENT", "PLAGIARISM_OR_COPYRIGHT", "INAPPROPRIATE_CONTENT", "OTHER"]),
  description: z.string().trim().max(2000).optional(),
}).strict();
const communityParamsSchema = z.object({ communityId: objectIdSchema });
const reviewReportSchema = z.object({
  status: z.enum(["reviewed", "resolved", "dismissed"]),
  moderationNote: z.string().trim().max(2000).optional(),
}).strict();
const moderationQueueQuerySchema = z.object({
  communityId: objectIdSchema.optional(),
  status: z.enum(["open", "reviewed", "resolved", "dismissed", "all"]).default("open"),
}).strict();
const moderationHistoryQuerySchema = z.object({ communityId: objectIdSchema.optional() }).strict();
const reviewEvidenceParamsSchema = z.object({ id: objectIdSchema, referenceId: objectIdSchema });
const reviewEvidenceOptionsQuerySchema = z.object({ projectId: objectIdSchema.optional() }).strict();
const reviewAsEvidenceSchema = z.object({
  projectId: objectIdSchema.optional(),
  screeningStatus: z.enum(["UNDECIDED", "INCLUDED", "EXCLUDED"]).optional(),
  exclusionReason: z.enum(["WRONG_RESEARCH_TOPIC", "WRONG_POPULATION_CONTEXT", "WRONG_METHODOLOGY", "NOT_PEER_REVIEWED", "INSUFFICIENT_RELEVANT_EVIDENCE", "DUPLICATE", "OTHER"]).optional(),
  exclusionNote: z.string().trim().max(2000).optional(),
  relation: z.enum(["SUPPORTING", "COUNTER", "RELATED"]).optional(),
  evidenceType: z.string().trim().max(120).optional(),
  excerpt: z.string().trim().max(5000).optional(),
  evidenceSelections: z.array(z.object({ evidenceType: z.string().trim().min(2).max(120), excerpt: z.string().trim().min(2).max(5000) }).strict()).min(1).max(20).optional(),
  explanation: z.string().trim().max(5000).optional(),
  confirmRelation: z.boolean().optional(),
}).strict();

const forumWriteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous",
});
const threadCreateLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous" });
const responseLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous" });
const voteLimiter = rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous" });
const reportLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 8, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous" });
const validatePostInput = validate(postInputSchema as unknown as z.ZodSchema<unknown>);
const validatePostUpdate = validate(postUpdateSchema as unknown as z.ZodSchema<unknown>);
const validateCommentInput = validate(commentSchema as unknown as z.ZodSchema<unknown>);

const FORUM_VIEW_COOKIE = "lumigap_forum_viewer";
function forumViewerKey(req: Request, res: Response) {
  if (req.user?.sub) return `user:${req.user.sub}`;
  const cookieHeader = req.headers.cookie ?? "";
  const token = cookieHeader.split(";").map((part: string) => part.trim()).find((part: string) => part.startsWith(`${FORUM_VIEW_COOKIE}=`))?.slice(FORUM_VIEW_COOKIE.length + 1);
  if (token && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(token)) return `anon:${token.toLowerCase()}`;
  const nextToken = randomUUID();
  let crossSite = false;
  try {
    const origin = req.get("origin");
    crossSite = Boolean(origin && new URL(origin).hostname !== req.hostname);
  } catch { /* Invalid Origin must not turn a public topic read into a server error. */ }
  const sameSite = crossSite && req.secure ? "None" : "Lax";
  res.setHeader("Set-Cookie", `${FORUM_VIEW_COOKIE}=${nextToken}; Path=/; Max-Age=31536000; HttpOnly; SameSite=${sameSite}${req.secure ? "; Secure" : ""}`);
  return `anon:${nextToken}`;
}

export const forumRouter: Router = Router();
forumRouter.get("/posts", optionalAuth, validate(postQuerySchema, "query"), async (req, res) => {
  const { page, pageSize, researchGapId, linkedResearchGapId, includeModerated, feed, ...filter } = req.query as unknown as z.infer<typeof postQuerySchema>;
  res.json({
    success: true,
    ...(await forumService.listPosts(
      { ...filter, sort: feed ?? filter.sort, linkedResearchGapId: linkedResearchGapId ?? researchGapId, includeModerated: includeModerated === "true" },
      page,
      pageSize,
      req.user?.sub,
      req.user?.role,
    )),
  });
});
forumRouter.post("/posts", requireAuth, requirePermission("forum:write"), threadCreateLimiter, validatePostInput, async (req, res) => {
  res.status(201).json({ success: true, data: await forumService.createPost(req.body, req.user!.sub) });
});
forumRouter.get("/posts/:id", optionalAuth, validate(idParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await forumService.getPost(req.params.id as string, req.user?.sub, req.user?.role, forumViewerKey(req, res)) });
});
forumRouter.patch("/posts/:id", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), validatePostUpdate, async (req, res) => {
  res.json({ success: true, data: await forumService.updatePost(req.params.id as string, req.body, req.user!.sub) });
});
forumRouter.delete("/posts/:id", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), async (req, res) => {
  await forumService.deletePost(req.params.id as string, req.user!.sub, req.user!.role);
  res.json({ success: true, data: { deleted: true } });
});
forumRouter.patch("/posts/:id/moderation", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), validate(moderatePostSchema), async (req, res) => {
  res.json({ success: true, data: await forumService.moderatePost(req.params.id as string, req.body.action, req.body.reason, req.user!.sub, req.user!.role) });
});
forumRouter.get("/posts/:postId/comments", optionalAuth, validate(postIdParamsSchema, "params"), validate(commentsPaginationSchema, "query"), async (req, res) => {
  const { page, pageSize } = req.query as unknown as z.infer<typeof commentsPaginationSchema>;
  res.json({ success: true, ...(await forumService.listComments(req.params.postId as string, page, pageSize, req.user?.sub, req.user?.role)) });
});
forumRouter.post("/posts/:postId/comments", requireAuth, responseLimiter, validate(postIdParamsSchema, "params"), validateCommentInput, async (req, res) => {
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
  res.json({ success: true, data: await forumService.moderateComment(req.params.id as string, req.body.action, req.body.reason, req.user!.sub, req.user!.role) });
});
forumRouter.post("/posts/:postId/accepted-answer/:commentId", requireAuth, forumWriteLimiter, validate(acceptParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await forumService.acceptAnswer(req.params.postId as string, req.params.commentId as string, req.user!.sub) });
});
forumRouter.delete("/posts/:postId/accepted-answer", requireAuth, forumWriteLimiter, validate(postIdParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await forumService.acceptAnswer(req.params.postId as string, undefined, req.user!.sub) });
});
forumRouter.put("/posts/:id/follow", requireAuth, validate(idParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await forumService.follow(req.params.id as string, req.user!.sub, true, req.user!.role) });
});
forumRouter.delete("/posts/:id/follow", requireAuth, validate(idParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await forumService.follow(req.params.id as string, req.user!.sub, false, req.user!.role) });
});
forumRouter.get("/context", requireAuth, validate(z.object({ q: z.string().trim().max(160).optional() }).strict(), "query"), async (req, res) => {
  res.json({ success: true, data: await forumService.contextOptions(req.user!.sub, String(req.query.q ?? "") || undefined) });
});
forumRouter.post("/context/gaps/:id/share", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await forumService.makeGapShareable(req.params.id as string, req.user!.sub) });
});
forumRouter.post("/posts/:id/vote", requireAuth, voteLimiter, validate(idParamsSchema, "params"), validate(voteSchema), async (req, res) => {
  res.json({ success: true, data: await forumService.vote("post", req.params.id as string, req.body.value, req.user!.sub, req.user!.role) });
});
forumRouter.post("/comments/:id/vote", requireAuth, voteLimiter, validate(idParamsSchema, "params"), validate(voteSchema), async (req, res) => {
  res.json({ success: true, data: await forumService.vote("comment", req.params.id as string, req.body.value, req.user!.sub, req.user!.role) });
});
forumRouter.post("/reports", requireAuth, reportLimiter, validate(reportSchema), async (req, res) => {
  const { targetType, targetId, ...input } = req.body;
  res.status(201).json({ success: true, data: await forumService.report(targetType, targetId, input, req.user!.sub) });
});
forumRouter.get("/reports", requireAuth, validate(moderationQueueQuerySchema, "query"), async (req, res) => {
  const { communityId, status } = req.query as unknown as z.infer<typeof moderationQueueQuerySchema>;
  res.json({ success: true, data: await forumService.listReports(communityId, status, req.user!.sub, req.user!.role) });
});
forumRouter.get("/moderation/actions", requireAuth, validate(moderationHistoryQuerySchema, "query"), async (req, res) => {
  const { communityId } = req.query as unknown as z.infer<typeof moderationHistoryQuerySchema>;
  res.json({ success: true, data: await forumService.listModerationActions(communityId, req.user!.sub, req.user!.role) });
});
forumRouter.get("/communities/:communityId/reports", requireAuth, validate(communityParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await forumService.listReports(req.params.communityId as string, "open", req.user!.sub, req.user!.role) });
});
forumRouter.patch("/reports/:id", requireAuth, forumWriteLimiter, validate(idParamsSchema, "params"), validate(reviewReportSchema), async (req, res) => {
  res.json({ success: true, data: await forumService.reviewReport(req.params.id as string, req.body, req.user!.sub, req.user!.role) });
});

export const gapDiscussionRouter: Router = Router();
gapDiscussionRouter.get("/:id/discussions", requireAuth, validate(idParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await forumService.gapDiscussionContext(req.params.id as string, req.user!.sub, req.user!.role) });
});
gapDiscussionRouter.post("/:id/discussions", requireAuth, requirePermission("forum:write"), threadCreateLimiter, validate(idParamsSchema, "params"), validatePostInput, async (req, res) => {
  res.status(201).json({
    success: true,
    data: await forumService.createPost({ ...req.body, type: "RESEARCH_GAP_DISCUSSION", linkedResearchGapId: req.params.id as string }, req.user!.sub),
  });
});
gapDiscussionRouter.get("/:id/forum-citations/:referenceId/evidence-options", requireAuth, validate(reviewEvidenceParamsSchema, "params"), validate(reviewEvidenceOptionsQuerySchema, "query"), async (req, res) => {
  res.json({ success: true, data: await forumService.forumCitationEvidenceOptions(req.params.id as string, req.params.referenceId as string, (req.query as { projectId?: string }).projectId, req.user!.sub) });
});
gapDiscussionRouter.post("/:id/forum-citations/:referenceId/review-as-evidence", requireAuth, forumWriteLimiter, validate(reviewEvidenceParamsSchema, "params"), validate(reviewAsEvidenceSchema), async (req, res) => {
  res.json({ success: true, data: await forumService.reviewCitationAsEvidence(req.params.id as string, { ...req.body, referenceId: req.params.referenceId as string }, req.user!.sub) });
});
