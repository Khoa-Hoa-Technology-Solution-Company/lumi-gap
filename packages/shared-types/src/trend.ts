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
  totalCitations: number;
  avgCitations: number;
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
    growthRatePct: number;
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
  /** Year-over-year growth, %: last complete year vs the year before.
   *  Denominator is clamped to >= 1 so a 0→N jump reads as N*100%. */
  growthRatePct: number;
  /** Compound annual growth rate over (up to) the last 3 complete years, %.
   *  Null when the series is too short or starts at 0. */
  cagr3yPct: number | null;
  /** Least-squares slope of count-per-year over the window (papers/year).
   *  Positive = rising, negative = declining. The steeper, the hotter. */
  momentum: number;
}

/** One topic in the trends overview list (GET /trends). */
export interface TrendingTopic extends TrendMetrics {
  topic: string;
  taxonomy?: TrendTopicTaxonomy;
  totalPapers: number;
  /** Gap years are filled with count 0; sorted by year ascending. */
  yearlyBreakdown: YearlyCount[];
}

/** A keyword growing fast from a small base (early signal of a new direction). */
export interface RisingKeyword {
  keyword: string;
  totalPapers: number;
  growthRatePct: number;
  yearlyBreakdown: YearlyCount[];
}

/** Response shape of GET /api/v1/trends. */
export interface TrendsOverview {
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
  yearFrom: number;
  yearTo: number;
  lastCompleteYear: number;
  topics: TopicComparisonItem[];
  computedAt: string;
}

export interface TrendTopicCandidate extends TrendingTopic {
  matchedBy: "topic" | "taxonomy";
}

export interface TrendTopicCandidatesResponse {
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

export interface TrendExplanationResponse {
  topic: string | null;
  language: "en" | "vi";
  summary: string;
  whyItMatters: string[];
  evidenceSignals: TrendEvidenceSignal[];
  cautions: string[];
  suggestedActions: string[];
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
  computedAt: string;
}
