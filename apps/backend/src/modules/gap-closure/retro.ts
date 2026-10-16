/**
 * Retrospective experiment: OLD count rule vs the Gap Closure Protocol (GCP) with the literature frozen at a cutoff year T.
 * Procedure and threats to validity: docs/gap-closure-retro-evaluation.md. Driver: scripts/gap-closure-retro-eval.ts.
 *
 * PURE — no I/O, no env, no database. Everything the script computes after its searches (labels, metrics, CSV, kappa)
 * lives here so it can be unit-tested and so a filled audit.csv can be re-scored without the database.
 */
import type { ClosureAbstainReason, ClosureDocumentSource, ClosureLabel, ClosureQueryLog, GapClosureDecision } from "@trend/shared-types";
import {
  CLOSURE_LABELS,
  clopperPearsonUpper,
  cohenKappa,
  decideClosure,
  effectiveLabel,
  type ClosureDecisionResult,
  type ScreenedDocument,
} from "./closure.rules.js";

/* ------------------------------------------------------------------ */
/*  The OLD count rule (frozen baseline)                               */
/* ------------------------------------------------------------------ */

/*
 * BASELINE BEING REPLACED. Everything in this section is a FROZEN COPY of the rule LumiGap used to label a gap
 * "Confirmed" (modules/gaps/gap-evidence.ts: computeGapEvidence + resolveProbeYears, and the growth window of
 * modules/gaps/gaps.service.ts: conceptGrowthPct), copied on 2026-10-15 BEFORE the Gap Closure Protocol replaced it.
 * It is duplicated on purpose: the experiment must keep measuring the old behaviour even after gap-evidence.ts changes.
 * Do not "fix" or refactor it. If the baseline ever has to change, add a new named copy next to it.
 *
 * Old rule: a gap is "confirmed" when the two probe topics rarely appear in the same paper (scarce), the busier parent
 * topic is growing (rising) and each parent topic has enough papers (not low sample). Nothing in it looks for a paper
 * that ANSWERS the question; a low co-mention count is the only evidence of absence.
 */

export interface LegacyEvidenceInput {
  intersectionCount: number;
  parentCounts: { a: number; b: number };
  /** YoY growth % of the more-active parent topic (0 if neither rises / unknown). */
  parentRisingGrowthPct: number;
}

export interface LegacyThresholds {
  scarceAbs: number;
  scarcePct: number;
  parentRisingMin: number;
  /** Each parent topic needs at least this many papers before the gap can be confirmed. */
  minParentPapers: number;
}

/**
 * The thresholds of the old rule: the defaults of GAP_SCARCE_ABS, GAP_SCARCE_PCT, GAP_PARENT_RISING_MIN and
 * GAP_MIN_PARENT_PAPERS in config/env.ts on 2026-10-15. Frozen here because those variables were removed with the rule;
 * the experiment must not drift with whatever the environment says later.
 */
export const LEGACY_THRESHOLDS: LegacyThresholds = { scarceAbs: 5, scarcePct: 0.02, parentRisingMin: 0, minParentPapers: 5 };

