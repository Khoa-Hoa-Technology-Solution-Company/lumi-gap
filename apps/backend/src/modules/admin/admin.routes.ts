import { Router } from "express";
import { requireAuth, requireSystemRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { adminController } from "./admin.controller.js";
import {
  AdminReasonSchema, CreateUserSchema, UpdateRoleSchema, UpdateStatusSchema, UpdateUserSchema,
} from "./dto/admin.schema.js";

/** Admin user-management + stats + system operations. Always gated. */
export const adminRouter: Router = Router();

adminRouter.use(requireAuth, requireSystemRole("ADMIN"));

adminRouter.get("/users", adminController.listUsers);
adminRouter.get("/users/summary", adminController.summary);
adminRouter.post("/users", validate(CreateUserSchema), adminController.createUser);
adminRouter.get("/users/:id", adminController.getUser);
adminRouter.patch("/users/:id", requireSystemRole("SUPER_ADMIN"), validate(UpdateUserSchema), adminController.updateUser);
adminRouter.patch("/users/:id/role", validate(UpdateRoleSchema), adminController.updateRole);
adminRouter.patch("/users/:id/status", validate(UpdateStatusSchema), adminController.updateStatus);
adminRouter.post("/users/:id/revoke-sessions", validate(AdminReasonSchema), adminController.revokeSessions);
adminRouter.get("/stats", adminController.stats);
adminRouter.get("/audit-logs", adminController.listAuditLogs);
adminRouter.get("/workers", adminController.listWorkers);
adminRouter.get("/settings", adminController.getSettings);
