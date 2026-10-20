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
    actions: [{ criterionId: "groundedness" as const, priority: "high" as const, action: "Read the allocation procedure and baseline comparability table before reusing the reported improvement.", why: "The abstract reports a 12% improvement without describing group assignment or uncertainty.", expectedOutcome: "A short evidence table recording allocation, baseline scores, outcome definition and uncertainty." },
      { criterionId: "completeness" as const, priority: "medium" as const, action: "Note the single-university, one-semester setting next to the 12% gain in your reading notes.", why: "The abstract bounds the result to one setting, which limits how far it can be generalized.", expectedOutcome: "A checked reading note stating the setting and its limits beside the reported effect." }],
    researchQuestions: [{ criterionId: "completeness" as const, question: "Would the guided feedback approach transfer to a different university or a longer observation period?", why: "The abstract explicitly limits the reported setting to one semester and one university." },
      { criterionId: "groundedness" as const, question: "How large is the guided-feedback gain once prior writing ability is controlled for?", why: "The abstract reports a 12% gain without saying how the groups compared at baseline." }],
    limitations: ["The abstract alone cannot establish whether the comparison controls for prior writing ability."],
    facts: {
      studyDesign: { status: "reported" as string, value: "Comparison of two feedback methods" as string | null, evidence: { sourceId: "target", quote: "We compare two feedback methods with 120 students." } as { sourceId: string; quote: string } | null },
      sampleOrData: { status: "reported" as string, value: "120 university students" as string | null, evidence: { sourceId: "target", quote: "We compare two feedback methods with 120 students." } as { sourceId: string; quote: string } | null },
      setting: { status: "reported" as string, value: "One university, one semester" as string | null, evidence: { sourceId: "target", quote: "The study covers one semester at one university." } as { sourceId: string; quote: string } | null },
      measures: { status: "not_reported" as string, value: null as string | null, evidence: null as { sourceId: string; quote: string } | null },
      keyResults: [{ status: "reported", value: "Guided group improved its rubric score by 12%", evidence: { sourceId: "target", quote: "The guided group improved its rubric score by 12%." } as { sourceId: string; quote: string } | null }],
      authorStatedLimitations: [{ status: "reported", value: "Single university and semester", evidence: { sourceId: "target", quote: "The study covers one semester at one university." } as { sourceId: string; quote: string } | null }],
    },
    guidance: {
      purposes: [{ purpose: "method" as const, explanation: "It shows a simple two-arm comparison of feedback methods that a course study could copy." }],
      audience: "newcomer" as const,
      audienceReason: "The design and outcome are described in plain terms without specialist methods.",
      caution: "The 12% gain comes from one semester at one university and may not transfer." as string | null,
    },
  };
}

export const PROJECT_ID = "00000000-0000-4000-8000-0000000000aa";
export const makeProjectRow = () => ({
  id: PROJECT_ID, title: "Feedback in first-year writing", description: "Which feedback helps first-year students write better?", researchField: "Education",
  inclusionCriteria: ["Empirical studies of university students"], exclusionCriteria: ["Studies without a comparison group"], status: "ACTIVE", ownerId: "owner",
});
export const makePlanRow = () => ({
  projectId: PROJECT_ID, version: 3, problem: "How feedback type affects first-year writing quality", objectives: ["Compare guided and unguided feedback"],
  questions: [{ id: "00000000-0000-4000-8000-0000000000bb", text: "Does guided feedback improve rubric scores?" }], scope: "First-year university courses", methodology: "Quasi-experimental comparison across sections",
});
export function makeProjectOutput() {
  return {
    verdict: "core" as string,
    verdictReason: "It compares guided feedback against another method, which is the plan's main question.",
    questionLinks: [{ planItem: "Does guided feedback improve rubric scores?", contribution: "Reports a rubric score gain for the guided group that the team can compare with.", evidence: [{ sourceId: "target", quote: "The guided group improved its rubric score by 12%." }] }],
    reusable: [{ kind: "method" as string, description: "A two-group comparison of feedback methods within one course.", evidence: { sourceId: "target", quote: "We compare two feedback methods with 120 students." } as { sourceId: string; quote: string } | null }],
    tensions: [{ description: "Only one semester at one university, while the plan covers several sections.", evidence: [{ sourceId: "target", quote: "The study covers one semester at one university." }] }],
    screening: { suggestion: "include" as string, reason: "It is an empirical study of university students with a comparison group.", criteria: ["Empirical studies of university students"] },
    actions: [{ criterionId: "relevance" as const, priority: "high" as const, action: "Extract the rubric, group sizes and the 12% gain into the team's evidence table.", why: "It is the closest prior comparison to the planned design.", expectedOutcome: "An evidence table row with design, sample, outcome measure and effect." }],
    limitations: ["Only the abstract was available to compare with the plan."],
  };
}
