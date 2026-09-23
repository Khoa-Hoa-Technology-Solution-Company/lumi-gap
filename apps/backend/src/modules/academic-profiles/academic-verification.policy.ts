import type {
  AcademicVerificationEvidence,
  LecturerVerificationPolicyResult,
  VerificationEvidenceType,
} from "@trend/shared-types";

const strongEvidence = new Set<VerificationEvidenceType>([
  "TRUSTED_SSO_FACULTY",
  "ORCID_AFFILIATION_MATCH",
  "INSTITUTION_EMPLOYMENT_API",
]);

export function evaluateLecturerVerificationEvidence(input: {
  institutionalEmailVerified: boolean;
  evidence: AcademicVerificationEvidence[];
  allowedAutoVerifyMethods?: VerificationEvidenceType[];
}): LecturerVerificationPolicyResult {
  const validatedTypes = [...new Set(input.evidence
    .filter((item) => item.status === "VALIDATED")
    .map((item) => item.type))];

  if (!input.institutionalEmailVerified || !validatedTypes.includes("INSTITUTIONAL_EMAIL")) {
    return {
      decision: "NOT_ELIGIBLE",
      reasons: ["INSTITUTIONAL_EMAIL_NOT_VERIFIED"],
      evidenceTypes: validatedTypes,
    };
  }

  const allowed = new Set(input.allowedAutoVerifyMethods ?? [...strongEvidence]);
  const qualifying = validatedTypes.filter((type) => strongEvidence.has(type) && allowed.has(type));
  if (qualifying.length > 0) {
    return {
      decision: "AUTO_VERIFIED",
      reasons: ["VERIFIED_INSTITUTIONAL_EMAIL", `STRONG_EVIDENCE:${qualifying.join(",")}`],
      evidenceTypes: validatedTypes,
    };
  }

  return {
    decision: "PENDING_REVIEW",
    reasons: ["VERIFIED_INSTITUTIONAL_EMAIL", "STRONG_ACADEMIC_EVIDENCE_MISSING"],
    evidenceTypes: validatedTypes,
  };
}
