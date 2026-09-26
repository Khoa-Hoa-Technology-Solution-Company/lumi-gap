import { z } from "zod";
import { RegisterSchema } from "../../auth/dto/auth.schema.js";

const SystemRoleSchema = z.enum(["RESEARCH_USER", "ADMIN", "SUPER_ADMIN"]);
const AccountStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]);
const ReasonSchema = z.string().trim().min(3).max(500);

export const ListUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: SystemRoleSchema.optional(),
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
  role: SystemRoleSchema.default("RESEARCH_USER"),
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