export interface LegacyEvidence {
  intersectionCount: number;
  parentCounts: { a: number; b: number };
  scarcityScore: number;
  confirmed: boolean;
  lowSample: boolean;
  evidenceConfidence: number;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Verbatim copy of computeGapEvidence (see the banner above). */
export function legacyComputeGapEvidence(input: LegacyEvidenceInput, t: LegacyThresholds): LegacyEvidence {
  const minParent = Math.min(input.parentCounts.a, input.parentCounts.b);
  // A parent topic with no papers means the corpus cannot speak to this gap at all;
  // an empty intersection then is missing data, not evidence of scarcity.
  if (minParent === 0) {
    return { intersectionCount: input.intersectionCount, parentCounts: input.parentCounts, scarcityScore: 0, confirmed: false, lowSample: true, evidenceConfidence: 0 };
  }
  // Scarcity ceiling: the larger of the absolute floor and a fraction of the smaller parent.
  const ceiling = Math.max(t.scarceAbs, Math.floor(t.scarcePct * minParent), 1);
  const scarcityScore = clamp01(1 - input.intersectionCount / ceiling);
  const scarce = input.intersectionCount <= ceiling;
  const rising = input.parentRisingGrowthPct > t.parentRisingMin;
  // With a handful of papers an empty intersection and "0 -> 1 paper" growth are noise, not evidence.
  const lowSample = minParent < t.minParentPapers;
  const confirmed = scarce && rising && !lowSample;
  // Confirmed gaps anchor at 0.5 and scale with scarcity; unconfirmed stay low.
  const evidenceConfidence = confirmed
    ? clamp01(0.5 + 0.5 * scarcityScore)
    : clamp01(0.25 * scarcityScore);
  return {
    intersectionCount: input.intersectionCount,
    parentCounts: input.parentCounts,
    scarcityScore: round2(scarcityScore),
    confirmed,
    lowSample,
    evidenceConfidence: round2(evidenceConfidence),
  };
}

export interface YearRange { yearFrom?: number; yearTo?: number }

/** Verbatim copy of resolveProbeYears: the user's window narrowed by the probe's window; an empty overlap falls back to the user's. */
export function legacyResolveProbeYears(user: YearRange, probe: YearRange): YearRange & { conflict: boolean } {
  const from = [user.yearFrom, probe.yearFrom].filter((v): v is number => v !== undefined);
  const to = [user.yearTo, probe.yearTo].filter((v): v is number => v !== undefined);
  const yearFrom = from.length ? Math.max(...from) : undefined, yearTo = to.length ? Math.min(...to) : undefined;
  if (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo) return { yearFrom: user.yearFrom, yearTo: user.yearTo, conflict: true };
  return { yearFrom, yearTo, conflict: false };
}

/** GAP_WINDOW_YEARS of gaps.service.ts: how many years back the growth of a parent topic is measured when no start year is given. */
export const LEGACY_GROWTH_WINDOW_YEARS = 5;

/** Years used to COUNT the probe at cutoff T: the probe's own window, never later than T. */
export function legacyCountYears(probe: YearRange, cutoff: number): YearRange & { conflict: boolean } {
  return legacyResolveProbeYears({ yearTo: cutoff }, probe);
}

/** Window and last complete year of the growth series, as conceptGrowthPct computes them, with "now" replaced by the cutoff view. */
export function legacyGrowthWindow(years: YearRange, now: number): { yearFrom: number; yearTo: number; lastCompleteYear: number } {
  const yearTo = years.yearTo ?? now;
  const yearFrom = years.yearFrom ?? yearTo - LEGACY_GROWTH_WINDOW_YEARS;
  return { yearFrom, yearTo, lastCompleteYear: Math.min(yearTo, now - 1) };
}

/** confirmed / weak = the old rule's two evidence states; none = the gap has no probe so the rule cannot run; error = the counting failed. */
export type OldLabel = "confirmed" | "weak" | "none" | "error";
export const OLD_LABELS: readonly OldLabel[] = ["confirmed", "weak", "none", "error"];

/**
 * The old rule as the UI showed it: `confirmed` when computeGapEvidence confirms (evidenceConfidence >= 0.5), `weak` for a
 * probed gap that is not confirmed, `none` when there is no probe (null input).
 */
export function legacyCountRule(input: LegacyEvidenceInput | null, thresholds: LegacyThresholds): { label: OldLabel; evidence: LegacyEvidence | null } {
  if (!input) return { label: "none", evidence: null };
  const evidence = legacyComputeGapEvidence(input, thresholds);
  return { label: evidence.confirmed ? "confirmed" : "weak", evidence };
}

/* ------------------------------------------------------------------ */
/*  Windows, documents, evaluation                                     */
/* ------------------------------------------------------------------ */

/**
 * Keeps documents whose publication year is inside the window. A document with an unknown year is dropped: it cannot be
 * shown to be inside, and a leak across the cutoff would void the experiment.
 */
export function filterDraftsByYears<T extends { publicationYear?: number | null }>(drafts: T[], range: YearRange): { kept: T[]; dropped: number; droppedUnknownYear: number } {
  const kept: T[] = [];
  let droppedUnknownYear = 0;
  for (const draft of drafts) {
    const year = draft.publicationYear;
    if (typeof year !== "number" || !Number.isInteger(year) || year <= 0) { droppedUnknownYear += 1; continue; }
    if (range.yearFrom !== undefined && year < range.yearFrom) continue;
    if (range.yearTo !== undefined && year > range.yearTo) continue;
    kept.push(draft);
  }
  return { kept, dropped: drafts.length - kept.length, droppedUnknownYear };
}

/** One searched and screened document in results.json. `dedupeKey` is the document id inside the experiment. */
export interface RetroDocument {
  dedupeKey: string;
  paperId?: string | null;
  openalexId?: string | null;
  doi?: string | null;
  title: string;
  publicationYear?: number | null;
  retrievedFrom: ClosureDocumentSource;
  aiLabel: ClosureLabel | null;
  aiQuote: string | null;
  aiQuoteVerified: boolean;
  limitationStatement: boolean;
  /** The LLM call for this document's batch failed: the document is unlabelled and counts as pending. */
  batchFailed: boolean;
}

export interface Witness { title: string; doi?: string; year?: number; quote: string }

/** What the closure rules see of a document: the AI label counts only with a verified quote. */
export function toScreenedDocument(doc: RetroDocument): ScreenedDocument {
  return { id: doc.dedupeKey, paperId: doc.paperId, aiLabel: doc.aiLabel, aiQuoteVerified: doc.aiQuoteVerified, limitationStatement: doc.limitationStatement };
}

/** What GCP says about a window of the literature. */
export type GcpState = "CLOSED" | "OPEN_CERTIFIED" | "ABSTAIN" | "NO_ANSWER_FOUND" | "NEEDS_REVIEW";
export const GCP_STATES: readonly GcpState[] = ["CLOSED", "OPEN_CERTIFIED", "ABSTAIN", "NO_ANSWER_FOUND", "NEEDS_REVIEW"];

export interface WindowEvaluation {
  state: GcpState;
  /** decideClosure's verdict on the same documents. */
  decision: GapClosureDecision;
  reasons: ClosureAbstainReason[];
  bound?: number;
  /** Documents whose effective label is ANSWERS. */
  answers: number;
  /** Documents without an effective label (UNSURE, unverified quote, failed batch): a person must read them. */
  pending: number;
  /** Failed searches: an error is never the same as "zero results". */
  searchErrors: number;
  witnessId?: string;
}

export interface WindowEvaluationInput {
  documents: RetroDocument[];
  searchErrors: number;
  /** Optional: with both, the decision is certified by decideClosure (bound against maxFalseNovelty). */
  coverage?: { pHat: number } | null;
  calibration?: { epsHat: number | null; judgeKind: string } | null;
  maxFalseNovelty: number;
}

/**
 * Applies the production decision rule (decideClosure) to a window. Fail-closed: a failed search or a document waiting
 * for a person yields NEEDS_REVIEW, never "no answer". Without coverage and calibration nothing can be certified, so a
 * window with no answer, no error and no pending document is NO_ANSWER_FOUND (an observation, not a certificate).
 */
export function evaluateWindow(input: WindowEvaluationInput): WindowEvaluation {
  const screened = input.documents.map(toScreenedDocument);
  const result: ClosureDecisionResult = decideClosure({ documents: screened, searchErrors: input.searchErrors, coverage: input.coverage ?? null, calibration: input.calibration ?? null, maxFalseNovelty: input.maxFalseNovelty });
  const labels = screened.map(effectiveLabel);
  const answers = labels.filter((label) => label === "ANSWERS").length;
  const pending = labels.filter((label) => label === undefined).length;
  let state: GcpState;
  if (result.decision === "CLOSED") state = "CLOSED";
  else if (input.searchErrors > 0 || pending > 0) state = "NEEDS_REVIEW";
  else if (result.decision === "OPEN_CERTIFIED") state = "OPEN_CERTIFIED";
  else if (input.coverage && input.calibration) state = "ABSTAIN";
  else state = "NO_ANSWER_FOUND";
  return { state, decision: result.decision, reasons: result.reasons, bound: result.bound, answers, pending, searchErrors: input.searchErrors, witnessId: result.witnessDocumentId };
}

export function pickWitness(documents: RetroDocument[], witnessId: string | undefined): Witness | null {
  if (!witnessId) return null;
  const doc = documents.find((candidate) => candidate.dedupeKey === witnessId);
  if (!doc || !doc.aiQuote) return null;
  return { title: doc.title, doi: doc.doi ?? undefined, year: doc.publicationYear ?? undefined, quote: doc.aiQuote };
}

export interface RetroWindowResult {
  window: "AT_T" | "AFTER_T";
  yearFrom?: number;
  yearTo?: number;
  queries: ClosureQueryLog[];
  documents: RetroDocument[];
  droppedByYear: number;
  droppedUnknownYear: number;
  evaluation: WindowEvaluation;
  witness: Witness | null;
  /** The whole phase failed (not just one query); the window is then reported as needing review. */
  error?: string;
}

export interface RetroGapResult {
  gapId: string;
  title: string;
  question: string;
  facets: Record<string, string | undefined>;
  cutoff: number;
  proposedQueries: string[];
  old: { label: OldLabel; evidence: LegacyEvidence | null; growthPct?: { a: number; b: number }; years?: YearRange; error?: string };
  atT: RetroWindowResult;
  afterT: RetroWindowResult;
}

/* ------------------------------------------------------------------ */
/*  CSV                                                                */
/* ------------------------------------------------------------------ */

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** RFC 4180 writer: comma separated, CRLF rows, fields with commas, quotes, line breaks or edge spaces quoted. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** RFC 4180 reader: quoted fields may hold commas, doubled quotes and line breaks. Skips blank lines and a leading BOM. */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;
  const endField = () => { row.push(field); field = ""; started = false; };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && !started) { quoted = true; started = true; continue; }
    if (ch === ",") { endField(); continue; }
    if (ch === "\r") { if (source[i + 1] === "\n") i += 1; endRow(); continue; }
    if (ch === "\n") { endRow(); continue; }
    field += ch;
    started = true;
  }
  if (quoted) throw new Error("CSV ends inside a quoted field");
  if (started || field !== "" || row.length) endRow();
  return rows;
}

