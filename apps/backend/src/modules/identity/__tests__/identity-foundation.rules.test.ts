import { describe, expect, it } from "vitest";
import { RegisterSchema, UpdateAcademicProfileSchema } from "../../auth/dto/auth.schema.js";
import { deriveParticipantScope, invitationCanAdmitAcademicRole, policyCapabilities } from "../identity-foundation.rules.js";

describe("open academic platform identity policy", () => {
  it("derives FPT context only from current verified affiliation", () => {
    expect(deriveParticipantScope("PERSONAL_EMAIL", [{ hostInstitution: true, isCurrent: true, verificationStatus: "VERIFIED" }])).toBe("INTERNAL");
    expect(deriveParticipantScope("PERSONAL_EMAIL", [{ hostInstitution: true, isCurrent: true, verificationStatus: "PENDING" }])).toBe("PENDING");
    expect(deriveParticipantScope("INVITATION", [])).toBe("EXTERNAL");
  });
  it.each(["STUDENT", "RESEARCHER", "LECTURER"] as const)("opens core workflows for email-verified %s across institutions", academicRole => {
    for (const participantScope of ["PENDING", "INTERNAL", "EXTERNAL"] as const) {
      expect(policyCapabilities({ systemRole: "USER", accountActive: true, emailVerified: true, academicRole, academicRoleVerificationStatus: "SELF_DECLARED", participantScope })).toEqual(["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT"]);
    }
    expect(invitationCanAdmitAcademicRole(academicRole)).toBe(true);
  });
  it("requires email ownership independently of FPT affiliation", () => {
    expect(policyCapabilities({ systemRole: "USER", accountActive: true, emailVerified: false, academicRole: "STUDENT", participantScope: "INTERNAL" })).toEqual([]);
  });
  it("does not grant formal authority to verified Researchers or Students", () => {
    for (const academicRole of ["STUDENT", "RESEARCHER"] as const) expect(policyCapabilities({ systemRole: "USER", accountActive: true, emailVerified: true, academicRole, academicRoleVerificationStatus: "VERIFIED", positionVerified: true, participantScope: "INTERNAL", currentHostPositionVerified: true })).toEqual(["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT"]);
  });
  it("requires Lecturer position verification", () => {
    for (const positionVerified of [false, undefined]) expect(policyCapabilities({ systemRole: "USER", accountActive: true, emailVerified: true, academicRole: "LECTURER", academicRoleVerificationStatus: "VERIFIED", positionVerified, participantScope: "EXTERNAL" })).not.toContain("STRUCTURED_REVIEW");
  });
  it("allows verified non-FPT Lecturers to become eligible for assigned review and mentoring", () => {
    const actual = policyCapabilities({ systemRole: "USER", accountActive: true, emailVerified: true, academicRole: "LECTURER", academicRoleVerificationStatus: "VERIFIED", positionVerified: true, participantScope: "EXTERNAL" });
    expect(actual).toEqual(expect.arrayContaining(["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT", "STRUCTURED_REVIEW", "REVIEW_ARTIFACT", "MENTOR_PROJECT"]));
    expect(actual).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
  });
  it("keeps institution-specific approval separate", () => {
    expect(policyCapabilities({ systemRole: "USER", accountActive: true, emailVerified: true, academicRole: "LECTURER", academicRoleVerificationStatus: "VERIFIED", positionVerified: true, participantScope: "INTERNAL", currentHostPositionVerified: true })).toContain("APPROVE_ACADEMIC_CONTRIBUTION");
  });
  it("grants admin only system authority unless separately academically qualified", () => {
    expect(policyCapabilities({ systemRole: "ADMIN", accountActive: true, participantScope: "INTERNAL" })).toEqual(["MANAGE_SYSTEM"]);
    expect(policyCapabilities({ systemRole: "ADMIN", accountActive: false, participantScope: "INTERNAL" })).toEqual([]);
  });
  it.each(["role", "systemRole", "verificationStatus", "verifiedBy", "positionStatus"])("rejects privileged field %s", field => {
    expect(RegisterSchema.safeParse({ email: "student@gmail.com", password: "StrongPassword123", fullName: "Student", [field]: "ADMIN" }).success).toBe(false);
    expect(UpdateAcademicProfileSchema.safeParse({ academicRole: "LECTURER", institutionName: "University of Melbourne", positionTitle: "Lecturer", researchAreas: ["Education"], [field]: "VERIFIED" }).success).toBe(false);
  });
});
