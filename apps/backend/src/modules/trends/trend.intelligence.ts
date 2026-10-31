import type { TrendFacetBucket, YearlyCitationMetric } from "@trend/shared-types";

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
