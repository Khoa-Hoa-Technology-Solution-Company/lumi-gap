import { describe, expect, it } from "vitest";
import { isLecturerWorkspaceEligible, type User } from "@trend/shared-types";
import { isEligibleVerifiedLecturer, policyCapabilities } from "../identity-foundation.rules.js";
import { RevokeVerificationSchema } from "../../academic-profiles/dto/academic-profile.schema.js";

describe("Canonical Lecturer Eligibility & Workspace Access Matrix", () => {
  it("denies students, researchers, and unverified/pending/needs-info/rejected/revoked lecturers", () => {
    const deniedCases = [
      { label: "Student", academicRole: "STUDENT" as const, academicRoleVerificationStatus: "SELF_DECLARED" as const, positionVerified: false },
      { label: "Researcher", academicRole: "RESEARCHER" as const, academicRoleVerificationStatus: "VERIFIED" as const, positionVerified: true },
      { label: "Self-declared lecturer", academicRole: "LECTURER" as const, academicRoleVerificationStatus: "SELF_DECLARED" as const, positionVerified: false },
      { label: "Pending lecturer", academicRole: "LECTURER" as const, academicRoleVerificationStatus: "PENDING" as const, positionVerified: false },
      { label: "Needs more info lecturer", academicRole: "LECTURER" as const, academicRoleVerificationStatus: "NEEDS_MORE_INFORMATION" as const, positionVerified: false },
      { label: "Rejected lecturer", academicRole: "LECTURER" as const, academicRoleVerificationStatus: "REJECTED" as const, positionVerified: false },
      { label: "Revoked/invalidated lecturer", academicRole: "LECTURER" as const, academicRoleVerificationStatus: "INVALIDATED" as const, positionVerified: false },
      { label: "Role verified but position not verified", academicRole: "LECTURER" as const, academicRoleVerificationStatus: "VERIFIED" as const, positionVerified: false },
    ];

    for (const c of deniedCases) {
      const eligible = isEligibleVerifiedLecturer({
        accountActive: true,
        emailVerified: true,
        academicRole: c.academicRole,
        academicRoleVerificationStatus: c.academicRoleVerificationStatus,
        positionVerified: c.positionVerified,
      });
      expect(eligible, c.label).toBe(false);

      const caps = policyCapabilities({
        systemRole: "USER",
        accountActive: true,
        emailVerified: true,
        academicRole: c.academicRole,
        academicRoleVerificationStatus: c.academicRoleVerificationStatus,
        positionVerified: c.positionVerified,
        participantScope: "INTERNAL",
        currentHostPositionVerified: false,
      });
      expect(caps, c.label).not.toContain("MENTOR_PROJECT");
      expect(caps, c.label).not.toContain("STRUCTURED_REVIEW");
      expect(caps, c.label).not.toContain("REVIEW_ARTIFACT");
      expect(caps, c.label).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
      expect(caps, c.label).toContain("BASIC_RESEARCH");
    }
  });

  it("grants verified lecturer capabilities only when active, email-verified, and position-verified", () => {
    const eligible = isEligibleVerifiedLecturer({
      accountActive: true,
      emailVerified: true,
      academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED",
      positionVerified: true,
    });
    expect(eligible).toBe(true);

    const externalCaps = policyCapabilities({
      systemRole: "USER",
      accountActive: true,
      emailVerified: true,
      academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED",
      positionVerified: true,
      participantScope: "EXTERNAL",
      currentHostPositionVerified: false,
    });
    expect(externalCaps).toEqual(expect.arrayContaining(["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT", "MENTOR_PROJECT", "STRUCTURED_REVIEW", "REVIEW_ARTIFACT"]));
    expect(externalCaps).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
    expect(externalCaps).not.toContain("MANAGE_SYSTEM");

    const internalCaps = policyCapabilities({
      systemRole: "USER",
      accountActive: true,
      emailVerified: true,
      academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED",
      positionVerified: true,
      participantScope: "INTERNAL",
      currentHostPositionVerified: true,
    });
    expect(internalCaps).toContain("APPROVE_ACADEMIC_CONTRIBUTION");
    expect(internalCaps).not.toContain("MANAGE_SYSTEM");
  });

  it("denies suspended or unverified-email lecturers even if profile flags were previously verified", () => {
    expect(isEligibleVerifiedLecturer({
      accountActive: false,
      emailVerified: true,
      academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED",
      positionVerified: true,
    })).toBe(false);

    expect(isEligibleVerifiedLecturer({
      accountActive: true,
      emailVerified: false,
      academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED",
      positionVerified: true,
    })).toBe(false);
  });

  it("does NOT grant Lecturer capabilities to an ADMIN without independently verified lecturer credentials", () => {
    const unverifiedAdminCaps = policyCapabilities({
      systemRole: "ADMIN",
      accountActive: true,
      emailVerified: true,
      academicRole: undefined,
      academicRoleVerificationStatus: undefined,
      positionVerified: false,
      participantScope: "INTERNAL",
      currentHostPositionVerified: false,
    });
    expect(unverifiedAdminCaps).toEqual(["MANAGE_SYSTEM"]);

    const verifiedAdminLecturerCaps = policyCapabilities({
      systemRole: "ADMIN",
      accountActive: true,
      emailVerified: true,
      academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED",
      positionVerified: true,
      participantScope: "INTERNAL",
      currentHostPositionVerified: true,
    });
    expect(verifiedAdminLecturerCaps).toEqual(
      expect.arrayContaining(["MANAGE_SYSTEM", "MENTOR_PROJECT", "STRUCTURED_REVIEW", "REVIEW_ARTIFACT", "APPROVE_ACADEMIC_CONTRIBUTION"]),
    );
  });

  it("evaluates shared client-safe isLecturerWorkspaceEligible helper consistently", () => {
    const baseUser: Partial<User> = {
      accountStatus: "ACTIVE",
      isActive: true,
      emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(isLecturerWorkspaceEligible({ ...baseUser, systemRole: "ADMIN", lecturerWorkspaceEligible: false })).toBe(false);
    expect(isLecturerWorkspaceEligible({ ...baseUser, academicRole: "LECTURER", academicRoleVerificationStatus: "SELF_DECLARED" })).toBe(false);
    expect(isLecturerWorkspaceEligible({
      ...baseUser,
      academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED",
      positionVerificationStatus: "VERIFIED",
      capabilities: ["BASIC_RESEARCH", "MENTOR_PROJECT"],
    })).toBe(true);
    expect(isLecturerWorkspaceEligible({
      ...baseUser,
      accountStatus: "SUSPENDED",
      lecturerWorkspaceEligible: true,
    })).toBe(false);
  });

  it("validates revocation payload requires a clear reason >= 10 chars", () => {
    expect(RevokeVerificationSchema.safeParse({ reason: "too short" }).success).toBe(false);
    expect(RevokeVerificationSchema.safeParse({ reason: "Employment ended at declared university" }).success).toBe(true);
  });
});
