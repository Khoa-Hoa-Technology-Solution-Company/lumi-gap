import { z } from "zod";

export const topicBodySchema = z.object({ topic: z.string().trim().min(1).max(80) }).strict();
export const topicKeyParamsSchema = z.object({ key: z.string().trim().min(1).max(120) });
export const vocabularyQuerySchema = z.object({ q: z.string().trim().max(80).default("") });
