/**
 * Lenient repair of model output before schema validation. Fixes the small, mechanical mistakes models
 * make (a single object where an array belongs, one item too many, a missing optional explanation, a
 * plain string in place of a fact) so that one slip does not fail a whole evaluation. Anything that
 * still does not have the required shape is left for the schema to reject.
 */
type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);

/** Wrap a single item into an array, map null/undefined to [] and drop items over `max`. */
export function asList(value: unknown, max: number): unknown[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
  return list.slice(0, max);
}
/** Plain strings only: trims, drops strings shorter than `min`, truncates to `max`. */
function stringList(value: unknown, maxItems: number, min: number, max: number): string[] {
  return asList(value, Number.MAX_SAFE_INTEGER)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, max))
    .filter((item) => item.length >= min)
    .slice(0, maxItems);
}
const clip = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : value);
const optionalText = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : value === undefined || value === null ? "" : value);
const QUOTE_MAX = 600;
const TEXT_MAX = 1500;

function quoteObject(value: unknown) {
  return isObject(value) ? { ...value, quote: clip(value.quote, QUOTE_MAX) } : value;
}
/** Quotes shorter than 12 characters or without a source cannot be verified; drop them here. */
function quotes(value: unknown, max: number) {
  return asList(value, Number.MAX_SAFE_INTEGER)
    .map(quoteObject)
    .filter((item) => isObject(item) && typeof item.sourceId === "string" && typeof item.quote === "string" && item.quote.length >= 12)
    .slice(0, max);
}
function nullableQuote(value: unknown) {
  if (Array.isArray(value)) value = value[0];
  const [item] = quotes(value, 1);
  return item ?? null;
}

/** A fact may arrive as a plain string, with an "unverified" status, or with its quote as an array. */
export function normalizeFact(value: unknown): unknown {
  if (typeof value === "string") return value.trim() ? { status: "reported", value: value.trim().slice(0, QUOTE_MAX), evidence: null } : { status: "not_reported", value: null, evidence: null };
  if (value === null || value === undefined) return { status: "not_reported", value: null, evidence: null };
  if (!isObject(value)) return value;
  const text = typeof value.value === "string" && value.value.trim() ? value.value.trim().slice(0, QUOTE_MAX) : null;
  const status = value.status === "not_reported" || !text ? "not_reported" : "reported";
  return { status, value: status === "reported" ? text : null, evidence: status === "reported" ? nullableQuote(value.evidence) : null };
}

const criterionItem = (value: unknown) => isObject(value) ? {
  ...value,
  finding: clip(value.finding, TEXT_MAX),
  evidence: quotes(value.evidence, 4),
  missingEvidence: stringList(value.missingEvidence, 5, 5, QUOTE_MAX),
  improvement: optionalText(value.improvement, TEXT_MAX),
} : value;
const CRITERION_IDS = ["relevance", "groundedness", "completeness"];
const PRIORITIES = ["high", "medium", "low"];
const usableText = (value: unknown) => typeof value === "string" && value.trim().length >= 12;

/**
 * The criterion an unlabelled action or question most likely belongs to: one the model could not assess,
 * else the lowest-scored one, else completeness.
 */
export function inferCriterionId(criteria: unknown): string {
  const items = asList(criteria, Number.MAX_SAFE_INTEGER).filter(isObject).filter((item) => CRITERION_IDS.includes(item.id as string));
  const insufficient = items.find((item) => item.score === null || item.status === "insufficient_evidence");
  if (insufficient) return insufficient.id as string;
  const scored = items.filter((item) => typeof item.score === "number").sort((a, b) => (a.score as number) - (b.score as number));
  return (scored[0]?.id as string | undefined) ?? "completeness";
}
const criterionOr = (value: unknown, fallback: string) => (typeof value === "string" && CRITERION_IDS.includes(value) ? value : fallback);

