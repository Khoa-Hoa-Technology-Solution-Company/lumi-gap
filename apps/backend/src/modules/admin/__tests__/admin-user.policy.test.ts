import { describe, expect, it } from "vitest";
import { assertCanCreateUser, assertCanManageUser, legacyRole } from "../admin-user.policy.js";

const owner = { id: "owner", systemRole: "ADMIN" };
const admin = { id: "admin", systemRole: "ADMIN" };
const researcher = { id: "researcher", systemRole: "USER" };

describe("admin user hierarchy", () => {
  it("allows admins to create regular users only", () => {
    expect(() => assertCanCreateUser(admin, "USER")).not.toThrow();
    expect(() => assertCanCreateUser(admin, "ADMIN")).toThrow();
    expect(() => assertCanCreateUser(owner, "ADMIN")).toThrow();
  });

  it("allows admins to manage other accounts", () => {
    expect(() => assertCanManageUser(owner, admin, "UPDATE_ROLE")).not.toThrow();
    expect(() => assertCanManageUser(owner, researcher, "UPDATE_PROFILE")).not.toThrow();
  });

  it("allows admin management actions for other accounts", () => {
    expect(() => assertCanManageUser(admin, researcher, "UPDATE_STATUS")).not.toThrow();
    expect(() => assertCanManageUser(admin, researcher, "REVOKE_SESSIONS")).not.toThrow();
    expect(() => assertCanManageUser(admin, researcher, "UPDATE_ROLE")).not.toThrow();
    expect(() => assertCanManageUser(admin, owner, "UPDATE_STATUS")).not.toThrow();
  });

  it("blocks self role and account-status changes", () => {
    expect(() => assertCanManageUser(owner, owner, "UPDATE_ROLE")).toThrow(/own system role/);
    expect(() => assertCanManageUser(admin, admin, "UPDATE_STATUS")).toThrow(/own account status/);
  });

  it("keeps the legacy marker for both system roles", () => {
    expect(legacyRole("USER")).toBe("user");
    expect(legacyRole("ADMIN")).toBe("admin");
  });
});
