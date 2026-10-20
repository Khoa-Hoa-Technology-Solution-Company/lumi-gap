import { z } from "zod";
import type { PaperReadingFacts, PaperReadingGuidance, QualityAssessment, QualityCriterionAssessment, QualityFact, QualityQuote } from "@trend/shared-types";
import type { JudgeSource, QualityJudgeInput } from "./quality.prompt.js";
import { normalizeJudgeCandidate } from "./quality.normalize.js";

/** The model output does not have the required shape. Only this kind of failure earns one repair retry. */
export class QualityStructureError extends Error {
  constructor(message: string) { super(message); this.name = "QualityStructureError"; }
}

const criterionId = z.enum(["relevance", "groundedness", "completeness"]);
const text = z.string().trim().min(12).max(1500);
const quote = z.object({ sourceId: z.string().min(1).max(60), quote: z.string().trim().min(12).max(600) });
const factSchema = z.object({
  status: z.enum(["reported", "not_reported"]),
  value: z.string().trim().max(600).nullable(),
  evidence: quote.nullable(),
});
const nullableText = z.preprocess((value) => (typeof value === "string" && !value.trim() ? null : value), text.nullable());

/**
 * The validator only rejects unusable output: depth ("2–4 actions", "2–3 questions") is asked for in the
 * prompt, never enforced here, so a thin but correct answer is kept.
 */
function judgeSchemas() {
  const minimum = 1;
  const base = z.object({
    summary: text.max(2000),
    criteria: z.array(z.object({
      id: criterionId,
      score: z.number().int().min(1).max(5).nullable(),
      finding: text,
      evidence: z.array(quote).max(4),
      missingEvidence: z.array(z.string().trim().min(5).max(600)).max(5),
      // Optional explanation: the UI hides an empty improvement.
      improvement: z.string().trim().max(1500),
    })).length(3),
    actions: z.array(z.object({ criterionId, priority: z.enum(["high", "medium", "low"]), action: text, why: text, expectedOutcome: text })).min(minimum).max(4),
    researchQuestions: z.array(z.object({ criterionId, question: text, why: text })).min(minimum).max(3),
    limitations: z.array(z.string().trim().min(10).max(600)).max(5),
  });
  /** Paper reference mode (rubric quality-v3): a reading card and reading guidance on top of the rubric. */
  const paper = base.extend({
    facts: z.object({
      studyDesign: factSchema, sampleOrData: factSchema, setting: factSchema, measures: factSchema,
      keyResults: z.array(factSchema).max(6), authorStatedLimitations: z.array(factSchema).max(6),
    }),
    guidance: z.object({
      purposes: z.array(z.object({ purpose: z.enum(["overview", "method", "data", "results", "counterpoint", "background"]), explanation: text })).min(1).max(4),
      audience: z.enum(["newcomer", "intermediate", "specialist"]),
      audienceReason: text,
      caution: nullableText,
    }),
  });
  return { base, paper };
}
const strictSchemas = judgeSchemas();
export const judgeAssessmentSchema = strictSchemas.base;
export const paperJudgeAssessmentSchema = strictSchemas.paper;

export const normalizeQuoteText = (value: string) => value.normalize("NFKC").replace(/\s+/gu, " ").trim();

/** True when `citation` cites one of `sources` and appears there verbatim (whitespace-insensitive). */
export function isVerbatimQuote(citation: QualityQuote, sources: Map<string, Pick<JudgeSource, "text">>) {
  const source = sources.get(citation.sourceId);
  return !!source && normalizeQuoteText(source.text).includes(normalizeQuoteText(citation.quote));
}

