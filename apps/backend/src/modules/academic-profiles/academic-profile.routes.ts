import { Router } from "express";
import { requireAuth, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { academicProfileController } from "./academic-profile.controller.js";
import {
  PublicProfileParamsSchema,
  UpdateAcademicProfileDetailsSchema,
  VerificationDecisionParamsSchema,
  VerificationDecisionSchema,
  VerificationListQuerySchema,
  VerificationRequestSchema,
} from "./dto/academic-profile.schema.js";

export const academicProfileRouter: Router = Router();
academicProfileRouter.get("/me", requireAuth, academicProfileController.mine);
academicProfileRouter.patch("/me", requireAuth, validate(UpdateAcademicProfileDetailsSchema), academicProfileController.updateMine);
academicProfileRouter.post("/me/verification-request", requireAuth, validate(VerificationRequestSchema), academicProfileController.requestVerification);
academicProfileRouter.get("/:userId", validate(PublicProfileParamsSchema, "params"), academicProfileController.publicProfile);

export const academicProfileAdminRouter: Router = Router();
academicProfileAdminRouter.use(requireAuth, requireRole("admin"));
academicProfileAdminRouter.get("/academic-verifications", validate(VerificationListQuerySchema, "query"), academicProfileController.listVerificationRequests);
academicProfileAdminRouter.patch(
  "/academic-verifications/:profileId",
  validate(VerificationDecisionParamsSchema, "params"),
  validate(VerificationDecisionSchema),
  academicProfileController.decideVerification,
);
