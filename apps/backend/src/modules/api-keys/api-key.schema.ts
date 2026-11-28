import { z } from "zod";

const secret = z.string().trim().min(8, "The API key looks too short").max(4096)
  .regex(/^[^\s\x00-\x1f\x7f]+$/, "The API key must not contain spaces or control characters");

export const ApiKeyProviderSchema = z.enum(["GEMINI", "OPENALEX"]);

export const CreateApiKeySchema = z.object({
  provider: ApiKeyProviderSchema,
  label: z.string().trim().min(1).max(100),
  apiKey: secret,
  priority: z.number().int().min(0).max(10_000).default(100),
}).strict();

export const UpdateApiKeySchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  priority: z.number().int().min(0).max(10_000).optional(),
  isEnabled: z.boolean().optional(),
  /** Replaces the secret; resets the key's status and counters. */
  apiKey: secret.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const ApiKeyIdParamsSchema = z.object({ id: z.string().uuid() });

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof UpdateApiKeySchema>;
