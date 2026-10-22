/** One point of a yearly time series. */
export interface YearlyCount {
  year: number;
  count: number;
}

export interface TopItem {
  id: string;
  name: string;
  count: number;
}

export interface YearlyCitationMetric extends YearlyCount {
  /** Sum / mean of citation counts. Null when the data source cannot sum
   *  citations (OpenAlex aggregate queries only count works). */
  totalCitations: number | null;
  avgCitations: number | null;
  /** Works among the 10% most cited of their year, type and subfield
   *  (OpenAlex citation_normalized_percentile). Present for OpenAlex data. */
  topCitedCount?: number;
  /** topCitedCount / count · 100 — PP(top 10%), Waltman & Schreiber (2013). */
  ppTop10Pct?: number | null;
}

export interface TrendFacetBucket {
  id: string;
  name: string;
  count: number;
  /** OpenAlex entity id/key when available, e.g. https://openalex.org/T123 or T123.
   *  Kept optional so older name-based facets remain backward compatible. */
  openalexId?: string;
}

export interface TrendFacets {
  paperKinds: TrendFacetBucket[];
  openAccessStatuses: TrendFacetBucket[];
  providers: TrendFacetBucket[];
  topSources: TrendFacetBucket[];
  languages: TrendFacetBucket[];
  citationBands: TrendFacetBucket[];
  domains: TrendFacetBucket[];
  fields: TrendFacetBucket[];
  subfields: TrendFacetBucket[];
  topics: TrendFacetBucket[];
}

export interface TrendTopicTaxonomy {
  openalexTopicId?: string;
  domainId?: string;
  domainName?: string;
  fieldId?: string;
  fieldName?: string;
  subfieldId?: string;
  subfieldName?: string;
}

export interface TrendTaxonomyCoverage {
  totalPapers: number;
  papersWithAnyTopic: number;
  papersWithPrimaryTopic: number;
  papersWithFullHierarchy: number;
  anyTopicCoveragePct: number;
  primaryTopicCoveragePct: number;
  fullHierarchyCoveragePct: number;
}

export interface RecommendedTrendComparison {
  topics: string[];
  reason: string;
  sharedTaxonomy?: Pick<TrendTopicTaxonomy, "domainName" | "fieldName" | "subfieldName">;
  metrics: Array<{
    topic: string;
    totalPapers: number;
    /** Verdict-based ranking metric: TrendClassification.relativeChangePct. */
    relativeChangePct: number | null;
    /** @deprecated Raw-count YoY growth; not used for ranking or labels. */
    growthRatePct: number;
    /** @deprecated Raw-count least-squares slope; not used for ranking or labels. */
    momentum: number;
  }>;
}

/**
 * Growth metrics computed from a yearly publication series.
 *
 * Metrics are computed over COMPLETE years only (the current calendar year is
 * excluded because it is still accumulating papers and would always look like
 * a decline). `yearlyBreakdown` still includes the current year so charts can
 * render it — label it "YTD" on the FE.
 */
export interface TrendMetrics {
  /** @deprecated Descriptive only: year-over-year growth of raw counts, %.
   *  Not tested; never use it to sort or label a trend (use TrendClassification).
   *  Denominator is clamped to >= 1 so a 0→N jump reads as N*100%. */
  growthRatePct: number;
  /** @deprecated Descriptive only: 3-year CAGR of raw counts, %. Not tested;
   *  never use it to sort or label a trend (use TrendClassification). */
  cagr3yPct: number | null;
  /** @deprecated Descriptive only: least-squares slope of raw counts
   *  (papers/year). Not tested; never use it to sort or label a trend (use
   *  TrendClassification). */
  momentum: number;
}

/** Mann–Kendall test (Mann 1945; Kendall 1975) on the yearly share. */
export interface MannKendallTrend {
  n: number;
  s: number;
  variance: number;
  z: number;
  pValue: number;
  /** "exact": exact null distribution of S (n ≤ 10, no ties); "normal": normal
   *  approximation with continuity correction. Absent on older responses. */
  pValueMethod?: "exact" | "normal";
  tau: number;
}

/** Trend verdict of a topic's yearly share of its field (Mann–Kendall). */
export type TrendVerdict = "rising" | "declining" | "stable" | "insufficient";

/** Only set for rising / declining. */
export type TrendConfidence = "high" | "medium";

