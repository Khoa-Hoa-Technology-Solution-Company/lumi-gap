import { z } from "zod";
import { databaseIdSchema } from "../../../common/validation/database-id.js";

const TargetKind = z.enum(["report", "gap", "paper"]);
const ObjectId = databaseIdSchema;

const Language = z.enum(["en", "vi"]);

export const EvaluateSchema = z.object({
  targetKind: TargetKind,
  targetId: ObjectId,
  force: z.boolean().optional(),
  language: Language.optional(),
  /** Paper only: evaluate against this project's research plan (caller must be a current member). */
  projectId: z.string().uuid().optional(),
}).refine((value) => !value.projectId || value.targetKind === "paper", { path: ["projectId"], message: "Project mode is only available for papers" });
export type EvaluateInput = z.infer<typeof EvaluateSchema>;

export const RateSchema = z.object({
  targetKind: TargetKind,
  targetId: ObjectId,
  stars: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type RateInput = z.infer<typeof RateSchema>;

export const TargetParamsSchema = z.object({
  targetKind: TargetKind,
  targetId: ObjectId,
});
export type TargetParamsInput = z.infer<typeof TargetParamsSchema>;

export const ViewQuerySchema = z.object({
  language: Language.optional(),
  projectId: z.string().uuid().optional(),
});
export type ViewQueryInput = z.infer<typeof ViewQuerySchema>;

export const ReadingContextParamsSchema = z.object({ paperId: ObjectId });
export const ReadingContextQuerySchema = z.object({
  topic: z.string().trim().max(200).optional(),
  query: z.string().trim().max(200).optional(),
});
export type ReadingContextQueryInput = z.infer<typeof ReadingContextQuerySchema>;

export const EvaluationJobParamsSchema = z.object({ jobId: z.string().regex(/^quality-[a-f0-9]{40}$/) });
