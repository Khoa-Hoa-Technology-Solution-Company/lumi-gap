import type { DetectedTag, DetectedTagFilterKey, DetectedTagKind, DetectedTagSource } from "@trend/shared-types";
import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client.js";
import { cache, hashKey } from "../../infrastructure/cache.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { normalizeTerm } from "./taxonomy.normalize.js";

/**
 * Query understanding: resolve a search query to catalogue entries (OpenAlex taxonomy nodes in
 * research_topics, keywords and admin-curated tags) WITHOUT an LLM. Phrases are matched deterministically against an
 * in-memory dictionary, with a trigram fallback for typos.
 *
 * `search.service.ts` decides what to do with the result (hard filter vs boost).
 */

export interface ResolveQueryTagsResult {
  /** Up to MAX_TAGS tags, strongest first. */
  detectedTags: DetectedTag[];
  best: DetectedTag | null;
  /** True when `best` explains the whole query (all content words) and was not a fuzzy match. */
  coversQuery: boolean;
  /** Active papers in the corpus when the dictionary was loaded (0 when unknown), to judge how narrow a tag is. */
  corpusSize: number;
  /**
   * The topic, subfield or keyword the WHOLE query names exactly (by name or alias, never fuzzy), including entries
   * with no local papers yet. It never feeds `detectedTags`/`best`; search uses it to offer fetching more papers.
   */
  coverageTarget: DetectedTag | null;
}

type BaseSource = Exclude<DetectedTagSource, "fuzzy">;

interface DictionaryEntry {
  kind: DetectedTagKind;
  id: string;
  openalexId?: string;
  name: string;
  paperCount: number;
  /** Works in the whole of OpenAlex; taxonomy nodes only. */
  worksCount?: number;
  source: BaseSource;
  filter: { key: DetectedTagFilterKey; value: string };
}

interface Candidate {
  tag: DetectedTag;
  /** Share of the query's content words inside the matched phrase. */
  coverage: number;
}

/**
 * Bump when the matching algorithm, confidences or the output shape change: cached results of an
 * older algorithm must not be served.
 */
const CACHE_VERSION = "v4";
const CACHE_TTL_SECONDS = 600;

const MAX_TAGS = 5;
const MAX_QUERY_CHARS = 200;
const MAX_NGRAM = 8;
const MIN_SINGLE_TOKEN_CHARS = 3;

const FUZZY_MIN_SIMILARITY = 0.5;
const FUZZY_CONFIDENCE_FACTOR = 0.8;
const FUZZY_LIMIT_PER_TABLE = 5;
const BROAD_LEVEL_FACTOR = 0.9;
/**
 * Curated tags are maintained by admins, so when a tag and a taxonomy node / keyword answer the same
 * phrase the tag wins: kind "tag" gets this bonus (capped at confidence 1). Because the cap makes an exact
 * name match tie with other exact matches, finalize() also orders kind "tag" first among equal confidences.
 */
const TAG_CONFIDENCE_BONUS = 0.01;

const SOURCE_CONFIDENCE: Record<BaseSource, number> = {
  name: 1,
  alias: 0.95,
  "openalex-keyword": 0.8,
};
/** Levels whose empty (zero-paper) entries are still indexed, so search can offer to fetch their papers. */
const BACKFILL_LEVELS: readonly string[] = ["topic", "subfield"];
/** Kinds a coverage hint can point at (a backfill can import papers for these). */
const COVERAGE_KINDS: ReadonlySet<DetectedTagKind> = new Set<DetectedTagKind>(["topic", "subfield", "keyword"]);
/** Rank used to keep the most trustworthy source when one entry reaches a phrase several ways. */
const SOURCE_RANK: Record<BaseSource, number> = { name: 3, alias: 2, "openalex-keyword": 1 };

const FILTER_KEY_BY_LEVEL: Record<string, DetectedTagFilterKey> = {
  topic: "topicIds",
  subfield: "subfieldIds",
  field: "fieldIds",
  domain: "domainIds",
};

