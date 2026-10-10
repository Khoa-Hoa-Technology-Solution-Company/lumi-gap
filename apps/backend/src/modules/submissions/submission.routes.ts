import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../common/middleware/auth.js";
import { requireResearchWorkflow } from "../authorization/authorization.middleware.js";
import { requirePermission } from "../../common/middleware/permission.js";
import { uploadSinglePdf, assertPdfMagic } from "../../common/middleware/upload.js";
import { validate } from "../../common/middleware/validate.js";
import { objectIdSchema } from "../../common/validation/database-id.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { submissionService } from "./submission.service.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";

const submissionParamsSchema = z.object({ id: objectIdSchema });
const revisionParamsSchema = z.object({ id: objectIdSchema, revisionId: objectIdSchema });
const assignmentParamsSchema = z.object({ id: objectIdSchema, assignmentId: objectIdSchema });
const createSchema = z.object({
  projectId: objectIdSchema,
  title: z.string().trim().min(3).max(300),
  abstract: z.string().trim().max(10000).optional(),
  submissionType: z.enum(["RESEARCH_PROPOSAL", "LITERATURE_REVIEW", "THESIS_DRAFT", "RESEARCH_PAPER", "SOFTWARE_RESEARCH_PROJECT"]).optional(),
  researchField: z.string().trim().max(200).optional(),
  researchGoal: z.string().trim().max(5000).optional(),
  researchQuestions: z.array(z.string().trim().min(1).max(1000)).max(20).optional(),
  claimedResearchGap: z.string().trim().max(5000).optional(),
  claimedContribution: z.string().trim().max(5000).optional(),
  methodology: z.string().trim().max(5000).optional(),
  scope: z.string().trim().max(5000).optional(),
  keywords: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  expectedReviewWorkload: z.string().trim().max(160).optional(),
  authorIds: z.array(objectIdSchema).max(100).optional(),
  declaredConflictUserIds: z.array(objectIdSchema).max(100).optional(),
});
const revisionSchema = z.object({ responseToReview: z.string().trim().max(20000).optional() });
const assignSchema = z.object({
  reviewerId: objectIdSchema,
  dueAt: z.coerce.date().optional(),
  enforceInstitutionConflict: z.boolean().optional(),
});
// Reviews are submitted as structured human reviews (/reviews); an assignment only accepts, declines or cancels.
const updateAssignmentSchema = z.object({
  status: z.enum(["accepted", "declined", "completed", "cancelled"]),
  /** Optional reason when declining. */
  reviewText: z.string().trim().min(1).max(20000).optional(),
}).strict();

/**
 * The reviewer-assignment endpoints predate review requests and only forward to them.
 * No client uses them; mark them deprecated so new callers use /review-requests.
 */
function deprecatedForReviewRequests(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Deprecation", "true");
  res.setHeader("Link", '</api/v1/review-requests>; rel="successor-version"');
  next();
}

function uploadedPdf(req: Request) {
  const file = (req as Request & {
    file?: { buffer: Buffer; originalname: string; size: number };
  }).file;
  if (!file) throw AppError.badRequest("PDF file is required");
  assertPdfMagic(file.buffer);
  return { buffer: file.buffer, originalname: file.originalname, size: file.size };
}

function parseArrayFields(body: Record<string, unknown>) {
  const copy = { ...body };
  for (const key of ["authorIds", "declaredConflictUserIds", "researchQuestions", "keywords"] as const) {
    if (typeof copy[key] === "string") {
      try {
        copy[key] = JSON.parse(copy[key] as string);
      } catch {
        throw AppError.badRequest(`${key} must be a JSON array`);
      }
    }
  }
  return copy;
}

export const submissionRouter: Router = Router();
submissionRouter.use(requireAuth, requireResearchWorkflow);

const aiPreReviewLimiter = createRateLimiter("submissions:aiPreReviewLimiter", {
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous",
});

submissionRouter.get("/reviewer-assignments/me", deprecatedForReviewRequests, requirePermission("submission:review"), async (req, res) => {
  res.json({ success: true, data: await submissionService.listMyAssignments(req.user!.sub) });
});

submissionRouter.get("/", async (req, res) => {
  res.json({ success: true, data: await submissionService.listMine(req.user!.sub, req.user!.role) });
});

