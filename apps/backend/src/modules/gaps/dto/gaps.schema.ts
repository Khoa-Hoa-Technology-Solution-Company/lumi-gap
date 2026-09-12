import { z } from "zod";

const ObjectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, "invalid paper id");
const SelectedPaperIdsSchema = z
  .array(ObjectIdSchema)
  .max(10, "selectedPaperIds cannot exceed 10 papers")
  .transform((ids) => Array.from(new Set(ids)));

/** Body of POST /api/v1/gaps/analyze. */
export const AnalyzeGapSchema = z
  .object({
    topic: z.string().trim().min(3).max(200),
    projectId: z.string().optional(),
    yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
    yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
    selectedPaperIds: SelectedPaperIdsSchema.optional(),
    evidenceMode: z.enum(["auto", "selected", "hybrid"]).default("auto"),
  })
  .superRefine((body, ctx) => {
    if (body.yearFrom !== undefined && body.yearTo !== undefined && body.yearFrom > body.yearTo) {
      ctx.addIssue({ code: "custom", message: "yearFrom must be <= yearTo", path: ["yearFrom"] });
    }
    if (body.evidenceMode === "selected" && (body.selectedPaperIds?.length ?? 0) < 3) {
      ctx.addIssue({
        code: "custom",
        message: "Select at least 3 evidence papers",
        path: ["selectedPaperIds"],
      });
    }
  });

/** Body of POST /api/v1/gaps/evidence-preview. This endpoint does not charge credits. */
export const PreviewGapEvidenceSchema = z
  .object({
    topic: z.string().trim().min(3).max(200),
    projectId: z.string().optional(),
    yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
    yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
    selectedPaperIds: SelectedPaperIdsSchema.optional(),
    evidenceMode: z.enum(["auto", "selected", "hybrid"]).default("hybrid"),
  })
  .refine(
    (body) => body.yearFrom === undefined || body.yearTo === undefined || body.yearFrom <= body.yearTo,
    { message: "yearFrom must be <= yearTo", path: ["yearFrom"] },
  );

/** Query params of GET /api/v1/gaps. */
export const ListGapsQuerySchema = z.object({
  topic: z.string().trim().max(200).optional(),
  search: z.string().trim().max(200).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  source: z.enum(["report", "standalone"]).optional(),
  status: z.enum(["active", "resolved", "dismissed"]).default("active"),
  sortBy: z
    .enum(["recommended", "evidence", "confidence", "papers", "newest", "ai_only_last"])
    .default("recommended"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  projectId: z.string().optional(),
});

/** Body of PATCH /api/v1/gaps/:id. */
export const PatchGapSchema = z.object({
  status: z.enum(["active", "resolved", "dismissed"]),
});

export type AnalyzeGapDto = z.infer<typeof AnalyzeGapSchema>;
export type PreviewGapEvidenceDto = z.infer<typeof PreviewGapEvidenceSchema>;
export type ListGapsQuery = z.infer<typeof ListGapsQuerySchema>;
export type PatchGapDto = z.infer<typeof PatchGapSchema>;

/** Params of the directions routes: /api/v1/gaps/:id/directions. */
export const GapIdParamsSchema = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/, "invalid id"),
});

/** Body of POST /api/v1/gaps/:id/directions. */
export const DirectionsBodySchema = z.object({
  force: z.boolean().optional(),
});
export type DirectionsBody = z.infer<typeof DirectionsBodySchema>;