/* ------------------------------------------------------------------ */
/*  The audit sheet                                                    */
/* ------------------------------------------------------------------ */

export type AfterStatus = "FILLED" | "NOT_FOUND" | "UNKNOWN";
export const REVIEWER_LABELS = CLOSURE_LABELS;

/** One row of audit.csv: everything a reviewer needs and everything --score-audit needs. */
export interface AuditRecord {
  gapId: string;
  title: string;
  question: string;
  oldLabel: OldLabel;
  gcpAtT: GcpState;
  answersAtT: number;
  pendingAtT: number;
  failedQueriesAtT: number;
  witnessAtT: Witness | null;
  answersAfterT: number;
  pendingAfterT: number;
  failedQueriesAfterT: number;
  witnessAfterT: Witness | null;
  /** Reviewer cells: "" (not filled) or ANSWERS / PARTIAL / UNRELATED. */
  reviewer1AtT: string;
  reviewer2AtT: string;
  reviewer1AfterT: string;
  reviewer2AfterT: string;
}

export const AUDIT_HEADERS = [
  "gap_id", "title", "question", "old_label", "gcp_at_t", "answers_at_t", "pending_at_t", "failed_queries_at_t",
  "witness_at_t_title", "witness_at_t_doi", "witness_at_t_year", "witness_at_t_quote",
  "after_t_status", "answers_after_t", "pending_after_t", "failed_queries_after_t",
  "filled_after_t_title", "filled_after_t_doi", "filled_after_t_year", "filled_after_t_quote",
  "reviewer1_at_t", "reviewer2_at_t", "reviewer1_after_t", "reviewer2_after_t",
] as const;