export type TrendReasonCode =
  | "LOCAL_CORPUS"
  | "TOO_FEW_YEARS"
  | "TOO_FEW_PAPERS"
  | "SIGNIFICANT_INCREASE"
  | "SIGNIFICANT_DECREASE"
  | "NO_SIGNIFICANT_TREND";

/**
 * The single trend conclusion of a topic. Decided only by the Mann–Kendall
 * test on the yearly share s_t = n_t / N_t · 100 (N_t = papers of the same
 * OpenAlex field), complete years only. Magnitude: Sen's slope with its 95%
 * rank-based CI (Helsel et al. 2020, USGS TM 4-A3; Gilbert 1987). In the
 * overview list the p-values are adjusted with Benjamini–Hochberg (qValue).
 * Thresholds: trend.verdict.ts in the backend.
 */
export interface TrendClassification {
  verdict: TrendVerdict;
  /** Only for rising / declining. */
  confidence: TrendConfidence | null;
  /** Number of complete years used (n). */
  yearsUsed: number;
  /** Topic papers in the years used. */
  totalPapers: number;
  mannKendall: { s: number; z: number; tau: number; pValue: number; pValueMethod?: "exact" | "normal" } | null;
  /** Benjamini–Hochberg q-value; only in the overview list. */
  qValue: number | null;
  /** Number of p-values in the Benjamini–Hochberg family behind qValue (the
   *  topics tested in that request). Null/absent when there is no qValue. */
  qFamilySize?: number | null;
  /** Sen's slope of the share, percentage points per year. */
  senSlope: number | null;
  senSlopeCi95: [number, number] | null;
  /** senSlope / median(share) · 100, % per year (presentation only). */
  relativeChangePct: number | null;
  reasons: TrendReasonCode[];
}

/** One topic in the trends overview list (GET /trends). */
export interface TrendingTopic extends TrendMetrics {
  topic: string;
  taxonomy?: TrendTopicTaxonomy;
  totalPapers: number;
  /** Gap years are filled with count 0; sorted by year ascending. */
  yearlyBreakdown: YearlyCount[];
  /** Trend verdict of the topic's share of its field over complete years. */
  classification: TrendClassification;
  /** General Growth Tendency of the same share series (descriptive; never changes the verdict). */
  ggt?: TrendGgt;
}

export interface TrendShareYear {
  year: number;
  /** Papers of the topic. */
  count: number;
  /** Papers of the reference population (N_t). */
  total: number;
  /** count / total · 100. */
  sharePct: number;
}

/** PP(top 10%): share of the year's papers among the 10% most cited works of
 *  the same year, type and subfield (Waltman & Schreiber 2013). */
export interface TrendImpactYear {
  year: number;
  papers: number;
  /** Papers with OpenAlex citation_normalized_percentile.is_in_top_10_percent. */
  topPapers: number;
  /** topPapers / papers · 100. Null when the year has no papers. */
  ppTop10Pct: number | null;
}

/** One keyword compared between two periods with the log odds ratio of a
 *  2×2 table of papers (Woolf 1955; Haldane 1956). */
export interface TrendTermShift {
  term: string;
  /** Papers of period A / B that carry the keyword. */
  papersA: number;
  papersB: number;
  logOddsRatio: number;
  z: number;
  pValue: number;
  /** Benjamini–Hochberg q-value across all keywords tested for the topic. */
  qValue: number;
}

export interface TrendTermShiftAnalysis {
  periodA: { yearFrom: number; yearTo: number; papers: number };
  periodB: { yearFrom: number; yearTo: number; papers: number };
  /** Keywords tested: the most frequent ones of each period, merged. */
  termsTested: number;
  /** z > 0, ordered by effect size (log odds ratio), supported shifts first. */
  rising: TrendTermShift[];
  /** z < 0, ordered by effect size (log odds ratio), supported shifts first. */
  falling: TrendTermShift[];
}

/** Project convention (same value as the verdict's MIN_PAPERS): a keyword
 *  shift counts as a finding only when the period it grew into (B for a rise,
 *  A for a fall) has at least this many papers carrying the keyword. With
 *  millions of papers almost every shift is "significant", so q alone is not
 *  enough. */
export const KEYWORD_SHIFT_MIN_PAPERS = 30;

