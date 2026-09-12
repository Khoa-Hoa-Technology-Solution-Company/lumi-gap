import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";
import { searchController } from "./search.controller.js";
import { isRerankRequested } from "./dto/search.schema.js";
import { optionalAuth, requireAuth } from "../../common/middleware/auth.js";

export const searchRouter: Router = Router();

/** Conditionally require auth if reranking is requested, otherwise optional auth. */
const conditionalSearchAuth = (req: Request, res: Response, next: NextFunction) => {
  if (isRerankRequested(req.query.rerank)) {
    return requireAuth(req, res, next);
  }
  return optionalAuth(req, res, next);
};

/**
 * Plain semantic search is public and unthrottled. But `rerank=true` fires a
 * Gemini call on a cache miss, and the cache key includes the exact query — so
 * a loop of random queries would be guaranteed misses and could drain the
 * team's shared free-tier quota. Throttle ONLY the rerank path, keyed by IP.
 */
const rerankLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.RERANK_MAX_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isRerankRequested(req.query.rerank),
  keyGenerator: (req) => req.ip || "anonymous",
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: { code: "TOO_MANY_REQUESTS", message: "Re-rank rate limit exceeded — try again later." },
    }),
});

const semanticSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.SEMANTIC_SEARCH_MAX_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous",
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: { code: "TOO_MANY_REQUESTS", message: "Semantic search limit exceeded. Try again shortly." },
    }),
});

searchRouter.get("/", conditionalSearchAuth, semanticSearchLimiter, rerankLimiter, searchController.semantic);
