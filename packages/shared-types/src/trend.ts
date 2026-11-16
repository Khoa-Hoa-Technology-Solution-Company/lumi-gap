import type { ISODateString } from "./common.js";

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
  }>;
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
/** Citation-count bands used by the trend, search and report filters. */
export const TREND_CITATION_BANDS = ["0-9", "10-49", "50-99", "100-499", "500-999", "1000+"] as const;

export type TrendCitationBand = (typeof TREND_CITATION_BANDS)[number];

/**
 * rising: the share rises significantly and has not levelled off.
 * saturated: it rose significantly over the window but is flat near its peak in the recent years.
 * past_peak: it rose significantly over the window but has since fallen far below its peak.
 * declining: the share falls significantly. stable: no significant trend.
 * insufficient: a data gate failed.
 */
export type TrendVerdict = "rising" | "saturated" | "past_peak" | "declining" | "stable" | "insufficient";

/** Only set for rising / saturated / past_peak / declining. */
export type TrendConfidence = "high" | "medium";

export type TrendReasonCode =
  | "LOCAL_CORPUS"
  | "TOO_FEW_YEARS"
  | "TOO_FEW_PAPERS"
  | "SIGNIFICANT_INCREASE"
  | "SIGNIFICANT_DECREASE"
  | "PLATEAU_AFTER_INCREASE"
  | "DECLINE_AFTER_PEAK"
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
  /** Only for rising / saturated / past_peak / declining. */
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
  /** r_R: Sen's slope over the recent window / median(share of that window) · 100, % per year. */
  recentRelativeChangePct: number | null;
  /** median(share of the last 3 years) / max(share over the window), 0..1. */
  peakRatio: number | null;
  reasons: TrendReasonCode[];
}

