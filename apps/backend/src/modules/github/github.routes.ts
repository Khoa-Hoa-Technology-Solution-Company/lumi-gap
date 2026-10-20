import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { validate } from "../../common/middleware/validate.js";
import { githubCompleteSchema, githubPageSchema, githubRequestSchema, githubStartSchema } from "./github.schema.js";
import { githubController } from "./github.controller.js";

export const githubRouter: Router = Router();
githubRouter.use(requireAuth);
githubRouter.use((_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
const connections = createRateLimiter("github:connections", { windowMs: 60000, max: 15, keyGenerator: req => req.user!.sub });
const requests = createRateLimiter("github:requests", { windowMs: 60000, max: 600, keyGenerator: req => req.user!.sub });
githubRouter.get("/", requests, githubController.status);
githubRouter.post("/start", connections, validate(githubStartSchema), githubController.start);
githubRouter.post("/complete", connections, validate(githubCompleteSchema), githubController.complete);
githubRouter.get("/repositories", requests, validate(githubPageSchema, "query"), githubController.repositories);
githubRouter.post("/repository", requests, validate(githubRequestSchema), githubController.request);
githubRouter.delete("/", connections, githubController.disconnect);
