import mongoose from "mongoose";
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
 * Complete metadata filter used by keyword search and as the semantic
 * post-filter fallback. Keep this independent from vector-index capabilities:
 * only buildVectorFilter() decides which clauses are safe to push down.
 */
export function buildPaperMetadataMatch(
  input: PaperFilterInput,
  options: { includeActive?: boolean } = {},
): Record<string, unknown> {
  const match: Record<string, unknown> = options.includeActive === false
    ? {}
    : { dataStatus: "active" };

  if (input.paperIds?.length) {
    match._id = { $in: input.paperIds.map(toMongoId) };
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

function citationBandToMatch(band: string): Record<string, unknown> | null {
  if (band === "0-9") return { citationCount: { $gte: 0, $lte: 9 } };
  if (band === "10-49") return { citationCount: { $gte: 10, $lte: 49 } };
  if (band === "50-99") return { citationCount: { $gte: 50, $lte: 99 } };
  if (band === "100-499") return { citationCount: { $gte: 100, $lte: 499 } };
  if (band === "500-999") return { citationCount: { $gte: 500, $lte: 999 } };
  if (band === "1000+") return { citationCount: { $gte: 1000 } };
  return null;
}

function lowercase(values: unknown): string[] {
  return uniqueStrings(values).map((value) => value.toLowerCase());
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(String).map((value) => value.trim()).filter(Boolean)));
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

function toMongoId(id: string): mongoose.Types.ObjectId | string {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
}
