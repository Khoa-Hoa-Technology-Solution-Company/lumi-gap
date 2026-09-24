import { z } from "zod";

// Public APIs accept PostgreSQL UUIDs and legacy IDs that were preserved during
// the one-time data migration. This is validation only and opens no external connection.
export const databaseIdSchema = z.string().refine(
  (value) => /^[0-9a-fA-F]{24}$/.test(value)
    || /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value),
  "Invalid database id",
);

/** @deprecated Historical name kept for route compatibility. */
export const objectIdSchema = databaseIdSchema;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
