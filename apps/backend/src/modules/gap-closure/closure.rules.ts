/**
 * Gap Closure Protocol rules — PURE, no I/O. The method is described for people in docs/gap-closure-protocol.md;
 * every number this file produces can be recomputed by hand from the dossier of a check.
 *
 * A closed question (some published work answers it) is wrongly called open only when
 *   (1) every answering document is missing from the searched sources   — probability <= p (coverage), or
 *   (2) an answering document is present but the search or the screening misses it — probability <= eps (calibration).
 * By the union bound, P(false novelty) <= eps + p, so with one-sided Clopper-Pearson upper bounds epsHat and pHat
 * (each at confidence 1 - delta) the bound B = epsHat + pHat holds with probability >= 1 - 2 delta.
 */
import type {
  ClosureAbstainReason,
  ClosureJudgeKind,
  ClosureLabel,
  GapClosureDecision,
} from "@trend/shared-types";

/**
 * Version of the whole procedure that a calibration measures. Bump it whenever the rubric, the query or screening
 * prompt (QUERIES_PROMPT_VERSION, SCREENING_PROMPT_VERSION) or the search settings change: epsHat of an older
 * calibration does not describe the new procedure, and decide() refuses to mix versions.
 */
export const GAP_CLOSURE_PROTOCOL_VERSION = "gcp-v1";
/** Job name on the gaps queue; the job id is the check id. */
export const GAP_CLOSURE_JOB = "gap-closure-check";
export interface GapClosureJob {
  checkId: string;
  /** Hand-written queries; the runner asks the LLM for queries when absent. */
  queries?: string[];
}

export const CLOSURE_LABELS: readonly ClosureLabel[] = ["ANSWERS", "PARTIAL", "UNRELATED"];
/** A quote shorter than this cannot show that a document answers anything. */
export const MIN_QUOTE_CHARS = 20;

/* ------------------------------------------------------------------ */
/*  Clopper-Pearson                                                    */
/* ------------------------------------------------------------------ */

function logAddExp(a: number, b: number): number {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const max = Math.max(a, b);
  return max + Math.log(Math.exp(a - max) + Math.exp(b - max));
}

/** P(X <= x) for X ~ Binomial(m, p), summed in log space so large m does not underflow. */
export function binomialCdf(x: number, m: number, p: number): number {
  if (x < 0) return 0;
  if (x >= m) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  const logP = Math.log(p), logQ = Math.log1p(-p);
  let logTerm = m * logQ, logSum = logTerm;
  for (let k = 0; k < x; k += 1) {
    logTerm += Math.log((m - k) / (k + 1)) + logP - logQ;
    logSum = logAddExp(logSum, logTerm);
  }
  return Math.min(1, Math.exp(logSum));
}

function assertCounts(x: number, m: number, delta: number) {
  if (!Number.isInteger(x) || !Number.isInteger(m) || m < 1 || x < 0 || x > m) throw new RangeError(`Invalid counts x=${x}, m=${m}`);
  if (!(delta > 0 && delta < 1)) throw new RangeError(`Invalid delta ${delta}`);
}

/**
 * One-sided (1 - delta) Clopper-Pearson upper bound for a rate observed as x out of m: the p at which
 * P(X <= x | m, p) = delta. Closed form for x = 0: 1 - delta^(1/m). Rounded UP to 4 decimals so the
 * displayed value is never below the exact bound.
 */
export function clopperPearsonUpper(x: number, m: number, delta: number): number {
  assertCounts(x, m, delta);
  if (x === m) return 1;
  let p: number;
  if (x === 0) p = 1 - Math.pow(delta, 1 / m);
  else {
    let lo = x / m, hi = 1;
    for (let i = 0; i < 200; i += 1) {
      const mid = (lo + hi) / 2;
      if (binomialCdf(x, m, mid) > delta) lo = mid; else hi = mid;
    }
    p = hi;
  }
  return Math.min(1, Math.ceil(p * 1e4 - 1e-9) / 1e4);
}

