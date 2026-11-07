import { z } from "zod";
import { LIMITATION_CATEGORIES } from "@trend/shared-types";
import { databaseIdSchema } from "../../../common/validation/database-id.js";

const text = (max: number) => z.string().trim().max(max);
const score = z.number().int().min(1).max(5);
const evidenceIds = z.array(z.string().uuid()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, "Select each extraction once");

/* Matrix */
export const matrixQuerySchema = z.object({
  status: z.enum(["VERIFIED", "ALL"]).default("VERIFIED"),
  questionId: z.string().max(100).default(""),
  theme: text(80).default(""),
  q: text(200).default(""),
}).strict();
export const createCriterionSchema = z.object({ label: text(80).min(1), description: text(500).default("") }).strict();
export const updateCriterionSchema = createCriterionSchema.extend({ expectedVersion: z.number().int().positive() }).strict();
export const archiveCriterionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
export const reorderCriteriaSchema = z.object({
  order: z.array(z.string().uuid()).max(50).refine((ids) => new Set(ids).size === ids.length, "List each column once"),
}).strict();

/* Limitations */
export const limitationCategorySchema = z.enum(LIMITATION_CATEGORIES);
export const createLimitationSchema = z.object({
  statement: text(2000).min(3), category: limitationCategorySchema, evidenceIds, clientKey: z.string().uuid(),
}).strict();
export const updateLimitationSchema = z.object({
  statement: text(2000).min(3), category: limitationCategorySchema, evidenceIds, expectedVersion: z.number().int().positive(),
}).strict();
export const limitationStatusSchema = z.object({
  status: z.enum(["OPEN", "DISMISSED"]), rationale: text(2000).default(""), expectedVersion: z.number().int().positive(),
}).strict().refine((body) => body.status !== "DISMISSED" || body.rationale.length >= 3, { message: "Explain why the limitation is dismissed", path: ["rationale"] });
export const promoteLimitationSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: text(200).min(3),
  topic: text(200).min(3),
  significance: text(10000).min(10),
  researchQuestion: text(5000).optional(),
}).strict();

/* Feasibility */
export const feasibilityTargetParams = z.object({
  id: databaseIdSchema,
  targetKind: z.enum(["LIMITATION", "GAP"]),
  /** Gap ids may still be legacy 24-character ids; limitations are always UUIDs (checked by the service). */
  targetId: databaseIdSchema,
});
export const saveFeasibilitySchema = z.object({
  dataAvailability: score, expertise: score, resources: score, timeline: score, risk: score,
  notes: text(4000).default(""),
  /** Version of the assessor's own previous assessment; absent for a first assessment. */
  expectedVersion: z.number().int().positive().optional(),
}).strict();
