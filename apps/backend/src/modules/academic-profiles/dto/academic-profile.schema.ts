import { z } from "zod";
import { ACADEMIC_BIOGRAPHY_MAX_CHARACTERS, ACADEMIC_BIOGRAPHY_MAX_WORDS, countAcademicBiographyWords } from "@trend/shared-types";
import { objectIdSchema, paginationSchema } from "../../../common/validation/database-id.js";
import { isValidPublicHandle, isValidResolvablePublicHandle, normalizePublicHandle } from "../public-handle.js";

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
export const PublicForumActivityQuerySchema = z.object({
  filter: z.enum(["all", "topics", "replies", "reactions"]).default("all"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export const FeaturedWorkOptionsQuerySchema = z.object({
  kind: z.enum(["PAPER", "PROJECT", "RESEARCH_PROPOSAL", "RESEARCH_ARTIFACT", "CANDIDATE_GAP"]).default("PAPER"),
  q: z.string().trim().max(200).default(""),
}).strict();
const optionalBiography = z.string().trim().max(ACADEMIC_BIOGRAPHY_MAX_CHARACTERS).refine(
  (value) => countAcademicBiographyWords(value) <= ACADEMIC_BIOGRAPHY_MAX_WORDS,
  "Biography must be " + ACADEMIC_BIOGRAPHY_MAX_WORDS + " words or fewer",
).optional();
const booleanQuery = z.union([z.boolean(), z.enum(["true", "false"])]).transform((value) => value === true || value === "true");
const httpsUrl = z.string().url().max(500).refine((value) => new URL(value).protocol === "https:", {
  message: "Only HTTPS profile URLs are allowed",
});

export function isValidOrcid(value: string): boolean {
  const normalized = value.replace(/^https?:\/\/orcid\.org\//i, "").toUpperCase();
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

const academicIdentityProviderSchema = z.enum(["ORCID", "OPENALEX", "GOOGLE_SCHOLAR", "SEMANTIC_SCHOLAR", "OTHER"]);
const externalHttpUrl = z.string().url().max(500).refine((value) => {
  const url = new URL(value);
  return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
}, "Only HTTP or HTTPS profile URLs without embedded credentials are allowed");
const academicIdentityLinkFields = z.object({
  provider: academicIdentityProviderSchema,
  label: optionalText(120),
  identifier: optionalText(255),
  profileUrl: externalHttpUrl.optional(),
  visibility: z.enum(["PUBLIC", "REGISTERED_USERS", "PRIVATE"]).default("PUBLIC"),
}).strict();

function validateAcademicIdentityLink(value: z.infer<typeof academicIdentityLinkFields>, ctx: z.RefinementCtx) {
  const identifier = value.identifier?.trim();
  const profileUrl = value.profileUrl ? new URL(value.profileUrl) : undefined;
  if (!identifier && !profileUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["identifier"], message: "An identifier or profile URL is required" });
  }
  if (identifier && /^[a-z][a-z\d+.-]*:/i.test(identifier) && !/^https?:\/\//i.test(identifier)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["identifier"], message: "Identifiers cannot use unsupported URL schemes" });
  }
  if (value.provider === "OTHER" && !value.label?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["label"], message: "A profile name is required for Other academic profile" });
  }
  if (value.provider === "ORCID") {
    const candidate = identifier ?? value.profileUrl ?? "";
    if (!isValidOrcid(candidate)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["identifier"], message: "Invalid ORCID checksum" });
    if (profileUrl && profileUrl.hostname.toLowerCase() !== "orcid.org") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["profileUrl"], message: "ORCID URLs must use orcid.org" });
    }
  }
  if (value.provider === "OPENALEX") {
    const candidate = (identifier ?? value.profileUrl ?? "").replace(/^https?:\/\/openalex\.org\//i, "").replace(/\/$/, "");
    if (!/^A\d+$/i.test(candidate)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["identifier"], message: "OpenAlex Author ID must look like A123456789" });
    if (profileUrl && profileUrl.hostname.toLowerCase() !== "openalex.org") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["profileUrl"], message: "OpenAlex URLs must use openalex.org" });
    }
  }
  if (value.provider === "GOOGLE_SCHOLAR") {
    if (!profileUrl || profileUrl.hostname.toLowerCase() !== "scholar.google.com" || !/^\/citations\/?$/i.test(profileUrl.pathname) || !profileUrl.searchParams.get("user")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["profileUrl"], message: "Use a Google Scholar citations profile URL with a user ID" });
    }
  }
  if (value.provider === "SEMANTIC_SCHOLAR" && profileUrl
      && (!/^(www\.)?semanticscholar\.org$/i.test(profileUrl.hostname) || !/^\/author\//i.test(profileUrl.pathname))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["profileUrl"], message: "Semantic Scholar URLs must use semanticscholar.org/author" });
  }
}

