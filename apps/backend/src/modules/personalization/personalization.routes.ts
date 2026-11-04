import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { validate } from "../../common/middleware/validate.js";
import { personalizationController } from "./personalization.controller.js";
import { topicBodySchema, topicKeyParamsSchema, vocabularyQuerySchema } from "./dto/personalization.schema.js";

export const personalizationRouter: Router = Router();

const writeLimiter = createRateLimiter("personalization-write", { windowMs: 60_000, limit: 60 });

personalizationRouter.use(requireAuth);
personalizationRouter.get("/interests", personalizationController.interests);
personalizationRouter.get("/interests/vocabulary", validate(vocabularyQuerySchema, "query"), personalizationController.vocabulary);
personalizationRouter.post("/interests/follow", writeLimiter, validate(topicBodySchema, "body"), personalizationController.follow);
personalizationRouter.delete("/interests/follow/:key", writeLimiter, validate(topicKeyParamsSchema, "params"), personalizationController.unfollow);
personalizationRouter.post("/interests/mute", writeLimiter, validate(topicBodySchema, "body"), personalizationController.mute);
personalizationRouter.delete("/interests/mute/:key", writeLimiter, validate(topicKeyParamsSchema, "params"), personalizationController.unmute);
personalizationRouter.get("/for-you", personalizationController.forYou);
personalizationRouter.get("/communities", personalizationController.communities);
