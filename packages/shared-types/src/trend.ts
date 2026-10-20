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
  mannKendall: { s: number; z: number; tau: number; pValue: number } | null;
  /** Benjamini–Hochberg q-value; only in the overview list. */
  qValue: number | null;
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
  /** z > 0, sorted by z descending. */
  rising: TrendTermShift[];
  /** z < 0, sorted by z ascending. */
  falling: TrendTermShift[];
}

/** Where the counts come from: the whole OpenAlex population (aggregate
 *  queries) or the local corpus when OpenAlex is unavailable. */
export type TrendDataSource = "openalex" | "local";

/** Statistical evidence for one topic (GET /trends/:topic). Every value comes
 *  from a formula with a published source; see the web methodology panel. */
export interface TopicTrendStatistics {
  source: TrendDataSource;
  significanceLevel: number;
  /** Topic papers in the years used. */
  totalPapers: number;
  /** Complete years the tests use. */
  yearsUsed: number[];
  /** Population used as N_t: papers of the same OpenAlex field, or the whole
   *  corpus when the topic has no field. */
  baseline: { level: "field" | "corpus"; label: string };
  shareSeries: TrendShareYear[];
  mannKendall: MannKendallTrend | null;
  /** Sen's slope of the share, percentage points per year. */
  senSlopePctPoints: number | null;
  /** Verdict of the share trend; p-value only (one hypothesis, qValue null). */
  classification: TrendClassification;
  impact: TrendImpactYear[];
  termShift: TrendTermShiftAnalysis | null;
}

/** A keyword growing fast from a small base (early signal of a new direction). */
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