export const AcademicIdentityLinkSchema = academicIdentityLinkFields.superRefine(validateAcademicIdentityLink);
export const CreateAcademicIdentityLinkSchema = AcademicIdentityLinkSchema;
export const UpdateAcademicIdentityLinkSchema = academicIdentityLinkFields.extend({
  identifier: optionalText(255).nullable(),
  profileUrl: externalHttpUrl.nullable().optional(),
}).partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one academic identity field is required",
);
export const AcademicIdentityLinkParamsSchema = z.object({ identityId: objectIdSchema }).strict();
export type CreateAcademicIdentityLinkInput = z.infer<typeof CreateAcademicIdentityLinkSchema>;
export type UpdateAcademicIdentityLinkInput = z.infer<typeof UpdateAcademicIdentityLinkSchema>;

const featuredWorkSchema = z.object({
  kind: z.enum(["PAPER", "PROJECT", "RESEARCH_PROPOSAL", "RESEARCH_ARTIFACT", "CANDIDATE_GAP", "DATASET", "CONTRIBUTION", "OTHER"]).optional(),
  paperId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  submissionId: objectIdSchema.optional(),
  reportId: objectIdSchema.optional(),
  gapId: objectIdSchema.optional(),
  doi: optionalText(300),
  title: optionalText(500),
  year: z.number().int().min(1000).max(new Date().getFullYear() + 1).optional(),
  source: z.enum(["LUMIGAP", "ORCID", "MANUAL"]),
}).strict().superRefine((work, ctx) => {
  const targets = [work.paperId, work.projectId, work.submissionId, work.reportId, work.gapId].filter(Boolean);
  const kind = work.kind ?? "PAPER";
  const matches = kind === "PAPER" ? work.paperId : kind === "PROJECT" ? work.projectId : kind === "CANDIDATE_GAP" ? work.gapId : ["RESEARCH_ARTIFACT", "RESEARCH_PROPOSAL"].includes(kind) ? work.submissionId ?? work.reportId : undefined;
  if (work.source === "LUMIGAP" && (targets.length !== 1 || !matches)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a LumiGap record matching this work type" });
  if (work.source !== "LUMIGAP" && targets.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "External works cannot reference private LumiGap records" });
  if (work.source !== "LUMIGAP" && !work.title && !work.doi) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "External works require a title or DOI" });
  }
});

const affiliationSchema = z.object({
  institutionId: z.string().uuid().optional(),
  institutionName: optionalText(200),
  programId: z.string().uuid().optional(),
  programName: z.string().trim().min(2).max(160).optional(),
  rorId: z.string().trim().regex(/^(?:https:\/\/ror\.org\/)?0[a-z0-9]{8}$/i, "Invalid ROR ID").optional(),
  department: optionalText(200),
  position: optionalText(160),
  startYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  institutionalEmail: z.union([z.string().trim().toLowerCase().email().max(320), z.literal("")]).optional(),
}).strict();

export const UpdateAcademicProfileDetailsSchema = z.object({
  academicRole: z.enum(["STUDENT", "RESEARCHER", "LECTURER"]).optional(),
  primaryPosition: z.enum(["STUDENT", "LECTURER", "RESEARCH_STAFF", "INDUSTRY_PRACTITIONER", "OTHER"]).optional(),
  positionTitle: z.string().trim().min(1).max(160).optional(),
  // Temporary compatibility input. The service translates this into primaryPosition.
  academicType: z.enum(["student", "researcher", "lecturer"]).optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  headline: optionalText(180),
  biography: optionalBiography,
  profileVisibility: z.enum(["PUBLIC", "MEMBERS_ONLY", "PRIVATE"]).optional(),
  discoverability: z.object({
    showInResearcherSearch: z.boolean().optional(),
    allowCollaborationRequests: z.boolean().optional(),
  }).strict().optional(),
  privacy: z.object({
    orcid: z.enum(["PUBLIC", "REGISTERED_USERS", "PRIVATE"]).optional(),
    researchInterests: z.enum(["PUBLIC", "REGISTERED_USERS", "PRIVATE"]).optional(),
    expertise: z.enum(["PUBLIC", "REGISTERED_USERS", "PRIVATE"]).optional(),
  }).strict().optional(),
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
    const keys = items.map((item) => item.paperId ?? item.projectId ?? item.submissionId ?? item.reportId ?? item.gapId ?? item.doi?.toLowerCase() ?? item.title?.toLowerCase());
    return new Set(keys).size === keys.length;
  }, "Featured works must be unique").optional(),
  supportAvailability: availabilitySchema(supportTypes).optional(),
  reviewAvailability: reviewAvailabilitySchema.optional(),

  // Compatibility fields accepted from clients released with the first MVP.
  bio: optionalBiography,
  institution: optionalText(200),
  department: optionalText(200),
  institutionalEmail: z.string().trim().toLowerCase().email().max(320).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const PublicProfileParamsSchema = z.object({ userId: objectIdSchema }).strict();