const NOT_REPORTED: QualityFact = { status: "not_reported", value: null, evidence: null };
/** A value whose quote cannot be found verbatim is kept as "unverified", never shown as missing. */
function verifyFact(fact: z.infer<typeof factSchema>, sources: Map<string, JudgeSource>): QualityFact {
  if (fact.status !== "reported" || !fact.value) return NOT_REPORTED;
  if (!fact.evidence || !isVerbatimQuote(fact.evidence, sources)) return { status: "unverified", value: fact.value, evidence: null };
  return { status: "reported", value: fact.value, evidence: { sourceId: fact.evidence.sourceId, quote: fact.evidence.quote } };
}
function verifyFacts(raw: z.infer<typeof paperJudgeAssessmentSchema>["facts"], sources: Map<string, JudgeSource>): PaperReadingFacts {
  const reportedOnly = (items: z.infer<typeof factSchema>[]) => items.map((item) => verifyFact(item, sources)).filter((item) => item.status === "reported").slice(0, 4);
  return {
    studyDesign: verifyFact(raw.studyDesign, sources), sampleOrData: verifyFact(raw.sampleOrData, sources),
    setting: verifyFact(raw.setting, sources), measures: verifyFact(raw.measures, sources),
    keyResults: reportedOnly(raw.keyResults), authorStatedLimitations: reportedOnly(raw.authorStatedLimitations),
  };
}
function guidanceOf(raw: z.infer<typeof paperJudgeAssessmentSchema>["guidance"]): PaperReadingGuidance {
  const seen = new Set<string>();
  const purposes = raw.purposes.filter((item) => !seen.has(item.purpose) && !!seen.add(item.purpose)).slice(0, 3);
  return { purposes, audience: raw.audience, audienceReason: raw.audienceReason, caution: raw.caution };
}

const words = (value: string) => new Set(normalizeQuoteText(value).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4));
const SUPPORT_GAP = /\b(no|not|missing|without|absent|lack)\b|chưa|không|thiếu/iu;
const SUPPORT_TOPIC = /(abstract|tóm tắt)/iu;
const SUPPORT_KIND = /(support|evidence|compar|căn cứ|đối chiếu|hỗ trợ|linked|liên kết)/iu;
/** A model note that already says "no supporting abstracts were supplied", in its own words. */
function similarNote(note: string, forced: string) {
  const a = normalizeQuoteText(note).toLowerCase(), b = normalizeQuoteText(forced).toLowerCase();
  if (a === b || a.includes(b) || b.includes(a)) return true;
  if (SUPPORT_GAP.test(note) && SUPPORT_TOPIC.test(note) && SUPPORT_KIND.test(note)) return true;
  const left = words(note), right = words(forced);
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.max(1, Math.min(left.size, right.size)) >= 0.6;
}
function uniqueNotes(notes: string[]) {
  const seen = new Set<string>();
  return notes.filter((note) => { const key = normalizeQuoteText(note).toLowerCase(); return !seen.has(key) && !!seen.add(key); });
}

/**
 * Only supplied source IDs and verbatim quotes can become persisted evidence. An unverifiable quote is
 * dropped on its own; a score that is left without its required citations is withdrawn (null) with a note.
 * Throws QualityStructureError / ZodError only when the output does not have the required shape.
 */