/** B = epsHat + pHat, capped at 1, rounded to 4 decimals. */
export function falseNoveltyBound(epsHat: number, pHat: number): number {
  return Math.min(1, Math.round((epsHat + pHat) * 1e4) / 1e4);
}

/* ------------------------------------------------------------------ */
/*  Quotes and identifiers                                             */
/* ------------------------------------------------------------------ */

/** Lowercase, unify quotes and dashes, collapse whitespace; used on both sides of the verbatim check. */
export function normalizeForQuote(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the quote (at least MIN_QUOTE_CHARS after normalization) appears verbatim in the text. */
export function quoteAppearsIn(quote: string | null | undefined, text: string | null | undefined): boolean {
  if (!quote || !text) return false;
  const q = normalizeForQuote(quote).replace(/^[\s"'.…]+|[\s"'.…]+$/g, "");
  return q.length >= MIN_QUOTE_CHARS && normalizeForQuote(text).includes(q);
}

/** "https://doi.org/10.1/ABC" -> "10.1/abc". Returns null when nothing DOI-like is left. */
export function normalizeDoi(value: string): string | null {
  const doi = value.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "").trim();
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : null;
}

/* ------------------------------------------------------------------ */
/*  Screening and decision                                             */
/* ------------------------------------------------------------------ */

export interface ScreenedDocument {
  id: string;
  paperId?: string | null;
  aiLabel?: ClosureLabel | string | null;
  aiQuoteVerified?: boolean;
  humanLabel?: ClosureLabel | string | null;
  limitationStatement?: boolean;
}

const asLabel = (value: unknown): ClosureLabel | undefined => (CLOSURE_LABELS as readonly unknown[]).includes(value) ? value as ClosureLabel : undefined;

/**
 * The label that counts: a person's label when there is one; otherwise the AI label, but an AI ANSWERS or PARTIAL
 * counts only when its quote was found verbatim. Undefined means the document still needs a person.
 */
export function effectiveLabel(doc: ScreenedDocument): ClosureLabel | undefined {
  const human = asLabel(doc.humanLabel);
  if (human) return human;
  const ai = asLabel(doc.aiLabel);
  if (ai === "UNRELATED") return ai;
  return ai && doc.aiQuoteVerified ? ai : undefined;
}

/** HUMAN only when a person labelled every document; a check that screened nothing is AI (its queries decided). */
export function judgeKindOf(docs: ScreenedDocument[]): ClosureJudgeKind {
  return docs.length > 0 && docs.every((doc) => asLabel(doc.humanLabel)) ? "HUMAN" : "AI";
}

export interface ClosureDecisionInput {
  documents: ScreenedDocument[];
  /** Number of queries that failed; any failure means absence is unproven. */
  searchErrors: number;
  coverage?: { pHat: number } | null;
  calibration?: { epsHat: number | null; judgeKind: ClosureJudgeKind | string } | null;
  maxFalseNovelty: number;
  /** Papers that cannot corroborate the gap (the papers it was derived from). */
  excludeCorroborationPaperIds?: string[];
}

export interface ClosureDecisionResult {
  decision: GapClosureDecision;
  reasons: ClosureAbstainReason[];
  judgeKind: ClosureJudgeKind;
  bound?: number;
  witnessDocumentId?: string;
  corroborated: boolean;
}

/**
 * CLOSED when any document effectively ANSWERS (its quote is the witness; a person-confirmed one is preferred).
 * Otherwise OPEN_CERTIFIED only when nothing below applies, else ABSTAIN with every reason that applies:
 * a failed query, a document waiting for a person, no coverage, no calibration (or one for another judge kind),
 * or a bound above maxFalseNovelty. Fail-closed: missing information never counts as absence of evidence.
 */
export function decideClosure(input: ClosureDecisionInput): ClosureDecisionResult {
  const judgeKind = judgeKindOf(input.documents);
  const excluded = new Set(input.excludeCorroborationPaperIds ?? []);
  const labelled = input.documents.map((doc) => ({ doc, label: effectiveLabel(doc) }));
  const corroborated = labelled.some(({ doc, label }) => label === "PARTIAL" && doc.limitationStatement === true && !(doc.paperId && excluded.has(doc.paperId)));
  const answers = labelled.filter(({ label }) => label === "ANSWERS").map(({ doc }) => doc);
  if (answers.length) {
    const witness = answers.find((doc) => asLabel(doc.humanLabel) === "ANSWERS") ?? answers[0]!;
    return { decision: "CLOSED", reasons: [], judgeKind, witnessDocumentId: witness.id, corroborated };
  }
  const reasons: ClosureAbstainReason[] = [];
  if (input.searchErrors > 0) reasons.push("SEARCH_ERRORS");
  if (labelled.some(({ label }) => label === undefined)) reasons.push("PENDING_REVIEW");
  if (!input.coverage) reasons.push("NO_COVERAGE");
  const epsHat = input.calibration?.epsHat;
  if (!input.calibration || epsHat === null || epsHat === undefined) reasons.push("NO_CALIBRATION");
  else if (input.calibration.judgeKind !== judgeKind) reasons.push("CALIBRATION_JUDGE_MISMATCH");
  let bound: number | undefined;
  if (input.coverage && epsHat !== null && epsHat !== undefined) {
    bound = falseNoveltyBound(epsHat, input.coverage.pHat);
    if (bound > input.maxFalseNovelty) reasons.push("BOUND_EXCEEDS_MAX");
  }
  return { decision: reasons.length ? "ABSTAIN" : "OPEN_CERTIFIED", reasons, judgeKind, bound, corroborated };
}

/** Calibration questions are known to be answered: FOUND when the procedure closes them, MISSED when it does not. */
export function calibrationOutcome(docs: ScreenedDocument[], searchErrors = 0): "FOUND" | "MISSED" | "PENDING" {
  const labels = docs.map(effectiveLabel);
  if (labels.includes("ANSWERS")) return "FOUND";
  if (searchErrors > 0 || labels.includes(undefined)) return "PENDING";
  return "MISSED";
}

/* ------------------------------------------------------------------ */
/*  Reproducibility                                                    */
/* ------------------------------------------------------------------ */

/** Cohen's kappa over paired labels; null with fewer than 2 pairs. */
export function cohenKappa(pairs: Array<[ClosureLabel, ClosureLabel]>): number | null {
  if (pairs.length < 2) return null;
  const n = pairs.length;
  const observed = pairs.filter(([a, b]) => a === b).length / n;
  const expected = CLOSURE_LABELS.reduce((sum, label) => {
    const a = pairs.filter(([first]) => first === label).length / n;
    const b = pairs.filter(([, second]) => second === label).length / n;
    return sum + a * b;
  }, 0);
  if (expected === 1) return 1;
  return Math.round(((observed - expected) / (1 - expected)) * 1e4) / 1e4;
}

export interface BoundArithmeticInput {
  calibration?: { n: number; misses: number; epsHat: number | null } | null;
  coverage?: { m: number; x: number; pHat: number } | null;
  delta: number;
  bound?: number;
  maxFalseNovelty: number;
}

/** Plain-language lines a person can recompute, used in the dossier and the UI. */
export function describeBoundArithmetic(input: BoundArithmeticInput): string[] {
  const lines: string[] = [];
  const confidence = `${Math.round((1 - input.delta) * 100)}%`;
  if (input.calibration && input.calibration.epsHat !== null) {
    lines.push(`epsHat = Clopper-Pearson upper ${confidence} of ${input.calibration.misses}/${input.calibration.n} missed calibration questions = ${input.calibration.epsHat}`);
  } else lines.push("epsHat: no computed calibration");
  if (input.coverage) {
    lines.push(`pHat = Clopper-Pearson upper ${confidence} of ${input.coverage.x}/${input.coverage.m} reference DOIs not found = ${input.coverage.pHat}`);
  } else lines.push("pHat: no coverage check");
  if (input.bound !== undefined && input.calibration?.epsHat != null && input.coverage) {
    const ok = input.bound <= input.maxFalseNovelty;
    lines.push(`B = ${input.calibration.epsHat} + ${input.coverage.pHat} = ${input.bound} ${ok ? "<=" : ">"} ${input.maxFalseNovelty}`);
  }
  return lines;
}
