/** Policy versions frozen by the request origin or published template guideline. */
export const SCIENTIFIC_REVIEW_POLICY = "LumiGap Scientific Manuscript Review Rubric v1.0";
export const SCIENTIFIC_REVIEW_POLICY_V2 = "LumiGap Scientific Manuscript Review Rubric v2.0";
export const SCIENTIFIC_REVIEW_POLICIES = [
  SCIENTIFIC_REVIEW_POLICY,
  SCIENTIFIC_REVIEW_POLICY_V2,
] as const;
export const scientificIntegrityChecks = [
  { key: "authorship", title: "Authorship and contribution declarations", allowNotApplicable: false },
  { key: "borrowing", title: "Source attribution and unsupported borrowing", allowNotApplicable: false },
  { key: "data", title: "Data fabrication or falsification concerns", allowNotApplicable: true },
  { key: "sources", title: "Source credibility and citation accuracy", allowNotApplicable: false },
  { key: "conflicts", title: "Conflicts of interest disclosed", allowNotApplicable: false },
  { key: "ai_disclosure", title: "Applicable AI-use disclosures", allowNotApplicable: true },
  { key: "ethics", title: "Applicable research ethics approvals", allowNotApplicable: true },
  { key: "confidentiality", title: "Confidentiality and sensitive data handling", allowNotApplicable: true },
] as const;

export type ScientificIntegrityCheckKey = (typeof scientificIntegrityChecks)[number]["key"];

export type IntegrityEvidenceAccessState = "AVAILABLE" | "EMPTY" | "RESTRICTED";

export interface IntegrityEvidenceFact {
  label: string;
  value: string;
  tone?: "neutral" | "info" | "attention";
}

export interface IntegrityEvidencePreview {
  access: IntegrityEvidenceAccessState;
  facts: IntegrityEvidenceFact[];
  advisoryNotes?: string[];
}

export type ReviewIntegrityEvidenceMap = Partial<Record<ScientificIntegrityCheckKey, IntegrityEvidencePreview>>;

export function requiresScientificIntegrity(guidelines: readonly string[] = [], origin?: string) {
  return origin === "MENTOR_GUIDANCE" || SCIENTIFIC_REVIEW_POLICIES.some(policy => guidelines.includes(policy));
}
