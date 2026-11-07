import type { Request, Response } from "express";
import { FeaturedWorkOptionsQuerySchema, LecturerListQuerySchema, PublicForumActivityQuerySchema, VerificationListQuerySchema } from "./dto/academic-profile.schema.js";
import { featuredWorkOptions } from "./academic-featured-works.service.js";
import { publicForumActivity } from "./academic-forum-activity.service.js";
import { academicProfileService } from "./academic-profile.service.js";
import { institutionalEmailVerificationService } from "./institutional-email-verification.service.js";
import { stageLecturerEvidence } from "./verification-evidence-upload.service.js";
import { VerificationStatusQuerySchema } from "./dto/academic-profile.schema.js";
import { academicProfileCoverService } from "./academic-profile-cover.service.js";
import { academicProfileAvatarService } from "./academic-profile-avatar.service.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { affiliationService } from "../verification/affiliation.service.js";
import { academicIdentityService } from "./academic-identity.service.js";
import { getOrcidConfig, orcidOAuthService } from "./orcid-oauth.service.js";
import { resolveOAuthReturnOrigin } from "../auth/google-oidc.service.js";
import { auditService } from "../audit/audit.service.js";

function mapOrcidErrorCode(error: unknown): string {
  if (error instanceof AppError) {
    if (error.statusCode === 409) return "already_linked";
    if (error.statusCode === 401 || error.statusCode === 403) return "session_mismatch";
    if (error.message.toLowerCase().includes("cancelled")) return "cancelled";
    if (error.message.toLowerCase().includes("state")) return "expired";
  }
  return "failed";
}

