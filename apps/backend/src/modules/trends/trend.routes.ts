import { Router } from "express";
import { optionalAuth, requireAuth } from "../../common/middleware/auth.js";
import { trendController } from "./trend.controller.js";

export const trendRouter: Router = Router();

trendRouter.get("/", trendController.overview);
// Before "/:topic", which would otherwise read "discover" as a topic name.
trendRouter.get("/discover", trendController.discover);
trendRouter.get("/compare", trendController.compare);
trendRouter.get("/topic-candidates", trendController.topicCandidates);
trendRouter.get("/relationships", trendController.relationships);
trendRouter.get("/explain/history", requireAuth, trendController.explainHistory);
trendRouter.post("/explain", optionalAuth, trendController.explain);
trendRouter.get("/:topic", trendController.topic);
