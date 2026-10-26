export interface TrendYearWindow {
  yearFrom?: number;
  yearTo?: number;
}

function setWindow(params: URLSearchParams, window?: TrendYearWindow) {
  if (window?.yearFrom) params.set("yearFrom", String(window.yearFrom));
  if (window?.yearTo) params.set("yearTo", String(window.yearTo));
}

/** Topic detail keeps the year window it was opened from, so both pages show the same figures. */
export function getTopicTrendTarget(topic: string, openalexTopicId?: string, window?: TrendYearWindow): string {
  const base = `/trends/${encodeURIComponent(topic)}`;
  const params = new URLSearchParams();
  if (openalexTopicId) params.set("topicId", openalexTopicId);
  setWindow(params, window);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function getRisingKeywordTarget(keyword: string): string {
  return `/home?q=${encodeURIComponent(keyword)}`;
}

/** Links from a topic detail page to the next research step, carrying the topic and the year window. */
export function getTopicActionTargets(topic: string, window?: TrendYearWindow) {
  const build = (path: string, base: Record<string, string>) => {
    const params = new URLSearchParams(base);
    setWindow(params, window);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  };
  return {
    trends: build("/trends", {}),
    search: build("/home", { q: topic }),
    gaps: build("/research-gaps", { topic }),
    compare: build("/trends", { tab: "compare", compare: topic }),
    explain: build("/trends", { tab: "ai", focus: topic }),
    report: build("/reports", { topic, create: "true" }),
  };
}

/** The trends page scope (year window + every filter) that links to search, reports and gaps carry along. */
export interface TrendScopeParams {
  yearFrom: number;
  yearTo: number;
  domainIds: string[];
  domains: string[];
  fieldIds: string[];
  fields: string[];
  subfieldIds: string[];
  subfields: string[];
  topicIds: string[];
  topicsFilter: string[];
  paperKinds: string[];
  openAccessStatuses: string[];
  providers: string[];
  sources: string[];
  languages: string[];
  citationBands: string[];
}

const SCOPE_LIST_KEYS = ["domainIds", "domains", "fieldIds", "fields", "subfieldIds", "subfields", "topicIds"] as const;
const FACET_LIST_KEYS = ["paperKinds", "openAccessStatuses", "providers", "sources", "languages", "citationBands"] as const;

/** `path?base&scope`; without a scope only the base parameters are kept. */
export function buildTrendScopedUrl(path: string, base: Record<string, string>, scope?: Partial<TrendScopeParams>): string {
  const params = new URLSearchParams(base);
  if (scope) {
    if (scope.yearFrom) params.set("yearFrom", String(scope.yearFrom));
    if (scope.yearTo) params.set("yearTo", String(scope.yearTo));
    const add = (key: string, values?: string[]) => {
      const cleaned = (values ?? []).map((value) => value.trim()).filter(Boolean);
      if (cleaned.length > 0) params.set(key, cleaned.join(","));
    };
    for (const key of SCOPE_LIST_KEYS) add(key, scope[key]);
    // Target pages (home search, reports) read `topics`; the trends page itself reads `topicsFilter`.
    add("topics", scope.topicsFilter);
    add("topicsFilter", scope.topicsFilter);
    for (const key of FACET_LIST_KEYS) add(key, scope[key]);
  }
  return `${path}?${params.toString()}`;
}
