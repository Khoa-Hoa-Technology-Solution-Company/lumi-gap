export const TREND_CITATION_BANDS = ["0-9", "10-49", "50-99", "100-499", "500-999", "1000+"] as const;

export type TrendCitationBand = (typeof TREND_CITATION_BANDS)[number];

export interface TrendFilterInput {
  yearFrom: number;
  yearTo: number;
  paperKinds?: string[];
  openAccessStatuses?: string[];
  providers?: string[];
  sources?: string[];
  languages?: string[];
  citationBands?: TrendCitationBand[];
  domains?: string[];
  fields?: string[];
  subfields?: string[];
  topics?: string[];
  domainIds?: string[];
  fieldIds?: string[];
  subfieldIds?: string[];
  topicIds?: string[];
}

type MatchStage = Record<string, unknown>;

const scalarFilterMap = {
  paperKinds: "paperKind",
  openAccessStatuses: "openAccessStatus",
  providers: "primaryProvider",
  sources: "journalName",
  languages: "language",
} as const;

const taxonomyFilterMap = {
  domains: "domainName",
  fields: "fieldName",
  subfields: "subfieldName",
  topics: "topicName",
} as const;

const taxonomyIdFilterMap = {
  domainIds: "domainId",
  fieldIds: "fieldId",
  subfieldIds: "subfieldId",
  topicIds: "openalexTopicId",
} as const;

export function buildTrendMatchStage(input: TrendFilterInput): MatchStage {
  const matchStage: MatchStage = {
    dataStatus: "active",
    publicationYear: { $gte: input.yearFrom, $lte: input.yearTo },
  };

  for (const [filterKey, fieldName] of Object.entries(scalarFilterMap)) {
    const rawValues = uniqueStrings(input[filterKey as keyof typeof scalarFilterMap]);
    const values = filterKey === "languages"
      ? rawValues.map((value) => value.toLowerCase())
      : rawValues;
    if (values.length > 0) {
      matchStage[fieldName] = { $in: values };
    }
  }

  const taxonomyElemMatch = buildTopicElementMatch(input);
  if (Object.keys(taxonomyElemMatch).length > 0) {
    matchStage.topics = { $elemMatch: taxonomyElemMatch };
  }

  const citationClauses = uniqueStrings(input.citationBands).map(citationBandToMatch);
  if (citationClauses.length === 1) {
    Object.assign(matchStage, citationClauses[0]);
  } else if (citationClauses.length > 1) {
    matchStage.$or = citationClauses;
  }

  return matchStage;
}

/** Topic-level predicates for pipelines that have already unwound `$topics`.
 *  Without this, a domain filter selects the right papers but later aggregations
 *  can still count unrelated co-topics from those same papers. */
export function buildUnwoundTopicMatch(input: TrendFilterInput): MatchStage {
  return Object.fromEntries(
    Object.entries(buildTopicElementMatch(input)).map(([field, condition]) => [`topics.${field}`, condition]),
  );
}

function buildTopicElementMatch(input: TrendFilterInput): Record<string, unknown> {
  const taxonomyElemMatch: Record<string, unknown> = {};
  for (const [filterKey, topicFieldName] of Object.entries(taxonomyFilterMap)) {
    const values = uniqueStrings(input[filterKey as keyof typeof taxonomyFilterMap]);
    if (values.length > 0) {
      taxonomyElemMatch[topicFieldName] = { $in: values };
    }
  }
  for (const [filterKey, topicFieldName] of Object.entries(taxonomyIdFilterMap)) {
    const values = expandOpenAlexIds(uniqueStrings(input[filterKey as keyof typeof taxonomyIdFilterMap]));
    if (values.length > 0) {
      taxonomyElemMatch[topicFieldName] = { $in: values };
    }
  }
  return taxonomyElemMatch;
}

export function describeAppliedTrendFilters(input: TrendFilterInput): Partial<TrendFilterInput> {
  const filters: Partial<TrendFilterInput> = {};
  for (const key of [
    "paperKinds",
    "openAccessStatuses",
    "providers",
    "sources",
    "languages",
    "citationBands",
    "domains",
    "fields",
    "subfields",
    "topics",
    "domainIds",
    "fieldIds",
    "subfieldIds",
    "topicIds",
  ] as const) {
    const values = uniqueStrings(input[key]);
    if (values.length > 0) {
      filters[key] = values as never;
    }
  }
  return filters;
}

function citationBandToMatch(band: string): MatchStage {
  if (band === "0-9") return { citationCount: { $gte: 0, $lte: 9 } };
  if (band === "10-49") return { citationCount: { $gte: 10, $lte: 49 } };
  if (band === "50-99") return { citationCount: { $gte: 50, $lte: 99 } };
  if (band === "100-499") return { citationCount: { $gte: 100, $lte: 499 } };
  if (band === "500-999") return { citationCount: { $gte: 500, $lte: 999 } };
  return { citationCount: { $gte: 1000 } };
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(String).map((v) => v.trim()).filter(Boolean)));
}

function expandOpenAlexIds(values: string[]): string[] {
  const expanded = new Set<string>();
  for (const value of values) {
    expanded.add(value);
    const lastSegment = value.split("/").filter(Boolean).at(-1);
    if (lastSegment) {
      expanded.add(lastSegment);
      expanded.add(lastSegment.toUpperCase());
    }
  }
  return Array.from(expanded);
}