export const academicProfileController = {
  async featuredWorkOptions(req: Request, res: Response) {
    const { kind, q } = FeaturedWorkOptionsQuerySchema.parse(req.query);
    res.json({ success: true, data: await featuredWorkOptions(req.user!.sub, kind, q) });
  },
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
  async orcidStatus(req: Request, res: Response) {
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ success: true, data: await orcidOAuthService.status(req.user!.sub) });
  },
  async startOrcidConnection(req: Request, res: Response) {
    res.setHeader("Cache-Control", "private, no-store");
    const returnTo = typeof req.body?.returnTo === "string"
      ? req.body.returnTo
      : typeof req.query?.returnTo === "string"
        ? req.query.returnTo
        : undefined;
    const returnOrigin = typeof req.body?.returnOrigin === "string"
      ? req.body.returnOrigin
      : typeof req.query?.returnOrigin === "string"
        ? req.query.returnOrigin
        : req.get("origin");
    const sessionId = req.user!.sessionId ?? (req.user as { jti?: string } | undefined)?.jti;
    const started = await orcidOAuthService.start(req.user!.sub, sessionId, { returnTo, returnOrigin });
    res.json({ success: true, data: started });
  },
  async completeOrcidConnection(req: Request, res: Response) {
    res.setHeader("Cache-Control", "private, no-store");
    const sessionId = req.user!.sessionId ?? (req.user as { jti?: string } | undefined)?.jti;
    const result = await orcidOAuthService.complete({
      code: req.body?.code,
      state: req.body?.state,
      error: req.body?.error,
      errorDescription: req.body?.error_description,
      authenticatedUserId: req.user!.sub,
      authenticatedSessionId: sessionId,
    });
    res.json({
      success: true,
      data: {
        link: result.link,
        returnTo: result.returnTo,
      },
    });
  },
  async orcidCallbackRedirect(req: Request, res: Response) {
    res.setHeader("Cache-Control", "private, no-store");
    if (!getOrcidConfig().configured) {
      throw AppError.serviceUnavailable("ORCID connection is not configured");
    }
    try {
      const result = await orcidOAuthService.complete({
        code: typeof req.query.code === "string" ? req.query.code : undefined,
        state: typeof req.query.state === "string" ? req.query.state : undefined,
        error: typeof req.query.error === "string" ? req.query.error : undefined,
        errorDescription: typeof req.query.error_description === "string" ? req.query.error_description : undefined,
      });
      const redirectUrl = new URL(result.returnTo, result.returnOrigin);
      redirectUrl.searchParams.set("orcid", "connected");
      res.redirect(302, redirectUrl.toString());
    } catch (error) {
      const details = error instanceof AppError && error.details && typeof error.details === "object"
        ? (error.details as { returnOrigin?: string; returnTo?: string })
        : {};
      const origin = details.returnOrigin ?? resolveOAuthReturnOrigin();
      const path = details.returnTo ?? "/profile";
      const redirectUrl = new URL(path, origin);
      redirectUrl.searchParams.set("orcid_error", mapOrcidErrorCode(error));
      res.redirect(302, redirectUrl.toString());
    }
  },
  async disconnectOrcid(req: Request, res: Response) {
    res.setHeader("Cache-Control", "private, no-store");
    const result = await orcidOAuthService.disconnect(req.user!.sub);
    res.json({ success: true, data: result });
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
    res.setHeader("Cache-Control", "private, no-store");
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
    res.setHeader("Cache-Control", "private, no-store");
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
    const files = (req as Request & { files?: Record<string, Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>> }).files;
    res.status(req.body.submissionKey ? 201 : 202).json({ success: true, data: await academicProfileService.requestVerification(req.user!.sub, req.body, files?.evidence?.[0], files?.additionalEvidence?.[0], files?.evidenceFiles) });
  },
  async stageVerificationEvidence(req: Request, res: Response) {
    res.status(201).json({ success: true, data: await stageLecturerEvidence(req.user!.sub, req.body.institutionId, (req as Request & { file?: { buffer: Buffer; originalname: string; mimetype: string; size: number } }).file) });
  },
  async verificationStatus(req: Request, res: Response) {
    const query = VerificationStatusQuerySchema.parse(req.query);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ success: true, data: await academicProfileService.getVerificationStatus(req.user!.sub, query.submissionKey, query.requestId, query.page) });
  },
  async ownVerificationEvidenceFile(req: Request, res: Response) {
    const sourceId = typeof req.query.sourceId === "string" ? req.query.sourceId : undefined;
    const location = await academicProfileService.ownVerificationEvidenceFileLocation(req.params.requestId as string, req.user!.sub, sourceId);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(location.mimeType).setHeader("Content-Disposition", "attachment; filename=verification-evidence");
    await auditService.log("academic_profile.verification.evidence_accessed", { userId: req.user!.sub, targetTableName: "verification_evidence", targetRecordId: req.params.requestId as string });
    if (location.kind === "local") { res.sendFile(location.path); return; }
    const upstream = await fetch(location.url, { signal: AbortSignal.timeout(15_000) });
    if (!upstream.ok) throw AppError.notFound("Verification evidence is unavailable or has been removed");
    res.send(Buffer.from(await upstream.arrayBuffer()));
  },
  async institutionalEmailStatus(req: Request, res: Response) {
    res.json({ success: true, data: await institutionalEmailVerificationService.status(req.user!.sub) });
  },
  async requestInstitutionalEmailChallenge(req: Request, res: Response) {
    res.status(202).json({ success: true, data: await institutionalEmailVerificationService.requestChallenge(req.user!.sub, req.body.email) });
  },
  async verifyInstitutionalEmail(req: Request, res: Response) {
    const email = await institutionalEmailVerificationService.verifyChallenge(req.user!.sub, req.body.code, req.body.email);
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
    const sourceId = typeof req.query.sourceId === "string" ? req.query.sourceId : undefined;
    const location = await academicProfileService.verificationEvidenceFileLocation(req.params.requestId as string, adminId, sourceId);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const extension = location.mimeType === "image/png" ? "png" : location.mimeType === "image/jpeg" ? "jpg" : "pdf";
    if (location.kind === "redirect") {
      await auditService.log("academic_profile.verification.evidence_accessed", { userId: adminId, targetTableName: "verification_evidence", targetRecordId: req.params.requestId as string });
      const upstream = await fetch(location.url, { signal: AbortSignal.timeout(15_000) });
      if (!upstream.ok) throw AppError.notFound("Verification evidence is unavailable or has been removed");
      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.type(location.mimeType).setHeader("Content-Disposition", `attachment; filename=verification-evidence.${extension}`);
      res.send(bytes);
      return;
    }
    res.type(location.mimeType).setHeader("Content-Disposition", `attachment; filename=position-evidence.${extension}`);
    await auditService.log("academic_profile.verification.evidence_accessed", { userId: adminId, targetTableName: "verification_evidence", targetRecordId: req.params.requestId as string });
    res.sendFile(location.path);
  },
};
