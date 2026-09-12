import type { NextFunction, Request, Response } from "express";
import { trendService } from "./trend.service.js";
import {
  TrendExplainHistoryQuerySchema,
  TopicTrendQuerySchema,
  TrendCompareQuerySchema,
  TrendExplainBodySchema,
  TrendRelationshipQuerySchema,
  TrendTopicCandidatesQuerySchema,
  TrendsOverviewQuerySchema,
} from "./dto/trends.schema.js";

/**
 * Trends endpoints. Query is parsed inline (not via the validate() middleware)
 * because Express 5 makes `req.query` a read-only getter — reassigning throws.
 */
export const trendController = {
  /** GET /api/v1/trends?yearFrom=&yearTo=&limit=&minPapers=&sortBy= */
  async overview(req: Request, res: Response, next: NextFunction) {
    const parsed = TrendsOverviewQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const data = await trendService.overview(parsed.data);
    res.json({ success: true, data });
  },

  /** GET /api/v1/trends/:topic?yearFrom=&yearTo=   (:topic is URL-encoded) */
  async topic(req: Request, res: Response, next: NextFunction) {
    const parsed = TopicTrendQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const data = await trendService.topic(req.params.topic as string, parsed.data);
    res.json({ success: true, data });
  },

  /** GET /api/v1/trends/compare?topics=a,b&yearFrom=&yearTo= */
  async compare(req: Request, res: Response, next: NextFunction) {
    const parsed = TrendCompareQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const data = await trendService.compare(parsed.data);
    res.json({ success: true, data });
  },

  /** GET /api/v1/trends/topic-candidates?q=nlp&yearFrom=&yearTo= */
  async topicCandidates(req: Request, res: Response, next: NextFunction) {
    const parsed = TrendTopicCandidatesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const data = await trendService.topicCandidates(parsed.data);
    res.json({ success: true, data });
  },

  /** GET /api/v1/trends/relationships?topic=a&limit=12&yearFrom=&yearTo= */
  async relationships(req: Request, res: Response, next: NextFunction) {
    const parsed = TrendRelationshipQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const data = await trendService.relationships(parsed.data);
    res.json({ success: true, data });
  },

  /** POST /api/v1/trends/explain — AI explanation grounded in trend aggregate data. */
  async explain(req: Request, res: Response, next: NextFunction) {
    const parsed = TrendExplainBodySchema.safeParse(req.body);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const data = await trendService.explain(parsed.data, req.user?.sub);
    res.json({ success: true, data });
  },

  /** GET /api/v1/trends/explain/history — user's saved explain runs. */
  async explainHistory(req: Request, res: Response, next: NextFunction) {
    const parsed = TrendExplainHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const data = await trendService.explainHistory(req.user!.sub, parsed.data);
    res.json({ success: true, data });
  },
};
