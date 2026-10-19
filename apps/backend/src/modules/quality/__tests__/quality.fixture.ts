import type { QualityTargetKind } from "@trend/shared-types";
import { buildQualityJudgeInput } from "../quality.prompt.js";

export const ABSTRACT = "We study feedback for university writing. We compare two feedback methods with 120 students. The guided group improved its rubric score by 12%. The study covers one semester at one university.";
export const makeInput = (kind: QualityTargetKind = "paper") => buildQualityJudgeInput({ kind, title: "Guided feedback for university writing", content: ABSTRACT, context: "Feedback for university writing", evidence: kind === "paper" ? [] : [{ id: "source-paper", title: "Feedback trial", abstractText: ABSTRACT }] });
export function makeJudgeOutput() {
  return {
    summary: "The abstract describes a concrete comparison, but transfer to other settings needs further checking.",
    criteria: (["relevance", "groundedness", "completeness"] as const).map((id, index) => ({
      id, score: [4, 3, 3][index] as number | null,
      finding: "The abstract names university students, two feedback methods and a one-semester setting.",
      evidence: [{ sourceId: "target", quote: "We compare two feedback methods with 120 students." }],
      missingEvidence: ["The allocation procedure and uncertainty around the improvement are not reported."],
      improvement: "Read the methods section to check allocation and whether the two groups were comparable.",
    })),
    actions: [{ criterionId: "groundedness" as const, priority: "high" as const, action: "Read the allocation procedure and baseline comparability table before reusing the reported improvement.", why: "The abstract reports a 12% improvement without describing group assignment or uncertainty.", expectedOutcome: "A short evidence table recording allocation, baseline scores, outcome definition and uncertainty." }],
    researchQuestions: [{ criterionId: "completeness" as const, question: "Would the guided feedback approach transfer to a different university or a longer observation period?", why: "The abstract explicitly limits the reported setting to one semester and one university." }],
    limitations: ["The abstract alone cannot establish whether the comparison controls for prior writing ability."],
  };
}
