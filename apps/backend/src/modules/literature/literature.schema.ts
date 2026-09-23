import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid identifier format");
const optionalText = (max: number) => z.string().trim().max(max).optional();

const picocSchema = z.object({
  population: optionalText(1000), intervention: optionalText(1000), comparison: optionalText(1000),
  outcome: optionalText(1000), context: optionalText(1000),
}).strict();

export const createCorpusSchema = z.object({
  name: z.string().trim().min(3).max(200),
  topic: z.string().trim().min(3).max(300),
  researchGoal: optionalText(5000),
  domain: optionalText(300),
  keywords: z.array(z.string().trim().min(1).max(120)).max(30).default([]).transform((values) => [...new Set(values)]),
  picoc: picocSchema.default({}),
  searchStrategy: optionalText(10000),
  projectId: objectId.optional(),
}).strict();

const evidenceSchema = z.object({
  researchProblem: optionalText(5000), objectives: optionalText(5000), population: optionalText(2000),
  context: optionalText(2000), intervention: optionalText(2000), comparison: optionalText(2000),
  outcome: optionalText(2000), methodology: optionalText(500), dataset: optionalText(2000),
  findings: optionalText(10000), limitations: optionalText(10000), futureWork: optionalText(10000),
  contributionType: optionalText(500), researchType: optionalText(500),
}).strict();

export const addCorpusPaperSchema = z.object({
  paperId: objectId,
  included: z.boolean().default(true),
  exclusionReason: optionalText(2000),
  evidence: evidenceSchema.default({}),
}).strict().superRefine((value, ctx) => {
  if (!value.included && !value.exclusionReason) ctx.addIssue({ code: "custom", path: ["exclusionReason"], message: "Exclusion reason is required" });
});

export const corpusIdParamsSchema = z.object({ id: objectId });
export const corpusPaperParamsSchema = z.object({ id: objectId, paperId: objectId });
