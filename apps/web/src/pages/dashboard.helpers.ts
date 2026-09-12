export interface VolumePoint {
  date: string;
  count: number;
}

export interface SearchHistoryItem {
  query: string;
  mode: string;
  resultCount: number;
  durationMs?: number;
  createdAt: string;
}

export function totalSearchVolume(points: VolumePoint[]): number {
  return points.reduce((sum, p) => sum + p.count, 0);
}

export function averageSearchesPerDay(points: VolumePoint[], days: number): number {
  if (days <= 0) return 0;
  return Math.round((totalSearchVolume(points) / days) * 10) / 10;
}

export function fillMissingDays(points: VolumePoint[], days: number): VolumePoint[] {
  const result: VolumePoint[] = [];
  const pointsMap = new Map(points.map((p) => [p.date, p.count]));

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dateStr = String(d.getDate()).padStart(2, '0');
    const formatted = `${year}-${month}-${dateStr}`;

    result.push({
      date: formatted,
      count: pointsMap.get(formatted) || 0,
    });
  }
  return result;
}

export function getTopQueryLabel(topQueries: Array<{ query: string; count: number }>): string {
  return topQueries[0]?.query ?? "No query yet";
}

export function buildSearchTarget(query: string): string {
  return `/search?q=${encodeURIComponent(query)}`;
}