submissionRouter.post("/", requirePermission("submission:create"), uploadSinglePdf, async (req, res) => {
  const parsed = createSchema.safeParse(parseArrayFields(req.body));
  if (!parsed.success) throw parsed.error;
  const data = await submissionService.create(parsed.data, uploadedPdf(req), req.user!.sub, req.user!.role);
  res.status(201).json({ success: true, data });
});

submissionRouter.get("/:id", validate(submissionParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await submissionService.get(String(req.params.id), req.user!.sub, req.user!.role) });
});

submissionRouter.get("/:id/history", validate(submissionParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await submissionService.history(String(req.params.id), req.user!.sub, req.user!.role) });
});
submissionRouter.patch("/:id/open-review", validate(submissionParamsSchema, "params"), validate(z.object({ enabled: z.boolean() }).strict()), async (req, res) => {
  await submissionService.setOpenForReview(String(req.params.id), req.body.enabled, req.user!.sub, req.user!.role);
  res.status(204).send();
});
submissionRouter.post("/:id/versions", validate(submissionParamsSchema, "params"), validate(z.object({
  content: z.string().trim().min(1).max(500000).optional(), sourceRevisionId: objectIdSchema.optional(),
  expectedRevisionNumber: z.number().int().min(1), summary: z.string().trim().min(3).max(20000),
}).strict().refine((value) => value.content !== undefined || Boolean(value.sourceRevisionId), "Provide content or a source revision")), async (req, res) => {
  const data = await submissionService.createVersion(String(req.params.id), req.body, req.user!.sub, req.user!.role);
  res.status(201).json({ success: true, data });
});

submissionRouter.post("/:id/revisions", requirePermission("submission:revise"), validate(submissionParamsSchema, "params"), uploadSinglePdf, async (req, res) => {
  const parsed = revisionSchema.safeParse(req.body);
  if (!parsed.success) throw parsed.error;
  const data = await submissionService.addRevision(String(req.params.id), parsed.data.responseToReview, uploadedPdf(req), req.user!.sub, req.user!.role);
  res.status(201).json({ success: true, data });
});

submissionRouter.get("/:id/revisions", validate(submissionParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await submissionService.listRevisions(String(req.params.id), req.user!.sub, req.user!.role) });
});

submissionRouter.get("/:id/ai-pre-reviews", validate(submissionParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await submissionService.listAiPreReviews(String(req.params.id), req.user!.sub, req.user!.role) });
});

/** 202 Accepted — the ai-jobs worker runs the pre-review; poll GET /:id/ai-pre-reviews for the result. */
submissionRouter.post("/:id/ai-pre-review", aiPreReviewLimiter, validate(submissionParamsSchema, "params"), async (req, res) => {
  const data = await submissionService.runAiPreReview(String(req.params.id), req.user!.sub, req.user!.role);
  res.status(202).json({ success: true, data });
});

submissionRouter.get("/:id/revisions/:revisionId/download", validate(revisionParamsSchema, "params"), async (req, res) => {
  const result = await submissionService.resolveDownload(String(req.params.id), String(req.params.revisionId), req.user!.sub, req.user!.role);
  if (result.kind === "redirect") {
    res.redirect(result.url);
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.sendFile(result.path);
});

submissionRouter.post("/:id/reviewer-assignments", deprecatedForReviewRequests, requirePermission("review:assign"), validate(submissionParamsSchema, "params"), validate(assignSchema), async (req, res) => {
  const data = await submissionService.assignReviewer(String(req.params.id), req.body, req.user!.sub);
  res.status(201).json({ success: true, data });
});

submissionRouter.get("/:id/reviewer-assignments", deprecatedForReviewRequests, requirePermission("review:assign"), validate(submissionParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await submissionService.listAssignments(String(req.params.id)) });
});

submissionRouter.patch("/:id/reviewer-assignments/:assignmentId", deprecatedForReviewRequests, requirePermission("submission:review"), validate(assignmentParamsSchema, "params"), validate(updateAssignmentSchema), async (req, res) => {
  res.json({
    success: true,
    data: await submissionService.updateAssignment(
      String(req.params.id),
      String(req.params.assignmentId),
      req.body,
      req.user!.sub,
      req.user!.role,
    ),
  });
});

submissionRouter.get("/:id/reviewer-view", requirePermission("submission:review"), validate(submissionParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await submissionService.getReviewerView(String(req.params.id), req.user!.sub, req.user!.role) });
});
