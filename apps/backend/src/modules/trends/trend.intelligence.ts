import type { TrendFacetBucket, YearlyCitationMetric, YearlyCount } from "@trend/shared-types";

export function buildCitationMetric(year: number, count: number, totalCitations: number): YearlyCitationMetric {
  return {
    year,
    count,
    totalCitations,
    avgCitations: count > 0 ? Math.round((totalCitations / count) * 10) / 10 : 0,
  };
}

export function fillMissingCitationYears(
  series: YearlyCitationMetric[],
  yearFrom: number,
  yearTo: number,
): YearlyCitationMetric[] {
  const byYear = new Map(series.map((p) => [p.year, p]));
  const filled: YearlyCitationMetric[] = [];
  for (let year = yearFrom; year <= yearTo; year++) {
    filled.push(byYear.get(year) ?? buildCitationMetric(year, 0, 0));
  }
  return filled;
}

export function toFacetBuckets(rows: Array<{ _id: string | null; count: number }>, fallback = "unknown"): TrendFacetBucket[] {
  return rows
    .map((r) => {
      const id = String(r._id || fallback);
      return { id, name: id, count: r.count };
    })
    .filter((r) => r.count > 0);
}

export function toTaxonomyFacetBuckets(
  rows: Array<{ _id: { id?: string | null; name?: string | null } | null; count: number }>,
  fallback = "unknown",
): TrendFacetBucket[] {
  return rows
    .map((r) => {
      const openalexId = r._id?.id || undefined;
      const name = String(r._id?.name || openalexId || fallback);
      return {
        id: name,
        name,
        count: r.count,
        ...(openalexId ? { openalexId } : {}),
      };
    })
    .filter((r) => r.count > 0);
}

export function citationBand(citationCount: number): string {
  if (citationCount >= 1000) return "1000+";
  if (citationCount >= 500) return "500-999";
  if (citationCount >= 100) return "100-499";
  if (citationCount >= 50) return "50-99";
  if (citationCount >= 10) return "10-49";
  return "0-9";
}

export function fillMissingYearsFromCounts(
  series: Array<{ year: number; count: number }>,
  yearFrom: number,
  yearTo: number,
): YearlyCount[] {
  const byYear = new Map(series.map((p) => [p.year, p.count]));
  const filled: YearlyCount[] = [];
  for (let year = yearFrom; year <= yearTo; year++) {
    filled.push({ year, count: byYear.get(year) ?? 0 });
  }
  return filled;
}
