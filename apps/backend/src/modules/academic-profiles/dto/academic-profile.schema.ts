import { z } from "zod";
import { objectIdSchema, paginationSchema } from "../../../common/validation/mongo.js";

const trimmedList = z.array(z.string().trim().min(1).max(120)).max(50);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const httpsUrl = z.string().url().max(500).refine((value) => new URL(value).protocol === "https:", {
  message: "Only HTTPS profile URLs are allowed",
});

const supportTypes = z.enum([
  "RESEARCH_DIRECTION", "LITERATURE_REVIEW", "RESEARCH_GAP_VALIDATION", "METHODOLOGY",
  "EXPERIMENT_DESIGN", "DATA_ANALYSIS", "ACADEMIC_WRITING", "PAPER_REVIEW",
  "SOFTWARE_TECHNICAL_REVIEW",
]);
const reviewTypes = z.enum([
  "RESEARCH_PROPOSAL", "LITERATURE_REVIEW", "RESEARCH_GAP", "METHODOLOGY",
  "EXPERIMENT_REPORT", "MANUSCRIPT", "SOFTWARE_RESEARCH_PROJECT",
]);

const availabilitySchema = <T extends z.ZodTypeAny>(typeSchema: T) => z.object({
  enabled: z.boolean(),
  types: z.array(typeSchema).max(20),
  preferredTopics: trimmedList,
  note: optionalText(1000),
}).strict();

export const UpdateAcademicProfileDetailsSchema = z.object({
  academicType: z.enum(["student", "researcher", "lecturer"]).optional(),
  displayName: optionalText(120),
  bio: optionalText(3000),
  institution: optionalText(200),
  department: optionalText(200),
  academicTitle: optionalText(160),
  institutionalEmail: z.string().trim().email().max(320).optional(),
  researchInterests: trimmedList.optional(),
  expertiseAreas: trimmedList.optional(),
  skills: trimmedList.optional(),
  externalIdentities: z.array(z.object({
    provider: z.enum(["ORCID", "GITHUB"]),
    externalId: optionalText(200),
    profileUrl: httpsUrl.optional(),
  }).strict()).max(2).refine(
    (items) => new Set(items.map((item) => item.provider)).size === items.length,
    "Only one identity per provider is allowed",
  ).optional(),
  supportAvailability: availabilitySchema(supportTypes).optional(),
  reviewAvailability: availabilitySchema(reviewTypes).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const PublicProfileParamsSchema = z.object({ userId: objectIdSchema }).strict();
export const VerificationRequestSchema = z.object({}).strict();
export const VerificationListQuerySchema = paginationSchema.extend({
  status: z.enum(["PENDING", "VERIFIED", "REJECTED", "SELF_DECLARED"]).default("PENDING"),
});
export const VerificationDecisionParamsSchema = z.object({ profileId: objectIdSchema }).strict();
export const VerificationDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), note: optionalText(1000) }).strict(),
  z.object({ decision: z.literal("reject"), reason: z.string().trim().min(1).max(1000), note: optionalText(1000) }).strict(),
]);

export type UpdateAcademicProfileDetailsInput = z.infer<typeof UpdateAcademicProfileDetailsSchema>;
export type VerificationDecisionInput = z.infer<typeof VerificationDecisionSchema>;
