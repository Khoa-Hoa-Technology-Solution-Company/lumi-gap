import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions.js";

describe("RBAC permissions", () => {
  it("keeps student capabilities scoped to contributor actions", () => {
    expect(hasPermission("student", "forum:write")).toBe(true);
    expect(hasPermission("student", "review:assign")).toBe(false);
    expect(hasPermission("student", "community:moderate")).toBe(false);
  });

  it("allows reviewers to review but not assign themselves", () => {
    expect(hasPermission("reviewer", "submission:review")).toBe(true);
    expect(hasPermission("reviewer", "review:assign")).toBe(false);
  });

  it("allows moderators and admins to perform moderation tasks", () => {
    expect(hasPermission("moderator", "review:assign")).toBe(true);
    expect(hasPermission("moderator", "forum:moderate")).toBe(true);
    expect(hasPermission("admin", "ai-run:manage")).toBe(true);
    expect(hasPermission("ADMIN", "ai-run:manage")).toBe(true);
  });
});
