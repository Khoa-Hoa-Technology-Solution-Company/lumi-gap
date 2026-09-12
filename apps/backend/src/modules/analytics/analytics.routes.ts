import { Router } from "express";
import { requireAuth, requireRole } from "../../common/middleware/auth.js";
import { analyticsController } from "./analytics.controller.js";

export const analyticsRouter: Router = Router();

// Public — Home page stats widget
analyticsRouter.get("/search/summary", analyticsController.summary);

// Authenticated user history — must be registered before /search (no trailing slash ambiguity)
analyticsRouter.get("/search/me", requireAuth, analyticsController.me);

// Admin dashboard — requires auth + admin role
analyticsRouter.get("/search", requireAuth, requireRole("admin"), analyticsController.dashboard);
