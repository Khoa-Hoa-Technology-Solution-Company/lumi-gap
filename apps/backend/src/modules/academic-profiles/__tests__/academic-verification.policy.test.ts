import { describe, expect, it } from "vitest";
import type { AcademicVerificationEvidence } from "@trend/shared-types";
import { evaluateLecturerVerificationEvidence } from "../academic-verification.policy.js";

const now = "2026-09-23T00:00:00.000Z";
const evidence = (type: AcademicVerificationEvidence["type"], status: AcademicVerificationEvidence["status"] = "VALIDATED"): AcademicVerificationEvidence => ({
  type,
  status,
  source: "SYSTEM",
  createdAt: now,
  validatedAt: status === "VALIDATED" ? now : undefined,
});

describe("deterministic Lecturer verification policy", () => {
  it("never verifies from a trusted domain or manual ORCID alone", () => {
    const result = evaluateLecturerVerificationEvidence({
      institutionalEmailVerified: false,
      evidence: [evidence("TRUSTED_INSTITUTION"), evidence("ORCID", "SUBMITTED")],
    });
    expect(result.decision).toBe("NOT_ELIGIBLE");
  });

  it("keeps verified email plus manual ORCID pending", () => {
    const result = evaluateLecturerVerificationEvidence({
      institutionalEmailVerified: true,
      evidence: [evidence("INSTITUTIONAL_EMAIL"), evidence("ORCID", "SUBMITTED")],
    });
    expect(result.decision).toBe("PENDING_REVIEW");
  });

  it.each(["ORCID_AFFILIATION_MATCH", "TRUSTED_SSO_FACULTY", "INSTITUTION_EMPLOYMENT_API"] as const)(
    "auto-verifies only when verified email is combined with validated %s",
    (strongType) => {
      const result = evaluateLecturerVerificationEvidence({
        institutionalEmailVerified: true,
        evidence: [evidence("INSTITUTIONAL_EMAIL"), evidence(strongType)],
      });
      expect(result.decision).toBe("AUTO_VERIFIED");
    },
  );

  it("honors the trusted institution's allowed methods", () => {
    const result = evaluateLecturerVerificationEvidence({
      institutionalEmailVerified: true,
      evidence: [evidence("INSTITUTIONAL_EMAIL"), evidence("TRUSTED_SSO_FACULTY")],
      allowedAutoVerifyMethods: ["ORCID_AFFILIATION_MATCH"],
    });
    expect(result.decision).toBe("PENDING_REVIEW");
  });
});