export function afterStatusOf(counts: { answers: number; pending: number; failedQueries: number }): AfterStatus {
  if (counts.answers > 0) return "FILLED";
  return counts.pending > 0 || counts.failedQueries > 0 ? "UNKNOWN" : "NOT_FOUND";
}

const failedQueryCount = (window: RetroWindowResult): number => window.evaluation.searchErrors + (window.error ? 1 : 0);

export function toAuditRecord(result: RetroGapResult): AuditRecord {
  return {
    gapId: result.gapId,
    title: result.title,
    question: result.question,
    oldLabel: result.old.label,
    gcpAtT: result.atT.error ? "NEEDS_REVIEW" : result.atT.evaluation.state,
    answersAtT: result.atT.evaluation.answers,
    pendingAtT: result.atT.evaluation.pending,
    failedQueriesAtT: failedQueryCount(result.atT),
    witnessAtT: result.atT.witness,
    answersAfterT: result.afterT.evaluation.answers,
    pendingAfterT: result.afterT.evaluation.pending,
    failedQueriesAfterT: failedQueryCount(result.afterT),
    witnessAfterT: result.afterT.witness,
    reviewer1AtT: "", reviewer2AtT: "", reviewer1AfterT: "", reviewer2AfterT: "",
  };
}

const num = (value: number): string => String(value);
const witnessCells = (w: Witness | null): string[] => [w?.title ?? "", w?.doi ?? "", w?.year !== undefined ? String(w.year) : "", w?.quote ?? ""];

export function auditToCsv(records: AuditRecord[]): string {
  const rows = records.map((r) => [
    r.gapId, r.title, r.question, r.oldLabel, r.gcpAtT, num(r.answersAtT), num(r.pendingAtT), num(r.failedQueriesAtT),
    ...witnessCells(r.witnessAtT),
    afterStatusOf({ answers: r.answersAfterT, pending: r.pendingAfterT, failedQueries: r.failedQueriesAfterT }), num(r.answersAfterT), num(r.pendingAfterT), num(r.failedQueriesAfterT),
    ...witnessCells(r.witnessAfterT),
    r.reviewer1AtT, r.reviewer2AtT, r.reviewer1AfterT, r.reviewer2AfterT,
  ]);
  return toCsv([[...AUDIT_HEADERS], ...rows]);
}

export class AuditParseError extends Error {
  constructor(readonly issues: string[]) {
    super(`audit.csv has ${issues.length} problem(s):\n- ${issues.slice(0, 20).join("\n- ")}${issues.length > 20 ? `\n- ... and ${issues.length - 20} more` : ""}`);
  }
}

/** Parses a (possibly filled) audit.csv. Strict: any unknown value is reported instead of silently ignored. */
export function parseAuditCsv(text: string): AuditRecord[] {
  const table = parseCsv(text);
  if (!table.length) throw new AuditParseError(["the file is empty"]);
  const header = table[0]!.map((cell) => cell.trim());
  const missing = AUDIT_HEADERS.filter((name) => !header.includes(name));
  if (missing.length) throw new AuditParseError([`missing column(s): ${missing.join(", ")}`]);
  const issues: string[] = [];
  const records: AuditRecord[] = [];
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const get = (name: string): string => (cells[header.indexOf(name)] ?? "").trim();
    const count = (name: string): number => {
      const raw = get(name);
      if (!/^\d{1,6}$/.test(raw)) { issues.push(`row ${line}: ${name} must be a whole number, got "${raw}"`); return 0; }
      return Number(raw);
    };
    const oldLabel = get("old_label") as OldLabel;
    if (!OLD_LABELS.includes(oldLabel)) issues.push(`row ${line}: old_label "${oldLabel}" is not one of ${OLD_LABELS.join("/")}`);
    const gcpAtT = get("gcp_at_t") as GcpState;
    if (!GCP_STATES.includes(gcpAtT)) issues.push(`row ${line}: gcp_at_t "${gcpAtT}" is not one of ${GCP_STATES.join("/")}`);
    const reviewer = (name: string): string => {
      const raw = get(name).toUpperCase();
      if (raw !== "" && !(REVIEWER_LABELS as readonly string[]).includes(raw)) issues.push(`row ${line}: ${name} "${get(name)}" must be empty or ANSWERS/PARTIAL/UNRELATED`);
      return (REVIEWER_LABELS as readonly string[]).includes(raw) ? raw : "";
    };
    const witness = (prefix: string): Witness | null => {
      const title = get(`${prefix}_title`), quote = get(`${prefix}_quote`), doi = get(`${prefix}_doi`), year = get(`${prefix}_year`);
      if (!title && !quote) return null;
      return { title, quote, doi: doi || undefined, year: /^\d{4}$/.test(year) ? Number(year) : undefined };
    };
    const gapId = get("gap_id");
    if (!gapId) issues.push(`row ${line}: gap_id is empty`);
    const record: AuditRecord = {
      gapId, title: get("title"), question: get("question"), oldLabel, gcpAtT,
      answersAtT: count("answers_at_t"), pendingAtT: count("pending_at_t"), failedQueriesAtT: count("failed_queries_at_t"),
      witnessAtT: witness("witness_at_t"),
      answersAfterT: count("answers_after_t"), pendingAfterT: count("pending_after_t"), failedQueriesAfterT: count("failed_queries_after_t"),
      witnessAfterT: witness("filled_after_t"),
      reviewer1AtT: reviewer("reviewer1_at_t"), reviewer2AtT: reviewer("reviewer2_at_t"),
      reviewer1AfterT: reviewer("reviewer1_after_t"), reviewer2AfterT: reviewer("reviewer2_after_t"),
    };
    if ((record.reviewer1AtT || record.reviewer2AtT) && !record.witnessAtT) issues.push(`row ${line}: a reviewer label at T needs a witness at T in the same row`);
    if ((record.reviewer1AfterT || record.reviewer2AfterT) && !record.witnessAfterT) issues.push(`row ${line}: a reviewer label after T needs a filled-after-T document in the same row`);
    records.push(record);
  });
  if (issues.length) throw new AuditParseError(issues);
  if (!records.length) throw new AuditParseError(["the file has a header but no rows"]);
  return records;
}

