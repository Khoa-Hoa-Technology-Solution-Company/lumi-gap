import type { TrendScopeNotice } from "@trend/shared-types";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { shortId } from "./trend.openalex-client.js";
import type { TrendsOverviewQuery } from "./dto/trends.schema.js";

/** The Data Scope facet filters shared by every trend query schema. */
export type TrendScopeFilters = Pick<
  TrendsOverviewQuery,
  | "paperKinds"
  | "openAccessStatuses"
  | "providers"
  | "sources"
  | "languages"
  | "citationBands"
  | "domains"
  | "fields"
  | "subfields"
  | "topics"
  | "domainIds"
  | "fieldIds"
  | "subfieldIds"
  | "topicIds"
>;

export interface OpenAlexScope {
  /** Comma-joined OpenAlex filter clauses (AND), without publication_year.
   *  Empty string when no filter applies. Append with `withScope`. */
  filter: string;
  /** Scope without the taxonomy clauses (domain/field/subfield/topic), used
   *  for reference populations that set their own taxonomy filter. */
  nonTaxonomyFilter: string;
  /** Narrowest taxonomy level the scope filters on, null when none. */
  narrowestTaxonomy: (typeof TAXONOMY_LEVELS)[number]["column"] | null;
  notice: TrendScopeNotice;
}

/**
 * Work types counted when the user picks none. OpenAlex also indexes millions
 * of non-publication records (e.g. 21M "dataset" records for 2024–2026, mostly
 * biodiversity data dumps), which would otherwise dominate every count.
 */
export const DEFAULT_WORK_TYPES = ["article", "review", "preprint", "conference-paper", "book-chapter"] as const;
export const DEFAULT_WORK_TYPES_CLAUSE = `type:${DEFAULT_WORK_TYPES.join("|")}`;

const CITATION_BAND_RANGES: Record<string, string> = {
  "0-9": "0-9",
  "10-49": "10-49",
  "50-99": "50-99",
  "100-499": "100-499",
  "500-999": "500-999",
  "1000+": ">999",
};

const TAXONOMY_LEVELS = [
  { names: "domains", ids: "domainIds", filter: "primary_topic.domain.id", column: "domain" },
  { names: "fields", ids: "fieldIds", filter: "primary_topic.field.id", column: "field" },
  { names: "subfields", ids: "subfieldIds", filter: "primary_topic.subfield.id", column: "subfield" },
  { names: "topics", ids: "topicIds", filter: "primary_topic.id", column: "topic" },
] as const;

/**
 * Translates Data Scope filters into OpenAlex filter clauses. Taxonomy names
 * are resolved to OpenAlex ids through the local taxonomy table (a lookup, not
 * trend data). Filters with no OpenAlex equivalent are reported in `notice`.
 */
export async function buildOpenAlexScope(query: TrendScopeFilters): Promise<OpenAlexScope> {
  const plain: string[] = [];
  const taxonomy: string[] = [];
  const ignored: TrendScopeNotice["ignoredFilters"] = [];
  let narrowestTaxonomy: OpenAlexScope["narrowestTaxonomy"] = null;

  if (query.paperKinds?.length) addOr(plain, "type", query.paperKinds);
  else plain.push(DEFAULT_WORK_TYPES_CLAUSE);
  addOr(plain, "open_access.oa_status", query.openAccessStatuses);
  addOr(plain, "language", query.languages?.map((value) => value.toLowerCase()));
  if (query.citationBands?.length) {
    addOr(plain, "cited_by_count", query.citationBands.map((band) => CITATION_BAND_RANGES[band]).filter(Boolean) as string[]);
  }
  if (query.sources?.length) {
    const ids = query.sources.filter((value) => /^S\d+$/i.test(shortId(value))).map((value) => shortId(value).toUpperCase());
    const names = query.sources.filter((value) => !/^S\d+$/i.test(shortId(value)));
    addOr(plain, "primary_location.source.id", ids);
    if (names.length) ignored.push({ filter: "sources", values: names, reason: "Source names have no OpenAlex id; pick the source from the OpenAlex facet." });
  }
  if (query.providers?.length) {
    ignored.push({ filter: "providers", values: query.providers, reason: "The provider facet describes the local corpus and does not exist in OpenAlex." });
  }

  for (const level of TAXONOMY_LEVELS) {
    const ids = new Set((query[level.ids] ?? []).map((value) => shortId(value)).filter(Boolean));
    const names = query[level.names] ?? [];
    if (names.length) {
      const resolved = await resolveTaxonomyNames(level.column, names);
      for (const id of resolved.ids) ids.add(id);
      if (resolved.unresolved.length) {
        ignored.push({ filter: level.names, values: resolved.unresolved, reason: "No OpenAlex id is known for these names." });
      }
    }
    addOr(taxonomy, level.filter, [...ids].map((id) => (level.column === "topic" ? id.toUpperCase() : id)));
    if (ids.size > 0) narrowestTaxonomy = level.column;
  }

  return {
    filter: [...plain, ...taxonomy].join(","),
    nonTaxonomyFilter: plain.join(","),
    narrowestTaxonomy,
    notice: { ignoredFilters: ignored },
  };
}

/** Joins non-empty filter clauses with "," (AND). */
export function withScope(...clauses: Array<string | undefined>): string {
  return clauses.filter((clause): clause is string => Boolean(clause)).join(",");
}

export function yearsClause(yearFrom: number, yearTo: number): string {
  return `publication_year:${yearFrom}-${yearTo}`;
}

/** Inclusive publication date range, dates as YYYY-MM-DD. */
export function datesClause(from: string, to: string): string {
  return `from_publication_date:${from},to_publication_date:${to}`;
}

function addOr(clauses: string[], key: string, values?: string[]) {
  const unique = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  // OpenAlex accepts up to 100 OR values per filter.
  if (unique.length) clauses.push(`${key}:${unique.slice(0, 100).join("|")}`);
}

async function resolveTaxonomyNames(column: "domain" | "field" | "subfield" | "topic", names: string[]) {
  const rows = await getPrisma().paperTopic.findMany({
    where:
      column === "domain" ? { domainName: { in: names } }
      : column === "field" ? { fieldName: { in: names } }
      : column === "subfield" ? { subfieldName: { in: names } }
      : { topicName: { in: names } },
    select: { domainId: true, domainName: true, fieldId: true, fieldName: true, subfieldId: true, subfieldName: true, openalexTopicId: true, topicName: true },
    distinct: column === "domain" ? ["domainName"] : column === "field" ? ["fieldName"] : column === "subfield" ? ["subfieldName"] : ["topicName"],
  });
  const byName = new Map<string, string>();
  for (const row of rows) {
    const [name, id] =
      column === "domain" ? [row.domainName, row.domainId]
      : column === "field" ? [row.fieldName, row.fieldId]
      : column === "subfield" ? [row.subfieldName, row.subfieldId]
      : [row.topicName, row.openalexTopicId];
    if (name && id) byName.set(name, shortId(id));
  }
  return {
    ids: names.map((name) => byName.get(name)).filter((id): id is string => Boolean(id)),
    unresolved: names.filter((name) => !byName.has(name)),
  };
}
