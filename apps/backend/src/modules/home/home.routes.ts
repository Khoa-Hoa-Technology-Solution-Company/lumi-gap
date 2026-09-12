import { Router } from "express";
import { optionalAuth } from "../../common/middleware/auth.js";
import { homeController } from "./home.controller.js";

export const homeRouter: Router = Router();

homeRouter.get("/overview", optionalAuth, homeController.overview);
