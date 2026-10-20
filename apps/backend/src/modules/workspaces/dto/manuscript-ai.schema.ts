import { z } from "zod";
import { MANUSCRIPT_AI_ACTIONS } from "@trend/shared-types";

export const manuscriptAiSchema = z.object({
  fileId: z.string().uuid(), action: z.enum(MANUSCRIPT_AI_ACTIONS),
  sourceSequence: z.number().int().min(0).optional(),
  regenerateOf: z.string().uuid().optional(),
  from: z.number().int().min(0).max(1_000_000), to: z.number().int().min(0).max(1_000_000),
  original: z.string().max(12000), instruction: z.string().trim().max(2000).default(""),
  language: z.string().trim().min(1).max(60).default("English"),
}).strict().superRefine((value, ctx) => {
  if (value.to < value.from || value.to - value.from !== value.original.length) ctx.addIssue({ code: "custom", message: "Invalid source selection" });
  if (!["continue", "explain", "custom"].includes(value.action) && !value.original.trim()) ctx.addIssue({ code: "custom", message: "Select source text first" });
  if (value.action === "custom" && !value.instruction) ctx.addIssue({ code: "custom", message: "Describe the requested change" });
});
