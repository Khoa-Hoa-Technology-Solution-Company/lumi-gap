import { describe, expect, it } from "vitest";
import { assertProjectActionAllowed, invitationBelongsToUser, projectDeleteError } from "../project-workspace.rules.js";

describe("project workspace permission rules", () => {
  it("allows members to contribute but blocks owner-only settings", () => {
    expect(() => assertProjectActionAllowed("MEMBER", "ACTIVE", "CONTRIBUTE")).not.toThrow();
    expect(() => assertProjectActionAllowed("MEMBER", "ACTIVE", "EDIT_SETTINGS")).toThrow(/owner/i);
    expect(() => assertProjectActionAllowed("MEMBER", "ACTIVE", "MANAGE_MEMBERS")).toThrow(/owner/i);
  });

  it("makes archived projects read-only", () => {
    expect(() => assertProjectActionAllowed("OWNER", "ARCHIVED", "CONTRIBUTE")).toThrow(/read-only/i);
    expect(() => assertProjectActionAllowed("OWNER", "ARCHIVED", "DELETE")).not.toThrow();
  });

  it("requires ownership transfer before the owner leaves", () => {
    expect(() => assertProjectActionAllowed("OWNER", "ACTIVE", "LEAVE")).toThrow(/transfer ownership/i);
    expect(() => assertProjectActionAllowed("MEMBER", "ACTIVE", "LEAVE")).not.toThrow();
  });

  it("denies outsiders", () => {
    expect(() => assertProjectActionAllowed(undefined, "ACTIVE", "CONTRIBUTE")).toThrow(/membership/i);
  });
});

describe("project invitation ownership", () => {
  it("does not trust user id without the invited verified email", () => {
    expect(invitationBelongsToUser({ invitedUserId: "user-a", email: "old@example.com" }, { id: "user-a", verifiedEmails: ["new@example.com"] })).toBe(false);
  });

  it("matches email invitations case-insensitively", () => {
    expect(invitationBelongsToUser({ invitedUserId: null, email: "Researcher@Example.com" }, { id: "user-a", verifiedEmails: ["researcher@example.com"] })).toBe(true);
  });

  it("rejects invitations intended for another account", () => {
    expect(invitationBelongsToUser({ invitedUserId: "user-b", email: "other@example.com" }, { id: "user-a", verifiedEmails: ["me@example.com"] })).toBe(false);
  });
});

describe("projectDeleteError", () => {
  const empty = { submissions: 0, reportsByOthers: 0, gapsByOthers: 0, contributionsByOthers: 0 };

  it("allows deleting a project with only the owner's own work", () => {
    expect(projectDeleteError(empty)).toBeNull();
  });

  it("blocks deleting a project with submissions or other members' work and names what remains", () => {
    expect(projectDeleteError({ ...empty, submissions: 1 })).toMatch(/1 submission.*Archive/);
    expect(projectDeleteError({ ...empty, reportsByOthers: 2, gapsByOthers: 3 })).toMatch(/2 report\(s\).*3 research gap\(s\)/);
    expect(projectDeleteError({ ...empty, contributionsByOthers: 1 })).not.toBeNull();
  });
});
