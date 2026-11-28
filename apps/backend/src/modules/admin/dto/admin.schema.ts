import { z } from "zod";
import { RegisterSchema } from "../../auth/dto/auth.schema.js";

const SystemRoleSchema = z.enum(["USER", "ADMIN"]);
const AcademicRoleSchema = z.enum(["STUDENT", "LECTURER", "RESEARCHER"]);
const VerificationStatusFilterSchema = z.enum([
  "SELF_DECLARED",
  "PENDING",
  "NEEDS_MORE_INFORMATION",
  "VERIFIED",
  "REJECTED",
]);
const CreateUserSystemRoleSchema = z.literal("USER");
const AccountStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]);
const ReasonSchema = z.string().trim().min(3).max(500);
const OptionalReasonSchema = z.string().trim().min(3).max(500).optional();

export const ListUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: SystemRoleSchema.optional(),
  academicRole: AcademicRoleSchema.optional(),
  verificationStatus: VerificationStatusFilterSchema.optional(),
  institution: z.string().trim().max(160).optional(),
  accountStatus: AccountStatusSchema.optional(),
  emailVerified: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "lastLoginAt", "fullName", "email"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).strict();
export type ListUsersQueryInput = z.infer<typeof ListUsersQuerySchema>;

export const UpdateRoleSchema = z.object({
  role: SystemRoleSchema,
  reason: ReasonSchema,
}).strict();
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;

export const UpdateStatusSchema = z.object({
  accountStatus: AccountStatusSchema,
  reason: ReasonSchema,
}).strict();
export type UpdateStatusInput = z.infer<typeof UpdateStatusSchema>;

export const CreateUserSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  fullName: z.string().trim().min(1).max(120),
  password: RegisterSchema.shape.password,
  role: CreateUserSystemRoleSchema.default("USER"),
  institution: z.string().trim().max(300).optional(),
  accountStatus: AccountStatusSchema.default("ACTIVE"),
}).strict();
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  email: RegisterSchema.shape.email.optional(),
  fullName: RegisterSchema.shape.fullName.optional(),
  institution: z.string().trim().max(300).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const AdminReasonSchema = z.object({ reason: ReasonSchema }).strict();
export type AdminReasonInput = z.infer<typeof AdminReasonSchema>;

export const ListAuditLogsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  actionName: z.string().trim().max(120).optional(),
  targetTableName: z.string().trim().max(80).optional(),
  actorId: z.string().trim().max(64).optional(),
  from: z.string().trim().datetime({ offset: true }).optional(),
  to: z.string().trim().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export type ListAuditLogsQueryInput = z.infer<typeof ListAuditLogsQuerySchema>;

export const ListAiOperationsQuerySchema = z.object({
  kind: z.enum(["all", "ai_run", "report", "gap_analysis"]).default("all"),
  status: z.string().trim().max(32).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export type ListAiOperationsQueryInput = z.infer<typeof ListAiOperationsQuerySchema>;

export const UpdateAdminInstitutionSchema = z.object({
  isActive: z.boolean(),
  reason: OptionalReasonSchema,
}).strict();
export type UpdateAdminInstitutionInput = z.infer<typeof UpdateAdminInstitutionSchema>;

export const UpdateAdminApiProviderSchema = z.object({
  rateLimitPerMin: z.coerce.number().int().min(1).max(10_000).optional(),
  providerStatus: z.enum(["enabled", "disabled"]).optional(),
  reason: OptionalReasonSchema,
}).strict().refine((v) => v.rateLimitPerMin !== undefined || v.providerStatus !== undefined, {
  message: "At least one setting field must be provided",
});
export type UpdateAdminApiProviderInput = z.infer<typeof UpdateAdminApiProviderSchema>;
