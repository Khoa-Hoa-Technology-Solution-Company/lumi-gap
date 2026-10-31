import { z } from "zod";
import { paginationSchema } from "../../../common/validation/database-id.js";
import { catalogIdSchema } from "../../taxonomy/dto/taxonomy.schema.js";

/** Kinds a signed-in user may ask for from search. A tag is curated, so only admins can backfill one. */
export const SEARCH_BACKFILL_KINDS = ["topic", "subfield", "keyword"] as const;
export const ADMIN_BACKFILL_KINDS = ["topic", "subfield", "keyword", "tag"] as const;
export const BACKFILL_STATES = ["queued", "running", "completed", "failed"] as const;

export const SearchBackfillRequestSchema = z.object({
  targetKind: z.enum(SEARCH_BACKFILL_KINDS),
  targetId: catalogIdSchema,
});
export type SearchBackfillRequest = z.infer<typeof SearchBackfillRequestSchema>;

/** The upper bound on maxNewPapers is TOPIC_BACKFILL_MAX_NEW_PAPERS, enforced by the service (it is configuration). */
export const AdminBackfillRequestSchema = z.object({
  targetKind: z.enum(ADMIN_BACKFILL_KINDS),
  targetId: catalogIdSchema,
  maxNewPapers: z.number().int().min(1).optional(),
});
export type AdminBackfillRequest = z.infer<typeof AdminBackfillRequestSchema>;

export const BackfillRunParamsSchema = z.object({ id: catalogIdSchema });

export const ListBackfillRunsQuerySchema = paginationSchema.extend({
  targetKind: z.enum(ADMIN_BACKFILL_KINDS).optional(),
  targetId: catalogIdSchema.optional(),
  state: z.enum(BACKFILL_STATES).optional(),
});
export type ListBackfillRunsQuery = z.infer<typeof ListBackfillRunsQuerySchema>;