const STOPWORDS: ReadonlySet<string> = new Set(
  [
    "a", "an", "the", "of", "in", "on", "for", "and", "or", "to", "with", "about", "using", "based", "via",
    "của", "và", "trong", "cho", "về", "các", "những", "là", "với",
  ].map(normalizeTerm),
);

/** Diacritics are stripped by normalizeTerm, so "đ" etc. are already handled; the list is normalized too. */
export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}

/* ------------------------------------------------------------------------------------------------ */
/* Dictionary                                                                                       */
/* ------------------------------------------------------------------------------------------------ */

type Dictionary = Map<string, DictionaryEntry[]>;

let dictionary: Dictionary | null = null;
let dictionaryLoadedAt = 0;
let corpusSize = 0;
let dictionaryLoad: Promise<Dictionary> | null = null;
/** Bumped by invalidateTaxonomyDictionary(); a load that started earlier must not be stored. */
let dictionaryGeneration = 0;

/** Drop the in-memory dictionary (and locally cached resolutions) so the next query sees admin edits. */
export function invalidateTaxonomyDictionary(): void {
  dictionary = null;
  dictionaryLoadedAt = 0;
  dictionaryGeneration += 1;
}

function addEntry(map: Dictionary, phrase: string, entry: DictionaryEntry): void {
  if (!phrase) return;
  const list = map.get(phrase);
  if (!list) {
    map.set(phrase, [entry]);
    return;
  }
  const existing = list.findIndex((item) => item.kind === entry.kind && item.id === entry.id);
  if (existing === -1) list.push(entry);
  else if (SOURCE_RANK[entry.source] > SOURCE_RANK[list[existing]!.source]) list[existing] = entry;
}

async function loadDictionary(): Promise<Dictionary> {
  const started = Date.now();
  const prisma = getPrisma();
  const [topics, keywords, tags, activePapers] = await Promise.all([
    // Keywords and tags without local papers can neither filter nor boost anything, so they are left out. Topics and
    // subfields that OpenAlex knows but the corpus lacks are kept (indexed by name/alias only) for coverage hints.
    prisma.researchTopic.findMany({
      where: {
        status: "active",
        OR: [
          { paperCount: { gte: 1 } },
          { paperCount: 0, worksCount: { gt: 0 }, level: { in: [...BACKFILL_LEVELS] } },
        ],
      },
      select: {
        id: true, level: true, openalexId: true, topicName: true, aliases: true, openalexKeywords: true,
        paperCount: true, worksCount: true,
      },
    }),
    prisma.keyword.findMany({
      where: { status: "active", paperCount: { gte: 1 } },
      select: { id: true, keywordName: true, normalizedName: true, aliases: true, paperCount: true },
    }),
    prisma.tag.findMany({
      where: { status: "active", paperCount: { gte: 1 } },
      select: { id: true, slug: true, name: true, paperCount: true },
    }),
    prisma.paper.count({ where: { dataStatus: "active" } }),
  ]);
  corpusSize = activePapers;

  const map: Dictionary = new Map();
  for (const row of topics) {
    const filterKey = FILTER_KEY_BY_LEVEL[row.level];
    if (!filterKey || !row.openalexId) continue;
    const empty = row.paperCount < 1;
    if (empty && !(BACKFILL_LEVELS.includes(row.level) && (row.worksCount ?? 0) > 0)) continue;
    const base = {
      kind: row.level as DetectedTagKind,
      id: row.id,
      openalexId: row.openalexId,
      name: row.topicName,
      paperCount: row.paperCount,
      ...(typeof row.worksCount === "number" ? { worksCount: row.worksCount } : {}),
      filter: { key: filterKey, value: row.openalexId },
    };
    addEntry(map, normalizeTerm(row.topicName), { ...base, source: "name" });
    for (const alias of row.aliases) addEntry(map, normalizeTerm(alias), { ...base, source: "alias" });
    // Empty entries stay out of the OpenAlex keyword index: those phrases are too noisy to suggest an import.
    if (row.level === "topic" && !empty) {
      for (const keyword of row.openalexKeywords) {
        addEntry(map, normalizeTerm(keyword), { ...base, source: "openalex-keyword" });
      }
    }
  }
  for (const row of keywords) {
    const base = {
      kind: "keyword" as const,
      id: row.id,
      name: row.keywordName,
      paperCount: row.paperCount,
      filter: { key: "keywordIds" as const, value: row.id },
    };
    addEntry(map, row.normalizedName || normalizeTerm(row.keywordName), { ...base, source: "name" });
    for (const alias of row.aliases) addEntry(map, alias, { ...base, source: "alias" });
  }
  for (const row of tags) {
    const base = {
      kind: "tag" as const,
      id: row.id,
      name: row.name,
      paperCount: row.paperCount,
      filter: { key: "tagIds" as const, value: row.id },
    };
    addEntry(map, normalizeTerm(row.name), { ...base, source: "name" });
    // The slug ("machine-learning") is the tag's stable alias.
    addEntry(map, normalizeTerm(row.slug.replace(/-/g, " ")), { ...base, source: "alias" });
  }

  logger.info(
    { phrases: map.size, topics: topics.length, keywords: keywords.length, tags: tags.length, ms: Date.now() - started },
    "taxonomy dictionary loaded",
  );
  return map;
}

