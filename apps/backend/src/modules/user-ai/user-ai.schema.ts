import { z } from "zod";

export const AiConnectionDraftSchema = z.object({
  connectionId: z.string().uuid().optional(),
  provider: z.enum(["gemini", "openai-compatible"]),
  baseUrl: z.string().trim().min(1).max(1000),
  apiKey: z.string().trim().max(4096).regex(/^[^\x00-\x1f\x7f]*$/, "API key must not contain control characters").optional(),
}).strict();
export const SaveAiConnectionSchema = AiConnectionDraftSchema.extend({
  name: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200),
});
export const AiPreferenceSchema = z.object({ connectionId: z.string().uuid().nullable() }).strict();
export type AiConnectionDraft = z.infer<typeof AiConnectionDraftSchema>;
export type SaveAiConnectionInput = z.infer<typeof SaveAiConnectionSchema>;
