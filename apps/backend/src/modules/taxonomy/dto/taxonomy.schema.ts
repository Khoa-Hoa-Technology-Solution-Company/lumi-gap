import { z } from "zod";
import { paginationSchema } from "../../../common/validation/database-id.js";
import { TAXONOMY_LEVELS } from "../taxonomy.normalize.js";

/** Catalogue rows are keyed by PostgreSQL UUID only (no legacy 24-hex ids). */
export const catalogIdSchema = z.string().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  "Invalid id",
);

export const CatalogIdParamsSchema = z.object({ id: catalogIdSchema });

const aliasListSchema = z.array(z.string().trim().min(1).max(200)).max(200);

export const ListNodesQuerySchema = paginationSchema.extend({
  level: z.enum(TAXONOMY_LEVELS).optional(),
  parentId: catalogIdSchema.optional(),
  q: z.string().trim().max(120).optional(),
  status: z.enum(["active", "hidden"]).optional(),
  sort: z.enum(["paperCount", "worksCount", "name"]).default("paperCount"),
});
export type ListNodesQuery = z.infer<typeof ListNodesQuerySchema>;

export const UpdateNodeSchema = z.object({
  aliases: aliasListSchema.optional(),
  status: z.enum(["active", "hidden"]).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");
export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>;

export const ListKeywordsQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["active", "hidden", "merged"]).default("active"),
  sort: z.enum(["paperCount", "name"]).default("paperCount"),
});
export type ListKeywordsQuery = z.infer<typeof ListKeywordsQuerySchema>;

export const UpdateKeywordSchema = z.object({
  keywordName: z.string().trim().min(1).max(300).optional(),
  aliases: aliasListSchema.optional(),
  status: z.enum(["active", "hidden"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");
export type UpdateKeywordInput = z.infer<typeof UpdateKeywordSchema>;

export const MergeKeywordSchema = z.object({ targetId: catalogIdSchema });
export type MergeKeywordInput = z.infer<typeof MergeKeywordSchema>;