async function getDictionary(): Promise<Dictionary> {
  const ttlMs = env.TAXONOMY_DICTIONARY_TTL_SECONDS * 1000;
  if (dictionary && Date.now() - dictionaryLoadedAt < ttlMs) return dictionary;
  if (dictionaryLoad) return dictionaryLoad;

  const generation = dictionaryGeneration;
  const stale = dictionary;
  const load = loadDictionary()
    .then((map) => {
      if (generation === dictionaryGeneration) {
        dictionary = map;
        dictionaryLoadedAt = Date.now();
      }
      return map;
    })
    .catch((err: unknown) => {
      // Keep serving the previous dictionary through a transient DB error rather than failing search.
      if (stale && generation === dictionaryGeneration) {
        logger.warn({ err }, "taxonomy dictionary reload failed; serving the previous dictionary");
        dictionaryLoadedAt = Date.now();
        return stale;
      }
      throw err;
    })
    .finally(() => {
      if (dictionaryLoad === load) dictionaryLoad = null;
    });
  dictionaryLoad = load;
  return load;
}

/* ------------------------------------------------------------------------------------------------ */
/* Matching                                                                                         */
/* ------------------------------------------------------------------------------------------------ */

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function confidenceFor(entry: DictionaryEntry, coverage: number): number {
  const level = entry.kind === "domain" || entry.kind === "field" ? BROAD_LEVEL_FACTOR : 1;
  return round3(applyTagBonus(entry.kind, SOURCE_CONFIDENCE[entry.source] * coverage * level));
}

function applyTagBonus(kind: DetectedTagKind, confidence: number): number {
  return kind === "tag" ? Math.min(1, confidence + TAG_CONFIDENCE_BONUS) : confidence;
}

function keepBest(candidates: Map<string, Candidate>, candidate: Candidate): void {
  const key = `${candidate.tag.kind}:${candidate.tag.id}`;
  const existing = candidates.get(key);
  if (!existing || candidate.tag.confidence > existing.tag.confidence) candidates.set(key, candidate);
}

