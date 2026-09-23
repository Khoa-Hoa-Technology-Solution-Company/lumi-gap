import { Router } from "express";
import rateLimit from "express-rate-limit";
import { optionalAuth, requireAuth, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { uploadProfileCover } from "../../common/middleware/upload.js";
import { academicProfileController } from "./academic-profile.controller.js";
import {
  PublicProfileParamsSchema,
  LecturerListQuerySchema,
  UpdateAcademicProfileDetailsSchema,
  VerificationDecisionParamsSchema,
  VerificationDecisionSchema,
  VerificationListQuerySchema,
  VerificationRequestSchema,
  InstitutionalEmailChallengeSchema,
  InstitutionalEmailVerifySchema,
  PublicHandleParamsSchema,
  UpdatePublicHandleSchema,
} from "./dto/academic-profile.schema.js";

const verificationRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user!.sub,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many verification requests. Please try again later." },
});

const emailChallengeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user!.sub,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many email verification requests. Please try again later." },
});

const emailVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user!.sub,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many verification attempts. Please try again later." },
});

const publicHandleLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user!.sub,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many public URL changes. Please try again tomorrow." },
});

const coverUploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.user!.sub,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many cover uploads. Please try again tomorrow." },
});

export const academicProfileRouter: Router = Router();
academicProfileRouter.get("/me", requireAuth, academicProfileController.mine);
academicProfileRouter.patch("/me", requireAuth, validate(UpdateAcademicProfileDetailsSchema), academicProfileController.updateMine);
academicProfileRouter.patch("/me/public-handle", requireAuth, publicHandleLimiter, validate(UpdatePublicHandleSchema), academicProfileController.setPublicHandle);
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
academicProfileRouter.post("/me/verification-request", requireAuth, verificationRequestLimiter, validate(VerificationRequestSchema), academicProfileController.requestVerification);
academicProfileRouter.get("/lecturers", validate(LecturerListQuerySchema, "query"), academicProfileController.listLecturers);
academicProfileRouter.get("/by-handle/:handle", optionalAuth, validate(PublicHandleParamsSchema, "params"), academicProfileController.publicProfileByHandle);
academicProfileRouter.get("/:userId/cover", optionalAuth, validate(PublicProfileParamsSchema, "params"), academicProfileController.publicCover);
academicProfileRouter.get("/:userId/summary", optionalAuth, validate(PublicProfileParamsSchema, "params"), academicProfileController.compactProfile);
academicProfileRouter.get("/:userId", optionalAuth, validate(PublicProfileParamsSchema, "params"), academicProfileController.publicProfile);

export const academicProfileAdminRouter: Router = Router();
academicProfileAdminRouter.use(requireAuth, requireRole("admin"));
academicProfileAdminRouter.get("/academic-verifications", validate(VerificationListQuerySchema, "query"), academicProfileController.listVerificationRequests);
academicProfileAdminRouter.get(
  "/academic-verifications/:profileId",
  validate(VerificationDecisionParamsSchema, "params"),
  academicProfileController.verificationDetails,
);
academicProfileAdminRouter.patch(
  "/academic-verifications/:profileId",
  validate(VerificationDecisionParamsSchema, "params"),
  validate(VerificationDecisionSchema),
  academicProfileController.decideVerification,
);
