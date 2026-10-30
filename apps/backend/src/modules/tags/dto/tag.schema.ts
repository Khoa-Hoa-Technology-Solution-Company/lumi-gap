import { z } from "zod";
import { paginationSchema } from "../../../common/validation/database-id.js";
import { catalogIdSchema } from "../../taxonomy/dto/taxonomy.schema.js";

const effectSchema = z.enum(["include", "exclude"]);

export const TagRuleInputSchema = z.discriminatedUnion("ruleKind", [
  z.object({ ruleKind: z.literal("topic"), researchTopicId: catalogIdSchema, effect: effectSchema.optional() }),
  z.object({ ruleKind: z.literal("keyword"), keywordId: catalogIdSchema, effect: effectSchema.optional() }),
]);

const rulesSchema = z.array(TagRuleInputSchema).max(200);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must look like #1a2b3c");
const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Invalid slug");

export const ListTagsQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["active", "archived"]).default("active"),
});
export type ListTagsQuery = z.infer<typeof ListTagsQuerySchema>;

export const CreateTagSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  color: colorSchema.nullable().optional(),
  rules: rulesSchema.optional(),
});
export type CreateTagInput = z.infer<typeof CreateTagSchema>;

export const UpdateTagSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  color: colorSchema.nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>;

export const ReplaceRulesSchema = z.object({ rules: rulesSchema });
export type ReplaceRulesInput = z.infer<typeof ReplaceRulesSchema>;