/**
 * Reference population N_t of a share, GGT and verdict: works of the same
 * Data Scope (non-taxonomy filters) whose PRIMARY topic belongs to the same
 * unit as the topic at this level. "global" = every work with a primary topic
 * (works without a topic are left out because the topic count n_t never
 * includes them). Same definition for OpenAlex and the local corpus.
 */
export const TREND_BASELINE_LEVELS = ["global", "domain", "field", "subfield"] as const;
export type TrendBaselineLevel = (typeof TREND_BASELINE_LEVELS)[number];
/** Default kept from P0, so default numbers do not change. */
export const DEFAULT_TREND_BASELINE: TrendBaselineLevel = "field";

export interface TrendBaseline {
  /** Level actually used. "corpus" only appears in responses saved before P1. */
  level: TrendBaselineLevel | "corpus";
  /** Requested level when it could not be used (the topic has no id at that
   *  level) and the global baseline was used instead. */
  fallbackFrom?: TrendBaselineLevel;
  /** OpenAlex short id of the domain/field/subfield; absent for global. */
  id?: string;
  label: string;
  /** Global baseline only: share (%) of the scope's works in the years used
   *  that have no primary topic and are therefore outside N_t. */
  unclassifiedSharePct?: number | null;
}

/**
 * General Growth Tendency (Nelis et al. 2022, PLOS ONE 17(5): e0268433,
 * Eq (i)): GGT_y = [(n_y − n_{y−1})/n_{y−1} − (N_y − N_{y−1})/N_{y−1}] × 100%,
 * n = topic papers, N = reference population (TrendBaseline). Descriptive
 * growth relative to the reference; never used for the trend verdict.
 */
export type TrendGgtNullReason = "MISSING_PREVIOUS_YEAR" | "ZERO_PREVIOUS_UNIT" | "ZERO_PREVIOUS_BASELINE" | "ZERO_BASELINE";

export interface TrendGgtYear {
  year: number;
  /** null when the year has no previous year in the series or a denominator is 0. */
  ggtPct: number | null;
  unitGrowthPct: number | null;
  baselineGrowthPct: number | null;
  nullReason: TrendGgtNullReason | null;
}

/** Nelis et al. (2022) classes of a consistent GGT (strict bounds as printed).
 *  "unclassified": −10% ≤ GGT ≤ −5% (no class in the paper) or exactly on a bound. */
export type TrendGgtClass =
  | "consistent_decrease"
  | "no_consistent_growth"
  | "consistent_growth"
  | "consistent_strong_growth"
  | "consistent_intense_growth"
  | "unsustainable_growth"
  | "unclassified";

export interface TrendGgt {
  annual: TrendGgtYear[];
  /** Number of defined annual GGT values. */
  n: number;
  /** Arithmetic mean of the defined annual GGT (%). The paper reports
   *  "mean ± SEM" but gives no formula; arithmetic mean + sample SEM reproduces
   *  4 of the 12 printed values that state a window (golden dataset G1). */
  meanPct: number | null;
  /** Sample standard deviation (n − 1). */
  sdPct: number | null;
  /** sdPct / √n. */
  semPct: number | null;
  /** The two unambiguous reliability conditions of the paper. */
  conditions: {
    /** Every defined annual GGT < 100%. */
    allAnnualBelow100Pct: boolean | null;
    /** Smallest yearly topic count in the years used. */
    minUnitPapersPerYear: number | null;
    /** "at least 50 publications per year", read as every year used (the paper
     *  does not say every year or on average). */
    atLeast50PapersEveryYear: boolean | null;
  };
  /** GGT_y − GGT_{y−1} in percentage points, for the reader only: the paper's
   *  "less than 50% year-to-year variation" is not defined and is not applied. */
  yearToYearChanges: Array<{ year: number; deltaPctPoints: number }>;
  /** Class of meanPct; null unless both conditions above hold. */
  nelisClass: TrendGgtClass | null;
  /** Always false: the paper's stability condition is not checked. */
  stabilityChecked: false;
}

/** Default analysis window, in COMPLETE calendar years. */
export const DEFAULT_TREND_WINDOW_COMPLETE_YEARS = 10;

export interface TrendWindow {
  yearFrom: number;
  /** Inclusive; may be the current, still incomplete year (charts show it as YTD). */
  yearTo: number;
  /** min(yearTo, currentYear − 1): the last year the statistics use. */
  lastCompleteYear: number;
}

