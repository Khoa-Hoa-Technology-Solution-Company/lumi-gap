import { Router } from "express";
import { z } from "zod";
import { validate } from "../../common/middleware/validate.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { databaseIdSchema } from "../../common/validation/database-id.js";
import { mentorshipApplicationsService as applications } from "./mentorship-applications.service.js";
import { applicationPageSchema, mentorshipApplicationSchema, applicationActionSchema, applicationNoteSchema } from "./dto/mentorship-application.schema.js";

export const mentorshipApplicationsRouter = Router({ mergeParams: true });
const params = z.object({ id: databaseIdSchema });
const item = params.extend({ applicationId: z.string().uuid() });
const limit = createRateLimiter("projects:mentorshipApplications", { windowMs: 3600000, limit: 60, keyGenerator: req => req.user!.sub, standardHeaders: true, legacyHeaders: false });
mentorshipApplicationsRouter.use((_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
mentorshipApplicationsRouter.get("/", validate(params, "params"), validate(applicationPageSchema, "query"), async (req, res) => res.json({ success: true, data: await applications.list(String(req.params.id), req.user!.sub, req.query) }));
mentorshipApplicationsRouter.post("/", limit, validate(params, "params"), validate(mentorshipApplicationSchema), async (req, res) => res.status(201).json({ success: true, data: await applications.apply(String(req.params.id), req.user!.sub, req.body) }));
mentorshipApplicationsRouter.get("/:applicationId", validate(item, "params"), async (req, res) => res.json({ success: true, data: await applications.detail(String(req.params.id), String(req.params.applicationId), req.user!.sub) }));
mentorshipApplicationsRouter.post("/:applicationId/action", limit, validate(item, "params"), validate(applicationActionSchema), async (req, res) => res.json({ success: true, data: await applications.action(String(req.params.id), String(req.params.applicationId), req.user!.sub, req.body) }));
mentorshipApplicationsRouter.post("/:applicationId/notes", limit, validate(item, "params"), validate(applicationNoteSchema), async (req, res) => res.status(201).json({ success: true, data: await applications.note(String(req.params.id), String(req.params.applicationId), req.user!.sub, req.body) }));
