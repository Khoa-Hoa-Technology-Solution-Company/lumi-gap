import type { NextFunction, Request, Response } from "express";
import { trendFollowService } from "./trend-follow.service.js";
import { trendService } from "./trend.service.js";
import {
  CreateTrendFollowSchema,
  TrendExplainHistoryQuerySchema,
  TrendFollowCheckQuerySchema,
  TopicTrendQuerySchema,
  TrendCompareQuerySchema,
  TrendExplainBodySchema,
  TrendPeriodsQuerySchema,
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

  /** GET /api/v1/trends/periods?granularity=month|quarter&window=rolling|year-to-date&periods= */
  async periods(req: Request, res: Response, next: NextFunction) {
    const parsed = TrendPeriodsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const data = await trendService.periods(parsed.data);
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
  /** GET /api/v1/trends/follows — topics the user follows. */
  async listFollows(req: Request, res: Response) {
    res.json({ success: true, data: await trendFollowService.list(req.user!.sub) });
  },

  /** GET /api/v1/trends/follows/check?topic= */
  async checkFollow(req: Request, res: Response, next: NextFunction) {
    const parsed = TrendFollowCheckQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    res.json({ success: true, data: await trendFollowService.check(req.user!.sub, parsed.data.topic) });
  },

  /** POST /api/v1/trends/follows — follow a topic; the current verdict becomes the baseline. */
  async createFollow(req: Request, res: Response, next: NextFunction) {
    const parsed = CreateTrendFollowSchema.safeParse(req.body);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    res.status(201).json({ success: true, data: await trendFollowService.create(req.user!.sub, parsed.data) });
  },

  /** DELETE /api/v1/trends/follows/:id */
  async deleteFollow(req: Request, res: Response) {
    await trendFollowService.remove(req.user!.sub, req.params.id as string);
    res.json({ success: true, data: { ok: true } });
  },
};
