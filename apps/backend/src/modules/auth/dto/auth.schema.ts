import { z } from "zod";
import { MAX_ONBOARDING_RESEARCH_AREAS, MAX_ONBOARDING_RESEARCH_INTERESTS, MAX_ONBOARDING_RESEARCH_SKILLS } from "@trend/shared-types";

export const RegisterSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(10).max(128)
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[0-9]/, "Password must include a number"),
  fullName: z.string().min(1).max(120),
  invitationToken: z.string().min(32).max(256).optional(),
}).strict();
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const UpdateAcademicProfileSchema = z.object({
  academicRole: z.enum(["STUDENT", "RESEARCHER", "LECTURER"]),
  primaryPosition: z.enum(["STUDENT", "LECTURER", "RESEARCH_STAFF", "INDUSTRY_PRACTITIONER", "OTHER"]).optional(),
  positionTitle: z.string().trim().max(160).optional(),
  institutionName: z.string().trim().max(200).optional().nullable(),
  institutionId: z.string().uuid().optional(),
  noAffiliation: z.boolean().optional(),
  department: z.string().trim().max(200).optional().nullable(),
  specifiedPosition: z.string().trim().max(160).optional(),
  country: z.string().trim().min(2).max(100).optional(),
  campusId: z.string().uuid().optional().nullable(),
  programId: z.string().uuid().optional().nullable(),
  programName: z.string().trim().min(2).max(160).optional(),
  researchAreas: z.array(z.string().trim().min(1).max(80)).max(MAX_ONBOARDING_RESEARCH_AREAS).optional(),
  expertiseAreas: z.array(z.string().trim().min(1).max(80)).max(MAX_ONBOARDING_RESEARCH_AREAS).optional(),
  researchInterests: z.array(z.string().trim().min(1).max(80)).max(MAX_ONBOARDING_RESEARCH_INTERESTS).optional(),
  researchKeywords: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(MAX_ONBOARDING_RESEARCH_SKILLS).optional(),
}).strict().superRefine((data, ctx) => {
  const researchAreas = data.researchAreas ?? data.expertiseAreas;
  if (!researchAreas?.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["researchAreas"], message: "Select at least one research area" });
  }
  if (data.noAffiliation || (!data.institutionId && !data.institutionName?.trim())) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["institutionName"], message: "Institution is required" });
  if (data.academicRole === "STUDENT") {
    if (data.noAffiliation || (!data.institutionId && !data.institutionName?.trim())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["institutionName"], message: "Institution is required" });
    }
    if (!data.programId && !data.programName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["programId"], message: "Program / Major is required for students" });
    }
    return;
  }
  if (!(data.positionTitle?.trim() || data.specifiedPosition?.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["positionTitle"], message: "Current position is required" });
  }
  if (!data.institutionId && !data.institutionName?.trim() && !data.noAffiliation) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["institutionName"], message: "Institution is required" });
  }
});
export type UpdateAcademicProfileInput = z.infer<typeof UpdateAcademicProfileSchema>;

export const AcademicOnboardingOptionsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  institutionId: z.string().uuid().optional(),
}).strict();

export const LoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(128),
}).strict();
export type LoginInput = z.infer<typeof LoginSchema>;

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof RefreshSchema>;

export const OAuthExchangeSchema = z.object({
  code: z.string().min(32).max(128),
});
export type OAuthExchangeInput = z.infer<typeof OAuthExchangeSchema>;

export const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  institution: z.string().max(120).optional().nullable(),
  researchInterests: z.array(z.string()).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: RegisterSchema.shape.password,
}).strict();
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const VerifyEmailSchema = z.object({ token: z.string().min(32).max(256) }).strict();
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

export const AddEmailSchema = z.object({
  email: z.string().email().toLowerCase(),
  purpose: z.enum(["INSTITUTIONAL", "CONTACT"]).default("INSTITUTIONAL"),
}).strict();
export type AddEmailInput = z.infer<typeof AddEmailSchema>;

export const ResendEmailVerificationSchema = z.object({ email: z.string().email().toLowerCase() }).strict();
export type ResendEmailVerificationInput = z.infer<typeof ResendEmailVerificationSchema>;

export const ForgotPasswordSchema = ResendEmailVerificationSchema;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  newPassword: RegisterSchema.shape.password,
}).strict();
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export const RankingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type RankingsQueryInput = z.infer<typeof RankingsQuerySchema>;
