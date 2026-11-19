import { z } from "zod";
import { catalogIdSchema } from "../../taxonomy/dto/taxonomy.schema.js";

export const TOPIC_WATCH_KINDS = ["topic", "subfield", "keyword", "tag"] as const;

const dailyMaxSchema = z.number().int().min(1).nullable();
const backlogTargetSchema = z.number().int().min(0);

export const UpsertTopicWatchSchema = z.object({
  targetKind: z.enum(TOPIC_WATCH_KINDS),
  targetId: catalogIdSchema,
  dailyMaxNewPapers: dailyMaxSchema.optional(),
  backlogTargetPapers: backlogTargetSchema.optional(),
});
export type UpsertTopicWatchInput = z.infer<typeof UpsertTopicWatchSchema>;

export const UpdateTopicWatchSchema = z.object({
  enabled: z.boolean().optional(),
  dailyMaxNewPapers: dailyMaxSchema.optional(),
  backlogTargetPapers: backlogTargetSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });
export type UpdateTopicWatchInput = z.infer<typeof UpdateTopicWatchSchema>;

export const TopicWatchParamsSchema = z.object({ id: catalogIdSchema });

export const ListTopicWatchesQuerySchema = z.object({
  targetKind: z.enum(TOPIC_WATCH_KINDS).optional(),
  targetId: catalogIdSchema.optional(),
});
export type ListTopicWatchesQuery = z.infer<typeof ListTopicWatchesQuerySchema>;
