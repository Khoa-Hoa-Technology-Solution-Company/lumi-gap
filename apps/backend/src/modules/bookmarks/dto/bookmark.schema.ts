import { z } from "zod";

export const CreateBookmarkSchema = z.object({
  targetKind: z.enum(["paper", "report"]),
  targetId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid Target ID"),
  note: z.string().max(500).nullable().optional(),
});
export type CreateBookmarkInput = z.infer<typeof CreateBookmarkSchema>;

export const UpdateBookmarkSchema = z.object({
  note: z.string().max(500).nullable().optional(),
});
export type UpdateBookmarkInput = z.infer<typeof UpdateBookmarkSchema>;
