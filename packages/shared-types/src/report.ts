import type { ISODateString } from "./common.js";
import type { PaperRef } from "./paper.js";

export type ReportStatus = "queued" | "generating" | "ready" | "failed";
export type ReportLanguage = "auto" | "en" | "vi";

export interface ReportScopeFilters {
  paperKinds?: string[];
  openAccessStatuses?: string[];
  providers?: string[];
  sources?: string[];
  /** Evidence-paper languages. This is separate from the report output language. */
  languages?: string[];
  citationBands?: string[];
  domains?: string[];
  fields?: string[];
  subfields?: string[];
  topics?: string[];
  domainIds?: string[];
  fieldIds?: string[];
  subfieldIds?: string[];
  topicIds?: string[];
}

/** Body of POST /api/v1/reports. */
export interface CreateReportRequest {
  /** The analytical question. The report language is controlled by `language`. */
  query: string;
  projectId?: string;
  /** Optional display label, e.g. the topic the user clicked on the Trends page. */
  topic?: string;
  yearFrom?: number;
  yearTo?: number;
  /** auto detects from query + topic; en/vi force all report and gap text. */
  language?: ReportLanguage;
  /** Optional dataset scope inherited from Trends. Retrieval is limited by these filters. */
  scopeFilters?: ReportScopeFilters;
  deepAnalysis?: boolean; // Phase D — opt-in Gemini function-calling mode (Pro + tools, slowest)
  fast?: boolean; // Fast mode — use the Flash model (faster, lighter). Ignored if deepAnalysis.
  /** Optional fixed evidence set chosen by the user before generation. */
  selectedPaperIds?: string[];
}

export interface PreviewReportEvidenceRequest {
  query: string;
  projectId?: string;
  topic?: string;
  yearFrom?: number;
  yearTo?: number;
  language?: ReportLanguage;
  /** Optional dataset scope inherited from Trends. Retrieval is limited by these filters. */
  scopeFilters?: ReportScopeFilters;
  selectedPaperIds?: string[];
  /** Defaults true. Set false when editing an already-reviewed pack so removed papers stay removed. */
  fillWithRetrieved?: boolean;
}

export interface ReportEvidencePaper {
  id: string;
  title: string;
  abstractText?: string;
  publicationYear?: number;
  journalName?: string;
  citationCount?: number;
  authorNames: string[];
  score: number;
  source: "selected" | "retrieved";
}

export interface PreviewReportEvidenceResponse {
  papers: ReportEvidencePaper[];
  retrievedPaperIds: string[];
  selectedPaperIds: string[];
  maxEvidencePapers: number;
  warnings: string[];
}

export interface GapProbe {
  topicA: string;
  topicB: string;
  yearFrom?: number;
  yearTo?: number;
  scopeFilters?: ReportScopeFilters;
  language?: ReportLanguage;
}

export interface ResearchGap {
  title: string;
  description: string;
  rationale: string;
  /** RESOLVED paper ids (not citation numbers) — link them directly. */
  supportingPaperIds: string[];
  confidence: number; // 0..1 — LLM self-reported (legacy; prefer evidenceConfidence)
  /** v2 — the intersection the LLM claims is under-explored, verified deterministically. */
  probe?: GapProbe;
  /** v2 — # papers at topicA ∩ topicB ∩ years (from count_papers). */
  intersectionCount?: number;
  /** v2 — corpus volume of each parent topic. */
  parentCounts?: { a: number; b: number };
  /** v2 — the rising parent (if any) with its YoY growth %. */
  parentTrend?: { topic: string; growthRatePct: number } | null;
  /** v2 — deterministic confidence from scarcity + parent activity (replaces `confidence`). */
  evidenceConfidence?: number; // 0..1
}

export interface AnalyticalReport {
  id: string;
  userId: string;
  projectId?: string;
  topic?: string;
  query: string;
  status: ReportStatus;
  yearFrom?: number;
  yearTo?: number;
  /** Markdown body. Inline citations are [n] where n is 1-based into
   *  `groundingPaperIds`: [n] → groundingPaperIds[n-1]. */
  markdown?: string;
  /** Paper ids the report was grounded on, in RETRIEVAL ORDER.
   *  ORDER-SIGNIFICANT: citation [n] in `markdown` maps to
   *  groundingPaperIds[n-1]. Do NOT sort or dedupe — it breaks citations. */
  groundingPaperIds: string[];
  /** Resolved grounding papers in RETRIEVAL ORDER: citation [n] → groundingPapers[n-1].
   *  Populated by GET /reports/:id. */
  groundingPapers?: PaperRef[];
  researchGaps: ResearchGap[];
  modelVersion: string;
  promptVersion: string;
  deepAnalysis: boolean; // NEW — Phase D
  fast?: boolean; // Fast mode — generated with the Flash model
  selectedPaperIds?: string[];
  /** Credits charged when this report was queued. Fixed by reasoning profile. */
  creditCost?: number;
  /** Ledger action used for the charge (fast_report, standard_report, deep_mcp_report). */
  creditAction?: string;
  /** Set when the original report charge was returned after failure or a cache hit. */
  creditRefundedAt?: ISODateString;
  errorMessage?: string;
  createdAt: ISODateString;
  completedAt?: ISODateString;
}

/** Shape of GET /reports list rows — heavy fields are stripped server-side. */
export type ReportListItem = Omit<
  AnalyticalReport,
  "markdown" | "researchGaps" | "groundingPaperIds"
>;
