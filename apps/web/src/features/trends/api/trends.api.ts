import type {
  PublicationTrend,
  TrendExplanationHistoryResponse,
  TrendExplanationResponse,
  TrendTopicCandidatesResponse,
  TopicRelationshipResponse,
  TrendCompareResponse,
  TrendGranularity,
  TrendPeriodWindow,
  TrendPeriodsOverview,
  TrendVerdict,
  TrendsOverview,
} from "@trend/shared-types";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

export interface TrendsOverviewParams {
  yearFrom?: number;
  yearTo?: number;
  limit?: number;
  minPapers?: number;
  sortBy?: "trend" | "total";
  /** Only topics with this verdict in `topics` (counts stay over all tested topics). */
  verdict?: TrendVerdict;
  /** First topic of the page, for paging with `limit`. */
  offset?: number;
  paperKinds?: string[];
  openAccessStatuses?: string[];
  providers?: string[];
  sources?: string[];
  languages?: string[];
  citationBands?: Array<"0-9" | "10-49" | "50-99" | "100-499" | "500-999" | "1000+">;
  domains?: string[];
  fields?: string[];
  subfields?: string[];
  topics?: string[];
  domainIds?: string[];
  fieldIds?: string[];
  subfieldIds?: string[];
  topicIds?: string[];
}

export interface TrendPeriodsParams extends Omit<TrendsOverviewParams, "yearFrom" | "yearTo"> {
  granularity?: TrendGranularity;
  window?: TrendPeriodWindow;
  /** Complete periods of a rolling window (5–24). */
  periods?: number;
}

export interface TrendCompareParams extends Omit<TrendsOverviewParams, "limit" | "minPapers" | "sortBy" | "verdict" | "offset"> {
  topics: string[];
  yearFrom?: number;
  yearTo?: number;
}

export interface TrendTopicCandidatesParams extends Omit<TrendsOverviewParams, "sortBy" | "verdict" | "offset"> {
  q: string;
  limit?: number;
  minPapers?: number;
}

export interface TrendRelationshipParams extends Omit<TrendsOverviewParams, "limit" | "minPapers" | "sortBy" | "verdict" | "offset"> {
  topic: string;
  yearFrom?: number;
  yearTo?: number;
  limit?: number;
}

export interface TrendExplainInput extends Omit<TrendsOverviewParams, "limit" | "minPapers" | "sortBy" | "verdict" | "offset"> {
  topic?: string;
  yearFrom?: number;
  yearTo?: number;
  language?: "en" | "vi";
}

export interface TrendExplainHistoryParams {
  topic?: string;
  limit?: number;
}

function serializeTrendParams(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      const cleaned = value.map(String).map((item) => item.trim()).filter(Boolean);
      if (cleaned.length > 0) searchParams.set(key, cleaned.join(","));
      continue;
    }
    const stringValue = String(value).trim();
    if (stringValue.length > 0) searchParams.set(key, stringValue);
  }

  return searchParams.toString();
}

export const trendsApi = {
  async overview(params?: TrendsOverviewParams): Promise<TrendsOverview> {
    const res = await api.get("/trends", {
      params,
      paramsSerializer: { serialize: serializeTrendParams },
    });
    return res.data.data;
  },
  async periods(params?: TrendPeriodsParams): Promise<TrendPeriodsOverview> {
    const res = await api.get("/trends/periods", {
      params,
      paramsSerializer: { serialize: serializeTrendParams },
    });
    return res.data.data;
  },
  async topic(topic: string, params?: { topicId?: string; yearFrom?: number; yearTo?: number } & Omit<TrendsOverviewParams, "limit" | "minPapers" | "sortBy">): Promise<PublicationTrend> {
    const res = await api.get(API_ROUTES.trends.topic(topic), {
      params,
      paramsSerializer: { serialize: serializeTrendParams },
    });
    return res.data.data;
  },
  async compare(params: TrendCompareParams): Promise<TrendCompareResponse> {
    const res = await api.get("/trends/compare", {
      params: { ...params, topics: params.topics.join(",") },
      paramsSerializer: { serialize: serializeTrendParams },
    });
    return res.data.data;
  },
  async topicCandidates(params: TrendTopicCandidatesParams): Promise<TrendTopicCandidatesResponse> {
    const res = await api.get("/trends/topic-candidates", {
      params,
      paramsSerializer: { serialize: serializeTrendParams },
    });
    return res.data.data;
  },
  async relationships(params: TrendRelationshipParams): Promise<TopicRelationshipResponse> {
    const res = await api.get("/trends/relationships", {
      params,
      paramsSerializer: { serialize: serializeTrendParams },
    });
    return res.data.data;
  },
  async explain(input: TrendExplainInput): Promise<TrendExplanationResponse> {
    const res = await api.post("/trends/explain", input);
    return res.data.data;
  },
  async explainHistory(params?: TrendExplainHistoryParams): Promise<TrendExplanationHistoryResponse> {
    const res = await api.get("/trends/explain/history", { params });
    return res.data.data;
  },
};
