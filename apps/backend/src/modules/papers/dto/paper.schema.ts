import { z } from "zod";
import { paperFilterShape } from "./paper-filters.schema.js";

/**
 * Query params for GET /api/v1/papers (keyword browse + search). Shares
 * `paperFilterShape` with GET /search so both endpoints filter identically.
 * Parsed inline in the route (Express 5 makes req.query a read-only getter).
 */
export const PaperListQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  ...paperFilterShape,
});

export type PaperListQueryInput = z.infer<typeof PaperListQuerySchema>;
