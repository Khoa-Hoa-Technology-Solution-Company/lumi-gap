import type { TrendScopeLayer, TrendTopicTaxonomy } from "@trend/shared-types";
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
export const IT_SCOPE_VERSION = "it-v2";

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

export interface ScopeApplicationTopic {
  /** Upper-case OpenAlex topic id, e.g. "T12254". */
  id: string;
  name: string;
  /** OpenAlex subfield the topic belongs to; never one of IT_SCOPE (the clauses must stay disjoint). */
  subfieldId: string;
  /** Application area, for grouping on the Docs page. */
  area: "bioinformatics" | "health" | "education" | "finance" | "iot" | "other";
}

/**
 * Layer 3 (spec §7.2): single topics outside the 16 subfields where computing is
 * the main subject. Seed list proposed on 2026-11-19 from an OpenAlex topic search
 * and approved by the team the same day. A topic is
 * filtered by primary_topic.id, so adding or removing one changes N_t: bump IT_SCOPE_VERSION.
 */
export const IT_SCOPE_APPLICATION_TOPICS: readonly ScopeApplicationTopic[] = [
  { id: "T12254", name: "Machine Learning in Bioinformatics", subfieldId: "1312", area: "bioinformatics" },
  { id: "T10887", name: "Bioinformatics and Genomic Networks", subfieldId: "1312", area: "bioinformatics" },
  { id: "T11710", name: "Biomedical Text Mining and Ontologies", subfieldId: "2718", area: "bioinformatics" },
  { id: "T10211", name: "Computational Drug Discovery Methods", subfieldId: "3002", area: "bioinformatics" },
  { id: "T11396", name: "Artificial Intelligence in Healthcare", subfieldId: "3605", area: "health" },
  { id: "T10350", name: "Electronic Health Records Systems", subfieldId: "3605", area: "health" },
  { id: "T12422", name: "Radiomics and Machine Learning in Medical Imaging", subfieldId: "2741", area: "health" },
  { id: "T11446", name: "Mobile Health and mHealth Applications", subfieldId: "3600", area: "health" },
  { id: "T14414", name: "Artificial Intelligence in Education", subfieldId: "3304", area: "education" },
  { id: "T12171", name: "Open Education and E-Learning", subfieldId: "3304", area: "education" },
  { id: "T11995", name: "FinTech, Crowdfunding, Digital Finance", subfieldId: "1404", area: "finance" },
  { id: "T11326", name: "Stock Market Forecasting Methods", subfieldId: "1803", area: "finance" },
  { id: "T13420", name: "Arduino and IoT Applications", subfieldId: "2208", area: "iot" },
  { id: "T12079", name: "IoT Networks and Protocols", subfieldId: "2208", area: "iot" },
  { id: "T10761", name: "Vehicular Ad Hoc Networks (VANETs)", subfieldId: "2208", area: "iot" },
  { id: "T10616", name: "Smart Agriculture and AI", subfieldId: "1110", area: "iot" },
  { id: "T10429", name: "EEG and Brain-Computer Interfaces", subfieldId: "2805", area: "other" },
  { id: "T10020", name: "Quantum Information and Cryptography", subfieldId: "3107", area: "other" },
];

/** First year of the fixed span yearly series are fetched over, so one cached series serves every window. */
export const SERIES_FIRST_YEAR = 1900;

/** OpenAlex slows /works requests whose OR list has more than 10 values ("wide_or_filter"), so the scope is queried in chunks. */
const MAX_OR_VALUES = 10;
const TOPICS_PAGE_SIZE = 200;
const CONCURRENCY = 6;

function chunked(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += MAX_OR_VALUES) chunks.push(ids.slice(index, index + MAX_OR_VALUES));
  return chunks;
}

/** Subfield ids of the scope in OR chunks of at most 10; the chunks are disjoint, so their counts add up. */
export function itScopeSubfieldChunks(): string[][] {
  return chunked(IT_SCOPE.map((subfield) => subfield.id));
}

/** Layer-3 topic ids in OR chunks of at most 10. */
export function itScopeApplicationChunks(): string[][] {
  return chunked(IT_SCOPE_APPLICATION_TOPICS.map((topic) => topic.id));
}

/**
 * /works filter clauses that together cover the scope: the subfields of layers 1–2,
 * then the layer-3 topics. A work has one primary topic, hence one subfield, and
 * no layer-3 topic lies in a layer 1–2 subfield, so the clauses are disjoint and their counts add up.
 */
export function itScopeWorkClauses(): string[] {
  return [
    ...itScopeSubfieldChunks().map((ids) => `primary_topic.subfield.id:${ids.join("|")}`),
    ...itScopeApplicationChunks().map((ids) => `primary_topic.id:${ids.join("|")}`),
  ];
}

/** Whether a subfield is one of layers 1–2 (a layer-3 topic's subfield is not: only that topic is in scope). */
export function isItScopeSubfield(subfieldId: string | undefined | null): boolean {
  if (!subfieldId) return false;
  const id = shortId(subfieldId);
  return IT_SCOPE.some((subfield) => subfield.id === id);
}

export function isItScopeApplicationTopic(topicId: string | undefined | null): boolean {
  if (!topicId) return false;
  const id = shortId(topicId).toUpperCase();
  return IT_SCOPE_APPLICATION_TOPICS.some((topic) => topic.id === id);
}

/** Whether a topic is in the scope: its subfield is in layers 1–2, or it is a layer-3 topic. */
export function isInItScope(subfieldId: string | undefined | null, topicId?: string | null): boolean {
  return isItScopeSubfield(subfieldId) || isItScopeApplicationTopic(topicId);
}

export function scopeLayerOf(subfieldId: string | undefined | null, topicId?: string | null): TrendScopeLayer | undefined {
  if (isItScopeApplicationTopic(topicId)) return "application";
  const id = subfieldId ? shortId(subfieldId) : undefined;
  return IT_SCOPE.find((subfield) => subfield.id === id)?.layer;
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

/** Every OpenAlex topic of the scope (layers 1–3), sorted by id. One /topics request per 200 topics of each subfield chunk, plus one per layer-3 chunk. */
export async function itScopeTopics(): Promise<ScopeTopic[]> {
  const lists = await Promise.all([
    ...itScopeSubfieldChunks().map((ids) => topicsOf(`subfield.id:${ids.join("|")}`)),
    ...itScopeApplicationChunks().map((ids) => topicsOf(`id:${ids.join("|")}`)),
  ]);
  const byId = new Map<string, ScopeTopic>();
  for (const entity of lists.flat()) {
    const id = shortId(entity.id).toUpperCase();
    const layer = scopeLayerOf(entity.subfield?.id, id);
    byId.set(id, {
      id,
      name: entity.display_name ?? id,
      taxonomy: {
        openalexTopicId: id,
        ...(entity.domain ? { domainId: shortId(entity.domain.id), domainName: entity.domain.display_name } : {}),
        ...(entity.field ? { fieldId: shortId(entity.field.id), fieldName: entity.field.display_name } : {}),
        ...(entity.subfield ? { subfieldId: shortId(entity.subfield.id), subfieldName: entity.subfield.display_name } : {}),
        ...(layer ? { scopeLayer: layer } : {}),
      },
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function topicsOf(filter: string): Promise<TopicEntity[]> {
  const all: TopicEntity[] = [];
  for (let page = 1; ; page++) {
    const json = await openAlexGet<{ results?: TopicEntity[] }>("topics", {
      filter,
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
 * per clause of itScopeWorkClauses.
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
