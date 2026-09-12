import { z } from "zod";

export const TranslatePaperBodySchema = z.object({
  targetLanguage: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2,3}$/, "targetLanguage must be an ISO language code"),
});

export type TranslatePaperInput = z.infer<typeof TranslatePaperBodySchema>;
