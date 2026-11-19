import { z } from "zod";
export const orcidStartSchema = z.object({}).strict();
export const orcidCallbackSchema = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code: z.string().min(1).max(1024).optional(),
  error: z.string().regex(/^[a-z_]{1,80}$/).optional(),
}).strict().refine(value => Boolean(value.code) !== Boolean(value.error), "Supply either an authorization code or a provider error");
