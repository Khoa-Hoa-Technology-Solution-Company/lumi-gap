export function getTopicTrendTarget(topic: string, openalexTopicId?: string): string {
  const base = `/trends/${encodeURIComponent(topic)}`;
  return openalexTopicId ? `${base}?topicId=${encodeURIComponent(openalexTopicId)}` : base;
}

export function getRisingKeywordTarget(keyword: string): string {
  return `/search?q=${encodeURIComponent(keyword)}`;
}
