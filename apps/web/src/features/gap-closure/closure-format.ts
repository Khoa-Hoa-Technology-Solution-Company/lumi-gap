import type {
  ClosureAbstainReason,
  ClosureCalibrationMode,
  ClosureCalibrationView,
  ClosureFacetMatch,
  ClosureLabel,
  CoverageCheckView,
  GapClosureCheckStatus,
  GapClosureCheckView,
  GapClosureDocumentView,
  GapClosureStatus,
  QuestionFacets,
} from "@trend/shared-types";

/** Credits charged by POST /gap-closure/gaps/:gapId/checks (action gap_closure_check). */
export const GAP_CLOSURE_CHECK_CREDIT_COST = 10;
export const FACET_KEYS = ["population", "intervention", "comparison", "outcome", "context"] as const;
export const MIN_QUOTE_CHARS = 20;

export type ClosureTone = "neutral" | "closed" | "open" | "warning" | "danger";

export interface ClosureBadgeSpec {
  /** Translation key; "{{bound}}" is interpolated for OPEN_CERTIFIED. */
  labelKey: string;
  tone: ClosureTone;
  /** Interpolation value for {{bound}}, a percentage rounded up. */
  bound?: string;
}

/** True while the runner still searches; the check view is polled until this is false. */
export function isClosureCheckRunning(status: GapClosureCheckStatus | undefined): boolean {
  return status === "QUEUED" || status === "SEARCHING";
}

/** Rounds an upper bound UP to one decimal of a percent so the badge never understates the risk (0.1534 -> "15.4"). */
export function formatBoundPercent(bound: number | undefined | null): string | undefined {
  if (bound === undefined || bound === null || !Number.isFinite(bound)) return undefined;
  const percent = Math.ceil(Math.min(1, Math.max(0, bound)) * 1000 - 1e-9) / 10;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
}

/** Decimal rate with 4 digits, the form the server stores and uses in the dossier ("0.0951"). */
export function formatRate(value: number | undefined | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(4);
}

/** Label and tone of the status badge shown on gap cards and in the drawer. */
export function closureBadgeSpec(status: GapClosureStatus | undefined, bound?: number | null): ClosureBadgeSpec {
  switch (status) {
    case "CLOSED":
      return { labelKey: "Already answered", tone: "closed" };
    case "OPEN_CERTIFIED": {
      const percent = formatBoundPercent(bound);
      return percent === undefined
        ? { labelKey: "Open · certified", tone: "open" }
        : { labelKey: "Open · false-novelty risk ≤ {{bound}}%", tone: "open", bound: percent };
    }
    case "ABSTAIN":
      return { labelKey: "Needs review", tone: "warning" };
    default:
      return { labelKey: "Not checked", tone: "neutral" };
  }
}

export const ABSTAIN_REASON_KEYS: Record<ClosureAbstainReason, string> = {
  SEARCH_ERRORS: "A search failed, so documents may have been missed. Run the check again.",
  PENDING_REVIEW: "Some documents still need a person to confirm their label because the AI quote could not be verified in the text.",
  NO_COVERAGE: "There is no coverage check for this topic yet, so we do not know how much of the literature the search can see. Add one on the Coverage tab.",
  NO_CALIBRATION: "There is no computed calibration yet, so we do not know how often this procedure misses an answer that exists. Compute one on the Calibrations tab.",
  CALIBRATION_JUDGE_MISMATCH: "The calibration used a different kind of judge (AI or human) than this check, so its miss rate does not apply.",
  BOUND_EXCEEDS_MAX: "The false-novelty bound B is larger than the allowed maximum, so we cannot certify the question as open.",
};

export function abstainReasonKey(reason: ClosureAbstainReason): string {
  return ABSTAIN_REASON_KEYS[reason] ?? reason;
}

