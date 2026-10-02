import type { TrendCitationBand } from "../trends/trend.filters.js";

export interface PaperFilterInput {
  yearFrom?: number;
  yearTo?: number;
  paperKinds?: string[];
  openAccess?: boolean;
  openAccessStatuses?: string[];
  provider?: string;
  providers?: string[];
  sources?: string[];
  languages?: string[];
  citationBands?: TrendCitationBand[] | string[];
  domains?: string[];
  fields?: string[];
  subfields?: string[];
  topics?: string[];
  domainIds?: string[];
  fieldIds?: string[];
  subfieldIds?: string[];
  topicIds?: string[];
  paperIds?: string[];
}

/**
 * Document-style metadata filter shared by non-vector callers. The retriever
 * pushes the equivalent predicates into SQL (see postgres-paper-search.ts),
 * which reuses the helpers exported below.
 */
export function buildPaperMetadataMatch(
  input: PaperFilterInput,
  options: { includeActive?: boolean } = {},
): Record<string, unknown> {
  const match: Record<string, unknown> = options.includeActive === false
    ? {}
    : { dataStatus: "active" };

  if (input.paperIds?.length) {
    match._id = { $in: input.paperIds };
  }
  if (input.yearFrom !== undefined || input.yearTo !== undefined) {
    match.publicationYear = {
      ...(input.yearFrom !== undefined ? { $gte: input.yearFrom } : {}),
      ...(input.yearTo !== undefined ? { $lte: input.yearTo } : {}),
    };
  }
  if (input.paperKinds?.length) match.paperKind = { $in: uniqueStrings(input.paperKinds) };
  if (input.openAccess) match.openAccessUrl = { $type: "string", $ne: "" };
  if (input.openAccessStatuses?.length) {
    match.openAccessStatus = { $in: lowercase(input.openAccessStatuses) };
  }

  const providers = uniqueStrings(input.providers);
  if (providers.length) {
    match.primaryProvider = { $in: providers.map((value) => value.toLowerCase()) };
  } else if (input.provider) {
    match.primaryProvider = input.provider.toLowerCase();
  }
  if (input.sources?.length) match.journalName = { $in: uniqueStrings(input.sources) };
  if (input.languages?.length) match.language = { $in: lowercase(input.languages) };

  const citationClauses = uniqueStrings(input.citationBands)
    .map(citationBandToMatch)
    .filter((clause): clause is Record<string, unknown> => clause !== null);
  if (citationClauses.length === 1) {
    Object.assign(match, citationClauses[0]);
  } else if (citationClauses.length > 1) {
    match.$or = citationClauses;
  }

  const topicMatch = buildTopicElementMatch(input);
  if (Object.keys(topicMatch).length) match.topics = { $elemMatch: topicMatch };

  return match;
}

function buildTopicElementMatch(input: PaperFilterInput): Record<string, unknown> {
  const match: Record<string, unknown> = {};
  const names = [
    ["topics", "topicName"],
    ["domains", "domainName"],
    ["fields", "fieldName"],
    ["subfields", "subfieldName"],
  ] as const;
  const ids = [
    ["topicIds", "openalexTopicId"],
    ["domainIds", "domainId"],
    ["fieldIds", "fieldId"],
    ["subfieldIds", "subfieldId"],
  ] as const;

  for (const [inputKey, documentKey] of names) {
    const values = uniqueStrings(input[inputKey]);
    if (values.length) match[documentKey] = { $in: values };
  }
  for (const [inputKey, documentKey] of ids) {
    const values = expandOpenAlexIds(uniqueStrings(input[inputKey]));
    if (values.length) match[documentKey] = { $in: values };
  }
  return match;
}

const CITATION_BAND_RANGES: Record<string, { min: number; max?: number }> = {
  "0-9": { min: 0, max: 9 },
  "10-49": { min: 10, max: 49 },
  "50-99": { min: 50, max: 99 },
  "100-499": { min: 100, max: 499 },
  "500-999": { min: 500, max: 999 },
  "1000+": { min: 1000 },
};

export function citationBandRange(band: string): { min: number; max?: number } | null {
  return CITATION_BAND_RANGES[band] ?? null;
}

function citationBandToMatch(band: string): Record<string, unknown> | null {
  const range = citationBandRange(band);
  if (!range) return null;
  return {
    citationCount: {
      $gte: range.min,
      ...(range.max !== undefined ? { $lte: range.max } : {}),
    },
  };
}

export function lowercase(values: unknown): string[] {
  return uniqueStrings(values).map((value) => value.toLowerCase());
}

export function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(String).map((value) => value.trim()).filter(Boolean)));
}

export function expandOpenAlexIds(values: string[]): string[] {
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