/** Missing/invalid criterionId or priority is filled in; an item without its texts is dropped on its own. */
function actions(value: unknown, max: number, fallbackCriterion: string) {
  return asList(value, Number.MAX_SAFE_INTEGER).filter(isObject)
    .filter((item) => usableText(item.action) && usableText(item.why) && usableText(item.expectedOutcome))
    .map((item) => ({
      ...item, criterionId: criterionOr(item.criterionId, fallbackCriterion),
      priority: typeof item.priority === "string" && PRIORITIES.includes(item.priority.toLowerCase()) ? item.priority.toLowerCase() : "medium",
      action: clip(item.action, TEXT_MAX), why: clip(item.why, TEXT_MAX), expectedOutcome: clip(item.expectedOutcome, TEXT_MAX),
    }))
    .slice(0, max);
}
function researchQuestions(value: unknown, fallbackCriterion: string) {
  return asList(value, Number.MAX_SAFE_INTEGER).filter(isObject)
    .filter((item) => usableText(item.question) && usableText(item.why))
    .map((item) => ({ ...item, criterionId: criterionOr(item.criterionId, fallbackCriterion), question: clip(item.question, TEXT_MAX), why: clip(item.why, TEXT_MAX) }))
    .slice(0, 3);
}

/** Reference mode (all target kinds). Facts and guidance are only touched when present. */
export function normalizeJudgeCandidate(candidate: unknown): unknown {
  if (!isObject(candidate)) return candidate;
  const fallbackCriterion = inferCriterionId(candidate.criteria);
  const out: Json = {
    ...candidate,
    summary: clip(candidate.summary, 2000),
    criteria: asList(candidate.criteria, 3).map(criterionItem),
    actions: actions(candidate.actions, 4, fallbackCriterion),
    researchQuestions: researchQuestions(candidate.researchQuestions, fallbackCriterion),
    limitations: stringList(candidate.limitations, 5, 10, QUOTE_MAX),
  };
  if (isObject(candidate.facts)) {
    const facts = candidate.facts;
    out.facts = {
      ...facts,
      studyDesign: normalizeFact(facts.studyDesign), sampleOrData: normalizeFact(facts.sampleOrData),
      setting: normalizeFact(facts.setting), measures: normalizeFact(facts.measures),
      keyResults: asList(facts.keyResults, 6).map(normalizeFact), authorStatedLimitations: asList(facts.authorStatedLimitations, 6).map(normalizeFact),
    };
  }
  if (isObject(candidate.guidance)) {
    const guidance = candidate.guidance;
    out.guidance = {
      ...guidance,
      purposes: asList(guidance.purposes, 4).map((item) => isObject(item) ? { ...item, explanation: clip(item.explanation, TEXT_MAX) } : item),
      audienceReason: clip(guidance.audienceReason, TEXT_MAX),
      caution: guidance.caution === undefined ? null : clip(guidance.caution, TEXT_MAX),
    };
  }
  return out;
}

/** Project mode. Item-level verbatim checks still run afterwards. */
export function normalizeProjectCandidate(candidate: unknown): unknown {
  if (!isObject(candidate)) return candidate;
  const screening = candidate.screening;
  return {
    ...candidate,
    verdictReason: clip(candidate.verdictReason, TEXT_MAX),
    questionLinks: asList(candidate.questionLinks, 8).map((item) => isObject(item) ? { ...item, contribution: clip(item.contribution, TEXT_MAX), evidence: quotes(item.evidence, 3) } : item),
    reusable: asList(candidate.reusable, 6).map((item) => isObject(item) ? { ...item, description: clip(item.description, TEXT_MAX), evidence: nullableQuote(item.evidence) } : item),
    tensions: asList(candidate.tensions, 5).map((item) => isObject(item) ? { ...item, description: clip(item.description, TEXT_MAX), evidence: quotes(item.evidence, 3) } : item),
    screening: isObject(screening) ? { ...screening, reason: clip(screening.reason, TEXT_MAX), criteria: stringList(screening.criteria, 10, 1, 300) } : screening,
    actions: actions(candidate.actions, 4, "relevance"),
    limitations: stringList(candidate.limitations, 5, 10, QUOTE_MAX),
  };
}
