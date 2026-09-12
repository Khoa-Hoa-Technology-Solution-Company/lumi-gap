import { Router, type RequestHandler } from "express";
import { env } from "../../config/env.js";
import { requireAuth, requireRole } from "../../common/middleware/auth.js";
import { embeddingController } from "./embedding.controller.js";

/**
 * Admin embedding routes, mounted under /api/v1/admin.
 * Gated by requireAuth + requireRole("admin"); SYNC_ADMIN_BYPASS=true (dev only)
 * drops the gate so the team can demo before an admin user is seeded.
 */
const adminGuard: RequestHandler[] = env.SYNC_ADMIN_BYPASS
  ? []
  : [requireAuth, requireRole("admin")];

export const embeddingRouter: Router = Router();

embeddingRouter.post("/embed", ...adminGuard, embeddingController.trigger);
embeddingRouter.get("/embed/status", ...adminGuard, embeddingController.status);
