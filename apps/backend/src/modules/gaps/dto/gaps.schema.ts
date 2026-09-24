import { z } from "zod";
import { databaseIdSchema } from "../../../common/validation/database-id.js";

const ObjectIdSchema = databaseIdSchema;
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
  id: databaseIdSchema,
});

/** Body of POST /api/v1/gaps/:id/directions. */
export const DirectionsBodySchema = z.object({
  force: z.boolean().optional(),
});
export type DirectionsBody = z.infer<typeof DirectionsBodySchema>;

export const GapCandidateSchema = z.object({
  topic: z.string().trim().min(3).max(200),
  projectId: ObjectIdSchema.optional(),
  corpusId: ObjectIdSchema.optional(),
  title: z.string().trim().min(3).max(200),
  gapType: z.enum(["COVERAGE_GAP", "EMPIRICAL_VALIDATION_GAP", "CONTRADICTORY_EVIDENCE_GAP", "CONTEXT_GAP", "METHODOLOGICAL_GAP", "OUTCOME_GAP", "TEMPORAL_GAP", "EMERGING_GAP", "MISSING_CONNECTION_GAP", "ASSUMPTION_GAP", "OTHER"]),
  scope: z.string().trim().max(5000).optional(),
  establishedKnowledge: z.string().trim().min(10).max(10000),
  observedLimitation: z.string().trim().min(10).max(10000),
  missingEvidence: z.string().trim().min(10).max(10000),
  significanceExplanation: z.string().trim().min(10).max(10000),
  suggestedResearchQuestion: z.string().trim().max(5000).optional(),
  gapConfidence: z.enum(["LOW", "MODERATE", "HIGH"]),
  researchPriority: z.enum(["LOW", "MODERATE", "HIGH"]),
}).strict();
export const GapEvidenceRecordSchema = z.object({
  paperId: ObjectIdSchema,
  evidenceKind: z.enum(["SUPPORTING", "COUNTER"]),
  evidenceType: z.string().trim().max(120).optional(),
  excerpt: z.string().trim().max(5000).optional(),
  explanation: z.string().trim().min(10).max(5000),
}).strict();
export const GapValidationSchema = z.object({
  action: z.enum(["VALIDATE", "CHALLENGE", "REQUEST_EVIDENCE", "SUGGEST_EVIDENCE", "REFINE_SCOPE", "REJECT"]),
  comment: z.string().trim().min(10).max(10000),
  suggestedChanges: z.string().trim().max(10000).optional(),
}).strict();
