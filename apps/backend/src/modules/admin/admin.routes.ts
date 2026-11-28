import { Router } from "express";
import { requireAuth, requireSystemRole } from "../../common/middleware/auth.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { validate } from "../../common/middleware/validate.js";
import { adminController } from "./admin.controller.js";
import {
  AdminReasonSchema,
  CreateUserSchema,
  UpdateAdminApiProviderSchema,
  UpdateAdminInstitutionSchema,
  UpdateRoleSchema,
  UpdateStatusSchema,
  UpdateUserSchema,
} from "./dto/admin.schema.js";

const adminMutationLimiter = createRateLimiter("admin:mutations", {
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anon",
});

/** Admin user-management + stats + system operations. Always gated. */
export const adminRouter: Router = Router();

adminRouter.use(requireAuth, requireSystemRole("ADMIN"));

adminRouter.get("/users", adminController.listUsers);
adminRouter.get("/users/summary", adminController.summary);
adminRouter.post("/users", adminMutationLimiter, validate(CreateUserSchema), adminController.createUser);
adminRouter.get("/users/:id", adminController.getUser);
adminRouter.patch("/users/:id", adminMutationLimiter, validate(UpdateUserSchema), adminController.updateUser);
adminRouter.patch("/users/:id/role", adminMutationLimiter, validate(UpdateRoleSchema), adminController.updateRole);
adminRouter.patch("/users/:id/status", adminMutationLimiter, validate(UpdateStatusSchema), adminController.updateStatus);
adminRouter.post("/users/:id/revoke-sessions", adminMutationLimiter, validate(AdminReasonSchema), adminController.revokeSessions);
adminRouter.get("/stats", adminController.stats);
adminRouter.get("/audit-logs", adminController.listAuditLogs);
adminRouter.get("/workers", adminController.listWorkers);
adminRouter.get("/ai-operations", adminController.listAiOperations);
adminRouter.get("/settings", adminController.getSettings);
adminRouter.patch(
  "/settings/institutions/:id",
  adminMutationLimiter,
  validate(UpdateAdminInstitutionSchema),
  adminController.updateInstitution,
);
adminRouter.patch(
  "/settings/api-providers/:id",
  adminMutationLimiter,
  validate(UpdateAdminApiProviderSchema),
  adminController.updateApiProvider,
);
