import type { NextFunction, Request, Response } from "express";
import { analyticsService } from "../analytics/analytics.service.js";
import { searchService } from "./search.service.js";
import { SearchQuerySchema } from "./dto/search.schema.js";

/**
 * GET /api/v1/search?q=&page=&pageSize=&yearFrom=&yearTo=
 *
 * Query is parsed inline (not via the validate() middleware) because Express 5
 * makes `req.query` a read-only getter — reassigning it throws.
 */
export const searchController = {
  async semantic(req: Request, res: Response, next: NextFunction) {
    const parsed = SearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const {
      q,
      page,
      pageSize,
      yearFrom,
      yearTo,
      paperKind,
      paperKinds,
      openAccess,
      openAccessStatuses,
      provider,
      providers,
      sources,
      languages,
      citationBands,
      domains,
      fields,
      subfields,
      topics,
      domainIds,
      fieldIds,
      subfieldIds,
      topicIds,
      minScore,
      sort,
      rerank,
    } = parsed.data;
    const t0 = Date.now();
    const { papers, total, reranked } = await searchService.semantic({
      q,
      page,
      pageSize,
      yearFrom,
      yearTo,
      paperKinds: paperKinds ?? paperKind,
      openAccess,
      openAccessStatuses,
      provider,
      providers,
      sources,
      languages,
      citationBands,
      domains,
      fields,
      subfields,
      topics,
      domainIds,
      fieldIds,
      subfieldIds,
      topicIds,
      minScore,
      sort,
      rerank,
      userId: req.user?.sub,
    });

    // Fire-and-forget: log the search for analytics (never awaited, never blocks response)
    analyticsService.logSearch({
      userId: req.user?.sub,
      query: q,
      mode: reranked ? "semantic+rerank" : "semantic",
      resultCount: total,
      durationMs: Date.now() - t0,
      filters: {
        yearFrom,
        yearTo,
        paperKinds: paperKinds ?? paperKind,
        openAccess,
        openAccessStatuses,
        provider,
        providers,
        sources,
        languages,
        citationBands,
        domains,
        fields,
        subfields,
        topics,
        domainIds,
        fieldIds,
        subfieldIds,
        topicIds,
      },
    });

    res.json({
      success: true,
      data: papers,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        mode: reranked ? "semantic+rerank" : "semantic",
      },
    });
  },
};
