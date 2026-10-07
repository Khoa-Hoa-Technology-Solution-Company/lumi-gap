import { Router } from "express";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { optionalAuth, requireAuth, requireSystemRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { uploadProfileAvatar, uploadProfileCover } from "../../common/middleware/upload.js";
import { academicProfileController } from "./academic-profile.controller.js";
import { uploadPositionEvidence } from "../../common/middleware/upload.js";
import {
  PublicProfileParamsSchema,
  PublicForumActivityQuerySchema,
  LecturerListQuerySchema,
  UpdateAcademicProfileDetailsSchema,
  VerificationDecisionParamsSchema,
  VerificationDecisionSchema,
  VerificationListQuerySchema,
  VerificationRequestSchema,
  InstitutionalEmailChallengeSchema,
  InstitutionalEmailVerifySchema,
  AcademicIdentityLinkParamsSchema,
  CreateAcademicIdentityLinkSchema,
  UpdateAcademicIdentityLinkSchema,
  PublicHandleParamsSchema,
  UpdatePublicHandleSchema,
} from "./dto/academic-profile.schema.js";

const verificationRequestLimiter = createRateLimiter("academic-profiles:verificationRequestLimiter", {
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user!.sub,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many verification requests. Please try again later." },
});

const emailChallengeLimiter = createRateLimiter("academic-profiles:emailChallengeLimiter", {
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user!.sub,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many email verification requests. Please try again later." },
});

const emailVerifyLimiter = createRateLimiter("academic-profiles:emailVerifyLimiter", {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user!.sub,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many verification attempts. Please try again later." },
});

const publicHandleLimiter = createRateLimiter("academic-profiles:publicHandleLimiter", {
  windowMs: 24 * 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user!.sub,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many public URL changes. Please try again tomorrow." },
});

const coverUploadLimiter = createRateLimiter("academic-profiles:coverUploadLimiter", {
  windowMs: 24 * 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.user!.sub,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many cover uploads. Please try again tomorrow." },
});

const avatarUploadLimiter = createRateLimiter("academic-profiles:avatarUploadLimiter", {
  windowMs: 24 * 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.user!.sub,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many profile photo uploads. Please try again tomorrow." },
});

export const academicProfileRouter: Router = Router();
academicProfileRouter.get("/me", requireAuth, academicProfileController.mine);
academicProfileRouter.patch("/me", requireAuth, validate(UpdateAcademicProfileDetailsSchema), academicProfileController.updateMine);
academicProfileRouter.get("/me/academic-identities", requireAuth, academicProfileController.listAcademicIdentities);
academicProfileRouter.post("/me/academic-identities", requireAuth, validate(CreateAcademicIdentityLinkSchema), academicProfileController.createAcademicIdentity);
academicProfileRouter.patch("/me/academic-identities/:identityId", requireAuth, validate(AcademicIdentityLinkParamsSchema, "params"), validate(UpdateAcademicIdentityLinkSchema), academicProfileController.updateAcademicIdentity);
academicProfileRouter.delete("/me/academic-identities/:identityId", requireAuth, validate(AcademicIdentityLinkParamsSchema, "params"), academicProfileController.deleteAcademicIdentity);
academicProfileRouter.patch("/me/public-handle", requireAuth, publicHandleLimiter, validate(UpdatePublicHandleSchema), academicProfileController.setPublicHandle);
academicProfileRouter.post("/me/avatar", requireAuth, avatarUploadLimiter, uploadProfileAvatar, academicProfileController.uploadAvatar);
academicProfileRouter.delete("/me/avatar", requireAuth, academicProfileController.removeAvatar);
academicProfileRouter.post("/me/cover", requireAuth, coverUploadLimiter, uploadProfileCover, academicProfileController.uploadCover);
academicProfileRouter.delete("/me/cover", requireAuth, academicProfileController.removeCover);
academicProfileRouter.get("/me/verification-status", requireAuth, academicProfileController.verificationStatus);
academicProfileRouter.get("/me/institutional-email/status", requireAuth, academicProfileController.institutionalEmailStatus);
academicProfileRouter.post(
  "/me/institutional-email/challenge",
  requireAuth,
  emailChallengeLimiter,
  validate(InstitutionalEmailChallengeSchema),
  academicProfileController.requestInstitutionalEmailChallenge,
);
academicProfileRouter.post(
  "/me/institutional-email/verify",
  requireAuth,
  emailVerifyLimiter,
  validate(InstitutionalEmailVerifySchema),
  academicProfileController.verifyInstitutionalEmail,
);
academicProfileRouter.post("/me/verification-request", requireAuth, verificationRequestLimiter, uploadPositionEvidence, validate(VerificationRequestSchema), academicProfileController.requestVerification);
academicProfileRouter.get("/lecturers", validate(LecturerListQuerySchema, "query"), academicProfileController.listLecturers);
academicProfileRouter.get("/by-handle/:handle", optionalAuth, validate(PublicHandleParamsSchema, "params"), academicProfileController.publicProfileByHandle);
academicProfileRouter.get("/:userId/avatar", optionalAuth, validate(PublicProfileParamsSchema, "params"), academicProfileController.publicAvatar);
academicProfileRouter.get("/:userId/cover", optionalAuth, validate(PublicProfileParamsSchema, "params"), academicProfileController.publicCover);
academicProfileRouter.get("/:userId/summary", optionalAuth, validate(PublicProfileParamsSchema, "params"), academicProfileController.compactProfile);
academicProfileRouter.get("/:userId/forum-activity", optionalAuth, validate(PublicProfileParamsSchema, "params"), validate(PublicForumActivityQuerySchema, "query"), academicProfileController.forumActivity);
academicProfileRouter.get("/:userId", optionalAuth, validate(PublicProfileParamsSchema, "params"), academicProfileController.publicProfile);

export const academicProfileAdminRouter: Router = Router();
academicProfileAdminRouter.use(requireAuth, requireSystemRole("ADMIN"));
academicProfileAdminRouter.get("/academic-verifications", validate(VerificationListQuerySchema, "query"), academicProfileController.listVerificationRequests);
academicProfileAdminRouter.get(
  "/academic-verifications/:requestId",
  validate(VerificationDecisionParamsSchema, "params"),
  academicProfileController.verificationDetails,
);
academicProfileAdminRouter.get(
  "/academic-verifications/:requestId/evidence",
  validate(VerificationDecisionParamsSchema, "params"),
  academicProfileController.verificationEvidenceFile,
);
academicProfileAdminRouter.patch(
  "/academic-verifications/:requestId",
  validate(VerificationDecisionParamsSchema, "params"),
  validate(VerificationDecisionSchema),
  academicProfileController.decideVerification,
);