/** One topic in the trends overview list (GET /trends). */
export interface TrendingTopic {
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

/** Descriptive statistics of a short series (backend trend.descriptive.ts). */
export interface DescriptiveStats {
  n: number;
  mean: number;
  median: number;
  q1: number;
  q3: number;
  /** Sample variance, divisor n − 1. Null when n < 2. */
  variance: number | null;
  standardDeviation: number | null;
  min: number;
  max: number;
  range: number;
  /** s / mean. Null when the mean is 0 or n < 2. */
  coefficientOfVariation: number | null;
  /** Adjusted Fisher–Pearson G1 (Joanes & Gill 1998). Null when n < 3 or the series is constant. */
  skewness: number | null;
  /** Excess kurtosis G2 (Joanes & Gill 1998), 0 for a normal distribution. Null when n < 4 or the series is constant. */
  kurtosis: number | null;
}

/** One used year of the exploratory analysis: the share, the Theil–Sen line and what is left over. */
export interface TrendEdaYear {
  year: number;
  sharePct: number;
  /** Value of the Theil–Sen line; null when no line could be fitted. */
  fitted: number | null;
  /** sharePct − fitted. */
  residual: number | null;
  /** (residual − median) / MAD; null when the MAD is 0 or there are fewer than 3 years. */
  outlierScore: number | null;
  /** |outlierScore| above the cut-off (2.5, Leys et al. 2013). */
  outlier: boolean;
}

/**
 * Exploratory data analysis of one topic (GET /trends/:topic), in the order the
 * page shows it: data check, descriptive statistics, trend line and residuals,
 * anomalous years. It describes the series; only `classification` concludes.
 */
export interface TopicEda {
  /** Years of the window that were left out of every statistic, and why. */
  excludedYears: Array<{ year: number; reason: "incomplete" | "no_population" }>;
  /** Used years in which the topic has no paper. */
  zeroCountYears: number[];
  /** Of the yearly share s_t, in %. */
  share: DescriptiveStats | null;
  /** Of the yearly paper count n_t. */
  papers: DescriptiveStats | null;
  /** Theil–Sen line of the share: fitted = intercept + slope · year. */
  trendLine: { slope: number; intercept: number } | null;
  years: TrendEdaYear[];
  /** MAD of the residuals (scaled by 1.4826); null with fewer than 3 years. */
  residualMad: number | null;
  /** Years whose residual is an outlier. They are a caution, never a verdict. */
  outlierYears: number[];
  /** The recent window R the plateau check looks at; null when no year is used. */
  recentWindow: { yearFrom: number; yearTo: number } | null;
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
  /** Population used as N_t: every paper of the IT scope ("scope", with its
   *  version), papers of the same OpenAlex field for a topic outside the scope
   *  or in the local corpus, or the whole corpus when the topic has no field. */
  baseline: { level: "scope" | "field" | "corpus"; label: string; scopeVersion?: string };
  shareSeries: TrendShareYear[];
  mannKendall: MannKendallTrend | null;
  /** Sen's slope of the share, percentage points per year. */
  senSlopePctPoints: number | null;
  /** Verdict of the share trend; p-value only (one hypothesis, qValue null). */
  classification: TrendClassification;
  /** Exploratory analysis the verdict is read against. */
  eda: TopicEda;
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
  /** Version of the IT scope the topics were tested in (backend trend.scope.ts);
   *  absent for the local corpus. Verdicts of two versions are not comparable. */
  scopeVersion?: string;
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
  /** Topics listed in this request, before `topics` is paged. OpenAlex: every
   *  topic of the IT scope is tested; these are the ones with at least
   *  minPapers papers in the window, inside the subfield or topic filter when
   *  there is one. Local corpus: every topic with at least minPapers. Does not
   *  depend on limit/offset. */
  testedTopicCount: number;
  /** Tested topics of the requested `verdict` (all of them without one);
   *  `topics` is the page [offset, offset + limit) of these. */
  matchedTopicCount?: number;
  /** Always null for the yearly overview since every topic of the scope is
   *  tested; GET /trends/periods sets it (largest topics of every subfield of the scope). */
  candidateStrata?: TrendCandidateStrata | null;
  /** Verdicts of all tested topics, not only of the `topics` returned. */
  verdictCounts: Record<TrendVerdict, number>;
  yearlyTotalPapers: YearlyCount[];
  citationTrend: YearlyCitationMetric[];
  facets: TrendFacets;
  taxonomyCoverage: TrendTaxonomyCoverage;
  recommendedComparisons: RecommendedTrendComparison[];
  topics: TrendingTopic[];
  risingKeywords: RisingKeyword[];
  computedAt: string;
}

/** Candidates taken from every field (or every subfield of a one-field scope)
 *  so the smaller fields are tested too, not only the 200 largest topics. */
export interface TrendCandidateStrata {
  level: "field" | "subfield";
  /** Fields or subfields of the scope that were queried. */
  strata: number;
  /** Largest topics taken from each of them. */
  perStratum: number;
}

/** Period length of GET /trends/periods. */
export type TrendGranularity = "month" | "quarter";

/** "rolling": the last N complete periods; "year-to-date": the complete
 *  periods of the current calendar year. */
export type TrendPeriodWindow = "rolling" | "year-to-date";

export interface TrendPeriod {
  /** "2026-09" (month) or "2026-Q3" (quarter). */
  key: string;
  /** Inclusive publication dates, YYYY-MM-DD. */
  from: string;
  to: string;
  /** False for the period still running: shown, never tested. */
  complete: boolean;
}

export interface PeriodCount {
  period: string;
  count: number;
}

/** One topic of GET /trends/periods. Its classification is the same test as
 *  the yearly one on monthly or quarterly shares: `yearsUsed` counts complete
 *  periods, Sen's slope is in percentage points per period, and the reason
 *  TOO_FEW_YEARS means fewer than 5 complete periods. */
export interface TrendingPeriodTopic {
  topic: string;
  taxonomy?: TrendTopicTaxonomy;
  /** Papers over every period of the window, the running one included. */
  totalPapers: number;
  periodBreakdown: PeriodCount[];
  classification: TrendClassification;
}

/** Response shape of GET /api/v1/trends/periods (trends by month or quarter). */
export interface TrendPeriodsOverview {
  dataSource?: TrendDataSource;
  /** Version of the IT scope whose total is the denominator; absent for the local corpus. */
  scopeVersion?: string;
  scopeNotice?: TrendScopeNotice;
  granularity: TrendGranularity;
  window: TrendPeriodWindow;
  /** Oldest first; the last one is the running period (complete = false). */
  periods: TrendPeriod[];
  periodTotalPapers: PeriodCount[];
  totalPapersInWindow: number;
  testedTopicCount: number;
  /** Same as TrendsOverview.matchedTopicCount. */
  matchedTopicCount?: number;
  candidateStrata: TrendCandidateStrata | null;
  verdictCounts: Record<TrendVerdict, number>;
  topics: TrendingPeriodTopic[];
  computedAt: string;
}

export interface TopicComparisonItem {
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
export interface PublicationTrend {
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
  /** Most-cited papers of the topic in the local corpus and window (openable in the app); absent when none. */
  topPapers?: Array<{ id: string; title: string; publicationYear: number; citationCount: number }>;
  computedAt: string;
}

/** A trend topic the user follows (GET /trends/follows). */
export interface TrendTopicFollow {
  id: string;
  topic: string;
  openalexTopicId?: string;
  note?: string;
  /** Verdict at the last check (default 10-year window); absent until it could be computed. */
  lastVerdict?: TrendVerdict;
  lastDataSource?: TrendDataSource;
  lastCheckedAt?: ISODateString;
  createdAt: ISODateString;
}

/** Trend evidence frozen into a project (GET /projects/:id/trend-snapshots). */
export interface ProjectTrendSnapshot {
  id: string;
  projectId: string;
  createdById: string;
  topic: string;
  openalexTopicId?: string;
  yearFrom: number;
  yearTo: number;
  verdict: TrendVerdict;
  dataSource: TrendDataSource;
  totalPapers: number;
  classification: TrendClassification;
  baseline?: { level: "scope" | "field" | "corpus"; label: string; scopeVersion?: string };
  note?: string;
  createdAt: ISODateString;
}
