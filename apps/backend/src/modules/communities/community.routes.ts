import { Router } from "express";
import { z } from "zod";
import { optionalAuth, requireAuth } from "../../common/middleware/auth.js";
import { requirePermission } from "../../common/middleware/permission.js";
import { validate } from "../../common/middleware/validate.js";
import { objectIdSchema, paginationSchema } from "../../common/validation/database-id.js";
import { communityService } from "./community.service.js";
import { requireCapability } from "../authorization/authorization.middleware.js";

const communityInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  rules: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  researchTopics: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
});
const communityUpdateSchema = communityInputSchema.partial().refine((value) => Object.keys(value).length > 0);
const idParamsSchema = z.object({ id: objectIdSchema });
const lookupParamsSchema = z.object({ idOrSlug: z.string().trim().min(1).max(120) });
const memberParamsSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });
const updateMemberSchema = z.object({
  role: z.enum(["moderator", "member"]).optional(),
  status: z.enum(["pending", "active", "declined", "banned"]).optional(),
}).refine((value) => value.role !== undefined || value.status !== undefined);

export const communityRouter: Router = Router();
communityRouter.get("/", optionalAuth, validate(paginationSchema, "query"), async (req, res) => {
  const { page, pageSize } = req.query as unknown as z.infer<typeof paginationSchema>;
  res.json({ success: true, ...(await communityService.list(req.user?.sub, page, pageSize, req.user?.role)) });
});
communityRouter.post("/", requireAuth, requireCapability("BASIC_RESEARCH"), validate(communityInputSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await communityService.create(req.body, req.user!.sub) });
});
communityRouter.get("/:idOrSlug", optionalAuth, validate(lookupParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await communityService.get(req.params.idOrSlug as string, req.user?.sub, req.user?.role) });
});
communityRouter.patch("/:id", requireAuth, validate(idParamsSchema, "params"), validate(communityUpdateSchema), async (req, res) => {
  res.json({ success: true, data: await communityService.update(req.params.id as string, req.body, req.user!.sub, req.user!.role) });
});
communityRouter.post("/:id/join", requireAuth, requirePermission("community:join"), validate(idParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await communityService.join(req.params.id as string, req.user!.sub) });
});
communityRouter.delete("/:id/membership", requireAuth, validate(idParamsSchema, "params"), async (req, res) => {
  await communityService.leave(req.params.id as string, req.user!.sub);
  res.json({ success: true, data: { deleted: true } });
});
communityRouter.get("/:id/members", requireAuth, validate(idParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await communityService.listMembers(req.params.id as string, req.user!.sub, req.user!.role) });
});
communityRouter.patch("/:id/members/:userId", requireAuth, validate(memberParamsSchema, "params"), validate(updateMemberSchema), async (req, res) => {
  res.json({
    success: true,
    data: await communityService.updateMember(
      req.params.id as string,
      req.params.userId as string,
      req.body,
      req.user!.sub,
      req.user!.role,
    ),
  });
});
