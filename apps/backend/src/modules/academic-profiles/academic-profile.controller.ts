import type { Request, Response } from "express";
import { VerificationListQuerySchema } from "./dto/academic-profile.schema.js";
import { academicProfileService } from "./academic-profile.service.js";

export const academicProfileController = {
  async mine(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.getMine(req.user!.sub) });
  },
  async updateMine(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.updateMine(req.user!.sub, req.body) });
  },
  async publicProfile(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.getPublic(req.params.userId as string) });
  },
  async requestVerification(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.requestVerification(req.user!.sub) });
  },
  async listVerificationRequests(req: Request, res: Response) {
    const query = VerificationListQuerySchema.parse(req.query);
    const result = await academicProfileService.listVerificationRequests(query.status, query.page, query.pageSize);
    res.json({ success: true, ...result });
  },
  async decideVerification(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.decideVerification(req.params.profileId as string, req.body, req.user!.sub) });
  },
};
