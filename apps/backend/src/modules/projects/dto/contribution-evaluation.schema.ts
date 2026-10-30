import { z } from "zod";

export const evaluationRuleSchema = z.object({
  clientKey: z.string().uuid(), title: z.string().trim().min(3).max(240),
  rationale: z.string().trim().min(20).max(5000), defaultWeight: z.number().int().min(1).max(100).default(1),
  maxWeight: z.number().int().min(1).max(100).default(100),
}).strict().refine(v => v.defaultWeight <= v.maxWeight, "Default weight exceeds maximum");
export const evaluationProposalSchema = z.object({
  clientKey: z.string().uuid(), ruleId: z.string().uuid(),
  outcomeKey: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,99}$/),
  expectedVersion: z.number().int().min(0), contributionIds: z.array(z.string().uuid()).min(1).max(100).refine(v => new Set(v).size === v.length),
  weight: z.number().int().min(1).max(100), rationale: z.string().trim().min(20).max(5000),
  retrospectiveWeight: z.boolean(),
  writingReportId: z.string().uuid().optional(),
  participation: z.array(z.object({ userId: z.string().uuid(), basisPoints: z.number().int().min(0).max(10000) }).strict()).min(1).max(100)
    .refine(v => new Set(v.map(p => p.userId)).size === v.length && v.reduce((n, p) => n + p.basisPoints, 0) === 10000, "Participation must total 10000 without duplicates"),
}).strict();
export const evaluationDecisionSchema = z.object({
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/), kind: z.enum(["PARTICIPANT", "WEIGHT", "CHALLENGE", "RESOLUTION"]),
  decision: z.enum(["APPROVE", "DISPUTE"]), note: z.string().trim().max(2000).default(""),
}).strict().refine(v => (v.kind !== "CHALLENGE" || v.decision === "DISPUTE") && (v.kind !== "RESOLUTION" || v.decision === "APPROVE") && (!(v.decision === "DISPUTE" || v.kind === "RESOLUTION") || v.note.length >= 10), "Explain the dispute or its resolution");
export const evaluationBoardSchema = z.object({ periodId: z.string().uuid(), page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export const evaluationRunSchema = z.object({ clientKey: z.string().uuid(), periodId: z.string().uuid(), ruleId: z.string().uuid() }).strict();
export const writingSuggestionsSchema = z.object({ contributionIds: z.string().max(4000).refine(v => z.array(z.string().uuid()).min(1).max(100).safeParse(v.split(",")).success) }).strict();
