import { z } from "zod";
import { databaseIdSchema } from "../../../common/validation/database-id.js";

const objectId = databaseIdSchema;

export const ProjectTeamChatParamsSchema = z.object({
  id: objectId,
});

export const ProjectTeamChatMessageParamsSchema = ProjectTeamChatParamsSchema.extend({
  messageId: objectId,
});

export const TeamChatReferenceSchema = z.object({ kind: z.enum(["PAPER", "TASK", "MANUSCRIPT_SNAPSHOT", "SUBMISSION_REVISION"]), id: z.string().uuid() }).strict();
export const TeamChatReferencesQuerySchema = z.object({ kind: TeamChatReferenceSchema.shape.kind, q: z.string().trim().max(200).default(""), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
export const SendProjectTeamChatMessageSchema = z.object({
  content: z.string().trim().max(2000),
  clientKey: z.string().uuid().optional(),
  replyToId: objectId.optional(),
  reference: TeamChatReferenceSchema.optional(),
}).strict().refine(value => value.content.length > 0 || value.reference, { message: "Write a message or choose a research reference" });

export const DeleteProjectTeamChatMessageSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const ListProjectTeamChatQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
  beforeId: objectId.optional(),
  afterId: objectId.optional(),
  aroundId: objectId.optional(),
  q: z.string().trim().max(200).optional(),
  ids: z.string().min(1).max(3700).refine(value => { const ids = value.split(","); return ids.length <= 100 && ids.every(id => objectId.safeParse(id).success); }, "Supply at most 100 valid message IDs").optional(),
}).strict().refine(value => [value.before || value.beforeId, value.afterId, value.aroundId, value.ids].filter(Boolean).length <= 1, { message: "Use only one message cursor" });

export type SendProjectTeamChatMessageInput = z.infer<typeof SendProjectTeamChatMessageSchema>;
export type DeleteProjectTeamChatMessageInput = z.infer<typeof DeleteProjectTeamChatMessageSchema>;
export type ListProjectTeamChatQuery = z.infer<typeof ListProjectTeamChatQuerySchema>;
