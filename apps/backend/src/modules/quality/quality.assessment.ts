import { z } from "zod";
import type { QualityAssessment, QualityCriterionAssessment } from "@trend/shared-types";
import type { QualityJudgeInput } from "./quality.prompt.js";

const criterionId = z.enum(["relevance", "groundedness", "completeness"]);
const text = z.string().trim().min(12).max(1500);
export const judgeAssessmentSchema = z.object({
  summary: text.max(2000),
  criteria: z.array(z.object({
    id: criterionId,
    score: z.number().int().min(1).max(5).nullable(),
    finding: text,
    evidence: z.array(z.object({ sourceId: z.string().min(1).max(60), quote: z.string().trim().min(12).max(600) })).max(4),
    missingEvidence: z.array(z.string().trim().min(5).max(600)).max(5),
    improvement: text,
  })).length(3),
  actions: z.array(z.object({ criterionId, priority: z.enum(["high", "medium", "low"]), action: text, why: text, expectedOutcome: text })).min(1).max(4),
  researchQuestions: z.array(z.object({ criterionId, question: text, why: text })).min(1).max(3),
  limitations: z.array(z.string().trim().min(10).max(600)).min(1).max(5),
});

const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/gu, " ").trim();

/** Only supplied source IDs and verbatim quotes can become persisted evidence. */
export function validateQualityAssessment(candidate: unknown, input: QualityJudgeInput): QualityAssessment {
  const raw = judgeAssessmentSchema.parse(candidate);
  if (new Set(raw.criteria.map((item) => item.id)).size !== 3) throw new Error("Duplicate or missing quality criteria");
  const sourceById = new Map(input.sources.map((item) => [item.id, item]));
  const missingSupport = input.rubric.targetKind !== "paper" && !input.sources.some((item) => item.kind === "evidence_abstract");
  const missingSupportMessage = input.rubric.language === "vi"
    ? "Chưa có tóm tắt bài báo làm căn cứ để đối chiếu; cần bổ sung và đọc tài liệu hỗ trợ."
    : "No supporting paper abstracts were supplied for comparison; obtain and read the supporting literature.";
  const criteria: QualityCriterionAssessment[] = input.rubric.criteria.map(({ id }) => {
    const item = raw.criteria.find((criterion) => criterion.id === id)!;
    for (const citation of item.evidence) {
      const citedSource = sourceById.get(citation.sourceId);
      if (!citedSource || !normalize(citedSource.text).includes(normalize(citation.quote))) throw new Error("Unverifiable quality evidence quote");
    }
    const comparisonCriterion = id === "groundedness" || (input.rubric.targetKind === "report" && id === "completeness");
    const forcedInsufficient = comparisonCriterion && missingSupport;
    const score = forcedInsufficient ? null : item.score;
    const missingEvidence = [...item.missingEvidence];
    if (forcedInsufficient) missingEvidence.unshift(missingSupportMessage);
    if (score === null && !missingEvidence.length) throw new Error("Insufficient evidence must explain what is missing");
    if (score !== null) {
      if (!item.evidence.length) throw new Error("Scored criteria need source evidence");
      if (!item.evidence.some((citation) => citation.sourceId === "target")) throw new Error("Scored criteria need evidence from the evaluated content");
      if (comparisonCriterion && input.rubric.targetKind !== "paper" && !item.evidence.some((citation) => sourceById.get(citation.sourceId)?.kind === "evidence_abstract")) throw new Error("This criterion needs comparison evidence");
    }
    return { ...item, ...(forcedInsufficient && item.score !== null ? { finding: missingSupportMessage } : {}), score, status: score === null ? "insufficient_evidence" : "assessed", missingEvidence };
  });
  const priority = { high: 0, medium: 1, low: 2 };
  const sources = input.sources.map(({ text: _text, ...metadata }) => metadata);
  const coverageLimitations: string[] = [];
  if (input.sources.some((item) => item.truncated)) coverageLimitations.push(input.rubric.language === "vi" ? "Một số văn bản đã được rút ngắn do giới hạn độ dài; nhận xét chỉ dựa trên phần được đọc." : "Some sources were truncated to fit the reading limit; only the supplied excerpts were assessed.");
  const readCount = sources.filter((item) => item.kind === "evidence_abstract").length;
  if (input.evidenceTotal > readCount) coverageLimitations.push(input.rubric.language === "vi" ? `Chỉ đọc được ${readCount}/${input.evidenceTotal} tóm tắt tài liệu liên kết; các tài liệu còn lại chưa được đối chiếu.` : `Only ${readCount}/${input.evidenceTotal} linked paper abstracts were read; the remaining papers were not compared.`);
  return { rubric: input.rubric, summary: raw.summary, criteria, actions: [...raw.actions].sort((a, b) => priority[a.priority] - priority[b.priority]), researchQuestions: raw.researchQuestions, sources, limitations: [...new Set([...input.rubric.limitations, ...coverageLimitations, ...raw.limitations])] };
}

/** Null is deliberate: do not turn missing information into an invented low score. */
export function qualityScores(details: QualityAssessment) {
  const relevance = details.criteria.find((item) => item.id === "relevance")!.score;
  const groundedness = details.criteria.find((item) => item.id === "groundedness")!.score;
  const completeness = details.criteria.find((item) => item.id === "completeness")!.score;
  const overall = relevance === null || groundedness === null || completeness === null ? null : Math.round((relevance + groundedness + completeness) / 3 * 10) / 10;
  return { relevance, groundedness, completeness, overall };
}
