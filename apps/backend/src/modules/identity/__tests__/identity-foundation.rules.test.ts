import { describe, expect, it } from "vitest";
import { RegisterSchema } from "../../auth/dto/auth.schema.js";
import {
  deriveParticipantScope, invitationCanAdmitAcademicRole, policyCapabilities,
} from "../identity-foundation.rules.js";

describe("identity and affiliation foundation rules", () => {
  it("derives Internal only from a verified current host-institution affiliation", () => {
    expect(deriveParticipantScope("INVITATION", [{
      hostInstitution: true, isCurrent: true, verificationStatus: "VERIFIED",
    }])).toBe("INTERNAL");
  });

  it("does not label a pending FPT University claim External", () => {
    expect(deriveParticipantScope("INVITATION", [{
      hostInstitution: true, isCurrent: true, verificationStatus: "PENDING",
    }])).toBe("PENDING");
  });

  it("derives External only for an admitted participant without a current host claim", () => {
    expect(deriveParticipantScope("INVITATION", [])).toBe("EXTERNAL");
  });

  it("does not grant lecturer authority from role selection alone", () => {
    const capabilities = policyCapabilities({
      systemRole: "USER", accountActive: true, academicRole: "LECTURER",
      academicRoleVerificationStatus: "SELF_DECLARED", participantScope: "INTERNAL",
    });
    expect(capabilities).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
    expect(capabilities).not.toContain("MENTOR_PROJECT");
    expect(capabilities).not.toContain("REVIEW_ARTIFACT");
    expect(capabilities).not.toContain("STRUCTURED_REVIEW");
  });

  it("grants privileged Lecturer capabilities only to a verified internal Lecturer", () => {
    const capabilities = policyCapabilities({
      systemRole: "USER", accountActive: true, academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED", participantScope: "INTERNAL",
      currentHostPositionVerified: true,
    });
    expect(capabilities).toEqual(expect.arrayContaining([
      "BASIC_RESEARCH",
      "CREATE_RESEARCH_PROJECT",
      "APPROVE_ACADEMIC_CONTRIBUTION",
      "MENTOR_PROJECT",
      "REVIEW_ARTIFACT",
      "STRUCTURED_REVIEW",
    ]));
  });

  it("does not convert an external Lecturer verification into FPT authority after affiliation changes", () => {
    const capabilities = policyCapabilities({
      systemRole: "USER", accountActive: true, academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED", participantScope: "INTERNAL",
      currentHostPositionVerified: false,
    });
    expect(capabilities).toContain("BASIC_RESEARCH");
    expect(capabilities).toContain("CREATE_RESEARCH_PROJECT");
    expect(capabilities).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
    expect(capabilities).not.toContain("MENTOR_PROJECT");
    expect(capabilities).not.toContain("STRUCTURED_REVIEW");
  });

  it("requires both internal affiliation and verified Lecturer position for Lecturer privileges", () => {
    const external = policyCapabilities({
      systemRole: "USER", accountActive: true, academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED", participantScope: "EXTERNAL",
    });
    const pendingAffiliation = policyCapabilities({
      systemRole: "USER", accountActive: true, academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED", participantScope: "PENDING",
    });
    const expiredPosition = policyCapabilities({
      systemRole: "USER", accountActive: true, academicRole: "LECTURER",
      academicRoleVerificationStatus: "EXPIRED", participantScope: "INTERNAL",
    });

    expect(external).toEqual(expect.arrayContaining(["BASIC_RESEARCH", "REVIEW_ARTIFACT", "STRUCTURED_REVIEW"]));
    expect(external).not.toContain("CREATE_RESEARCH_PROJECT");
    expect(external).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
    expect(external).not.toContain("MENTOR_PROJECT");

    for (const capabilities of [pendingAffiliation, expiredPosition]) {
      expect(capabilities).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
      expect(capabilities).not.toContain("MENTOR_PROJECT");
      expect(capabilities).not.toContain("REVIEW_ARTIFACT");
      expect(capabilities).not.toContain("STRUCTURED_REVIEW");
    }
  });

  it("keeps a self-declared external Lecturer least-privileged until position verification", () => {
    const capabilities = policyCapabilities({
      systemRole: "USER", accountActive: true, academicRole: "LECTURER",
      academicRoleVerificationStatus: "SELF_DECLARED", participantScope: "EXTERNAL",
    });
    expect(capabilities).toEqual(["BASIC_RESEARCH"]);
  });

  it("keeps an internal Researcher in the research persona without mentor or approval authority", () => {
    const capabilities = policyCapabilities({
      systemRole: "USER", accountActive: true, academicRole: "RESEARCHER",
      academicRoleVerificationStatus: "SELF_DECLARED", participantScope: "INTERNAL",
    });
    expect(capabilities).toContain("BASIC_RESEARCH");
    expect(capabilities).toContain("CREATE_RESEARCH_PROJECT");
    expect(capabilities).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
    expect(capabilities).not.toContain("MENTOR_PROJECT");
    expect(capabilities).not.toContain("REVIEW_ARTIFACT");
    expect(capabilities).not.toContain("MANAGE_SYSTEM");
  });

  it("keeps an external Researcher least-privileged until internal affiliation is verified", () => {
    const capabilities = policyCapabilities({
      systemRole: "USER", accountActive: true, academicRole: "RESEARCHER",
      academicRoleVerificationStatus: "SELF_DECLARED", participantScope: "EXTERNAL",
    });
    expect(capabilities).toContain("BASIC_RESEARCH");
    expect(capabilities).not.toContain("CREATE_RESEARCH_PROJECT");
    expect(capabilities).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
    expect(capabilities).not.toContain("MENTOR_PROJECT");
    expect(capabilities).not.toContain("REVIEW_ARTIFACT");
    expect(capabilities).not.toContain("MANAGE_SYSTEM");
  });

  it("keeps external Student admission disabled while allowing invited Researchers and Lecturers", () => {
    expect(invitationCanAdmitAcademicRole("STUDENT")).toBe(false);
    expect(invitationCanAdmitAcademicRole("RESEARCHER")).toBe(true);
    expect(invitationCanAdmitAcademicRole("LECTURER")).toBe(true);
  });

  it("grants system administration without academic authority by default", () => {
    const capabilities = policyCapabilities({
      systemRole: "ADMIN", accountActive: true, academicRole: "RESEARCHER",
      academicRoleVerificationStatus: "SELF_DECLARED", participantScope: "INTERNAL",
    });
    expect(capabilities).toEqual(["MANAGE_SYSTEM"]);
  });

  it("allows an admin to hold separate verified Lecturer authority only when academic policy is satisfied", () => {
    const capabilities = policyCapabilities({
      systemRole: "ADMIN", accountActive: true, academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED", participantScope: "INTERNAL",
      currentHostPositionVerified: true,
    });
    expect(capabilities).toEqual(expect.arrayContaining([
      "MANAGE_SYSTEM",
      "APPROVE_ACADEMIC_CONTRIBUTION",
      "MENTOR_PROJECT",
      "REVIEW_ARTIFACT",
      "STRUCTURED_REVIEW",
    ]));
  });

  it("does not permit ADMIN selection during registration", () => {
    expect(RegisterSchema.safeParse({
      email: "student@fpt.edu.vn", password: "StrongPassword123", fullName: "Student", role: "ADMIN",
    }).success).toBe(false);
  });
});

