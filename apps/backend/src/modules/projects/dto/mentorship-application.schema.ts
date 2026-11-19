import { z } from "zod";
const terms = z.array(z.string().trim().min(2).max(120)).max(10).transform(values => [...new Set(values)]).default([]);
export const mentorshipApplicationSchema = z.object({
  message: z.string().trim().min(20).max(2000), mentorRole: z.enum(["PRIMARY", "SECONDARY"]).default("PRIMARY"),
  areas: terms, methodologies: terms, capabilities: terms,
  availability: z.string().trim().min(10).max(1000), idempotencyKey: z.string().uuid(),
}).strict();
export const applicationActionSchema = z.object({ action: z.enum(["SHORTLIST", "DECLINE", "WITHDRAW"]), expectedVersion: z.number().int().positive() }).strict();
export const applicationNoteSchema = z.object({ body: z.string().trim().min(5).max(2000), clientKey: z.string().uuid() }).strict();
export const applicationPageSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(20).default(10) }).strict();
