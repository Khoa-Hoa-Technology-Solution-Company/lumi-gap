import { describe, expect, it } from "vitest";
import { institutionalEmailIssue, lecturerVerificationError } from "../utils/lecturer-verification-form";

describe("Lecturer verification input and error messages", () => {
  const status = { verified: false, trustedInstitution: false, approvedEmailDomains: [{ domain: "vlu.edu.vn", allowSubdomains: false }] };
  it("validates syntax and matches approved email domains with safe boundaries", () => {
    for (const email of ["", "test", "bad@@vlu.edu.vn"]) expect(institutionalEmailIssue(email, status)).toBe("Enter a valid institutional email address.");
    for (const email of ["person@fpt.edu.vn", "person@staff.vlu.edu.vn", "person@vlu.edu.vn.attacker.com"]) expect(institutionalEmailIssue(email, status)).toContain("not approved");
    expect(institutionalEmailIssue(" lecturer@VLU.EDU.VN ", status)).toBeUndefined();
  });
  it("does not borrow website domains for email verification", () => {
    expect(institutionalEmailIssue("person@vlu.edu.vn", { ...status, officialDomains: ["vlu.edu.vn"], approvedEmailDomains: [] })).toContain("not configured");
    expect(institutionalEmailIssue("person@unknown.edu", { verified: false, trustedInstitution: false })).toBeUndefined();
  });
  it("handles stable codes and older API domain errors without exposing internal errors", () => {
    const error = (code: string, message: string) => ({ response: { data: { error: { code, message } } } });
    expect(lecturerVerificationError(error("INSTITUTIONAL_EMAIL_INSTITUTION_MISMATCH", "internal"), "fallback", "email")).toContain("{{institution}}");
    expect(lecturerVerificationError(error("BAD_REQUEST", "Use an approved institutional email for your selected institution"), "fallback", "email")).toContain("{{institution}}");
    expect(lecturerVerificationError(error("VALIDATION_ERROR", "Invalid request payload"), "fallback", "code")).toBe("Enter the 6-digit verification code.");
    expect(lecturerVerificationError(error("INTERNAL_ERROR", "secret/internal detail"), "fallback", "email")).toBe("fallback");
  });
});
