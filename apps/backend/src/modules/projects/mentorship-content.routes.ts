import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../../common/middleware/auth.js";
import { requireResearchWorkflow } from "../authorization/authorization.middleware.js";
import { validate } from "../../common/middleware/validate.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { databaseIdSchema } from "../../common/validation/database-id.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { mentorshipContentService as service } from "./mentorship-content.service.js";

export const mentorshipContentRouter = Router();
mentorshipContentRouter.use(requireAuth, requireResearchWorkflow);
const context = z.object({ projectId: databaseIdSchema, direction: z.enum(["PROJECT_TO_LECTURER", "LECTURER_TO_PROJECT"]) }).strict();
const draft = context.extend({ message: z.string().trim().max(1000), mentorRole: z.enum(["PRIMARY", "SECONDARY"]), attachmentIds: z.array(z.string().uuid()).max(5), expectedVersion: z.number().int().min(0) });
const writes = createRateLimiter("projects:mentorship-content", { windowMs: 60_000, limit: 30, keyGenerator: req => req.user!.sub });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 } }).single("file");

mentorshipContentRouter.get("/draft", validate(context, "query"), async (req, res) => {
  const input = context.parse(req.query);
  res.json({ success: true, data: await service.draft(input.projectId, req.user!.sub, input.direction) });
});
mentorshipContentRouter.put("/draft", writes, validate(draft), async (req, res) => {
  const input = draft.parse(req.body);
  res.json({ success: true, data: await service.draft(input.projectId, req.user!.sub, input.direction, input) });
});
mentorshipContentRouter.post("/attachments", writes, validate(context, "query"), upload, async (req, res) => {
  const input = context.parse(req.query);
  if (!req.file) throw AppError.badRequest("Choose a file to attach");
  res.status(201).json({ success: true, data: await service.upload(input.projectId, req.user!.sub, input.direction, req.file) });
});
mentorshipContentRouter.get("/attachments/:attachmentId", validate(z.object({ attachmentId: z.string().uuid() }), "params"), async (req, res) => {
  const file = await service.file(String(req.params.attachmentId), req.user!.sub);
  res.set({ "Content-Type": file.mimeType, "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.fileName).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" });
  res.send(Buffer.from(file.content));
});
