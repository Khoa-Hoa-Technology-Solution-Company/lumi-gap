import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../common/middleware/auth.js";
import { requirePermission } from "../../common/middleware/permission.js";
import { validate } from "../../common/middleware/validate.js";
import { objectIdSchema, paginationSchema } from "../../common/validation/mongo.js";
import { recruitmentService } from "./recruitment.service.js";

const openingInputSchema = z.object({
  projectId: objectIdSchema,
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(1).max(10000),
  requirements: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
  capacity: z.number().int().min(1).max(100).optional(),
  closesAt: z.coerce.date().optional(),
});
const openingUpdateSchema = openingInputSchema.omit({ projectId: true }).partial().extend({
  status: z.enum(["open", "closed", "archived"]).optional(),
  closesAt: z.coerce.date().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0);
const listOpeningSchema = paginationSchema.extend({ projectId: objectIdSchema.optional() });
const idParamsSchema = z.object({ id: objectIdSchema });
const applicationParamsSchema = z.object({ id: objectIdSchema, applicationId: objectIdSchema });
const applicationInputSchema = z.object({
  coverLetter: z.string().trim().min(1).max(10000),
  skills: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
});
const decisionSchema = z.object({ status: z.enum(["shortlisted", "accepted", "rejected"]) });

export const recruitmentRouter: Router = Router();
recruitmentRouter.use(requireAuth);
recruitmentRouter.get("/", requirePermission("recruitment:read"), validate(listOpeningSchema, "query"), async (req, res) => {
  const { page, pageSize, projectId } = req.query as unknown as z.infer<typeof listOpeningSchema>;
  res.json({ success: true, ...(await recruitmentService.listOpenings(page, pageSize, projectId)) });
});
recruitmentRouter.post("/", requirePermission("recruitment:manage"), validate(openingInputSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await recruitmentService.createOpening(req.body, req.user!.sub, req.user!.role) });
});
recruitmentRouter.patch("/:id", requirePermission("recruitment:manage"), validate(idParamsSchema, "params"), validate(openingUpdateSchema), async (req, res) => {
  res.json({ success: true, data: await recruitmentService.updateOpening(req.params.id as string, req.body, req.user!.sub, req.user!.role) });
});
recruitmentRouter.post("/:id/applications", requirePermission("recruitment:apply"), validate(idParamsSchema, "params"), validate(applicationInputSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await recruitmentService.apply(req.params.id as string, req.body, req.user!.sub) });
});
recruitmentRouter.get("/:id/applications", requirePermission("recruitment:manage"), validate(idParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await recruitmentService.listApplications(req.params.id as string, req.user!.sub, req.user!.role) });
});
recruitmentRouter.patch("/:id/applications/:applicationId", requirePermission("recruitment:manage"), validate(applicationParamsSchema, "params"), validate(decisionSchema), async (req, res) => {
  res.json({ success: true, data: await recruitmentService.decideApplication(
    req.params.id as string,
    req.params.applicationId as string,
    req.body.status,
    req.user!.sub,
    req.user!.role,
  ) });
});
recruitmentRouter.delete("/:id/applications/:applicationId", requirePermission("recruitment:apply"), validate(applicationParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await recruitmentService.withdraw(
    req.params.id as string,
    req.params.applicationId as string,
    req.user!.sub,
  ) });
});
