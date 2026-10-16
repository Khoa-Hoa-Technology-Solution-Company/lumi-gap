import { z } from "zod";
import type { QuestionFacets } from "@trend/shared-types";
import { databaseIdSchema } from "../../../common/validation/database-id.js";
import { normalizeDoi } from "../closure.rules.js";

/** New closure tables only hold UUIDs; a 24-character legacy id would reach PostgreSQL as an invalid uuid. */
const uuid = z.string().uuid();

const facet = z.string().trim().max(300).optional();

function dropEmptyFacets(value: Record<string, string | undefined>): QuestionFacets {
  return Object.fromEntries(Object.entries(value).filter(([, text]) => text)) as QuestionFacets;
}

/** PICOC facets of a research question; blank facets are dropped. */
export const QuestionFacetsSchema = z
  .object({ population: facet, intervention: facet, comparison: facet, outcome: facet, context: facet })
  .strict()
  .transform(dropEmptyFacets);

/** Which facets the quoted sentence matches (true) or contradicts (false). */
export const ClosureFacetMatchSchema = z
  .object({
    population: z.boolean().optional(),
    intervention: z.boolean().optional(),
    comparison: z.boolean().optional(),
    outcome: z.boolean().optional(),
    context: z.boolean().optional(),
  })
  .strict();

const yearSchema = z.coerce.number().int().min(1900).max(2100);
const queriesSchema = z
  .array(z.string().trim().min(3).max(300))
  .max(5)
  .transform((queries) => [...new Set(queries)]);

/** Params */
export const GapChecksParamsSchema = z.object({ gapId: databaseIdSchema });
export const CheckParamsSchema = z.object({ checkId: uuid });
export const CheckDocumentParamsSchema = z.object({ checkId: uuid, docId: uuid });
export const CalibrationParamsSchema = z.object({ id: uuid });
export const CalibrationQuestionParamsSchema = z.object({ id: uuid, questionId: uuid });

/** Body of POST /gap-closure/gaps/:gapId/checks. An absent body means "use the gap's own question". */
export const StartGapClosureCheckSchema = z
  .object({
    question: z.string().trim().min(5).max(2000).optional(),
    facets: QuestionFacetsSchema.optional(),
    queries: queriesSchema.optional(),
    yearFrom: yearSchema.optional(),
    yearTo: yearSchema.optional(),
  })
  .strict()
  .refine((body) => body.yearFrom === undefined || body.yearTo === undefined || body.yearFrom <= body.yearTo, {
    message: "yearFrom must be <= yearTo",
    path: ["yearFrom"],
  })
  .default({});
export type StartGapClosureCheckDto = z.infer<typeof StartGapClosureCheckSchema>;

/** Body of PATCH /gap-closure/checks/:checkId/documents/:docId. The quote is verified by the service against the document text. */
export const ReviewClosureDocumentSchema = z
  .object({
    label: z.enum(["ANSWERS", "PARTIAL", "UNRELATED"]),
    quote: z.string().trim().max(2000).optional(),
    facets: ClosureFacetMatchSchema.optional(),
    limitationStatement: z.boolean().optional(),
    asSecondReviewer: z.boolean().optional(),
  })
  .strict();
export type ReviewClosureDocumentDto = z.infer<typeof ReviewClosureDocumentSchema>;

/** Body of POST /gap-closure/checks/:checkId/decide. */
export const DecideGapClosureSchema = z
  .object({ coverageCheckId: uuid.optional(), calibrationId: uuid.optional() })
  .strict()
  .default({});
export type DecideGapClosureDto = z.infer<typeof DecideGapClosureSchema>;

/** Query of GET /gap-closure/checks/:checkId/dossier. */
export const DossierQuerySchema = z.object({ format: z.enum(["json", "markdown"]).default("json") });
export type DossierQuery = z.infer<typeof DossierQuerySchema>;

/** Body of POST /gap-closure/coverage-checks. DOIs are normalized and validated by the service (it lists the invalid ones). */
export const CreateCoverageCheckSchema = z
  .object({
    topic: z.string().trim().min(3).max(300),
    projectId: databaseIdSchema.optional(),
    referenceSource: z.string().trim().min(5).max(500),
    dois: z.array(z.string().trim().min(1).max(300)).min(1).max(200),
  })
  .strict();
export type CreateCoverageCheckDto = z.infer<typeof CreateCoverageCheckSchema>;

/** Query of GET /gap-closure/coverage-checks. */
export const ListCoverageChecksQuerySchema = z.object({
  topic: z.string().trim().max(300).optional(),
  projectId: databaseIdSchema.optional(),
});
export type ListCoverageChecksQuery = z.infer<typeof ListCoverageChecksQuerySchema>;

/** Body of POST /gap-closure/calibrations. */
export const CreateClosureCalibrationSchema = z
  .object({
    name: z.string().trim().min(3).max(200),
    domain: z.string().trim().min(2).max(200),
    judgeKind: z.enum(["AI", "HUMAN"]),
  })
  .strict();
export type CreateClosureCalibrationDto = z.infer<typeof CreateClosureCalibrationSchema>;

const witnessDoi = z
  .string()
  .trim()
  .max(300)
  .transform((value, ctx) => {
    const doi = normalizeDoi(value);
    if (!doi) {
      ctx.addIssue({ code: "custom", message: "witnessDoi is not a valid DOI" });
      return z.NEVER;
    }
    return doi;
  });

/** Body of POST /gap-closure/calibrations/:id/questions. */
export const CreateCalibrationQuestionSchema = z
  .object({
    question: z.string().trim().min(10).max(2000),
    facets: QuestionFacetsSchema.optional(),
    witnessDoi,
    witnessQuote: z.string().trim().max(2000).optional(),
    labelSource: z.enum(["EXPERT_VALIDATION", "SURVEY"]),
    labelSourceRef: z.string().trim().max(500).optional(),
  })
  .strict();
export type CreateCalibrationQuestionDto = z.infer<typeof CreateCalibrationQuestionSchema>;
