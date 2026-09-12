import { z } from "zod";
import { TREND_CITATION_BANDS } from "../trend.filters.js";

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
    sortBy: z.enum(["momentum", "growth", "total"]).default("momentum"),
    ...trendFacetFiltersSchema,
  })
  .refine((q) => q.yearFrom === undefined || q.yearTo === undefined || q.yearFrom <= q.yearTo, {
    message: "yearFrom must be <= yearTo",
  });

export type TrendsOverviewQuery = z.infer<typeof TrendsOverviewQuerySchema>;

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
    yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
    yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
    language: z.enum(["en", "vi"]).default("en"),
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
