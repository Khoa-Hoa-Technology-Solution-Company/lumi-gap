import { describe, expect, it } from "vitest";
import { assertCanCreateUser, assertCanManageUser, legacyRole } from "../admin-user.policy.js";

const owner = { id: "owner", systemRole: "SUPER_ADMIN" };
const admin = { id: "admin", systemRole: "ADMIN" };
const researcher = { id: "researcher", systemRole: "RESEARCH_USER" };

describe("admin user hierarchy", () => {
  it("allows admins to create research users without granting privileged roles", () => {
    expect(() => assertCanCreateUser(admin, "RESEARCH_USER")).not.toThrow();
    expect(() => assertCanCreateUser(admin, "ADMIN")).toThrow(/only create research-user/i);
    expect(() => assertCanCreateUser(owner, "SUPER_ADMIN")).not.toThrow();
  });

  it("allows super admins to manage every other role", () => {
    expect(() => assertCanManageUser(owner, admin, "UPDATE_ROLE")).not.toThrow();
    expect(() => assertCanManageUser(owner, researcher, "UPDATE_PROFILE")).not.toThrow();
  });

  it("limits admins to research-user status and session operations", () => {
    expect(() => assertCanManageUser(admin, researcher, "UPDATE_STATUS")).not.toThrow();
    expect(() => assertCanManageUser(admin, researcher, "REVOKE_SESSIONS")).not.toThrow();
    expect(() => assertCanManageUser(admin, researcher, "UPDATE_ROLE")).toThrow(/Only a super admin/);
    expect(() => assertCanManageUser(admin, owner, "UPDATE_STATUS")).toThrow(/only manage research-user/i);
  });

  it("blocks self role and account-status changes", () => {
    expect(() => assertCanManageUser(owner, owner, "UPDATE_ROLE")).toThrow(/own system role/);
    expect(() => assertCanManageUser(admin, admin, "UPDATE_STATUS")).toThrow(/own account status/);
  });

  it("keeps the legacy admin marker for both administrative roles", () => {
    expect(legacyRole("RESEARCH_USER")).toBe("user");
    expect(legacyRole("ADMIN")).toBe("admin");
    expect(legacyRole("SUPER_ADMIN")).toBe("admin");
  });
});
