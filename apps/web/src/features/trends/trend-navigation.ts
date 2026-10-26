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
    report: build("/reports", { topic, create: "true" }),
  };
}
