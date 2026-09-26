import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(10).max(128)
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[0-9]/, "Password must include a number"),
  fullName: z.string().min(1).max(120),
}).strict();
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const UpdateAcademicProfileSchema = z.object({
  primaryPosition: z.enum(["STUDENT", "LECTURER", "RESEARCH_STAFF", "INDUSTRY_PRACTITIONER", "OTHER"]).optional(),
  positionTitle: z.string().trim().max(160).optional(),
  institutionName: z.string().trim().max(200).optional().nullable(),
  noAffiliation: z.boolean().optional(),
  department: z.string().trim().max(200).optional().nullable(),
  specifiedPosition: z.string().trim().max(160).optional(),
  country: z.string().trim().min(2).max(100).optional(),
}).strict().refine(
  (data) => Boolean(data.primaryPosition || data.positionTitle || data.specifiedPosition),
  { message: "Position is required", path: ["positionTitle"] },
);
export type UpdateAcademicProfileInput = z.infer<typeof UpdateAcademicProfileSchema>;

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
  fullName: z.string().min(1).max(120).optional(),
  institution: z.string().max(120).optional().nullable(),
  researchInterests: z.array(z.string()).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: RegisterSchema.shape.password,
}).strict();
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const VerifyEmailSchema = z.object({ token: z.string().min(32).max(256) }).strict();
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

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
