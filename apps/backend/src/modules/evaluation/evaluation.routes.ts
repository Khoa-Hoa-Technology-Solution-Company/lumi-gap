import { Router } from "express";
import { requireAuth, requireRole } from "../../common/middleware/auth.js";
import { evaluationController } from "./evaluation.controller.js";

export const evaluationRouter: Router = Router();

evaluationRouter.get("/evaluation/summary", requireAuth, requireRole("admin"), evaluationController.summary);
