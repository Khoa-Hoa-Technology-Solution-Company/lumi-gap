import { z } from "zod";

export const ListUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: z.enum(["student", "lecturer", "researcher", "admin"]).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListUsersQueryInput = z.infer<typeof ListUsersQuerySchema>;

export const UpdateRoleSchema = z.object({
  role: z.enum(["student", "lecturer", "researcher", "admin"]),
});
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;

export const UpdateStatusSchema = z.object({
  isActive: z.boolean(),
});
export type UpdateStatusInput = z.infer<typeof UpdateStatusSchema>;