export const PublicHandleSchema = z.string().trim().transform(normalizePublicHandle)
  .refine(isValidPublicHandle, "Use 3–40 lowercase letters, numbers, or single hyphens; choose a non-reserved name");
const ResolvablePublicHandleSchema = z.string().trim().transform(normalizePublicHandle)
  .refine(isValidResolvablePublicHandle, "Invalid public profile URL");
export const PublicHandleParamsSchema = z.object({ handle: ResolvablePublicHandleSchema }).strict();
export const UpdatePublicHandleSchema = z.object({ handle: PublicHandleSchema }).strict();
const lecturerSourceType = z.enum(["OFFICIAL_FACULTY_PROFILE", "OFFICIAL_STAFF_DIRECTORY", "DEPARTMENT_DIRECTORY", "INSTITUTION_ISSUED_PROFILE", "EMPLOYMENT_DOCUMENT", "APPOINTMENT_DOCUMENT", "STAFF_ID", "OTHER_INSTITUTION_SOURCE"]);
export const LecturerEvidenceEntrySchema = z.object({
  type: lecturerSourceType,
  sourceKind: z.enum(["URL", "DOCUMENT"]),
  customEvidenceName: z.string().trim().min(2).max(200).optional(),
  reference: z.string().trim().min(1).max(500).optional(),
  documentIndex: z.number().int().min(0).max(5).optional(),
  uploadId: z.string().uuid().optional(),
  retainedSourceId: z.string().uuid().optional(),
  additionalExplanation: z.string().trim().max(1000).optional(),
}).strict().superRefine((entry, ctx) => {
  const custom = entry.type === "OTHER_INSTITUTION_SOURCE";
  const document = ["INSTITUTION_ISSUED_PROFILE", "EMPLOYMENT_DOCUMENT", "APPOINTMENT_DOCUMENT", "STAFF_ID"].includes(entry.type);
  if (custom && !entry.customEvidenceName) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customEvidenceName"], message: "Describe your custom evidence" });
  if (!custom && (entry.customEvidenceName || entry.sourceKind !== (document ? "DOCUMENT" : "URL"))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Evidence format must match its type" });
  if (entry.sourceKind === "URL") {
    if (!entry.reference || entry.documentIndex !== undefined || entry.uploadId || entry.retainedSourceId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "URL evidence requires only a source URL" });
  } else if ([entry.documentIndex !== undefined, Boolean(entry.uploadId), Boolean(entry.retainedSourceId)].filter(Boolean).length !== 1 || entry.reference) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Document evidence requires exactly one uploaded document" });
});
const lecturerSources = z.preprocess(value => {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}, z.array(LecturerEvidenceEntrySchema).min(1).max(6));