export interface BoundArithmetic {
  /** IN_SITU: B = epsHat and pHat stays out of the bound; TRANSFER: B = epsHat + pHat. */
  mode: ClosureCalibrationMode;
  epsHat?: { value: number; misses?: number; n?: number };
  pHat?: { value: number; x?: number; m?: number };
  bound?: number;
  max?: number;
  /** B <= max, only when all three numbers are known. */
  withinMax?: boolean;
  /** Confidence level of each Clopper-Pearson bound, e.g. 95. */
  confidencePercent?: number;
}

/**
 * Collects the numbers of the decision rule; counts come from the calibration and coverage when they are loaded.
 * The formula is the one the decision used (check.boundMode), else the calibration's mode, else TRANSFER.
 */
export function buildBoundArithmetic(
  check: Pick<GapClosureCheckView, "epsHat" | "pHat" | "bound" | "maxFalseNovelty" | "delta"> & Partial<Pick<GapClosureCheckView, "boundMode">>,
  coverage?: Pick<CoverageCheckView, "x" | "m"> | null,
  calibration?: Pick<ClosureCalibrationView, "misses" | "n"> & Partial<Pick<ClosureCalibrationView, "mode">> | null,
): BoundArithmetic {
  const result: BoundArithmetic = { mode: check.boundMode ?? calibration?.mode ?? "TRANSFER" };
  if (check.epsHat !== undefined && check.epsHat !== null) {
    result.epsHat = { value: check.epsHat, misses: calibration?.misses, n: calibration?.n };
  }
  if (check.pHat !== undefined && check.pHat !== null) {
    result.pHat = { value: check.pHat, x: coverage?.x, m: coverage?.m };
  }
  const fallback = result.mode === "IN_SITU"
    ? result.epsHat?.value
    : result.epsHat && result.pHat ? Math.min(1, result.epsHat.value + result.pHat.value) : undefined;
  const bound = check.bound ?? fallback;
  if (bound !== undefined) result.bound = bound;
  if (check.maxFalseNovelty !== undefined && check.maxFalseNovelty !== null) result.max = check.maxFalseNovelty;
  if (result.bound !== undefined && result.max !== undefined) result.withinMax = result.bound <= result.max + 1e-12;
  if (check.delta !== undefined && check.delta !== null) result.confidencePercent = Math.round((1 - check.delta) * 100);
  return result;
}

/** "9 / 100" or "-" when a count is unknown. */
export function formatCount(numerator: number | undefined, denominator: number | undefined): string {
  return numerator === undefined || denominator === undefined ? "-" : `${numerator} / ${denominator}`;
}

/** "0.0951 + 0.0582 = 0.1533" (TRANSFER), "0.0951" (IN_SITU), or undefined when a term is missing. */
export function formatSum(arithmetic: BoundArithmetic): string | undefined {
  if (!arithmetic.epsHat || arithmetic.bound === undefined) return undefined;
  if (arithmetic.mode === "IN_SITU") return formatRate(arithmetic.bound);
  if (!arithmetic.pHat) return undefined;
  return `${formatRate(arithmetic.epsHat.value)} + ${formatRate(arithmetic.pHat.value)} = ${formatRate(arithmetic.bound)}`;
}

/** "B = epsHat + pHat = 0.0951 + 0.0582 = 0.1533 ≤ 0.2000" or, in situ, "B = epsHat = 0.0951 ≤ 0.2000". */
export function boundEquation(sum: string, arithmetic: Pick<BoundArithmetic, "withinMax" | "max"> & Partial<Pick<BoundArithmetic, "mode">>): string {
  return `B = ${arithmetic.mode === "IN_SITU" ? "epsHat" : "epsHat + pHat"} = ${sum} ${arithmetic.withinMax ? "≤" : ">"} ${formatRate(arithmetic.max)}`;
}

export function coverageOptionLabel(item: Pick<CoverageCheckView, "referenceSource" | "x" | "m" | "pHat">): string {
  return `${item.referenceSource} · ${item.x}/${item.m} · pHat ${formatRate(item.pHat)}`;
}

