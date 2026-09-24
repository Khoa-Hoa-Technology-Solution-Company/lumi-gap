import { z } from "zod";
import { databaseIdSchema } from "../../../common/validation/database-id.js";

const TargetKind = z.enum(["report", "gap", "paper"]);
const ObjectId = databaseIdSchema;

export const EvaluateSchema = z.object({
  targetKind: TargetKind,
  targetId: ObjectId,
  force: z.boolean().optional(),
});
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
