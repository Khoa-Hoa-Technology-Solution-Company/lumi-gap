import { describe, expect, it } from "vitest";
import {
  CreateUserSchema, ListUsersQuerySchema, UpdateRoleSchema, UpdateStatusSchema,
} from "../dto/admin.schema.js";

describe("admin user schemas", () => {
  it("parses lifecycle filters and deterministic sorting", () => {
    expect(ListUsersQuerySchema.parse({
      role: "SUPER_ADMIN", accountStatus: "SUSPENDED", emailVerified: "false", sortBy: "lastLoginAt",
    })).toMatchObject({ role: "SUPER_ADMIN", accountStatus: "SUSPENDED", emailVerified: false, sortBy: "lastLoginAt" });
  });

  it("requires an audit reason for sensitive mutations", () => {
    expect(UpdateRoleSchema.safeParse({ role: "ADMIN", reason: "" }).success).toBe(false);
    expect(UpdateStatusSchema.safeParse({ accountStatus: "DISABLED", reason: "Policy violation" }).success).toBe(true);
  });

  it("enforces the same password policy for admin-created users", () => {
    expect(CreateUserSchema.safeParse({ email: "new@example.com", fullName: "New User", password: "weak", role: "RESEARCH_USER" }).success).toBe(false);
    expect(CreateUserSchema.safeParse({ email: "new@example.com", fullName: "New User", password: "SecurePass123", role: "SUPER_ADMIN" }).success).toBe(true);
  });

  it("normalizes email/name and rejects blank names", () => {
    expect(CreateUserSchema.parse({
      email: "  NEW@EXAMPLE.COM ", fullName: "  New User  ", password: "SecurePass123",
    })).toMatchObject({ email: "new@example.com", fullName: "New User" });
    expect(CreateUserSchema.safeParse({ email: "new@example.com", fullName: "   ", password: "SecurePass123" }).success).toBe(false);
  });
});
