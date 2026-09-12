import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(120),
  role: z.enum(["student", "lecturer", "researcher"]).optional(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});
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
  newPassword: z.string().min(8).max(128),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const RankingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type RankingsQueryInput = z.infer<typeof RankingsQuerySchema>;

