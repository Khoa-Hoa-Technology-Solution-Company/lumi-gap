/**
 * Row -> view mappers and the closure dossier. PURE: no I/O, no env. The dossier holds everything a person needs
 * to redo a check by hand (docs/gap-closure-protocol.md): the logged queries, every document with its labels and
 * quotes, the coverage DOIs, the calibration questions and the arithmetic of the bound.
 */
import type {
  CalibrationQuestionView,
  ClosureAbstainReason,
  ClosureCalibrationView,
  ClosureFacetMatch,
  ClosureJudgeKind,
  ClosureLabel,
  ClosureQueryLog,
  CoverageCheckView,
  GapClosureCheckView,
  GapClosureDocumentView,
  GapClosureDossier,
  QuestionFacets,
} from "@trend/shared-types";
import { calibrationModeOf, cohenKappa, describeBoundArithmetic, effectiveLabel } from "./closure.rules.js";

/* ------------------------------------------------------------------ */
/*  Row shapes (structural, so Prisma rows assign without a cast)      */
/* ------------------------------------------------------------------ */

export interface CheckRow {
  id: string;
  targetKind: string;
  targetId: string;
  protocolVersion: string;
  status: string;
  question: string;
  facets: unknown;
  queries: unknown;
  yearFrom: number | null;
  yearTo: number | null;
  judgeKind: string | null;
  coverageCheckId: string | null;
  calibrationId: string | null;
  delta: number | null;
  epsHat: number | null;
  pHat: number | null;
  bound: number | null;
  /** Absent on rows read before the column existed. */
  boundMode?: string | null;
  maxFalseNovelty: number | null;
  decision: string | null;
  decisionReasons: unknown;
  witnessDocumentId: string | null;
  corroborated: boolean;
  errorMessage: string | null;
  createdById: string;
  decidedById: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentRow {
  id: string;
  paperId: string | null;
  openalexId: string | null;
  doi: string | null;
  title: string;
  abstractText: string | null;
  publicationYear: number | null;
  retrievedFrom: string;
  queryIndex: number;
  rank: number;
  aiLabel: string | null;
  aiQuote: string | null;
  aiFacets: unknown;
  aiQuoteVerified: boolean;
  humanLabel: string | null;
  humanQuote: string | null;
  humanFacets: unknown;
  reviewerId: string | null;
  reviewedAt: Date | null;
  secondLabel: string | null;
  secondReviewerId: string | null;
  limitationStatement: boolean;
}

export interface CoverageRow {
  id: string;
  topic: string;
  projectId: string | null;
  referenceSource: string;
  m: number;
  x: number;
  delta: number;
  pHat: number;
  createdById: string;
  createdAt: Date;
}

export interface CoverageItemRow {
  doi: string;
  position: number;
  title: string | null;
  foundLocal: boolean;
  foundOpenAlex: boolean;
  paperId: string | null;
  openalexId: string | null;
}

export interface CalibrationRow {
  id: string;
  name: string;
  domain: string;
  judgeKind: string;
  /** Absent on rows read before the column existed (TRANSFER). */
  mode?: string | null;
  protocolVersion: string;
  status: string;
  delta: number;
  n: number;
  misses: number;
  epsHat: number | null;
  computedAt: Date | null;
  createdById: string;
  createdAt: Date;
}

export interface CalibrationQuestionRow {
  id: string;
  calibrationId: string;
  question: string;
  facets: unknown;
  witnessDoi: string;
  witnessQuote: string | null;
  labelSource: string;
  labelSourceRef: string | null;
  result: string;
  closureCheckId: string | null;
  createdAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Mappers                                                            */
/* ------------------------------------------------------------------ */

const iso = (date: Date) => date.toISOString();
const optional = <T>(value: T | null | undefined): T | undefined => (value === null || value === undefined ? undefined : value);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function parseFacets(value: unknown): QuestionFacets {
  const record = asRecord(value);
  const facets: QuestionFacets = {};
  for (const key of ["population", "intervention", "comparison", "outcome", "context"] as const) {
    const text = record[key];
    if (typeof text === "string" && text.trim()) facets[key] = text;
  }
  return facets;
}

function parseFacetMatch(value: unknown): ClosureFacetMatch | undefined {
  const record = asRecord(value);
  const match: ClosureFacetMatch = {};
  for (const key of ["population", "intervention", "comparison", "outcome", "context"] as const) {
    if (typeof record[key] === "boolean") match[key] = record[key] as boolean;
  }
  return Object.keys(match).length ? match : undefined;
}

export function parseQueryLog(value: unknown): ClosureQueryLog[] {
  return Array.isArray(value) ? (value as ClosureQueryLog[]) : [];
}

export function parseReasons(value: unknown): ClosureAbstainReason[] {
  return Array.isArray(value) ? (value as ClosureAbstainReason[]) : [];
}

export function toDocumentView(row: DocumentRow): GapClosureDocumentView {
  return {
    id: row.id,
    paperId: optional(row.paperId),
    openalexId: optional(row.openalexId),
    doi: optional(row.doi),
    title: row.title,
    abstractText: optional(row.abstractText),
    publicationYear: optional(row.publicationYear),
    retrievedFrom: row.retrievedFrom as GapClosureDocumentView["retrievedFrom"],
    queryIndex: row.queryIndex,
    rank: row.rank,
    aiLabel: optional(row.aiLabel) as ClosureLabel | undefined,
    aiQuote: optional(row.aiQuote),
    aiFacets: parseFacetMatch(row.aiFacets),
    aiQuoteVerified: row.aiQuoteVerified,
    humanLabel: optional(row.humanLabel) as ClosureLabel | undefined,
    humanQuote: optional(row.humanQuote),
    humanFacets: parseFacetMatch(row.humanFacets),
    reviewerId: optional(row.reviewerId),
    reviewedAt: row.reviewedAt ? iso(row.reviewedAt) : undefined,
    secondLabel: optional(row.secondLabel) as ClosureLabel | undefined,
    secondReviewerId: optional(row.secondReviewerId),
    limitationStatement: row.limitationStatement,
    effectiveLabel: effectiveLabel({
      id: row.id,
      paperId: row.paperId,
      aiLabel: row.aiLabel,
      aiQuoteVerified: row.aiQuoteVerified,
      humanLabel: row.humanLabel,
      limitationStatement: row.limitationStatement,
    }),
  };
}

export function toCheckView(row: CheckRow, documents: DocumentRow[] = []): GapClosureCheckView {
  return {
    id: row.id,
    targetKind: row.targetKind as GapClosureCheckView["targetKind"],
    targetId: row.targetId,
    protocolVersion: row.protocolVersion,
    status: row.status as GapClosureCheckView["status"],
    question: row.question,
    facets: parseFacets(row.facets),
    queries: parseQueryLog(row.queries),
    yearFrom: optional(row.yearFrom),
    yearTo: optional(row.yearTo),
    judgeKind: optional(row.judgeKind) as ClosureJudgeKind | undefined,
    coverageCheckId: optional(row.coverageCheckId),
    calibrationId: optional(row.calibrationId),
    delta: optional(row.delta),
    epsHat: optional(row.epsHat),
    pHat: optional(row.pHat),
    bound: optional(row.bound),
    boundMode: row.boundMode ? calibrationModeOf(row.boundMode) : undefined,
    maxFalseNovelty: optional(row.maxFalseNovelty),
    decision: optional(row.decision) as GapClosureCheckView["decision"],
    decisionReasons: parseReasons(row.decisionReasons),
    witnessDocumentId: optional(row.witnessDocumentId),
    corroborated: row.corroborated,
    errorMessage: optional(row.errorMessage),
    createdById: row.createdById,
    decidedById: optional(row.decidedById),
    decidedAt: row.decidedAt ? iso(row.decidedAt) : undefined,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    documents: documents.map(toDocumentView),
  };
}

export function toCoverageView(row: CoverageRow, items: CoverageItemRow[] = []): CoverageCheckView {
  return {
    id: row.id,
    topic: row.topic,
    projectId: optional(row.projectId),
    referenceSource: row.referenceSource,
    m: row.m,
    x: row.x,
    delta: row.delta,
    pHat: row.pHat,
    createdById: row.createdById,
    createdAt: iso(row.createdAt),
    items: [...items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        doi: item.doi,
        position: item.position,
        title: optional(item.title),
        foundLocal: item.foundLocal,
        foundOpenAlex: item.foundOpenAlex,
        paperId: optional(item.paperId),
        openalexId: optional(item.openalexId),
      })),
  };
}