export const VerificationRequestSchema = z.object({
  type: z.enum(["POSITION", "AFFILIATION"]).default("POSITION"),
  evidenceType: z.enum(["INSTITUTIONAL_EMAIL", "INSTITUTIONAL_PROFILE", "ORCID", "EXTERNAL_ACADEMIC_PROFILE", "DOCUMENT", "OTHER"]),
  reference: z.string().trim().max(500).optional(),
  institutionId: z.string().uuid().optional(),
  studentId: z.string().trim().min(1).max(80).optional(),
  staffId: z.string().trim().max(80).optional(),
  additionalNote: z.string().trim().max(1000).optional(),
  proofType: z.enum(["STUDENT_CARD", "ENROLLMENT", "STAFF", "APPOINTMENT"]).optional(),
  path: z.enum(["STANDARD", "MANUAL"]).optional(),
  primarySourceType: z.enum(["OFFICIAL_FACULTY_PROFILE", "OFFICIAL_STAFF_DIRECTORY", "DEPARTMENT_DIRECTORY", "EMPLOYMENT_DOCUMENT", "APPOINTMENT_DOCUMENT", "STAFF_ID", "OTHER_INSTITUTION_SOURCE"]).optional(),
  additionalSourceType: z.enum(["OFFICIAL_FACULTY_PROFILE", "OFFICIAL_STAFF_DIRECTORY", "DEPARTMENT_DIRECTORY", "EMPLOYMENT_DOCUMENT", "APPOINTMENT_DOCUMENT", "STAFF_ID", "OTHER_INSTITUTION_SOURCE"]).optional(),
  additionalReference: z.string().trim().max(500).optional(),
  sources: lecturerSources.optional(),
  submissionKey: z.string().uuid().optional(),
  supplementsRequestId: z.string().uuid().optional(),
  expectedReviewedAt: z.string().datetime().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.sources) {
    if (value.supplementsRequestId && (!value.submissionKey || !value.expectedReviewedAt) || value.expectedReviewedAt && !value.supplementsRequestId || value.sources.some(source => source.retainedSourceId) && !value.supplementsRequestId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Supplement requires the original request, decision timestamp and submission key" });
    if (value.type !== "POSITION" || !value.path || !value.institutionId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Evidence entries require the Lecturer verification path and institution" });
    if (value.primarySourceType || value.additionalSourceType || value.reference || value.additionalReference) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Do not mix legacy evidence fields with evidence entries" });
    if (value.sources.some(source => source.uploadId) && !value.submissionKey) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Staged evidence requires a submission key" });
    return;
  }
  if (value.submissionKey || value.supplementsRequestId || value.expectedReviewedAt) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Submission keys require Lecturer evidence entries" });
  if (value.type === "AFFILIATION") {
    for (const field of ["institutionId", "proofType"] as const) {
      if (!value[field]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Required for affiliation verification" });
    }
    if (value.evidenceType !== "DOCUMENT") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["evidenceType"], message: "Private document evidence is required" });
  }
  if (["INSTITUTIONAL_PROFILE", "EXTERNAL_ACADEMIC_PROFILE"].includes(value.evidenceType)) {
    try {
      const url = new URL(value.reference ?? "");
      if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reference"], message: "Use a valid HTTPS profile URL" });
    }
  }
  if (value.evidenceType === "OTHER" && !value.reference?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reference"], message: "Describe the supporting evidence" });
  }
});
export const InstitutionalEmailChallengeSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid institutional email address.").max(320).optional() }).strict();
export const InstitutionalEmailVerifySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit verification code"),
  email: z.string().trim().toLowerCase().email().max(320).optional(),
}).strict();
export const VerificationStatusQuerySchema = z.object({ submissionKey: z.string().uuid().optional(), requestId: z.string().uuid().optional(), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
export const EvidenceUploadSchema = z.object({ institutionId: z.string().uuid() }).strict();
export const VerificationListQuerySchema = paginationSchema.extend({
  status: z.enum(["ALL", "PENDING", "NEEDS_MORE_INFORMATION", "VERIFIED", "REJECTED", "EXPIRED", "INVALIDATED"]).default("ALL"),
});
export const LecturerListQuerySchema = paginationSchema.extend({
  expertise: z.string().trim().max(120).optional(),
  researchInterest: z.string().trim().max(120).optional(),
  institution: z.string().trim().max(200).optional(),
  supportAvailable: booleanQuery.optional(),
  reviewAvailable: booleanQuery.optional(),
  verifiedOnly: booleanQuery.default(true),
});
export const VerificationDecisionParamsSchema = z.object({ requestId: objectIdSchema }).strict();
const reviewFields = {
  identityBindingMethod: z.enum(["INSTITUTION_CONTACT", "TRUSTED_INSTITUTION_RECORD"]).optional(),
  identityBindingReference: z.string().trim().min(10).max(500).optional(),
  checklist: z.object({ identityMatches: z.boolean(), institutionMatches: z.boolean(), currentPositionConfirmed: z.boolean(), institutionControlled: z.boolean(), noConflicts: z.boolean(), identityBound: z.boolean().optional(), independentEvidence: z.boolean().optional() }).strict().optional(),
  evidenceChecks: z.array(z.object({ id: z.string().uuid(), status: z.enum(["UNCHECKED", "VALID", "INVALID", "INCONCLUSIVE"]), note: optionalText(1000), institutionDomainConfirmed: z.boolean().optional() }).strict()).max(7).optional(),
};
export const VerificationDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), method: optionalText(120), note: optionalText(1000), ...reviewFields }).strict(),
  z.object({ decision: z.literal("reject"), reason: z.string().trim().min(1).max(1000), note: optionalText(1000), ...reviewFields }).strict(),
  z.object({ decision: z.literal("more_info"), reason: z.string().trim().min(1).max(1000), note: optionalText(1000), ...reviewFields }).strict(),
]);

export type UpdateAcademicProfileDetailsInput = z.infer<typeof UpdateAcademicProfileDetailsSchema>;
export type VerificationDecisionInput = z.infer<typeof VerificationDecisionSchema>;
export type VerificationRequestInput = z.infer<typeof VerificationRequestSchema>;
export type LecturerListQueryInput = z.infer<typeof LecturerListQuerySchema>;
