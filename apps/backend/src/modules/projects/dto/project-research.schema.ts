import { z } from "zod";
export const researchPageSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20), q: z.string().trim().max(200).default(""), state: z.string().max(32).optional(), itemId: z.string().uuid().optional() }).strict();
const text = (max = 5000) => z.string().trim().max(max);
export const evidenceContentSchema = z.object({
  claim: text().min(3), quotation: text(), locator: text(500), context: text(), methodology: text(),
  population: text(), results: text(), limitations: text(), themes: z.array(text(80).min(1)).max(12),
}).strict();
export const createEvidenceSchema = evidenceContentSchema.extend({ paperId: z.string().uuid(), origin: z.enum(["HUMAN", "AI_SUGGESTED"]), clientKey: z.string().uuid(), sourceChunkId: z.string().uuid().optional(), corpusPaperId: z.string().uuid().optional(), analysisHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
export const editEvidenceSchema = evidenceContentSchema.extend({ expectedVersion: z.number().int().positive() }).strict();
export const reviewEvidenceSchema = z.object({ expectedVersion: z.number().int().positive(), state: z.enum(["ACCEPTED", "REJECTED"]), rationale: text(2000).min(3) }).strict();
export const screeningPolicySchema = z.object({ mode: z.enum(["EXPLORATORY", "INDEPENDENT"]), blinded: z.boolean(), expectedVersion: z.number().int().positive() }).strict();
export const assignScreeningSchema = z.object({ reviewerIds: z.array(z.string().uuid()).min(2).max(5).refine(ids => new Set(ids).size === ids.length), phase: z.enum(["TITLE_ABSTRACT", "FULL_TEXT"]), expectedUpdatedAt: z.string().datetime() }).strict();
export const voteScreeningSchema = z.object({ phase: z.enum(["TITLE_ABSTRACT", "FULL_TEXT"]), decision: z.enum(["UNDECIDED", "INCLUDED", "EXCLUDED", "MAYBE"]), reason: text(2000), expectedVersion: z.number().int().positive() }).strict().refine(value => value.decision !== "EXCLUDED" || value.reason.length >= 3, { message: "Explain the exclusion", path: ["reason"] });
export const resolveScreeningSchema = z.object({ phase: z.enum(["TITLE_ABSTRACT", "FULL_TEXT"]), decision: z.enum(["INCLUDED", "EXCLUDED", "MAYBE"]), reason: text(2000).min(3), expectedUpdatedAt: z.string().datetime() }).strict();
export const organizePaperSchema = z.object({ tags: z.array(text(80).min(1)).max(12), collectionName: text(120).nullable(), expectedUpdatedAt: z.string().datetime() }).strict();
export const importPaperSchema = z.object({ title: text(500).min(3), doi: text(300).regex(/^10\.\d{4,9}\/\S+$/i).optional(), publicationYear: z.number().int().min(1500).max(2100).optional(), journalName: text(300).optional(), abstractText: text(20000).optional(), paperLink: text(2000).url().refine(value => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS source URL").optional(), authors: z.array(text(200).min(1)).max(100).default([]), reference: text(1000).default(""), clientKey: z.string().uuid() }).strict();
export const reviseGapSchema = z.object({ title: text(200).min(3), description: text(10000).min(3), rationale: text(10000).min(3), scope: text(), assumptions: text(), expectedVersion: z.number().int().positive() }).strict();
export const assessGapSchema = z.object({ status: z.enum(["PROPOSED", "IN_REVIEW", "NEEDS_MORE_EVIDENCE", "TEAM_SUPPORTED", "REJECTED"]), rationale: text().min(3), expectedVersion: z.number().int().positive(), reviewedEvidence: z.array(z.object({ id: z.string().uuid(), version: z.number().int().positive() }).strict()).max(30).optional() }).strict();
export const linkGapEvidenceSchema = z.object({ evidenceItemId: z.string().uuid(), expectedEvidenceVersion: z.number().int().positive(), expectedVersion: z.number().int().positive(), kind: z.enum(["SUPPORTING", "COUNTER"]), explanation: text().min(3) }).strict();
export const deriveQuestionSchema = z.object({ text: text(1000).min(3), expectedVersion: z.number().int().positive(), expectedPlanVersion: z.number().int().positive(), clientKey: z.string().uuid() }).strict();
export const gapGuidanceSchema = z.object({ note: text(2000).min(3), expectedVersion: z.number().int().positive(), clientKey: z.string().uuid() }).strict();
export const synthesisContentSchema = z.object({ commonFindings: text(10000), contradictions: text(10000), openQuestions: text(10000) }).strict();
export const synthesisSourcesSchema = z.object({
  expectedVersion: z.number().int().min(0),
  evidence: z.array(z.object({ id: z.string().uuid(), version: z.number().int().positive() }).strict()).min(3).max(30).refine(items => new Set(items.map(item => item.id)).size === items.length, "Select distinct evidence records"),
}).strict();
export const saveSynthesisSchema = synthesisSourcesSchema.extend(synthesisContentSchema.shape).strict();
export const reviewSynthesisSchema = z.object({ expectedVersion: z.number().int().positive(), rationale: text(2000).min(3) }).strict();
