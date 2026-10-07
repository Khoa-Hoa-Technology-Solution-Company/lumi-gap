import type { Request, Response } from "express";
import { LecturerListQuerySchema, PublicForumActivityQuerySchema, VerificationListQuerySchema } from "./dto/academic-profile.schema.js";
import { publicForumActivity } from "./academic-forum-activity.service.js";
import { academicProfileService } from "./academic-profile.service.js";
import { institutionalEmailVerificationService } from "./institutional-email-verification.service.js";
import { academicProfileCoverService } from "./academic-profile-cover.service.js";
import { academicProfileAvatarService } from "./academic-profile-avatar.service.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { affiliationService } from "../verification/affiliation.service.js";
import { academicIdentityService } from "./academic-identity.service.js";
import { auditService } from "../audit/audit.service.js";

export const academicProfileController = {
  async mine(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.getMine(req.user!.sub) });
  },
  async updateMine(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.updateMine(req.user!.sub, req.body) });
  },
  async listAcademicIdentities(req: Request, res: Response) {
    res.json({ success: true, data: await academicIdentityService.list(req.user!.sub) });
  },
  async createAcademicIdentity(req: Request, res: Response) {
    res.status(201).json({ success: true, data: await academicIdentityService.create(req.user!.sub, req.body) });
  },
  async updateAcademicIdentity(req: Request, res: Response) {
    res.json({ success: true, data: await academicIdentityService.update(req.user!.sub, req.params.identityId as string, req.body) });
  },
  async deleteAcademicIdentity(req: Request, res: Response) {
    await academicIdentityService.remove(req.user!.sub, req.params.identityId as string);
    res.status(204).send();
  },
  async publicProfile(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.getPublic(req.params.userId as string, req.user?.sub) });
  },
  async forumActivity(req: Request, res: Response) {
    const { filter, page } = PublicForumActivityQuerySchema.parse(req.query);
    res.json({ success: true, data: await publicForumActivity(req.params.userId as string, filter, page, req.user?.sub, req.user?.role) });
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
  async uploadAvatar(req: Request, res: Response) {
    const file = (req as Request & { file?: { buffer: Buffer } }).file;
    if (!file) throw AppError.badRequest("Choose a profile photo first");
    res.json({ success: true, data: await academicProfileAvatarService.upload(req.user!.sub, file.buffer) });
  },
  async removeAvatar(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileAvatarService.remove(req.user!.sub) });
  },
  async publicAvatar(req: Request, res: Response) {
    const location = await academicProfileAvatarService.publicLocation(req.params.userId as string, req.user?.sub);
    res.setHeader("Cache-Control", "public, max-age=300");
    if (location.kind === "redirect") {
      res.redirect(302, location.url);
      return;
    }
    res.type("webp").sendFile(location.path);
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
    const file = (req as Request & { file?: { buffer: Buffer; originalname: string; mimetype: string; size: number } }).file;
    res.status(202).json({ success: true, data: await academicProfileService.requestVerification(req.user!.sub, req.body, file) });
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
    const email = await institutionalEmailVerificationService.verifyChallenge(req.user!.sub, req.body.code);
    const affiliation = await affiliationService.verifyFromInstitutionalEmail(req.user!.sub);
    res.json({ success: true, data: { ...email, affiliation } });
  },
  async listVerificationRequests(req: Request, res: Response) {
    const query = VerificationListQuerySchema.parse(req.query);
    const result = await academicProfileService.listVerificationRequests(query.status, query.page, query.pageSize);
    res.json({ success: true, ...result });
  },
  async decideVerification(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.decideVerification(req.params.requestId as string, req.body, req.user!.sub) });
  },
  async verificationDetails(req: Request, res: Response) {
    res.json({ success: true, data: await academicProfileService.getVerificationDetails(req.params.requestId as string) });
  },
  async verificationEvidenceFile(req: Request, res: Response) {
    const adminId = req.user!.sub;
    const location = await academicProfileService.verificationEvidenceFileLocation(req.params.requestId as string);
    res.setHeader("Cache-Control", "private, no-store");
    if (location.kind === "redirect") {
      await auditService.log("academic_profile.verification.evidence_accessed", { userId: adminId, targetTableName: "verification_evidence", targetRecordId: req.params.requestId as string });
      res.redirect(302, location.url);
      return;
    }
    res.type("application/pdf").setHeader("Content-Disposition", "attachment; filename=position-evidence.pdf");
    await auditService.log("academic_profile.verification.evidence_accessed", { userId: adminId, targetTableName: "verification_evidence", targetRecordId: req.params.requestId as string });
    res.sendFile(location.path);
  },
};
