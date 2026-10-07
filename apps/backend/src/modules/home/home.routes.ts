import { Router } from "express";
import { optionalAuth, requireAuth } from "../../common/middleware/auth.js";
import { homeController } from "./home.controller.js";

export const homeRouter: Router = Router();

homeRouter.get("/overview", optionalAuth, homeController.overview);
homeRouter.get("/research", requireAuth, homeController.research);
