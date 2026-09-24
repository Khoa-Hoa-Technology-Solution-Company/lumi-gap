import { z } from "zod";
import { objectIdSchema, paginationSchema } from "../../../common/validation/database-id.js";
import { isValidPublicHandle, normalizePublicHandle } from "../public-handle.js";

const normalizeList = (maxItems: number, maxLength = 120) => z
  .array(z.string().trim().min(1).max(maxLength))
  .max(maxItems)
  .transform((items) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

const optionalText = (max: number) => z.string().trim().max(max).optional();
const booleanQuery = z.union([z.boolean(), z.enum(["true", "false"])]).transform((value) => value === true || value === "true");
const httpsUrl = z.string().url().max(500).refine((value) => new URL(value).protocol === "https:", {
  message: "Only HTTPS profile URLs are allowed",
});

export function isValidOrcid(value: string): boolean {
  const normalized = value.replace(/^https:\/\/orcid\.org\//i, "").toUpperCase();
  if (!/^\d{4}-\d{4}-\d{4}-[\dX]{4}$/.test(normalized)) return false;
  const chars = normalized.replaceAll("-", "");
  let total = 0;
  for (const char of chars.slice(0, 15)) total = (total + Number(char)) * 2;
  const remainder = (12 - (total % 11)) % 11;
  return chars[15] === (remainder === 10 ? "X" : String(remainder));
}

const supportTypes = z.enum([
  "RESEARCH_DIRECTION", "LITERATURE_REVIEW", "RESEARCH_GAP_VALIDATION",
  "RESEARCH_METHODOLOGY", "EXPERIMENT_DESIGN", "DATA_ANALYSIS",
  "ACADEMIC_WRITING", "SOFTWARE_TECHNICAL_GUIDANCE",
]);
const reviewTypes = z.enum([
  "RESEARCH_PROPOSAL", "LITERATURE_REVIEW", "THESIS_DRAFT", "RESEARCH_GAP", "METHODOLOGY",
  "EXPERIMENTAL_RESULTS", "RESEARCH_PAPER", "SOFTWARE_RESEARCH_PROJECT",
]);

const availabilitySchema = <T extends z.ZodTypeAny>(typeSchema: T) => z.object({
  enabled: z.boolean(),
  types: z.array(typeSchema).max(20).transform((items) => [...new Set(items)]),
  preferredTopics: normalizeList(30),
  note: optionalText(1000),
}).strict();

const reviewAvailabilitySchema = availabilitySchema(reviewTypes).extend({
  acceptedFields: normalizeList(30).optional(),
  maximumActiveReviews: z.number().int().min(1).max(20).optional(),
  preferredReviewWorkload: optionalText(160),
  temporarilyUnavailableUntil: z.coerce.date().nullable().optional(),
  autoRecommendationEnabled: z.boolean().optional(),
}).strict();

const externalIdentitySchema = z.object({
  provider: z.enum(["ORCID", "GITHUB", "OPENALEX", "GOOGLE_SCHOLAR", "SEMANTIC_SCHOLAR", "OTHER"]),
  externalId: optionalText(200),
  profileUrl: httpsUrl.optional(),
}).strict().superRefine((identity, ctx) => {
  if (!identity.externalId && !identity.profileUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "An external ID or profile URL is required" });
  }
  if (identity.provider === "ORCID") {
    const orcid = identity.externalId ?? identity.profileUrl ?? "";
    if (!isValidOrcid(orcid)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid ORCID checksum" });
    }
    if (identity.profileUrl && new URL(identity.profileUrl).hostname.toLowerCase() !== "orcid.org") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ORCID URLs must use orcid.org" });
    }
  }
  if (identity.provider === "GITHUB" && identity.profileUrl
      && new URL(identity.profileUrl).hostname.toLowerCase() !== "github.com") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "GitHub URLs must use github.com" });
  }
  if (identity.provider === "OPENALEX") {
    const value = (identity.externalId ?? identity.profileUrl ?? "").replace(/^https:\/\/openalex\.org\//i, "");
    if (!/^A\d+$/i.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "OpenAlex Author ID must look like A123456789" });
    }
    if (identity.profileUrl && new URL(identity.profileUrl).hostname.toLowerCase() !== "openalex.org") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "OpenAlex URLs must use openalex.org" });
    }
  }
  if (identity.provider === "GOOGLE_SCHOLAR") {
    if (!identity.profileUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Google Scholar requires a profile URL" });
    } else {
      const url = new URL(identity.profileUrl);
      if (url.hostname.toLowerCase() !== "scholar.google.com" || !url.searchParams.get("user")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use a Google Scholar citations profile URL with a user ID" });
      }
    }
  }
  if (identity.provider === "SEMANTIC_SCHOLAR") {
    const value = identity.externalId ?? "";
    const url = identity.profileUrl ? new URL(identity.profileUrl) : undefined;
    const validUrl = url
      && ["semanticscholar.org", "www.semanticscholar.org"].includes(url.hostname.toLowerCase())
      && /^\/author\//i.test(url.pathname);
    if (!value && !validUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use a Semantic Scholar Author ID or author profile URL" });
    }
    if (url && !validUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Semantic Scholar URLs must use semanticscholar.org/author" });
    }
  }
});

