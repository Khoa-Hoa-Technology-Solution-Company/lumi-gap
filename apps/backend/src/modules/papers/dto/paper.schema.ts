import { z } from "zod";
import { paperFilterShape } from "./paper-filters.schema.js";
import { PAPER_REQUEST_STATUSES } from "../paper-workflow.js";

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

/** Body of PATCH /api/v1/papers/:id/status (admin). Allowed transitions are checked in the service. */
export const UpdatePaperStatusSchema = z.object({
  status: z.enum(PAPER_REQUEST_STATUSES),
  rejectionReason: z.string().trim().max(2000).optional(),
});

export type UpdatePaperStatusInput = z.infer<typeof UpdatePaperStatusSchema>;
