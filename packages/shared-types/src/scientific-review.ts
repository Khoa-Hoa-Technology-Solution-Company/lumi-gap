/** Policy v1 is frozen by the request origin or published template guideline. */
export const SCIENTIFIC_REVIEW_POLICY = "LumiGap Scientific Manuscript Review Rubric v1.0";
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
export function requiresScientificIntegrity(guidelines: readonly string[] = [], origin?: string) {
  return origin === "MENTOR_GUIDANCE" || guidelines.includes(SCIENTIFIC_REVIEW_POLICY);
}