/* ------------------------------------------------------------------ */
/*  Statistics                                                         */
/* ------------------------------------------------------------------ */

export interface ProportionInterval {
  x: number;
  m: number;
  /** x / m, null when m = 0. */
  estimate: number | null;
  /** Clopper-Pearson, each side one-sided at alpha / 2 (together a 1 - alpha two-sided interval). */
  lower: number | null;
  upper: number | null;
}

/** Two-sided Clopper-Pearson interval built from clopperPearsonUpper: upper(x, m) and lower = 1 - upper(m - x, m). */
export function proportionInterval(x: number, m: number, alpha = 0.05): ProportionInterval {
  if (!Number.isInteger(m) || m < 1) return { x, m, estimate: null, lower: null, upper: null };
  const delta = alpha / 2;
  const upper = clopperPearsonUpper(x, m, delta);
  // The upper bound is rounded UP, so 1 - upper(m - x) is rounded DOWN: both ends stay conservative.
  const lower = x === 0 ? 0 : Math.floor((1 - clopperPearsonUpper(m - x, m, delta)) * 1e4 + 1e-9) / 1e4;
  return { x, m, estimate: Math.round((x / m) * 1e4) / 1e4, lower, upper };
}

export type ReviewerResolution = { status: "agreed" | "single"; label: ClosureLabel } | { status: "conflict" | "none"; label?: undefined };

/** Two reviewers agree -> their label; one label -> that label; two different labels -> conflict (needs a third look). */
export function resolveReviewers(first: string, second: string): ReviewerResolution {
  const a = (REVIEWER_LABELS as readonly string[]).includes(first) ? first as ClosureLabel : undefined;
  const b = (REVIEWER_LABELS as readonly string[]).includes(second) ? second as ClosureLabel : undefined;
  if (a && b) return a === b ? { status: "agreed", label: a } : { status: "conflict" };
  const only = a ?? b;
  return only ? { status: "single", label: only } : { status: "none" };
}

/* ------------------------------------------------------------------ */
/*  Scoring and metrics                                                */
/* ------------------------------------------------------------------ */

export type AtTState = "answered" | "no_answer" | "unresolved" | "disputed";
export type AfterState = "filled" | "not_filled" | "unknown" | "disputed";
export type Provenance = "AI" | "HUMAN";

export interface ScoredRow {
  gapId: string;
  oldLabel: OldLabel;
  gcpAtT: GcpState;
  atT: AtTState;
  atTBy: Provenance;
  after: AfterState;
  afterBy: Provenance;
}

/**
 * One gap's final state at T and after T. The AI result stands until a reviewer labels the witness:
 * ANSWERS keeps it, PARTIAL/UNRELATED removes it (only when it was the single answering document; with several the rest
 * were never shown to a reviewer, so the gap becomes unresolved), two different labels make the cell disputed.
 * Fail-closed: a pending document or a failed search is never read as "no answer".
 */
export function scoreRecord(record: AuditRecord, useHuman: boolean): ScoredRow {
  const openAtT = record.pendingAtT > 0 || record.failedQueriesAtT > 0;
  let atT: AtTState = record.answersAtT > 0 ? "answered" : openAtT ? "unresolved" : "no_answer";
  let atTBy: Provenance = "AI";
  if (useHuman && record.witnessAtT && record.answersAtT > 0) {
    const human = resolveReviewers(record.reviewer1AtT, record.reviewer2AtT);
    if (human.status === "conflict") { atT = "disputed"; atTBy = "HUMAN"; }
    else if (human.label) {
      atTBy = "HUMAN";
      if (human.label === "ANSWERS") atT = "answered";
      else atT = record.answersAtT === 1 && !openAtT ? "no_answer" : "unresolved";
    }
  }
  const openAfter = record.pendingAfterT > 0 || record.failedQueriesAfterT > 0;
  let after: AfterState = record.answersAfterT > 0 ? "filled" : openAfter ? "unknown" : "not_filled";
  let afterBy: Provenance = "AI";
  if (useHuman && record.witnessAfterT && record.answersAfterT > 0) {
    const human = resolveReviewers(record.reviewer1AfterT, record.reviewer2AfterT);
    if (human.status === "conflict") { after = "disputed"; afterBy = "HUMAN"; }
    else if (human.label) {
      afterBy = "HUMAN";
      if (human.label === "ANSWERS") after = "filled";
      else after = record.answersAfterT === 1 && !openAfter ? "not_filled" : "unknown";
    }
  }
  return { gapId: record.gapId, oldLabel: record.oldLabel, gcpAtT: record.gcpAtT, atT, atTBy, after, afterBy };
}

