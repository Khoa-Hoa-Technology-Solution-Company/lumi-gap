import { describe, expect, it } from "vitest";
import { canProposeCommunity, initialCommunityStatus, isCommunityAdmin, normalizeTerm } from "../community.rules.js";

describe("community term normalization", () => {
  it("normalizes case and diacritics", () => {
    expect(normalizeTerm("  Học Máy ")).toBe("hoc may");
  });
});

// Real access-token principals never carry a "lecturer"/"researcher" role: `role` is only ever
// "admin" or "user". Eligibility comes from the academic profile type plus its verification state.
describe("community proposals use real claims", () => {
  const admin = { role: "admin" as const, systemRole: "ADMIN" };
  const user = { role: "user" as const, systemRole: "USER" };

  it("lets admins propose regardless of profile", () => {
    expect(isCommunityAdmin(admin)).toBe(true);
    expect(canProposeCommunity(admin)).toBe(true);
  });

  it("requires a verified lecturer or researcher profile", () => {
    expect(canProposeCommunity({ ...user, academicProfileType: "lecturer" }, "VERIFIED")).toBe(true);
    expect(canProposeCommunity({ ...user, academicProfileType: "researcher" }, "VERIFIED")).toBe(true);
    expect(canProposeCommunity({ ...user, academicProfileType: "lecturer" }, "SELF_DECLARED")).toBe(false);
    expect(canProposeCommunity({ ...user, academicProfileType: "lecturer" }, "PENDING")).toBe(false);
    expect(canProposeCommunity({ ...user, academicProfileType: "lecturer" }, undefined)).toBe(false);
  });

  it("rejects students, unclassified users and a role-only claim", () => {
    expect(canProposeCommunity({ ...user, academicProfileType: "student" }, "VERIFIED")).toBe(false);
    expect(canProposeCommunity(user, "VERIFIED")).toBe(false);
    // The pre-fix code trusted `role === "lecturer"`; that value never appears in a real token.
    expect(canProposeCommunity({ role: "lecturer" as never, systemRole: "USER" }, "VERIFIED")).toBe(false);
  });

  it("auto-approves admins and queues everyone else", () => {
    expect(initialCommunityStatus(admin)).toBe("ACTIVE");
    expect(initialCommunityStatus(user)).toBe("PENDING_APPROVAL");
  });
});
