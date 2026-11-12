import { z } from "zod";
import { integrityAiCategories } from "@trend/shared-types";
const key = { clientKey: z.string().uuid() };
const version = { expectedVersion: z.number().int().min(0) };
const text = (max: number) => z.string().trim().max(max).default("");
export const integrityPolicySchema = z.object({
  requireAiAcknowledgement: z.boolean(), requireRightsAcknowledgement: z.boolean(), requireCitationAudit: z.boolean(), requireCurrentSnapshot: z.boolean(), reason: z.string().trim().min(5).max(1000),
}).strict();
export const integrityAiDeclarationSchema = z.object({
  disclosure: z.string().trim().min(10).max(5000), venuePolicy: text(1000),
  externalUsage: z.array(z.object({ tool: z.string().trim().min(2).max(120), category: z.enum(integrityAiCategories), purpose: z.string().trim().min(5).max(2000), affectedSections: text(1000) }).strict()).max(30),
}).strict();
export const integrityRightsSchema = z.object({
  holders: z.array(z.string().trim().min(2).max(200)).min(1).max(30),
  basis: z.enum(["INDIVIDUAL_AUTHORS", "JOINT_CLAIM", "INSTITUTIONAL_AGREEMENT", "EMPLOYMENT", "LICENSE_OR_ASSIGNMENT", "UNDETERMINED"]),
  basisExplanation: z.string().trim().min(10).max(3000), institutionalArrangement: text(2000), thirdPartyContent: text(3000), restrictions: text(2000), unresolvedQuestions: text(2000),
  supportingReferences: z.array(z.string().url().max(1000).refine(value => { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }, "Only public HTTP(S) reference links without credentials are supported")).max(10),
  prohibitsInternalSubmission: z.boolean(),
}).strict();
export const integrityCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CITATION_AUDIT"), ...key }).strict(),
  z.object({ kind: z.literal("READINESS_REPORT"), ...key }).strict(),
  z.object({ kind: z.literal("AI_DECLARATION"), ...key, ...version, content: integrityAiDeclarationSchema }).strict(),
  z.object({ kind: z.literal("RIGHTS_DECLARATION"), ...key, ...version, content: integrityRightsSchema }).strict(),
  z.object({ kind: z.literal("POLICY"), ...key, ...version, content: integrityPolicySchema }).strict(),
  z.object({ kind: z.literal("ACKNOWLEDGE"), recordId: z.string().uuid(), evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict(),
]);
export const aiAcceptanceSchema = z.object({ fileId: z.string().uuid(), sequence: z.number().int().min(1), clientKey: z.string().uuid(), paperId: z.string().uuid().optional() }).strict();
