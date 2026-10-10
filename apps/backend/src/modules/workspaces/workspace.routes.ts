import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../common/middleware/auth.js";
import { requireResearchWorkflow } from "../authorization/authorization.middleware.js";
import { requirePermission } from "../../common/middleware/permission.js";
import { validate } from "../../common/middleware/validate.js";
import { objectIdSchema } from "../../common/validation/database-id.js";
import { workspaceService } from "./workspace.service.js";

const workspaceParamsSchema = z.object({ id: objectIdSchema });
const sectionParamsSchema = z.object({ id: objectIdSchema, sectionId: objectIdSchema });
const commentParamsSchema = z.object({ id: objectIdSchema, commentId: objectIdSchema });
const createSchema = z.object({
  projectId: objectIdSchema,
  name: z.string().trim().min(2).max(160),
  memberIds: z.array(objectIdSchema).max(200).optional(),
});
const createSectionSchema = z.object({
  title: z.string().trim().min(1).max(240),
  content: z.string().max(200000).optional(),
  order: z.number().int().min(0).max(10000).optional(),
});
const updateSectionSchema = z.object({
  expectedVersion: z.number().int().min(1),
  title: z.string().trim().min(1).max(240).optional(),
  content: z.string().max(200000).optional(),
  order: z.number().int().min(0).max(10000).optional(),
  changeSummary: z.string().trim().max(1000).optional(),
}).refine((value) => value.title !== undefined || value.content !== undefined || value.order !== undefined, {
  message: "At least one section field must be updated",
});
const commentSchema = z.object({ body: z.string().trim().min(1).max(5000) });
const updateCommentSchema = z.object({ status: z.enum(["open", "resolved"]) });

export const workspaceRouter: Router = Router();
workspaceRouter.use(requireAuth, requireResearchWorkflow);

workspaceRouter.post("/", requirePermission("workspace:write"), validate(createSchema), async (req, res) => {
  const data = await workspaceService.create(req.body, req.user!.sub, req.user!.role);
  res.status(201).json({ success: true, data });
});
workspaceRouter.get("/:id", requirePermission("workspace:read"), validate(workspaceParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await workspaceService.get(String(req.params.id), req.user!.sub, req.user!.role) });
});
workspaceRouter.post("/:id/sections", requirePermission("workspace:write"), validate(workspaceParamsSchema, "params"), validate(createSectionSchema), async (req, res) => {
  const data = await workspaceService.createSection(String(req.params.id), req.body, req.user!.sub, req.user!.role);
  res.status(201).json({ success: true, data });
});
workspaceRouter.patch("/:id/sections/:sectionId", requirePermission("workspace:write"), validate(sectionParamsSchema, "params"), validate(updateSectionSchema), async (req, res) => {
  res.json({ success: true, data: await workspaceService.updateSection(String(req.params.id), String(req.params.sectionId), req.body, req.user!.sub, req.user!.role) });
});
workspaceRouter.get("/:id/sections/:sectionId/revisions", requirePermission("workspace:read"), validate(sectionParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await workspaceService.listSectionRevisions(String(req.params.id), String(req.params.sectionId), req.user!.sub, req.user!.role) });
});
workspaceRouter.post("/:id/sections/:sectionId/comments", requirePermission("workspace:comment"), validate(sectionParamsSchema, "params"), validate(commentSchema), async (req, res) => {
  const data = await workspaceService.addComment(String(req.params.id), String(req.params.sectionId), req.body.body, req.user!.sub, req.user!.role);
  res.status(201).json({ success: true, data });
});
workspaceRouter.patch("/:id/comments/:commentId", requirePermission("workspace:comment"), validate(commentParamsSchema, "params"), validate(updateCommentSchema), async (req, res) => {
  res.json({ success: true, data: await workspaceService.updateComment(String(req.params.id), String(req.params.commentId), req.body.status, req.user!.sub, req.user!.role) });
});