function matchNgrams(map: Dictionary, tokens: string[]): Map<string, Candidate> {
  const candidates = new Map<string, Candidate>();
  const isContent = tokens.map((token) => !isStopword(token));
  const contentTotal = isContent.filter(Boolean).length;
  if (contentTotal === 0) return candidates;

  for (let n = Math.min(MAX_NGRAM, tokens.length); n >= 1; n -= 1) {
    for (let start = 0; start + n <= tokens.length; start += 1) {
      let contentInPhrase = 0;
      for (let i = start; i < start + n; i += 1) if (isContent[i]) contentInPhrase += 1;
      if (contentInPhrase === 0) continue;
      const phrase = tokens.slice(start, start + n).join(" ");
      if (n === 1 && (phrase.length < MIN_SINGLE_TOKEN_CHARS || isStopword(phrase))) continue;
      const entries = map.get(phrase);
      if (!entries) continue;
      const coverage = contentInPhrase / contentTotal;
      for (const entry of entries) {
        keepBest(candidates, {
          coverage,
          tag: {
            kind: entry.kind,
            id: entry.id,
            ...(entry.openalexId ? { openalexId: entry.openalexId } : {}),
            name: entry.name,
            paperCount: entry.paperCount,
            ...(entry.worksCount === undefined ? {} : { worksCount: entry.worksCount }),
            confidence: confidenceFor(entry, coverage),
            source: entry.source,
            matchedText: phrase,
            filter: entry.filter,
          },
        });
      }
    }
  }
  return candidates;
}

interface FuzzyRow {
  kind: string;
  id: string;
  openalex_id: string | null;
  name: string;
  paper_count: number;
  works_count?: number | null;
  similarity: number;
}

/** Trigram fallback for typos ("machine learnin"). Uses the GIN trigram indexes through the `%` operator. */
async function fuzzyCandidates(nq: string): Promise<Map<string, Candidate>> {
  const rows = await getPrisma().$queryRaw<FuzzyRow[]>(Prisma.sql`
    (SELECT 'keyword' AS kind, k.id::text AS id, NULL::text AS openalex_id, k.keyword_name AS name,
            k.paper_count::int AS paper_count, NULL::int AS works_count, similarity(k.normalized_name, ${nq})::float8 AS similarity
     FROM keywords k
     WHERE k.status = 'active' AND k.paper_count >= 1
       AND k.normalized_name % ${nq} AND similarity(k.normalized_name, ${nq}) >= ${FUZZY_MIN_SIMILARITY}
     ORDER BY similarity DESC, k.paper_count DESC
     LIMIT ${FUZZY_LIMIT_PER_TABLE})
    UNION ALL
    (SELECT t.level AS kind, t.id::text AS id, t.openalex_id AS openalex_id, t.topic_name AS name,
            t.paper_count::int AS paper_count, t.works_count::int AS works_count, similarity(lower(t.topic_name), ${nq})::float8 AS similarity
     FROM research_topics t
     WHERE t.status = 'active' AND t.openalex_id IS NOT NULL AND t.paper_count >= 1
       AND lower(t.topic_name) % ${nq} AND similarity(lower(t.topic_name), ${nq}) >= ${FUZZY_MIN_SIMILARITY}
     ORDER BY similarity DESC, t.paper_count DESC
     LIMIT ${FUZZY_LIMIT_PER_TABLE})
    UNION ALL
    (SELECT 'tag' AS kind, g.id::text AS id, NULL::text AS openalex_id, g.name AS name,
            g.paper_count::int AS paper_count, NULL::int AS works_count, similarity(lower(g.name), ${nq})::float8 AS similarity
     FROM tags g
     WHERE g.status = 'active' AND g.paper_count >= 1
       AND lower(g.name) % ${nq} AND similarity(lower(g.name), ${nq}) >= ${FUZZY_MIN_SIMILARITY}
     ORDER BY similarity DESC, g.paper_count DESC
     LIMIT ${FUZZY_LIMIT_PER_TABLE})
  `);

  const candidates = new Map<string, Candidate>();
  for (const row of rows) {
    const kind = row.kind as DetectedTagKind;
    let filter: DetectedTag["filter"];
    if (kind === "keyword") filter = { key: "keywordIds", value: row.id };
    else if (kind === "tag") filter = { key: "tagIds", value: row.id };
    else {
      const key = FILTER_KEY_BY_LEVEL[kind];
      if (!key || !row.openalex_id) continue;
      filter = { key, value: row.openalex_id };
    }
    keepBest(candidates, {
      coverage: 0,
      tag: {
        kind,
        id: row.id,
        ...(row.openalex_id ? { openalexId: row.openalex_id } : {}),
        name: row.name,
        paperCount: Number(row.paper_count),
        ...(row.works_count == null || kind === "keyword" || kind === "tag" ? {} : { worksCount: Number(row.works_count) }),
        confidence: round3(applyTagBonus(kind, Number(row.similarity) * FUZZY_CONFIDENCE_FACTOR)),
        source: "fuzzy",
        matchedText: nq,
        filter,
      },
    });
  }
  return candidates;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  return b.tag.confidence - a.tag.confidence
    || Number(b.tag.kind === "tag") - Number(a.tag.kind === "tag")
    || b.tag.paperCount - a.tag.paperCount;
}

