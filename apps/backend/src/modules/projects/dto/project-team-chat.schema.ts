import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");

export const ProjectTeamChatParamsSchema = z.object({
  id: objectId,
});

export const ProjectTeamChatMessageParamsSchema = ProjectTeamChatParamsSchema.extend({
  messageId: objectId,
});

export const SendProjectTeamChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export const DeleteProjectTeamChatMessageSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const ListProjectTeamChatQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
});

export type SendProjectTeamChatMessageInput = z.infer<typeof SendProjectTeamChatMessageSchema>;
export type DeleteProjectTeamChatMessageInput = z.infer<typeof DeleteProjectTeamChatMessageSchema>;
export type ListProjectTeamChatQuery = z.infer<typeof ListProjectTeamChatQuerySchema>;
