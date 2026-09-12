import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");

export const ProjectChatParamsSchema = z.object({
  id: objectId,
});

export const ProjectChatMessageParamsSchema = ProjectChatParamsSchema.extend({
  messageId: objectId,
});

export const ProjectChatScopeSchema = z.enum(["private", "team"]).default("private");

export const SendProjectChatMessageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  scope: ProjectChatScopeSchema,
});

export const ListProjectChatQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  scope: ProjectChatScopeSchema,
});

export const StreamProjectChatQuerySchema = z.object({
  scope: ProjectChatScopeSchema.default("team"),
});

export const PinProjectChatMessageSchema = z.object({
  pinned: z.boolean(),
});
