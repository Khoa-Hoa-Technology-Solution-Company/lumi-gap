import type { Request, Response } from "express";
import { LecturerListQuerySchema, VerificationListQuerySchema } from "./dto/academic-profile.schema.js";
import { academicProfileService } from "./academic-profile.service.js";
import { institutionalEmailVerificationService } from "./institutional-email-verification.service.js";
import { academicProfileCoverService } from "./academic-profile-cover.service.js";
import { AppError } from "../../common/exceptions/app-error.js";

export const academicProfileController = {
  async mine(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.getMine(req.user!.sub) });
  },
  async updateMine(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.updateMine(req.user!.sub, req.body) });
  },
  async publicProfile(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.getPublic(req.params.userId as string, req.user?.sub) });
  },
  async publicProfileByHandle(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.getPublicByHandle(req.params.handle as string, req.user?.sub) });
  },
  async setPublicHandle(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.setPublicHandle(req.user!.sub, req.body.handle) });
  },
  async uploadCover(req: Request, res: Response) {
    const file = (req as Request & { file?: { buffer: Buffer } }).file;
    if (!file) throw AppError.badRequest("Choose a cover image first");
    res.json({ success: true, data: await academicProfileCoverService.upload(req.user!.sub, file.buffer) });
  },
  async removeCover(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileCoverService.remove(req.user!.sub) });
  },
  async publicCover(req: Request, res: Response) {
    const location = await academicProfileCoverService.publicLocation(req.params.userId as string, req.user?.sub);
    res.setHeader("Cache-Control", "public, max-age=300");
    if (location.kind === "redirect") {
      res.redirect(302, location.url);
      return;
    }
    res.type("webp").sendFile(location.path);
  },
  async compactProfile(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.getCompact(req.params.userId as string, req.user?.sub) });
  },
  async listLecturers(req: Request, res: Response) {
    const query = LecturerListQuerySchema.parse(req.query);
    const result = await academicProfileService.listLecturers(query);
    res.json({ success: true, ...result });
  },
  async requestVerification(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.requestVerification(req.user!.sub) });
  },
  async verificationStatus(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.getVerificationStatus(req.user!.sub) });
  },
  async institutionalEmailStatus(req: Request, res: Response) {
    res.json({ success: true, data: await institutionalEmailVerificationService.status(req.user!.sub) });
  },
  async requestInstitutionalEmailChallenge(req: Request, res: Response) {
    res.status(202).json({ success: true, data: await institutionalEmailVerificationService.requestChallenge(req.user!.sub) });
  },
  async verifyInstitutionalEmail(req: Request, res: Response) {
    res.json({ success: true, data: await institutionalEmailVerificationService.verifyChallenge(req.user!.sub, req.body.code) });
  },
  async listVerificationRequests(req: Request, res: Response) {
    const query = VerificationListQuerySchema.parse(req.query);
    const result = await academicProfileService.listVerificationRequests(query.status, query.page, query.pageSize);
    res.json({ success: true, ...result });
  },
  async decideVerification(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.decideVerification(req.params.profileId as string, req.body, req.user!.sub) });
  },
  async verificationDetails(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.getVerificationDetails(req.params.profileId as string) });
  },
};