/**
 * The best-populated entry whose exact name/alias is the whole query; zero-paper entries qualify. Coverage is about
 * what the corpus holds on the query, so a richer exact match of any other kind or source (a field, a curated tag, a
 * topic through its OpenAlex keywords) means it is not thin and there is no target.
 */
function pickCoverageTarget(candidates: Map<string, Candidate>): DetectedTag | null {
  const exact = [...candidates.values()].filter((candidate) => candidate.coverage === 1 && candidate.tag.source !== "fuzzy");
  const target = exact
    .filter(({ tag }) => (tag.source === "name" || tag.source === "alias") && COVERAGE_KINDS.has(tag.kind))
    .sort((a, b) => b.tag.paperCount - a.tag.paperCount || compareCandidates(a, b))[0]?.tag;
  if (!target || exact.some(({ tag }) => tag.paperCount > target.paperCount)) return null;
  return target;
}

/**
 * `ranking` feeds detectedTags/best and only ever holds entries with local papers; `all` may also hold the
 * zero-paper entries and is consulted for the coverage target alone.
 */
function finalize(ranking: Map<string, Candidate>, all: Map<string, Candidate> = ranking): ResolveQueryTagsResult {
  const ranked = [...ranking.values()].sort(compareCandidates).slice(0, MAX_TAGS);
  const top = ranked[0];
  return {
    detectedTags: ranked.map((candidate) => candidate.tag),
    best: top?.tag ?? null,
    coversQuery: !!top && top.coverage === 1 && top.tag.source !== "fuzzy",
    corpusSize,
    coverageTarget: pickCoverageTarget(all),
  };
}

const EMPTY: ResolveQueryTagsResult = {
  detectedTags: [], best: null, coversQuery: false, corpusSize: 0, coverageTarget: null,
};

function emptyResult(): ResolveQueryTagsResult {
  return { ...EMPTY, detectedTags: [] };
}

function cacheKey(nq: string): string {
  // The epoch only moves after invalidateTaxonomyDictionary(), so admin edits skip results cached before them.
  return `search:qtags:${CACHE_VERSION}:${hashKey(dictionaryGeneration ? [nq, dictionaryGeneration] : nq)}`;
}

/** Resolve a free-text search query to catalogue entries. Throws only when the catalogue cannot be read. */
export async function resolveQueryTags(q: string): Promise<ResolveQueryTagsResult> {
  const nq = normalizeTerm(q);
  if (!nq || nq.length > MAX_QUERY_CHARS) return emptyResult();

  const key = cacheKey(nq);
  try {
    const cached = await cache.get<ResolveQueryTagsResult>(key);
    if (cached && Array.isArray(cached.detectedTags)) return cached;
  } catch (err) {
    logger.warn({ err }, "query tag cache read failed; resolving without it");
  }

  const tokens = nq.split(" ");
  const matched = matchNgrams(await getDictionary(), tokens);
  // Zero-paper entries must not change ranking, so they are neither part of the ranking nor of the "nothing
  // matched" test that triggers the fuzzy fallback.
  const ranking = new Map([...matched].filter(([, candidate]) => candidate.tag.paperCount >= 1));
  const result = ranking.size === 0 && tokens.length >= 2
    ? finalize(await fuzzyCandidates(nq), matched)
    : finalize(ranking, matched);
  try {
    await cache.set(key, result, CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err }, "query tag cache write failed");
  }
  return result;
}
