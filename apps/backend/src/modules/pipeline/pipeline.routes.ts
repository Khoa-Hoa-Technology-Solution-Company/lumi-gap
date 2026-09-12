import { Router } from "express";
import { requireAuth, requireRole } from "../../common/middleware/auth.js";
import { pipelineController } from "./pipeline.controller.js";

export const pipelineRouter: Router = Router();

pipelineRouter.get("/pipeline/status", requireAuth, requireRole("admin"), pipelineController.status);