export interface KappaSummary { pairs: number; kappa: number | null; disagreements: number }

function kappaOf(pairs: Array<[ClosureLabel, ClosureLabel]>): KappaSummary {
  return { pairs: pairs.length, kappa: cohenKappa(pairs), disagreements: pairs.filter(([a, b]) => a !== b).length };
}

export interface RetroMetrics {
  /** True when human reviewer labels were used to override the AI where present. */
  useHuman: boolean;
  alpha: number;
  n: number;
  oldLabels: Record<OldLabel, number>;
  gcpStates: Record<GcpState, number>;
  atT: Record<AtTState, number>;
  /** Old rule said "confirmed": how many of them already had an answer at T (a lower bound of the old rule's false novelty). */
  oldConfirmed: { n: number; answeredAtT: ProportionInterval; unresolvedAtT: number; disputedAtT: number };
  /** Gaps with no answer at T (complete search, nothing answering, nothing pending). */
  noAnswerAtT: {
    n: number;
    filledAfter: ProportionInterval;
    unknownAfter: number;
    disputedAfter: number;
    byOldLabel: { confirmed: ProportionInterval; other: ProportionInterval };
    certified: { n: number; filledAfter: ProportionInterval };
  };
  /** Rows of oldLabel x atT. */
  crossTab: Record<OldLabel, Record<AtTState, number>>;
  humanCells: { witnessCells: number; labelledCells: number; reviewed: number };
  agreement: { atT: KappaSummary; afterT: KappaSummary; pooled: KappaSummary };
}

const zero = <K extends string>(keys: readonly K[]): Record<K, number> => Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
const AT_T_STATES: readonly AtTState[] = ["answered", "no_answer", "unresolved", "disputed"];

export function computeRetroMetrics(records: AuditRecord[], options: { useHuman: boolean; alpha?: number } = { useHuman: true }): RetroMetrics {
  const alpha = options.alpha ?? 0.05;
  const scored = records.map((record) => scoreRecord(record, options.useHuman));
  const oldLabels = zero(OLD_LABELS), gcpStates = zero(GCP_STATES), atT = zero(AT_T_STATES);
  const crossTab = Object.fromEntries(OLD_LABELS.map((label) => [label, zero(AT_T_STATES)])) as Record<OldLabel, Record<AtTState, number>>;
  for (const row of scored) { oldLabels[row.oldLabel] += 1; gcpStates[row.gcpAtT] += 1; atT[row.atT] += 1; crossTab[row.oldLabel][row.atT] += 1; }

  const confirmed = scored.filter((row) => row.oldLabel === "confirmed");
  const noAnswer = scored.filter((row) => row.atT === "no_answer");
  const resolvedAfter = (rows: ScoredRow[]) => {
    const filled = rows.filter((row) => row.after === "filled").length;
    const notFilled = rows.filter((row) => row.after === "not_filled").length;
    return proportionInterval(filled, filled + notFilled, alpha);
  };
  const certifiedNoAnswer = noAnswer.filter((row) => row.gcpAtT === "OPEN_CERTIFIED");

  const atPairs: Array<[ClosureLabel, ClosureLabel]> = [], afterPairs: Array<[ClosureLabel, ClosureLabel]> = [];
  let witnessCells = 0, labelledCells = 0, reviewed = 0;
  if (options.useHuman) {
    for (const record of records) {
      for (const [witness, r1, r2, pairs] of [
        [record.witnessAtT, record.reviewer1AtT, record.reviewer2AtT, atPairs],
        [record.witnessAfterT, record.reviewer1AfterT, record.reviewer2AfterT, afterPairs],
      ] as const) {
        if (!witness) continue;
        witnessCells += 1;
        const filled = (r1 ? 1 : 0) + (r2 ? 1 : 0);
        labelledCells += filled;
        if (filled > 0) reviewed += 1;
        if (r1 && r2) pairs.push([r1 as ClosureLabel, r2 as ClosureLabel]);
      }
    }
  }

  return {
    useHuman: options.useHuman,
    alpha,
    n: records.length,
    oldLabels,
    gcpStates,
    atT,
    oldConfirmed: {
      n: confirmed.length,
      answeredAtT: proportionInterval(confirmed.filter((row) => row.atT === "answered").length, confirmed.length, alpha),
      unresolvedAtT: confirmed.filter((row) => row.atT === "unresolved").length,
      disputedAtT: confirmed.filter((row) => row.atT === "disputed").length,
    },
    noAnswerAtT: {
      n: noAnswer.length,
      filledAfter: resolvedAfter(noAnswer),
      unknownAfter: noAnswer.filter((row) => row.after === "unknown").length,
      disputedAfter: noAnswer.filter((row) => row.after === "disputed").length,
      byOldLabel: { confirmed: resolvedAfter(noAnswer.filter((row) => row.oldLabel === "confirmed")), other: resolvedAfter(noAnswer.filter((row) => row.oldLabel !== "confirmed")) },
      certified: { n: certifiedNoAnswer.length, filledAfter: resolvedAfter(certifiedNoAnswer) },
    },
    crossTab,
    humanCells: { witnessCells, labelledCells, reviewed },
    agreement: { atT: kappaOf(atPairs), afterT: kappaOf(afterPairs), pooled: kappaOf([...atPairs, ...afterPairs]) },
  };
}

