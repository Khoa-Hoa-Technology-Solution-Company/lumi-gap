import { z } from "zod";
import { PERSONALIZATION } from "../personalization.constants.js";

export const topicBodySchema = z.object({ topic: z.string().trim().min(1).max(80) }).strict();
export const topicKeyParamsSchema = z.object({ key: z.string().trim().min(1).max(120) });
export const vocabularyQuerySchema = z.object({ q: z.string().trim().max(80).default("") });

/**
 * GET /for-you. `limit` is a plain integer string: an empty value, a decimal, a sign, an exponent or a repeated
 * parameter is rejected (400) instead of being clamped or guessed. Absent means the default feed size.
 */
export const forYouQuerySchema = z.object({
  limit: z.string().regex(/^\d{1,3}$/, "limit must be a whole number")
    .transform(Number)
    .pipe(z.number().int().min(PERSONALIZATION.FEED_MIN).max(PERSONALIZATION.FEED_MAX))
    .optional(),
}).strict().transform((query) => ({ limit: query.limit ?? PERSONALIZATION.FEED_SIZE }));
