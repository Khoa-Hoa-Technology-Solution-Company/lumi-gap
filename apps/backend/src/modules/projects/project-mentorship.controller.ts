import type { Request, Response } from "express";
import { z } from "zod";
import { databaseIdSchema } from "../../common/validation/database-id.js";
import { projectMentorshipService } from "./project-mentorship.service.js";

export const mentorshipParamsSchema = z.object({
  id: databaseIdSchema,
  relationshipId: z.string().uuid(),
});

export const requestMentorshipSchema = z.object({
  mentorUserId: databaseIdSchema,
  message: z.string().trim().min(1).max(1000),
  idempotencyKey: z.string().uuid().optional(),
}).strict();

export const academicSearchSchema = z.object({
  q: z.string().trim().max(160).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(10),
  institution: z.string().trim().max(200).optional(),
  area: z.string().trim().max(120).optional(), interest: z.string().trim().max(120).optional(),
  position: z.string().trim().max(160).optional(),
}).strict();
export const mentorshipOfferSchema = requestMentorshipSchema.omit({ mentorUserId: true });

export const respondMentorshipSchema = z.object({
  note: z.string().trim().max(1000).optional(),
}).strict();

export const projectMentorshipController = {
  async list(req: Request, res: Response) {
    const data = await projectMentorshipService.list(req.params.id as string, req.user!.sub, academicSearchSchema.parse(req.query));
    res.json({ success: true, data });
  },

  async request(req: Request, res: Response) {
    const data = await projectMentorshipService.request(req.params.id as string, req.user!.sub, req.body);
    res.status(201).json({ success: true, data });
  },

  async accept(req: Request, res: Response) {
    const data = await projectMentorshipService.accept(
      req.params.id as string,
      req.params.relationshipId as string,
      req.user!.sub,
      req.body.note,
    );
    res.json({ success: true, data });
  },

  async decline(req: Request, res: Response) {
    const data = await projectMentorshipService.decline(
      req.params.id as string,
      req.params.relationshipId as string,
      req.user!.sub,
      req.body.note,
    );
    res.json({ success: true, data });
  },

  async end(req: Request, res: Response) {
    const data = await projectMentorshipService.end(
      req.params.id as string,
      req.params.relationshipId as string,
      req.user!.sub,
      req.body.note,
    );
    res.json({ success: true, data });
  },
};
