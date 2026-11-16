import type { TrendTopicTaxonomy } from "@trend/shared-types";
import { openAlexGet, openAlexYearCounts, shortId } from "./trend.openalex-client.js";
import { DEFAULT_WORK_TYPES_CLAUSE, withScope } from "./trend.openalex-scope.js";
import { mapWithConcurrency } from "./trend.utils.js";

/**
 * The fixed population every trend is measured in: the Information Technology
 * group of disciplines. Spec: docs/superpowers/specs/2026-11-14-trend-eda-lifecycle-design.md §2.
 *
 * A topic's share is s_t = n_t / N_t · 100 with N_t = papers of the whole scope
 * in year t, so every topic has the same denominator and shares are comparable.
 * Changing the list changes every share: bump IT_SCOPE_VERSION with it. Verdicts
 * of two versions must not be compared.
 */
export const IT_SCOPE_VERSION = "it-v1";

export interface ScopeSubfield {
  /** OpenAlex subfield id, e.g. "1702". */
  id: string;
  name: string;
  layer: "core" | "related";
}

/** Core: the 11 subfields of the OpenAlex field Computer Science (17). Related: adjacent subfields of other fields. */
export const IT_SCOPE: readonly ScopeSubfield[] = [
  { id: "1702", name: "Artificial Intelligence", layer: "core" },
  { id: "1703", name: "Computational Theory and Mathematics", layer: "core" },
  { id: "1704", name: "Computer Graphics and Computer-Aided Design", layer: "core" },
  { id: "1705", name: "Computer Networks and Communications", layer: "core" },
  { id: "1706", name: "Computer Science Applications", layer: "core" },
  { id: "1707", name: "Computer Vision and Pattern Recognition", layer: "core" },
  { id: "1708", name: "Hardware and Architecture", layer: "core" },
  { id: "1709", name: "Human-Computer Interaction", layer: "core" },
  { id: "1710", name: "Information Systems", layer: "core" },
  { id: "1711", name: "Signal Processing", layer: "core" },
  { id: "1712", name: "Software", layer: "core" },
  { id: "2207", name: "Control and Systems Engineering", layer: "related" },
  { id: "1802", name: "Information Systems and Management", layer: "related" },
  { id: "2214", name: "Media Technology", layer: "related" },
  { id: "2611", name: "Modeling and Simulation", layer: "related" },
  { id: "2614", name: "Theoretical Computer Science", layer: "related" },
];

/** First year of the fixed span yearly series are fetched over, so one cached series serves every window. */
export const SERIES_FIRST_YEAR = 1900;

/** OpenAlex slows /works requests whose OR list has more than 10 values ("wide_or_filter"), so the scope is queried in chunks. */
const MAX_OR_VALUES = 10;
const TOPICS_PAGE_SIZE = 200;
const CONCURRENCY = 6;

/** Subfield ids of the scope in OR chunks of at most 10; the chunks are disjoint, so their counts add up. */
export function itScopeSubfieldChunks(): string[][] {
  const ids = IT_SCOPE.map((subfield) => subfield.id);
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += MAX_OR_VALUES) chunks.push(ids.slice(index, index + MAX_OR_VALUES));
  return chunks;
}

/** /works filter clauses that together cover the scope (a work has one primary topic, hence one subfield). */
export function itScopeWorkClauses(): string[] {
  return itScopeSubfieldChunks().map((ids) => `primary_topic.subfield.id:${ids.join("|")}`);
}

export function isInItScope(subfieldId: string | undefined | null): boolean {
  if (!subfieldId) return false;
  const id = shortId(subfieldId);
  return IT_SCOPE.some((subfield) => subfield.id === id);
}

/** Domain and field filters reach outside the IT scope, so scope-wide trend endpoints do not apply them and say so. */
export function widerThanItScope(query: { domains?: string[]; fields?: string[]; domainIds?: string[]; fieldIds?: string[] }): Array<{ filter: string; values: string[]; reason: string }> {
  const reason = "Trends cover the Information Technology scope only; filter by subfield or topic inside it.";
  return [
    { filter: "domains", values: [...(query.domains ?? []), ...(query.domainIds ?? [])] },
    { filter: "fields", values: [...(query.fields ?? []), ...(query.fieldIds ?? [])] },
  ]
    .filter((row) => row.values.length > 0)
    .map((row) => ({ ...row, reason }));
}

export interface ScopeTopic {
  /** Short upper-case OpenAlex topic id, e.g. "T10028". */
  id: string;
  name: string;
  taxonomy: TrendTopicTaxonomy;
}

type TopicEntity = {
  id: string;
  display_name?: string;
  domain?: { id: string; display_name: string };
  field?: { id: string; display_name: string };
  subfield?: { id: string; display_name: string };
};

/** Every OpenAlex topic of the scope, sorted by id. One /topics request per 200 topics of each subfield chunk. */
export async function itScopeTopics(): Promise<ScopeTopic[]> {
  const lists = await Promise.all(itScopeSubfieldChunks().map((ids) => topicsOfSubfields(ids)));
  const byId = new Map<string, ScopeTopic>();
  for (const entity of lists.flat()) {
    const id = shortId(entity.id).toUpperCase();
    byId.set(id, {
      id,
      name: entity.display_name ?? id,
      taxonomy: {
        openalexTopicId: id,
        ...(entity.domain ? { domainId: shortId(entity.domain.id), domainName: entity.domain.display_name } : {}),
        ...(entity.field ? { fieldId: shortId(entity.field.id), fieldName: entity.field.display_name } : {}),
        ...(entity.subfield ? { subfieldId: shortId(entity.subfield.id), subfieldName: entity.subfield.display_name } : {}),
      },
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function topicsOfSubfields(subfieldIds: string[]): Promise<TopicEntity[]> {
  const all: TopicEntity[] = [];
  for (let page = 1; ; page++) {
    const json = await openAlexGet<{ results?: TopicEntity[] }>("topics", {
      filter: `subfield.id:${subfieldIds.join("|")}`,
      per_page: String(TOPICS_PAGE_SIZE),
      page: String(page),
      select: "id,display_name,domain,field,subfield",
    });
    const results = json.results ?? [];
    all.push(...results);
    if (results.length < TOPICS_PAGE_SIZE) return all;
  }
}

function seriesSpan(): string {
  return `publication_year:${SERIES_FIRST_YEAR}-${new Date().getUTCFullYear()}`;
}

/**
 * N_t: papers of the whole scope per publication year. `plainFilter` is the
 * non-taxonomy part of the Data Scope (work types, language, ...). One request
 * per subfield chunk.
 */
export async function itScopeYearCounts(plainFilter: string = DEFAULT_WORK_TYPES_CLAUSE): Promise<Map<number, number>> {
  const series = await Promise.all(itScopeWorkClauses().map((clause) => openAlexYearCounts(withScope(plainFilter, clause, seriesSpan()))));
  const total = new Map<number, number>();
  for (const counts of series) for (const [year, count] of counts) total.set(year, (total.get(year) ?? 0) + count);
  return total;
}

/** n_t of every given topic per publication year, one request per topic, in the order of `topicIds`. */
export function topicYearCounts(topicIds: string[], plainFilter: string = DEFAULT_WORK_TYPES_CLAUSE): Promise<Array<Map<number, number>>> {
  const span = seriesSpan();
  return mapWithConcurrency(topicIds, CONCURRENCY, (id) => openAlexYearCounts(withScope(plainFilter, `primary_topic.id:${id}`, span)));
}
