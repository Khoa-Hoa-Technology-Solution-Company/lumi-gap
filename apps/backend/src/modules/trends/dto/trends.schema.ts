import { z } from "zod";
import { TREND_CITATION_BANDS } from "@trend/shared-types";

const csvListSchema = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    const values = Array.isArray(value) ? value : [value];
    return values
      .flatMap((item) => String(item).split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  },
  z.array(z.string().min(1)).max(50).optional(),
);

const citationBandListSchema = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    const values = Array.isArray(value) ? value : [value];
    return values
      .flatMap((item) => String(item).split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  },
  z.array(z.enum(TREND_CITATION_BANDS)).max(TREND_CITATION_BANDS.length).optional(),
);

/** Page of the tested topics: only one verdict (optional), from `offset`. */
const topicPageSchema = {
  verdict: z.enum(["rising", "stable", "declining", "insufficient"]).optional(),
  offset: z.coerce.number().int().min(0).max(1000).default(0),
};

const trendFacetFiltersSchema = {
  paperKinds: csvListSchema,
  openAccessStatuses: csvListSchema,
  providers: csvListSchema,
  sources: csvListSchema,
  languages: csvListSchema,
  citationBands: citationBandListSchema,
  domains: csvListSchema,
  fields: csvListSchema,
  subfields: csvListSchema,
  topics: csvListSchema,
  domainIds: csvListSchema,
  fieldIds: csvListSchema,
  subfieldIds: csvListSchema,
  topicIds: csvListSchema,
};

/** Query params for GET /api/v1/trends (overview). */
export const TrendsOverviewQuerySchema = z
  .object({
    yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
    yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    /** Topics with fewer total papers than this are noise — hide them. */
    minPapers: z.coerce.number().int().min(1).max(1000).default(3),
    /** "trend" = verdict order (trend.verdict.ts compareByTrend). The legacy
     *  values "momentum" and "growth" are accepted and mean "trend". */
    sortBy: z.preprocess(
      (value) => (value === "momentum" || value === "growth" ? "trend" : value),
      z.enum(["trend", "total"]).default("trend"),
    ),
    ...topicPageSchema,
    ...trendFacetFiltersSchema,
  })
  .refine((q) => q.yearFrom === undefined || q.yearTo === undefined || q.yearFrom <= q.yearTo, {
    message: "yearFrom must be <= yearTo",
  });

export type TrendsOverviewQuery = z.infer<typeof TrendsOverviewQuerySchema>;

/** Query params for GET /api/v1/trends/periods (trends by month or quarter). */
export const TrendPeriodsQuerySchema = z.object({
  granularity: z.enum(["month", "quarter"]).default("month"),
  window: z.enum(["rolling", "year-to-date"]).default("rolling"),
  /** Complete periods of a rolling window; default 12 months or 8 quarters.
   *  Ignored for year-to-date. */
  periods: z.coerce.number().int().min(5).max(24).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  minPapers: z.coerce.number().int().min(1).max(1000).default(3),
  sortBy: z.enum(["trend", "total"]).default("trend"),
  ...topicPageSchema,
  ...trendFacetFiltersSchema,
});

export type TrendPeriodsQuery = z.infer<typeof TrendPeriodsQuerySchema>;

/** Query params for GET /api/v1/trends/:topic (topic deep dive). */
export const TopicTrendQuerySchema = z
  .object({
    topicId: z.string().trim().min(1).max(80).optional(),
    yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
    yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
    ...trendFacetFiltersSchema,
  })
  .refine((q) => q.yearFrom === undefined || q.yearTo === undefined || q.yearFrom <= q.yearTo, {
    message: "yearFrom must be <= yearTo",
  });

export type TopicTrendQuery = z.infer<typeof TopicTrendQuerySchema>;

const { topics: _compareTopicsFilter, ...compareFacetFilters } = trendFacetFiltersSchema;

export const TrendCompareQuerySchema = TopicTrendQuerySchema.and(
  z.object({
    topics: z
      .string()
      .transform((s) =>
        s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().min(1)).min(2).max(5)),
    ...compareFacetFilters,
  }),
);

export type TrendCompareQuery = z.infer<typeof TrendCompareQuerySchema>;

export const TrendTopicCandidatesQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(120),
    yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
    yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
    limit: z.coerce.number().int().min(5).max(50).default(20),
    minPapers: z.coerce.number().int().min(1).max(1000).default(1),
    ...trendFacetFiltersSchema,
  })
  .refine((q) => q.yearFrom === undefined || q.yearTo === undefined || q.yearFrom <= q.yearTo, {
    message: "yearFrom must be <= yearTo",
  });

export type TrendTopicCandidatesQuery = z.infer<typeof TrendTopicCandidatesQuerySchema>;

export const TrendRelationshipQuerySchema = TopicTrendQuerySchema.and(
  z.object({
    topic: z.string().trim().min(1),
    limit: z.coerce.number().int().min(1).max(30).default(12),
  }),
);

export type TrendRelationshipQuery = z.infer<typeof TrendRelationshipQuerySchema>;

export const TrendExplainBodySchema = z
  .object({
    topic: z.string().trim().min(1).max(200).optional(),
    /** Exact OpenAlex topic of `topic`; without it the topic is resolved by name. */
    topicId: z.string().trim().min(1).max(80).optional(),
    yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
    yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
    language: z.enum(["en", "vi"]).default("en"),
    /** Same threshold as the overview the reader is looking at, so the explanation is grounded on those topics. */
    minPapers: z.coerce.number().int().min(1).max(1000).optional(),
    ...trendFacetFiltersSchema,
  })
  .refine((q) => q.yearFrom === undefined || q.yearTo === undefined || q.yearFrom <= q.yearTo, {
    message: "yearFrom must be <= yearTo",
  });

export type TrendExplainBody = z.infer<typeof TrendExplainBodySchema>;

export const TrendExplainHistoryQuerySchema = z.object({
  topic: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export type TrendExplainHistoryQuery = z.infer<typeof TrendExplainHistoryQuerySchema>;

/** POST /trends/follows */
export const CreateTrendFollowSchema = z.object({
  topic: z.string().trim().min(1).max(300),
  openalexTopicId: z.string().trim().min(1).max(64).optional(),
  note: z.string().max(500).nullable().optional(),
}).strict();

export type CreateTrendFollowBody = z.infer<typeof CreateTrendFollowSchema>;

/** GET /trends/follows/check?topic= */
export const TrendFollowCheckQuerySchema = z.object({ topic: z.string().trim().min(1).max(300) });

/** POST /projects/:projectId/trend-snapshots */
export const CreateProjectTrendSnapshotSchema = z.object({
  topic: z.string().trim().min(1).max(300),
  openalexTopicId: z.string().trim().min(1).max(64).optional(),
  yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
  yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
}).strict().refine((q) => q.yearFrom === undefined || q.yearTo === undefined || q.yearFrom <= q.yearTo, { message: "yearFrom must be <= yearTo", path: ["yearFrom"] });

export type CreateProjectTrendSnapshotBody = z.infer<typeof CreateProjectTrendSnapshotSchema>;