/* ------------------------------------------------------------------ */
/*  summary.md                                                         */
/* ------------------------------------------------------------------ */

const pct = (value: number | null): string => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
function intervalText(interval: ProportionInterval, alpha: number): string {
  if (interval.m === 0) return "n/a (no gaps in this group)";
  return `${interval.x}/${interval.m} = ${pct(interval.estimate)} (${Math.round((1 - alpha) * 100)}% Clopper-Pearson interval ${pct(interval.lower)} to ${pct(interval.upper)})`;
}

export interface SummaryMeta {
  cutoff?: number;
  generatedAt: string;
  protocolVersion?: string;
  /** Free-form settings lines (limit, topic, openalex on/off, coverage/calibration ids, models). */
  settings?: string[];
}

export function renderSummaryMarkdown(metrics: RetroMetrics, meta: SummaryMeta): string {
  const { alpha } = metrics;
  const human = metrics.humanCells;
  const lines: string[] = [];
  lines.push(`# Gap closure retrospective${meta.cutoff !== undefined ? `, literature frozen at ${meta.cutoff}` : ""}`);
  lines.push("");
  lines.push(`Generated ${meta.generatedAt}${meta.protocolVersion ? `, protocol ${meta.protocolVersion}` : ""}. Method and threats to validity: docs/gap-closure-retro-evaluation.md.`);
  lines.push("");
  if (metrics.useHuman && human.labelledCells > 0) {
    lines.push(`> **Status: partly audited.** ${human.reviewed} of ${human.witnessCells} witness documents have at least one human label; AI labels still stand for the rest. Numbers are final only when every witness has two human labels.`);
  } else {
    lines.push("> **Status: PROVISIONAL.** Every label below is an AI label (a model read the abstracts). It must not be quoted as a result until two people have filled the reviewer columns of audit.csv and the file has been re-scored with --score-audit.");
  }
  lines.push("");
  if (meta.settings?.length) { lines.push("Settings:", ...meta.settings.map((line) => `- ${line}`), ""); }
  lines.push("## 1. Gaps", "");
  lines.push(`- Gaps evaluated: **${metrics.n}**`);
  lines.push(`- Old count rule: ${OLD_LABELS.map((label) => `${label} ${metrics.oldLabels[label]}`).join(", ")}`);
  lines.push("");
  lines.push("## 2. Did GCP find an answer at T for gaps the old rule called confirmed?", "");
  lines.push(`- Old rule "confirmed": **${metrics.oldConfirmed.n}** gaps`);
  lines.push(`- Already answered at T according to GCP: **${intervalText(metrics.oldConfirmed.answeredAtT, alpha)}**`);
  lines.push(`- Not decidable at T (failed search or documents waiting for a person): ${metrics.oldConfirmed.unresolvedAtT}; disputed between reviewers: ${metrics.oldConfirmed.disputedAtT}`);
  lines.push("");
  lines.push("This ratio is an observed LOWER bound of the old rule's false-novelty rate: GCP can miss an answer (its own miss rate epsilon and the corpus coverage gap p), so the true share of already-answered gaps is at least this high. Undecidable gaps count as not answered.");
  lines.push("");
  lines.push("## 3. GCP decision distribution at T", "");
  lines.push("| GCP at T | Gaps |", "|---|---|");
  for (const state of GCP_STATES) lines.push(`| ${state} | ${metrics.gcpStates[state]} |`);
  lines.push("");
  lines.push("CLOSED = a verified answering sentence exists; OPEN_CERTIFIED = no answer and the bound epsilon + p is below the limit; ABSTAIN = no answer but certification failed; NO_ANSWER_FOUND = no answer, nothing pending, but no coverage/calibration was supplied so nothing is certified; NEEDS_REVIEW = a search failed or a document is waiting for a person (never read as \"no answer\").");
  lines.push("");
  lines.push("## 4. Old label x GCP state at T", "");
  lines.push(`| Old label | ${AT_T_STATES.join(" | ")} |`, `|---|${AT_T_STATES.map(() => "---").join("|")}|`);
  for (const label of OLD_LABELS) lines.push(`| ${label} | ${AT_T_STATES.map((state) => metrics.crossTab[label][state]).join(" | ")} |`);
  lines.push("");
  lines.push("## 5. Gaps with no answer at T: were they filled afterwards?", "");
  lines.push(`- Gaps with no answer at T: **${metrics.noAnswerAtT.n}**`);
  lines.push(`- Answered by a paper published after T: **${intervalText(metrics.noAnswerAtT.filledAfter, alpha)}**`);
  lines.push(`- After-T result unknown (failed search or documents waiting for a person): ${metrics.noAnswerAtT.unknownAfter}; disputed: ${metrics.noAnswerAtT.disputedAfter} (excluded from the ratio)`);
  lines.push(`- Old rule "confirmed" and no answer at T: ${intervalText(metrics.noAnswerAtT.byOldLabel.confirmed, alpha)}`);
  lines.push(`- Other old labels and no answer at T: ${intervalText(metrics.noAnswerAtT.byOldLabel.other, alpha)}`);
  lines.push(`- OPEN_CERTIFIED at T: ${metrics.noAnswerAtT.certified.n} gaps, filled afterwards ${intervalText(metrics.noAnswerAtT.certified.filledAfter, alpha)}`);
  lines.push("");
  lines.push("A gap filled after T is not a failure of GCP (open at T is the correct call); a high share only shows that the open gaps were real, answerable questions. See the docs for how to read this next to section 2.");
  lines.push("");
  lines.push("## 6. Human audit", "");
  lines.push(`- Witness documents shown to reviewers: ${human.witnessCells}; reviewer labels entered: ${human.labelledCells}; witnesses with at least one label: ${human.reviewed}`);
  const kappaLine = (name: string, k: KappaSummary) => `- Cohen's kappa, ${name}: ${k.kappa === null ? "n/a (fewer than 2 pairs with two labels)" : k.kappa} over ${k.pairs} pairs, ${k.disagreements} disagreements`;
  lines.push(kappaLine("at T", metrics.agreement.atT), kappaLine("after T", metrics.agreement.afterT), kappaLine("pooled", metrics.agreement.pooled));
  lines.push("");
  lines.push("The audit only shows the best witness of each gap. It checks the AI's positive claims, not the documents the AI called unrelated; the second error (a missed answer) is covered by the calibration miss rate epsilon, not by this audit.");
  lines.push("");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Command line                                                       */
/* ------------------------------------------------------------------ */

export interface RetroArgs {
  mode: "run" | "score";
  cutoff?: number;
  limit: number;
  gapIds: string[];
  topic?: string;
  out?: string;
  openalex: boolean;
  maxQueries?: number;
  coverageId?: string;
  calibrationId?: string;
  auditPath?: string;
}

const VALUE_FLAGS = new Set(["cutoff", "limit", "gap-ids", "topic", "out", "max-queries", "coverage-id", "calibration-id", "score-audit"]);
const BOOLEAN_FLAGS = new Set(["no-openalex"]);

function intFlag(name: string, value: string, min: number, max: number): number {
  if (!/^\d{1,6}$/.test(value)) throw new Error(`--${name} must be a whole number, got "${value}"`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) throw new Error(`--${name} must be between ${min} and ${max}`);
  return parsed;
}

/** Parses `--flag value` / `--flag=value`. `currentYear` is a parameter so tests do not depend on the clock. */
export function parseRetroArgs(argv: string[], currentYear = new Date().getFullYear()): RetroArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("--")) throw new Error(`Unexpected argument "${token}"`);
    const eq = token.indexOf("=");
    const name = token.slice(2, eq === -1 ? undefined : eq);
    if (BOOLEAN_FLAGS.has(name)) { if (eq !== -1) throw new Error(`--${name} takes no value`); flags.add(name); continue; }
    if (!VALUE_FLAGS.has(name)) throw new Error(`Unknown option --${name}`);
    const value = eq !== -1 ? token.slice(eq + 1) : argv[++i];
    if (value === undefined || value === "" || (eq === -1 && value.startsWith("--"))) throw new Error(`--${name} needs a value`);
    values.set(name, value);
  }
  const auditPath = values.get("score-audit");
  const gapIds = (values.get("gap-ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const topic = values.get("topic")?.trim() || undefined;
  if (values.has("gap-ids") && !gapIds.length) throw new Error("--gap-ids needs at least one id");
  if (gapIds.length && topic) throw new Error("Use --gap-ids or --topic, not both");
  const cutoffRaw = values.get("cutoff");
  if (!auditPath && cutoffRaw === undefined) throw new Error("--cutoff <year> is required");
  const cutoff = cutoffRaw !== undefined ? intFlag("cutoff", cutoffRaw, 1900, 2200) : undefined;
  if (cutoff !== undefined && !auditPath && cutoff >= currentYear) throw new Error(`--cutoff must be before ${currentYear}: the experiment needs at least one later year to look for answers`);
  return {
    mode: auditPath ? "score" : "run",
    cutoff,
    limit: values.has("limit") ? intFlag("limit", values.get("limit")!, 1, 500) : 20,
    gapIds,
    topic,
    out: values.get("out") ?? (cutoff !== undefined && !auditPath ? `./gap-closure-retro-${cutoff}` : undefined),
    openalex: !flags.has("no-openalex"),
    maxQueries: values.has("max-queries") ? intFlag("max-queries", values.get("max-queries")!, 1, 5) : undefined,
    coverageId: values.get("coverage-id"),
    calibrationId: values.get("calibration-id"),
    auditPath,
  };
}