export function calibrationOptionLabel(item: Pick<ClosureCalibrationView, "name" | "judgeKind" | "misses" | "n" | "epsHat"> & Partial<Pick<ClosureCalibrationView, "mode">>): string {
  return `${item.name} · ${item.judgeKind}${item.mode === "IN_SITU" ? " · in-situ" : ""} · ${item.misses}/${item.n} · epsHat ${formatRate(item.epsHat)}`;
}

/* ---------------------------- quotes and text ---------------------------- */

/** Same normalization as the server (closure.rules.ts normalizeForQuote), used only for an early hint. */
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

/** Client-side mirror of the server's verbatim check. The server stays authoritative. */
export function quoteAppearsInText(quote: string | undefined | null, text: string | undefined | null): boolean {
  if (!quote || !text) return false;
  const q = normalizeForQuote(quote).replace(/^[\s"'.…]+|[\s"'.…]+$/g, "");
  return q.length >= MIN_QUOTE_CHARS && normalizeForQuote(text).includes(q);
}

/** Title plus abstract, the text a quote must come from. */
export function documentText(doc: Pick<GapClosureDocumentView, "title" | "abstractText">): string {
  return doc.abstractText ? `${doc.title}\n${doc.abstractText}` : doc.title;
}

/** Splits text into sentences for the "select sentence" helper. */
export function splitSentences(text: string | undefined | null): string[] {
  if (!text) return [];
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'([])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** One entry per non-empty line, trimmed, in order, without duplicates. */
export function parseLines(value: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of value.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines;
}

/** DOI lines, also accepting commas or semicolons between DOIs on one line. */
export function parseDoiLines(value: string): string[] {
  const seen = new Set<string>();
  const dois: string[] = [];
  for (const piece of value.split(/[\r\n,;]+/)) {
    const doi = piece.trim();
    const key = doi.toLowerCase();
    if (!doi || seen.has(key)) continue;
    seen.add(key);
    dois.push(doi);
  }
  return dois;
}

/** Keeps non-empty trimmed facets only; undefined when none remain. */
export function compactFacets(facets: QuestionFacets | undefined | null): QuestionFacets | undefined {
  if (!facets) return undefined;
  const result: QuestionFacets = {};
  for (const key of FACET_KEYS) {
    const value = facets[key]?.trim();
    if (value) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Facet keys that have text, in PICOC order. */
export function activeFacetKeys(facets: QuestionFacets | undefined | null): Array<(typeof FACET_KEYS)[number]> {
  return FACET_KEYS.filter((key) => Boolean(facets?.[key]?.trim()));
}

/** Facet-match map without empty entries; undefined when empty. */
export function compactFacetMatch(match: ClosureFacetMatch): ClosureFacetMatch | undefined {
  const result: ClosureFacetMatch = {};
  for (const key of FACET_KEYS) {
    if (typeof match[key] === "boolean") result[key] = match[key];
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Link target for a document: DOI first, then OpenAlex id. */
export function documentExternalUrl(doc: Pick<GapClosureDocumentView, "doi" | "openalexId">): string | undefined {
  if (doc.doi) return `https://doi.org/${doc.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`;
  if (doc.openalexId) return /^https?:\/\//i.test(doc.openalexId) ? doc.openalexId : `https://openalex.org/${doc.openalexId}`;
  return undefined;
}

/** Documents whose label is not yet decided (no effective label), shown as "needs a person". */
export function countPendingDocuments(documents: ReadonlyArray<Pick<GapClosureDocumentView, "effectiveLabel">>): number {
  return documents.filter((doc) => doc.effectiveLabel === undefined || doc.effectiveLabel === null).length;
}

export function isDecidingLabel(label: ClosureLabel | undefined): boolean {
  return label === "ANSWERS" || label === "PARTIAL";
}

/** Message of the API error envelope, then the HTTP status text, then the fallback. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { error?: { message?: string } } } } | undefined)?.response;
  return response?.data?.error?.message || fallback;
}

export function apiErrorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | undefined)?.response?.status;
}
