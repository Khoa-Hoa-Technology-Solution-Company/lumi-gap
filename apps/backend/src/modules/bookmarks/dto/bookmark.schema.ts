import { z } from "zod";
import { databaseIdSchema } from "../../../common/validation/database-id.js";

export const CreateBookmarkSchema = z.object({
  targetKind: z.enum(["paper", "report"]),
  targetId: databaseIdSchema,
  note: z.string().max(500).nullable().optional(),
});
export type CreateBookmarkInput = z.infer<typeof CreateBookmarkSchema>;

export const UpdateBookmarkSchema = z.object({
  note: z.string().max(500).nullable().optional(),
});
export type UpdateBookmarkInput = z.infer<typeof UpdateBookmarkSchema>;