export function toCalibrationQuestionView(row: CalibrationQuestionRow): CalibrationQuestionView {
  return {
    id: row.id,
    calibrationId: row.calibrationId,
    question: row.question,
    facets: parseFacets(row.facets),
    witnessDoi: row.witnessDoi,
    witnessQuote: optional(row.witnessQuote),
    labelSource: row.labelSource as CalibrationQuestionView["labelSource"],
    labelSourceRef: optional(row.labelSourceRef),
    result: row.result as CalibrationQuestionView["result"],
    closureCheckId: optional(row.closureCheckId),
    createdAt: iso(row.createdAt),
  };
}

export function toCalibrationView(row: CalibrationRow, questions?: CalibrationQuestionRow[]): ClosureCalibrationView {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    judgeKind: row.judgeKind as ClosureJudgeKind,
    mode: calibrationModeOf(row.mode),
    protocolVersion: row.protocolVersion,
    status: row.status as ClosureCalibrationView["status"],
    delta: row.delta,
    n: row.n,
    misses: row.misses,
    epsHat: optional(row.epsHat),
    computedAt: row.computedAt ? iso(row.computedAt) : undefined,
    createdById: row.createdById,
    createdAt: iso(row.createdAt),
    questions: questions ? [...questions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(toCalibrationQuestionView) : undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Dossier                                                            */
/* ------------------------------------------------------------------ */

export interface DossierInput {
  generatedAt: Date;
  gap?: { id: string; title: string; topic: string };
  check: GapClosureCheckView;
  coverage?: CoverageCheckView;
  calibration?: ClosureCalibrationView;
  /** Used only when the check was never decided and carries no delta / threshold of its own. */
  defaults: { delta: number; maxFalseNovelty: number };
}

/** Cohen's kappa between the deciding and the second reviewer over documents that have both labels. */
export function interRaterKappa(documents: GapClosureDocumentView[]): GapClosureDossier["interRaterKappa"] {
  const pairs = documents.flatMap((doc): Array<[ClosureLabel, ClosureLabel]> => (doc.humanLabel && doc.secondLabel ? [[doc.humanLabel, doc.secondLabel]] : []));
  const kappa = cohenKappa(pairs);
  return kappa === null ? undefined : { kappa, documents: pairs.length };
}

export function buildDossier(input: DossierInput): GapClosureDossier {
  const { check, coverage, calibration } = input;
  const epsHat = check.epsHat ?? calibration?.epsHat ?? null;
  const pHat = check.pHat ?? coverage?.pHat;
  // The formula the decision used wins over the calibration's current mode.
  const mode = check.boundMode ?? calibration?.mode;
  const arithmetic = describeBoundArithmetic({
    calibration: calibration ? { n: calibration.n, misses: calibration.misses, epsHat, mode } : null,
    coverage: coverage ? { m: coverage.m, x: coverage.x, pHat: pHat ?? coverage.pHat } : null,
    delta: check.delta ?? coverage?.delta ?? calibration?.delta ?? input.defaults.delta,
    bound: check.bound,
    maxFalseNovelty: check.maxFalseNovelty ?? input.defaults.maxFalseNovelty,
  });
  if (calibration && check.epsHat !== undefined && calibration.epsHat !== undefined && check.epsHat !== calibration.epsHat) {
    arithmetic.push(`Note: the calibration was recomputed after this decision (now ${calibration.epsHat}); this check used ${check.epsHat}.`);
  }
  return {
    protocolVersion: check.protocolVersion,
    generatedAt: input.generatedAt.toISOString(),
    gap: input.gap,
    check,
    coverage,
    calibration,
    arithmetic,
    interRaterKappa: interRaterKappa(check.documents),
  };
}

export function dossierFilename(check: Pick<GapClosureCheckView, "id">): string {
  return `gap-closure-${check.id.slice(0, 8)}.md`;
}

const cell = (value: unknown) => String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim() || "-";
const PCT = (value: number | undefined) => (value === undefined ? "-" : String(value));

/** Human-readable dossier. Every number in it can be recomputed from the tables it contains. */
export function dossierMarkdown(dossier: GapClosureDossier): string {
  const { check, coverage, calibration } = dossier;
  const out: string[] = [];
  out.push(`# Gap closure dossier`, "");
  out.push(`- Protocol: ${dossier.protocolVersion}`, `- Generated: ${dossier.generatedAt}`, `- Check: ${check.id} (${check.status})`);
  if (dossier.gap) out.push(`- Gap: ${cell(dossier.gap.title)} (topic: ${cell(dossier.gap.topic)})`);
  out.push("", "## Question", "", check.question, "");
  const facets = Object.entries(check.facets);
  if (facets.length) out.push(...facets.map(([key, value]) => `- ${key}: ${value}`), "");
  if (check.yearFrom || check.yearTo) out.push(`Years: ${check.yearFrom ?? "any"} to ${check.yearTo ?? "any"}`, "");

  out.push("## Decision", "");
  out.push(`- Decision: ${check.decision ?? "not decided"}`);
  if (check.judgeKind) out.push(`- Judge: ${check.judgeKind}`);
  if (check.decisionReasons.length) out.push(`- Reasons: ${check.decisionReasons.join(", ")}`);
  out.push(`- Corroborated by a limitation statement: ${check.corroborated ? "yes" : "no"}`);
  if (check.witnessDocumentId) {
    const witness = check.documents.find((doc) => doc.id === check.witnessDocumentId);
    out.push(`- Witness: ${cell(witness?.title ?? check.witnessDocumentId)}${witness?.doi ? ` (doi:${witness.doi})` : ""}`);
    const quote = witness?.humanQuote ?? witness?.aiQuote;
    if (quote) out.push(`  > ${quote.replace(/\r?\n/g, " ")}`);
  }
  if (check.errorMessage) out.push(`- Error: ${check.errorMessage}`);
  out.push("");

  out.push("## False-novelty bound", "", ...dossier.arithmetic.map((line) => `- ${line}`), "");
  const inSitu = (check.boundMode ?? calibration?.mode) === "IN_SITU";
  out.push(
    inSitu
      ? "Assumptions: the calibration questions were searched in the same sources as this check and are representative of real gap questions, and the sources did not lose papers since the calibration."
      : "Assumptions: answering documents are missing from the sources independently of the question, and the calibration questions are representative of real gap questions.",
    inSitu
      ? "Guarantee (in-situ calibration): P(false novelty) <= epsHat holds with probability >= 1 - delta."
      : "Guarantee: P(false novelty) <= epsHat + pHat holds with probability >= 1 - 2 delta.",
    "",
  );
  if (dossier.interRaterKappa) out.push(`Inter-rater agreement (Cohen's kappa): ${dossier.interRaterKappa.kappa} over ${dossier.interRaterKappa.documents} documents.`, "");

  out.push("## Search log", "", "| # | Source | Query | Results | Error |", "|---|---|---|---|---|");
  check.queries.forEach((query, index) => out.push(`| ${index} | ${query.source} | ${cell(query.query)} | ${query.resultCount} | ${cell(query.error)} |`));
  out.push("");

  out.push("## Documents", "", "| Title | DOI | Year | Source | Query # | AI | Person | Counts as |", "|---|---|---|---|---|---|---|---|");
  for (const doc of check.documents) {
    out.push(`| ${cell(doc.title)} | ${cell(doc.doi)} | ${cell(doc.publicationYear)} | ${doc.retrievedFrom} | ${doc.queryIndex} | ${cell(doc.aiLabel)}${doc.aiLabel && doc.aiLabel !== "UNRELATED" ? (doc.aiQuoteVerified ? " (quote verified)" : " (quote not verified)") : ""} | ${cell(doc.humanLabel)} | ${cell(doc.effectiveLabel ?? "needs review")} |`);
  }
  out.push("");
  const quoted = check.documents.filter((doc) => (doc.humanQuote ?? doc.aiQuote) && (doc.effectiveLabel === "ANSWERS" || doc.effectiveLabel === "PARTIAL"));
  if (quoted.length) {
    out.push("### Quotes", "");
    for (const doc of quoted) out.push(`- ${cell(doc.title)} [${doc.effectiveLabel}${doc.limitationStatement ? ", limitation" : ""}]: "${(doc.humanQuote ?? doc.aiQuote ?? "").replace(/\r?\n/g, " ")}"`);
    out.push("");
  }

  out.push("## Coverage", "");
  if (coverage) {
    out.push(`- Reference source: ${coverage.referenceSource}`, `- m = ${coverage.m} reference DOIs, x = ${coverage.x} found neither in LumiGap nor in OpenAlex, pHat = ${PCT(coverage.pHat)}`, "");
    out.push("| DOI | In LumiGap | In OpenAlex |", "|---|---|---|");
    for (const item of coverage.items) out.push(`| ${cell(item.doi)} | ${item.foundLocal ? "yes" : "no"} | ${item.foundOpenAlex ? "yes" : "no"} |`);
  } else out.push("No coverage check was used.");
  out.push("");

  out.push("## Calibration", "");
  if (calibration) {
    out.push(`- ${cell(calibration.name)} (${cell(calibration.domain)}), judge ${calibration.judgeKind}, mode ${calibration.mode}, status ${calibration.status}`, `- n = ${calibration.n} questions known to be answered, ${calibration.misses} missed, epsHat = ${PCT(calibration.epsHat)}`, "");
    if (calibration.questions?.length) {
      out.push("| Question | Witness DOI | Source | Result |", "|---|---|---|---|");
      for (const question of calibration.questions) out.push(`| ${cell(question.question)} | ${cell(question.witnessDoi)} | ${question.labelSource} | ${question.result} |`);
    }
  } else out.push("No calibration was used.");
  out.push("");
  return out.join("\n");
}