const featuredWorkSchema = z.object({
  paperId: objectIdSchema.optional(),
  doi: optionalText(300),
  title: optionalText(500),
  year: z.number().int().min(1000).max(new Date().getFullYear() + 1).optional(),
  source: z.enum(["LUMIGAP", "ORCID", "MANUAL"]),
}).strict().superRefine((work, ctx) => {
  if (work.source === "LUMIGAP" && !work.paperId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paperId"], message: "LumiGap works require a paperId" });
  }
  if (work.source !== "LUMIGAP" && !work.title && !work.doi) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "External works require a title or DOI" });
  }
});

const affiliationSchema = z.object({
  institutionName: optionalText(200),
  rorId: z.string().trim().regex(/^(?:https:\/\/ror\.org\/)?0[a-z0-9]{8}$/i, "Invalid ROR ID").optional(),
  department: optionalText(200),
  position: optionalText(160),
  startYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  institutionalEmail: z.union([z.string().trim().toLowerCase().email().max(320), z.literal("")]).optional(),
}).strict();

export const UpdateAcademicProfileDetailsSchema = z.object({
  academicType: z.enum(["student", "researcher", "lecturer"]).optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  headline: optionalText(180),
  biography: optionalText(3000),
  profileVisibility: z.enum(["PUBLIC", "MEMBERS_ONLY", "PRIVATE"]).optional(),
  academicTitle: z.enum([
    "Lecturer", "Senior Lecturer", "Assistant Professor", "Associate Professor",
    "Professor", "Research Fellow", "Other",
  ]).nullable().optional(),
  affiliation: affiliationSchema.optional(),
  researchInterests: normalizeList(30).optional(),
  expertiseAreas: normalizeList(30).optional(),
  skills: normalizeList(40).optional(),
  researchKeywords: normalizeList(40).optional(),
  externalIdentities: z.array(externalIdentitySchema).max(8).refine(
    (items) => new Set(items.map((item) => item.provider)).size === items.length,
    "Only one identity per provider is allowed",
  ).optional(),
  featuredWorks: z.array(featuredWorkSchema).max(10).refine((items) => {
    const keys = items.map((item) => item.paperId ?? item.doi?.toLowerCase() ?? item.title?.toLowerCase());
    return new Set(keys).size === keys.length;
  }, "Featured works must be unique").optional(),
  supportAvailability: availabilitySchema(supportTypes).optional(),
  reviewAvailability: reviewAvailabilitySchema.optional(),

  // Compatibility fields accepted from clients released with the first MVP.
  bio: optionalText(3000),
  institution: optionalText(200),
  department: optionalText(200),
  institutionalEmail: z.string().trim().toLowerCase().email().max(320).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const PublicProfileParamsSchema = z.object({ userId: objectIdSchema }).strict();
export const PublicHandleSchema = z.string().trim().transform(normalizePublicHandle)
  .refine(isValidPublicHandle, "Use 3–40 lowercase letters, numbers, or single hyphens; choose a non-reserved name");
export const PublicHandleParamsSchema = z.object({ handle: PublicHandleSchema }).strict();
export const UpdatePublicHandleSchema = z.object({ handle: PublicHandleSchema }).strict();
export const VerificationRequestSchema = z.object({}).strict();
export const InstitutionalEmailChallengeSchema = z.object({}).strict();
export const InstitutionalEmailVerifySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit verification code"),
}).strict();
export const VerificationListQuerySchema = paginationSchema.extend({
  status: z.enum(["PENDING", "VERIFIED", "REJECTED", "SELF_DECLARED"]).default("PENDING"),
});
export const LecturerListQuerySchema = paginationSchema.extend({
  expertise: z.string().trim().max(120).optional(),
  researchInterest: z.string().trim().max(120).optional(),
  institution: z.string().trim().max(200).optional(),
  supportAvailable: booleanQuery.optional(),
  reviewAvailable: booleanQuery.optional(),
  verifiedOnly: booleanQuery.default(true),
});
export const VerificationDecisionParamsSchema = z.object({ profileId: objectIdSchema }).strict();
export const VerificationDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), method: optionalText(120), note: optionalText(1000) }).strict(),
  z.object({ decision: z.literal("reject"), reason: z.string().trim().min(1).max(1000), note: optionalText(1000) }).strict(),
]);

export type UpdateAcademicProfileDetailsInput = z.infer<typeof UpdateAcademicProfileDetailsSchema>;
export type VerificationDecisionInput = z.infer<typeof VerificationDecisionSchema>;
export type LecturerListQueryInput = z.infer<typeof LecturerListQuerySchema>;
