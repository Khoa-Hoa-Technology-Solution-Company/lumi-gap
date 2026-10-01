export type StructuredEvidenceType =
  | "FINDING"
  | "LIMITATION"
  | "FUTURE_WORK"
  | "METHOD"
  | "DATASET"
  | "CONTEXT"
  | "THREAT_TO_VALIDITY"
  | "OBJECTIVE"
  | "RESEARCH_PROBLEM";

type CorpusEvidence = Record<string, unknown>;

const FIELD_BY_TYPE: Record<StructuredEvidenceType, string> = {
  FINDING: "findings",
  LIMITATION: "limitations",
  FUTURE_WORK: "futureWork",
  METHOD: "methodology",
  DATASET: "dataset",
  CONTEXT: "context",
  THREAT_TO_VALIDITY: "limitations",
  OBJECTIVE: "objectives",
  RESEARCH_PROBLEM: "researchProblem",
};

export function structuredEvidenceItems(value: unknown) {
  const evidence = value && typeof value === "object" ? value as CorpusEvidence : {};
  return (Object.entries(FIELD_BY_TYPE) as Array<[StructuredEvidenceType, string]>)
    .map(([type, field]) => {
      const excerpt = typeof evidence[field] === "string" ? evidence[field].trim() : "";
      return excerpt ? { evidenceType: type, excerpt, sourceLocation: `CorpusPaper.evidence.${field}` } : undefined;
    })
    .filter((item): item is { evidenceType: StructuredEvidenceType; excerpt: string; sourceLocation: string } => Boolean(item));
}

export function structuredEvidenceField(type: string) {
  return FIELD_BY_TYPE[type as StructuredEvidenceType];
}