/**
 * The analysis window of every trend endpoint. Without `yearFrom` the window
 * holds exactly DEFAULT_TREND_WINDOW_COMPLETE_YEARS complete years ending at
 * the last complete year (yearFrom = lastCompleteYear − 9), whatever `yearTo`
 * is. The old rule `yearTo − 10` gave 10 complete years only when yearTo was
 * the current year, and 11 when yearTo was already complete.
 */
export function resolveTrendWindow(input: { yearFrom?: number; yearTo?: number }, currentYear = new Date().getFullYear()): TrendWindow {
  const yearTo = input.yearTo ?? currentYear;
  const lastCompleteYear = Math.min(yearTo, currentYear - 1);
  const yearFrom = input.yearFrom ?? lastCompleteYear - (DEFAULT_TREND_WINDOW_COMPLETE_YEARS - 1);
  return { yearFrom, yearTo, lastCompleteYear };
}

/** Where the counts come from: the whole OpenAlex population (aggregate
 *  queries) or the local corpus when OpenAlex is unavailable. */
export type TrendDataSource = "openalex" | "local";

/**
 * What a trend response can truthfully say about where its numbers come from.
 * Only observed facts: OpenAlex exposes no data or classifier version, so none
 * is reported. The server's cache of OpenAlex answers is not an OpenAlex
 * snapshot (the S3 data dump); this system does not use snapshots.
 */
export interface TrendDataProvenance {
  source: TrendDataSource;
  /** When OpenAlex produced the oldest count used in this response (kept with
   *  the cached answer). Null for local-corpus data. */
  fetchedAt: string | null;
  /** Version of the server's OpenAlex cache. Null for local-corpus data. */
  cacheVersion: string | null;
  /** The OpenAlex `corpus` parameter sent with every works query. Null for
   *  local-corpus data. */
  corpus: "core" | null;
}

/** Statistical evidence for one topic (GET /trends/:topic). Every value comes
 *  from a formula with a published source; see the web methodology panel. */
export interface TopicTrendStatistics {
  source: TrendDataSource;
  significanceLevel: number;
  /** Topic papers in the years used. */
  totalPapers: number;
  /** Complete years the tests use. */
  yearsUsed: number[];
  /** Reference population N_t (see TrendBaseline). */
  baseline: TrendBaseline;
  shareSeries: TrendShareYear[];
  mannKendall: MannKendallTrend | null;
  /** Sen's slope of the share, percentage points per year. */
  senSlopePctPoints: number | null;
  /** Verdict of the share trend; p-value only (one hypothesis, qValue null). */
  classification: TrendClassification;
  /** General Growth Tendency over the same years and reference population (descriptive). */
  ggt?: TrendGgt;
  impact: TrendImpactYear[];
  termShift: TrendTermShiftAnalysis | null;
}

/** A keyword whose share of papers rose between the earlier and later half
 *  of the window (supplementary; never part of the topic verdict). */
export interface RisingKeyword {
  keyword: string;
  totalPapers: number;
  growthRatePct: number;
  yearlyBreakdown: YearlyCount[];
  /** 2×2 log odds ratio test of the keyword between the earlier and later half
   *  of the window (Woolf 1955; Haldane 1956), BH-adjusted across the keywords
   *  tested. Present when the overview comes from OpenAlex. */
  shift?: TrendTermShift & {
    periodA: { yearFrom: number; yearTo: number };
    periodB: { yearFrom: number; yearTo: number };
  };
}

/** Data Scope filters that could not be applied to the data source, e.g. the
 *  local "provider" facet or a source name without an OpenAlex id. */
export interface TrendScopeNotice {
  ignoredFilters: Array<{ filter: string; values: string[]; reason: string }>;
}

/** Response shape of GET /api/v1/trends. */
export interface TrendsOverview {
  /** Where every count of this response comes from. */
  dataSource?: TrendDataSource;
  /** Requested reference population level of every topic share in the list. */
  baselineLevel?: TrendBaselineLevel;
  dataProvenance?: TrendDataProvenance;
  scopeNotice?: TrendScopeNotice;
  yearFrom: number;
  yearTo: number;
  /** Metrics only use years <= this. Entries in any yearlyBreakdown with
   *  year > lastCompleteYear are the still-accumulating YTD year — style and
   *  label them differently on charts (`yc.year > lastCompleteYear`). */
  lastCompleteYear: number;
  totalPapersInWindow: number;
  /** Distinct topic names available in the current active corpus window after
   *  Data Scope filters are applied. This is NOT limited by the overview `limit`. */
  uniqueTopicsInScope: number;
  yearlyTotalPapers: YearlyCount[];
  citationTrend: YearlyCitationMetric[];
  facets: TrendFacets;
  taxonomyCoverage: TrendTaxonomyCoverage;
  recommendedComparisons: RecommendedTrendComparison[];
  topics: TrendingTopic[];
  risingKeywords: RisingKeyword[];
  computedAt: string;
}

