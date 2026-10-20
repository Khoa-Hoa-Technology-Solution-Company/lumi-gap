import { getQualityRubric, type QualityEvaluation } from "@trend/shared-types";

export function makeQualityEvaluation(): QualityEvaluation {
  return {
    targetKind: "paper", targetId: "paper-a", relevance: 4, groundedness: 3, completeness: 3, overall: 3.3,
    rationale: "The abstract describes a comparison, with limited information about allocation.",
    model: "qa-model", createdAt: "2026-10-17T04:00:00.000Z", evaluatedAt: "2026-10-17T04:00:00.000Z", freshness: "current",
    details: {
      rubric: getQualityRubric("paper"), summary: "The abstract describes a comparison, with limited information about allocation.",
      criteria: (["relevance", "groundedness", "completeness"] as const).map((id, index) => ({
        id, score: index === 0 ? 4 : 3, status: "assessed",
        finding: "The study names university students, compares two feedback methods and reports a one-semester result.",
        evidence: [{ sourceId: "target", quote: "We compare two feedback methods with 120 students." }],
        missingEvidence: ["Group assignment and baseline comparability are not described in the abstract."],
        improvement: "Read the methods section and record how the groups were allocated before using the result.",
      })),
      actions: [{ criterionId: "groundedness", priority: "high", action: "Check group assignment and baseline comparability in the full paper.", why: "The abstract reports a 12% improvement but does not describe allocation or uncertainty.", expectedOutcome: "An evidence table with allocation, baseline scores and the uncertainty of the reported improvement." }],
      researchQuestions: [{ criterionId: "completeness", question: "Does guided feedback transfer to a second university?", why: "The supplied abstract reports only one university and one semester." }],
      limitations: ["The full paper and underlying data were not reviewed.", "The presence of an exact quote does not establish scientific validity."],
      sources: [{ id: "target", kind: "abstract", title: "Guided feedback for university writing", charactersRead: 211, truncated: false }],
    },
  };
}