export function validateQualityAssessment(candidate: unknown, input: QualityJudgeInput): QualityAssessment {
  const isPaper = input.rubric.targetKind === "paper";
  const schemas = strictSchemas;
  const raw = (isPaper ? schemas.paper : schemas.base).parse(normalizeJudgeCandidate(candidate)) as z.infer<typeof paperJudgeAssessmentSchema>;
  if (new Set(raw.criteria.map((item) => item.id)).size !== 3) throw new QualityStructureError("Duplicate or missing quality criteria");
  const vi = input.rubric.language === "vi";
  const sourceById = new Map(input.sources.map((item) => [item.id, item]));
  const missingSupport = !isPaper && !input.sources.some((item) => item.kind === "evidence_abstract");
  const missingSupportMessage = vi
    ? "Chưa có tóm tắt bài báo làm căn cứ để đối chiếu; cần bổ sung và đọc tài liệu hỗ trợ."
    : "No supporting paper abstracts were supplied for comparison; obtain and read the supporting literature.";
  const unsupportedScoreMessage = (comparison: boolean) => vi
    ? comparison
      ? "Điểm đã bị bỏ vì không còn trích dẫn nguyên văn hợp lệ từ cả nội dung được đánh giá và tóm tắt tài liệu hỗ trợ; cần đối chiếu trực tiếp với văn bản gốc."
      : "Điểm đã bị bỏ vì không còn trích dẫn nguyên văn hợp lệ từ nội dung được đánh giá; cần đọc trực tiếp văn bản gốc để kiểm tra."
    : comparison
      ? "The score was withdrawn because no verifiable quote remained from both the evaluated text and a supporting abstract; compare them directly in the original sources."
      : "The score was withdrawn because no verifiable quote from the evaluated text remained; read the original text to check this criterion.";

  const criteria: QualityCriterionAssessment[] = input.rubric.criteria.map(({ id }) => {
    const item = raw.criteria.find((criterion) => criterion.id === id)!;
    const evidence = item.evidence.filter((citation) => isVerbatimQuote(citation, sourceById));
    const comparisonCriterion = id === "groundedness" || (input.rubric.targetKind === "report" && id === "completeness");
    const forcedInsufficient = comparisonCriterion && missingSupport;
    const citesTarget = evidence.some((citation) => citation.sourceId === "target");
    const citesComparison = !comparisonCriterion || isPaper || evidence.some((citation) => sourceById.get(citation.sourceId)?.kind === "evidence_abstract");
    const unsupported = item.score !== null && !forcedInsufficient && (!citesTarget || !citesComparison);
    const score = forcedInsufficient || unsupported ? null : item.score;
    let missingEvidence = uniqueNotes(item.missingEvidence);
    if (forcedInsufficient) missingEvidence = [missingSupportMessage, ...missingEvidence.filter((note) => !similarNote(note, missingSupportMessage))];
    if (unsupported) missingEvidence = [unsupportedScoreMessage(comparisonCriterion && !isPaper), ...missingEvidence];
    if (score === null && !missingEvidence.length) throw new QualityStructureError("Insufficient evidence must explain what is missing");
    const finding = forcedInsufficient && item.score !== null ? missingSupportMessage : item.finding;
    return { id: item.id, score, status: score === null ? "insufficient_evidence" : "assessed", finding, evidence, missingEvidence: missingEvidence.slice(0, 6), improvement: item.improvement };
  });
  const priority = { high: 0, medium: 1, low: 2 };
  const sources = input.sources.map(({ text: _text, ...metadata }) => metadata);
  const coverageLimitations: string[] = [];
  if (input.sources.some((item) => item.truncated)) coverageLimitations.push(vi ? "Một số văn bản đã được rút ngắn do giới hạn độ dài; nhận xét chỉ dựa trên phần được đọc." : "Some sources were truncated to fit the reading limit; only the supplied excerpts were assessed.");
  const readCount = sources.filter((item) => item.kind === "evidence_abstract").length;
  if (input.evidenceTotal > readCount) coverageLimitations.push(vi ? `Chỉ đọc được ${readCount}/${input.evidenceTotal} tóm tắt tài liệu liên kết; các tài liệu còn lại chưa được đối chiếu.` : `Only ${readCount}/${input.evidenceTotal} linked paper abstracts were read; the remaining papers were not compared.`);
  return {
    rubric: input.rubric, summary: raw.summary, criteria,
    actions: raw.actions.map(({ criterionId: c, priority: p, action, why, expectedOutcome }) => ({ criterionId: c, priority: p, action, why, expectedOutcome })).sort((a, b) => priority[a.priority] - priority[b.priority]),
    researchQuestions: raw.researchQuestions.map(({ criterionId: c, question, why }) => ({ criterionId: c, question, why })),
    sources, limitations: [...new Set([...input.rubric.limitations, ...coverageLimitations, ...raw.limitations])],
    ...(isPaper ? { facts: verifyFacts(raw.facts, sourceById), guidance: guidanceOf(raw.guidance) } : {}),
  };
}

/** Null is deliberate: do not turn missing information into an invented low score. */
export function qualityScores(details: QualityAssessment) {
  const relevance = details.criteria.find((item) => item.id === "relevance")!.score;
  const groundedness = details.criteria.find((item) => item.id === "groundedness")!.score;
  const completeness = details.criteria.find((item) => item.id === "completeness")!.score;
  const overall = relevance === null || groundedness === null || completeness === null ? null : Math.round((relevance + groundedness + completeness) / 3 * 10) / 10;
  return { relevance, groundedness, completeness, overall };
}
