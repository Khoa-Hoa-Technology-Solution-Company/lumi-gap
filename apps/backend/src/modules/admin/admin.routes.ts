import { Router } from "express";
import { requireAuth, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { adminController } from "./admin.controller.js";
import { UpdateRoleSchema, UpdateStatusSchema } from "./dto/admin.schema.js";

/** Admin user-management + stats. Always gated — never bypassed. */
export const adminRouter: Router = Router();

adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.get("/users", adminController.listUsers);
adminRouter.patch("/users/:id/role", validate(UpdateRoleSchema), adminController.updateRole);
adminRouter.patch("/users/:id/status", validate(UpdateStatusSchema), adminController.updateStatus);
adminRouter.get("/stats", adminController.stats);
