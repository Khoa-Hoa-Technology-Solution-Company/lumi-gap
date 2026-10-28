import { DEFAULT_TREND_SORT, DEFAULT_TREND_YEAR_FROM, DEFAULT_TREND_YEAR_TO, type TrendSortKey } from "./trends.insights";

/** Default of the "Min papers" control; the URL omits it. */
export const DEFAULT_TREND_MIN_PAPERS = 2;

/** Everything the trends page keeps in its URL, so a reload or a shared link restores the same view. */
export interface TrendsPageUrlState {
  yearFrom: number;
  yearTo: number;
  sortBy: TrendSortKey;
  minPapers: number;
  activeTab: string;
  verdictFilter: string;
  /** Topic chosen for the AI tab (`?focus=`); empty when the page picks one itself. */
  focusTopic: string;
  domains: string[];
  fields: string[];
  subfields: string[];
  topicsFilter: string[];
  domainIds: string[];
  fieldIds: string[];
  subfieldIds: string[];
  topicIds: string[];
  paperKinds: string[];
  openAccessStatuses: string[];
  providers: string[];
  sources: string[];
  languages: string[];
  citationBands: string[];
  selectedTopics: string[];
}

const LIST_KEYS = [
  "domains", "fields", "subfields", "topicsFilter",
  "domainIds", "fieldIds", "subfieldIds", "topicIds",
  "paperKinds", "openAccessStatuses", "providers", "sources", "languages", "citationBands",
] as const;

/** URL search params of the trends page; values equal to their defaults are left out. */
export function buildTrendsPageParams(state: TrendsPageUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.yearFrom !== DEFAULT_TREND_YEAR_FROM) params.set("yearFrom", String(state.yearFrom));
  if (state.yearTo !== DEFAULT_TREND_YEAR_TO) params.set("yearTo", String(state.yearTo));
  if (state.sortBy !== DEFAULT_TREND_SORT) params.set("sortBy", state.sortBy);
  if (state.minPapers !== DEFAULT_TREND_MIN_PAPERS) params.set("minPapers", String(state.minPapers));
  if (state.activeTab !== "overview") params.set("tab", state.activeTab);
  if (state.activeTab === "topics" && state.verdictFilter !== "all") params.set("verdict", state.verdictFilter);
  const focus = state.focusTopic.trim();
  if (focus) params.set("focus", focus);
  for (const key of LIST_KEYS) if (state[key].length > 0) params.set(key, state[key].join(","));
  if (state.selectedTopics.length > 0) params.set("compare", state.selectedTopics.join(","));
  return params;
}