export interface TopicComparisonItem extends TrendMetrics {
  topic: string;
  taxonomy?: TrendTopicTaxonomy;
  totalPapers: number;
  yearlyBreakdown: YearlyCount[];
  citationTrend: YearlyCitationMetric[];
}

export interface TrendCompareResponse {
  dataSource?: TrendDataSource;
  dataProvenance?: TrendDataProvenance;
  yearFrom: number;
  yearTo: number;
  lastCompleteYear: number;
  topics: TopicComparisonItem[];
  computedAt: string;
}

/** Search candidates are not tested, so they carry no classification. */
export interface TrendTopicCandidate extends Omit<TrendingTopic, "classification"> {
  matchedBy: "topic" | "taxonomy";
}

export interface TrendTopicCandidatesResponse {
  dataSource?: TrendDataSource;
  dataProvenance?: TrendDataProvenance;
  query: string;
  yearFrom: number;
  yearTo: number;
  lastCompleteYear: number;
  totalCandidates: number;
  topics: TrendTopicCandidate[];
  computedAt: string;
}

export interface TopicRelationshipNode {
  id: string;
  label: string;
  count: number;
}

export interface TopicRelationshipEdge {
  source: string;
  target: string;
  count: number;
}

export interface TopicRelationshipResponse {
  dataSource?: TrendDataSource;
  dataProvenance?: TrendDataProvenance;
  topic: string;
  yearFrom: number;
  yearTo: number;
  nodes: TopicRelationshipNode[];
  edges: TopicRelationshipEdge[];
  computedAt: string;
}

export type TrendMetricTraceSource =
  | "yearlyTotalPapers"
  | "citationTrend"
  | "topicMetrics"
  | "risingKeywords"
  | "facets"
  | "relationships";

export interface TrendMetricTrace {
  source: TrendMetricTraceSource;
  label: string;
  value: string;
  explanation: string;
}

export interface TrendEvidenceSignal {
  text: string;
  sources: TrendMetricTraceSource[];
}

/** A possible cause of the trend, phrased as a hypothesis and tied to papers the AI was shown. */
export interface TrendPossibleDriver {
  text: string;
  paperIds: string[];
  papers?: Array<{ id: string; title: string; publicationYear?: number }>;
}

export interface TrendExplanationResponse {
  topic: string | null;
  language: "en" | "vi";
  summary: string;
  whyItMatters: string[];
  evidenceSignals: TrendEvidenceSignal[];
  cautions: string[];
  suggestedActions: string[];
  /** Absent on explanations saved before drivers existed. */
  possibleDrivers?: TrendPossibleDriver[];
  metricTrace: TrendMetricTrace[];
  generatedAt: string;
}

export interface TrendExplanationHistoryItem extends TrendExplanationResponse {
  id: string;
  yearFrom: number;
  yearTo: number;
  scopeHash: string;
  scopeLabel: string;
  createdAt: string;
}

export interface TrendExplanationHistoryResponse {
  items: TrendExplanationHistoryItem[];
}

/** Response shape of GET /api/v1/trends/:topic — deep dive into one topic. */
export interface PublicationTrend extends TrendMetrics {
  dataSource?: TrendDataSource;
  dataProvenance?: TrendDataProvenance;
  topic: string;
  taxonomy?: TrendTopicTaxonomy;
  totalPapers: number;
  yearlyBreakdown: YearlyCount[];
  citationTrend: YearlyCitationMetric[];
  facets: TrendFacets;
  /** Same semantics as TrendsOverview.lastCompleteYear. */
  lastCompleteYear: number;
  topJournals: TopItem[];
  topAuthors: TopItem[];
  topKeywords: TopItem[];
  statistics?: TopicTrendStatistics;
  computedAt: string;
}
