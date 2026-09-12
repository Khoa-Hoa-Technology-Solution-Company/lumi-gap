import { z } from "zod";
import { TREND_CITATION_BANDS } from "../../trends/trend.filters.js";

const ObjectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid paper ID format");
const SelectedPaperIdsSchema = z.array(ObjectIdSchema).max(20, "selectedPaperIds cannot exceed 20 papers");

function stringList(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return undefined;
  const values = Array.from(new Set(v.map(String).map((value) => value.trim()).filter(Boolean)));
  return values.length > 0 ? values : undefined;
}

const ScopeFiltersSchema = z
  .object({
    paperKinds: z.preprocess(stringList, z.array(z.string()).optional()),
    openAccessStatuses: z.preprocess(stringList, z.array(z.string()).optional()),
    providers: z.preprocess(stringList, z.array(z.string()).optional()),
    sources: z.preprocess(stringList, z.array(z.string()).optional()),
    languages: z.preprocess(stringList, z.array(z.string()).optional()),
    citationBands: z.preprocess(stringList, z.array(z.enum(TREND_CITATION_BANDS)).optional()),
    domains: z.preprocess(stringList, z.array(z.string()).optional()),
    fields: z.preprocess(stringList, z.array(z.string()).optional()),
    subfields: z.preprocess(stringList, z.array(z.string()).optional()),
    topics: z.preprocess(stringList, z.array(z.string()).optional()),
    domainIds: z.preprocess(stringList, z.array(z.string()).optional()),
    fieldIds: z.preprocess(stringList, z.array(z.string()).optional()),
    subfieldIds: z.preprocess(stringList, z.array(z.string()).optional()),
    topicIds: z.preprocess(stringList, z.array(z.string()).optional()),
  })
  .partial()
  .optional();

/** Body of POST /api/v1/reports. */
export const CreateReportSchema = z
  .object({
    query: z.string().trim().min(3, "query must be at least 3 characters").max(500),
    topic: z.string().trim().max(200).optional(),
    projectId: z.string().optional(),
    yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
    yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
    language: z.enum(["auto", "en", "vi"]).default("auto"),
    scopeFilters: ScopeFiltersSchema,
    deepAnalysis: z.boolean().optional(), // Phase D — opt-in Gemini function-calling mode
    fast: z.boolean().optional(), // Fast mode — Flash model (ignored when deepAnalysis is true)
    selectedPaperIds: SelectedPaperIdsSchema.optional(),
  })
  .refine((b) => b.yearFrom === undefined || b.yearTo === undefined || b.yearFrom <= b.yearTo, {
    message: "yearFrom must be <= yearTo",
  });

export type CreateReportInput = z.infer<typeof CreateReportSchema>;

/** Body of POST /api/v1/reports/evidence-preview. */
export const PreviewReportEvidenceSchema = z
  .object({
    query: z.string().trim().min(3, "query must be at least 3 characters").max(500),
    topic: z.string().trim().max(200).optional(),
    projectId: z.string().optional(),
    yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
    yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
    language: z.enum(["auto", "en", "vi"]).default("auto"),
    scopeFilters: ScopeFiltersSchema,
    selectedPaperIds: SelectedPaperIdsSchema.optional(),
    fillWithRetrieved: z.boolean().optional(),
  })
  .refine((b) => b.yearFrom === undefined || b.yearTo === undefined || b.yearFrom <= b.yearTo, {
    message: "yearFrom must be <= yearTo",
  });

export type PreviewReportEvidenceInput = z.infer<typeof PreviewReportEvidenceSchema>;

/** Query params of GET /api/v1/reports. */
export const ListReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  projectId: z.string().optional(),
  paperId: ObjectIdSchema.optional(),
});

export type ListReportsQuery = z.infer<typeof ListReportsQuerySchema>;

/** Body of DELETE /api/v1/reports (batch delete) */
export const BatchDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, "must provide at least one id to delete"),
});

export type BatchDeleteInput = z.infer<typeof BatchDeleteSchema>;

export const PaperIdParamSchema = z.object({
  paperId: ObjectIdSchema,
});

export type PaperIdParam = z.infer<typeof PaperIdParamSchema>;
