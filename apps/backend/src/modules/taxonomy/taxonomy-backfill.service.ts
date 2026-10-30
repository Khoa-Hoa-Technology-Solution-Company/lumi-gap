import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { normalizeTerm, type TaxonomyLevel } from "./taxonomy.normalize.js";

export interface TaxonomyBackfillSummary { nodesCreated: number; topicLinks: number; keywordsCreated: number; keywordLinks: number }
type Db = PrismaClient | Prisma.TransactionClient;

const DEFAULT_BATCH_SIZE = 1000;
const MAX_MERGE_DEPTH = 5;

interface KeywordRow { id: string; normalized_name: string; status: string; merged_into_id: string | null }
interface AliasRow extends KeywordRow { aliases: string[] }

/**
 * Per-level source columns on paper_topics. `parent` is the short-id column of the parent level on the
 * same row; the topic level is keyed by openalex_topic_id, the others by their own short id column.
 */
const NODE_SOURCES: { level: TaxonomyLevel; id: string; name: string; parentLevel: TaxonomyLevel | null; parentId: string | null }[] = [
  { level: "domain", id: "domain_id", name: "domain_name", parentLevel: null, parentId: null },
  { level: "field", id: "field_id", name: "field_name", parentLevel: "domain", parentId: "domain_id" },
  { level: "subfield", id: "subfield_id", name: "subfield_name", parentLevel: "field", parentId: "field_id" },
  { level: "topic", id: "openalex_topic_id", name: "topic_name", parentLevel: "subfield", parentId: "subfield_id" },
];

async function timed<T>(step: string, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  const result = await run();
  logger.info({ step, durationMs: Date.now() - startedAt, result }, "taxonomy backfill step done");
  return result;
}

/** Dedupes raw spellings by normalized form (first-seen display name wins) and drops empty ones. */
function normalizeNames(rawNames: readonly string[]): { display: Map<string, string>; rawToNormalized: Map<string, string> } {
  const display = new Map<string, string>();
  const rawToNormalized = new Map<string, string>();
  for (const raw of rawNames) {
    const normalized = normalizeTerm(raw);
    if (!normalized) continue;
    rawToNormalized.set(raw, normalized);
    if (!display.has(normalized)) display.set(normalized, raw.trim());
  }
  return { display, rawToNormalized };
}

/**
 * Resolves normalized terms to keyword ids: exact normalized_name, then alias, then insert.
 * Merged keywords are followed to their survivor (bounded, loop-safe).
 */
async function resolveKeywordIds(db: Db, display: Map<string, string>): Promise<{ ids: Map<string, string>; created: number }> {
  const rows = new Map<string, KeywordRow>();
  // Sorted so concurrent ingests insert overlapping keywords in the same order and cannot deadlock.
  const wanted = [...display.keys()].sort();
  if (!wanted.length) return { ids: new Map(), created: 0 };

  const exact = await db.$queryRaw<KeywordRow[]>(Prisma.sql`SELECT id::text AS id, normalized_name, status, merged_into_id::text AS merged_into_id FROM keywords WHERE normalized_name = ANY(${wanted}::text[])`);
  for (const row of exact) rows.set(row.normalized_name, row);

  let missing = wanted.filter((term) => !rows.has(term));
  if (missing.length) {
    const byAlias = await db.$queryRaw<AliasRow[]>(Prisma.sql`SELECT id::text AS id, normalized_name, status, merged_into_id::text AS merged_into_id, aliases FROM keywords WHERE aliases && ${missing}::text[] ORDER BY normalized_name`);
    for (const row of byAlias) for (const alias of row.aliases) if (missing.includes(alias) && !rows.has(alias)) rows.set(alias, row);
    missing = wanted.filter((term) => !rows.has(term));
  }

  let created = 0;
  if (missing.length) {
    const names = missing.map((term) => display.get(term) ?? term);
    created = await db.$executeRaw(Prisma.sql`INSERT INTO keywords (keyword_name, normalized_name) SELECT n, nn FROM unnest(${names}::text[], ${missing}::text[]) AS t(n, nn) ON CONFLICT (normalized_name) DO NOTHING`);
    // Re-select so a concurrent writer that won the insert race is still resolved.
    const inserted = await db.$queryRaw<KeywordRow[]>(Prisma.sql`SELECT id::text AS id, normalized_name, status, merged_into_id::text AS merged_into_id FROM keywords WHERE normalized_name = ANY(${missing}::text[])`);
    for (const row of inserted) rows.set(row.normalized_name, row);
  }

  // Follow merged_into_id until a non-merged survivor (max depth, so a corrupt cycle cannot hang us).
  const ids = new Map<string, string>();
  let pending = new Map<string, string>();
  for (const [term, row] of rows) {
    if (row.status === "merged" && row.merged_into_id) pending.set(term, row.merged_into_id);
    else ids.set(term, row.id);
  }
  for (let depth = 0; depth < MAX_MERGE_DEPTH && pending.size; depth += 1) {
    const targetIds = [...new Set(pending.values())];
    const targets = await db.$queryRaw<KeywordRow[]>(Prisma.sql`SELECT id::text AS id, normalized_name, status, merged_into_id::text AS merged_into_id FROM keywords WHERE id = ANY(${targetIds}::uuid[])`);
    const byId = new Map(targets.map((row) => [row.id, row]));
    const next = new Map<string, string>();
    for (const [term, targetId] of pending) {
      const target = byId.get(targetId);
      if (!target) { ids.set(term, targetId); continue; }
      if (target.status === "merged" && target.merged_into_id) next.set(term, target.merged_into_id);
      else ids.set(term, target.id);
    }
    pending = next;
  }
  // Depth exhausted: keep the last known target rather than leaving the keyword unlinked.
  for (const [term, targetId] of pending) ids.set(term, targetId);
  return { ids, created };
}

/** Resolves the given raw keyword names and writes keyword_id onto matching paper_keywords rows. */
async function linkKeywordNames(db: Db, rawNames: readonly string[], paperId?: string): Promise<{ keywordsCreated: number; keywordLinks: number }> {
  const { display, rawToNormalized } = normalizeNames(rawNames);
  if (!display.size) return { keywordsCreated: 0, keywordLinks: 0 };
  const { ids, created } = await resolveKeywordIds(db, display);
  const names: string[] = [];
  const keywordIds: string[] = [];
  for (const [raw, normalized] of rawToNormalized) {
    const id = ids.get(normalized);
    if (id) { names.push(raw); keywordIds.push(id); }
  }
  if (!names.length) return { keywordsCreated: created, keywordLinks: 0 };
  const paperFilter = paperId ? Prisma.sql`AND pk.paper_id = ${paperId}::uuid` : Prisma.empty;
  const keywordLinks = await db.$executeRaw(Prisma.sql`UPDATE paper_keywords pk SET keyword_id = m.id FROM unnest(${names}::text[], ${keywordIds}::uuid[]) AS m(name, id) WHERE pk.keyword_name = m.name AND pk.keyword_id IS NULL ${paperFilter}`);
  return { keywordsCreated: created, keywordLinks };
}

async function ensureLevel(db: Db, source: (typeof NODE_SOURCES)[number]): Promise<number> {
  const { level, id, name, parentLevel, parentId } = source;
  const idCol = Prisma.raw(`pt.${id}`);
  const nameCol = Prisma.raw(`pt.${name}`);
  const parentCol = parentId ? Prisma.raw(`pt.${parentId}`) : null;
  const inserted = parentLevel && parentCol
    ? await db.$executeRaw(Prisma.sql`INSERT INTO research_topics (level, openalex_id, topic_name, parent_topic_id) SELECT DISTINCT ON (${idCol}) ${level}::text, ${idCol}, ${nameCol}, parent.id FROM paper_topics pt LEFT JOIN research_topics parent ON parent.level = ${parentLevel} AND parent.openalex_id = ${parentCol} WHERE ${idCol} IS NOT NULL AND ${nameCol} IS NOT NULL ORDER BY ${idCol}, (parent.id IS NULL) ON CONFLICT (level, openalex_id) DO NOTHING`)
    : await db.$executeRaw(Prisma.sql`INSERT INTO research_topics (level, openalex_id, topic_name) SELECT DISTINCT ON (${idCol}) ${level}::text, ${idCol}, ${nameCol} FROM paper_topics pt WHERE ${idCol} IS NOT NULL AND ${nameCol} IS NOT NULL ORDER BY ${idCol} ON CONFLICT (level, openalex_id) DO NOTHING`);
  if (parentLevel && parentCol) {
    // Nodes created by the OpenAlex sync (or an earlier run) may still lack a parent that is now resolvable.
    await db.$executeRaw(Prisma.sql`UPDATE research_topics child SET parent_topic_id = src.parent_id FROM (SELECT DISTINCT ${idCol} AS child_key, parent.id AS parent_id FROM paper_topics pt JOIN research_topics parent ON parent.level = ${parentLevel} AND parent.openalex_id = ${parentCol} WHERE ${idCol} IS NOT NULL) src WHERE child.level = ${level} AND child.openalex_id = src.child_key AND child.parent_topic_id IS NULL`);
  }
  return inserted;
}

export const taxonomyBackfillService = {
  async backfillAll(): Promise<TaxonomyBackfillSummary> {
    const nodesCreated = await timed("ensureNodesFromPapers", () => this.ensureNodesFromPapers());
    const topicLinks = await timed("linkTopics", () => this.linkTopics());
    const { keywordsCreated, keywordLinks } = await timed("linkKeywords", () => this.linkKeywords());
    await timed("refreshCounts", () => this.refreshCounts());
    return { nodesCreated, topicLinks, keywordsCreated, keywordLinks };
  },

  /** Inserts taxonomy nodes seen on papers but missing from research_topics, parents before children. */
  async ensureNodesFromPapers(): Promise<number> {
    const db = getPrisma();
    let total = 0;
    for (const source of NODE_SOURCES) total += await ensureLevel(db, source);
    return total;
  },

  async linkTopics(): Promise<number> {
    return getPrisma().$executeRaw`UPDATE paper_topics pt SET topic_id = rt.id FROM research_topics rt WHERE rt.level = 'topic' AND rt.openalex_id = pt.openalex_topic_id AND pt.topic_id IS DISTINCT FROM rt.id`;
  },

  async linkKeywords(options: { batchSize?: number } = {}): Promise<{ keywordsCreated: number; keywordLinks: number }> {
    const db = getPrisma();
    const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
    let keywordsCreated = 0;
    let keywordLinks = 0;
    let after = "";
    // Keyset on keyword_name: names that normalize to nothing stay unlinked, so "WHERE keyword_id IS NULL" alone would never advance.
    for (;;) {
      const page = await db.$queryRaw<{ keyword_name: string }[]>(Prisma.sql`SELECT DISTINCT keyword_name FROM paper_keywords WHERE keyword_id IS NULL AND keyword_name > ${after} ORDER BY keyword_name LIMIT ${batchSize}`);
      if (!page.length) break;
      const result = await linkKeywordNames(db, page.map((row) => row.keyword_name));
      keywordsCreated += result.keywordsCreated;
      keywordLinks += result.keywordLinks;
      after = page[page.length - 1]!.keyword_name;
      if (page.length < batchSize) break;
    }
    return { keywordsCreated, keywordLinks };
  },

  /** Recomputes distinct active-paper counts for keywords, taxonomy nodes and tags. */
  async refreshCounts(): Promise<void> {
    const db = getPrisma();
    await db.$executeRaw`UPDATE keywords k SET paper_count = COALESCE(c.n, 0) FROM keywords k2 LEFT JOIN (SELECT pk.keyword_id, COUNT(DISTINCT pk.paper_id)::int AS n FROM paper_keywords pk JOIN papers p ON p.id = pk.paper_id WHERE p.data_status = 'active' AND pk.keyword_id IS NOT NULL GROUP BY pk.keyword_id) c ON c.keyword_id = k2.id WHERE k.id = k2.id AND k.paper_count IS DISTINCT FROM COALESCE(c.n, 0)`;
    await db.$executeRaw`WITH apt AS (SELECT pt.paper_id, pt.topic_id, pt.subfield_id, pt.field_id, pt.domain_id FROM paper_topics pt JOIN papers p ON p.id = pt.paper_id WHERE p.data_status = 'active'), c AS (SELECT 'topic'::text AS level, topic_id::text AS key, COUNT(DISTINCT paper_id)::int AS n FROM apt WHERE topic_id IS NOT NULL GROUP BY topic_id UNION ALL SELECT 'subfield', subfield_id, COUNT(DISTINCT paper_id)::int FROM apt WHERE subfield_id IS NOT NULL GROUP BY subfield_id UNION ALL SELECT 'field', field_id, COUNT(DISTINCT paper_id)::int FROM apt WHERE field_id IS NOT NULL GROUP BY field_id UNION ALL SELECT 'domain', domain_id, COUNT(DISTINCT paper_id)::int FROM apt WHERE domain_id IS NOT NULL GROUP BY domain_id) UPDATE research_topics rt SET paper_count = COALESCE(c.n, 0) FROM research_topics r2 LEFT JOIN c ON c.level = r2.level AND c.key = CASE WHEN r2.level = 'topic' THEN r2.id::text ELSE r2.openalex_id END WHERE rt.id = r2.id AND rt.paper_count IS DISTINCT FROM COALESCE(c.n, 0)`;
    await db.$executeRaw`UPDATE tags t SET paper_count = COALESCE(c.n, 0) FROM tags t2 LEFT JOIN (SELECT ptag.tag_id, COUNT(DISTINCT ptag.paper_id)::int AS n FROM paper_tags ptag JOIN papers p ON p.id = ptag.paper_id WHERE p.data_status = 'active' GROUP BY ptag.tag_id) c ON c.tag_id = t2.id WHERE t.id = t2.id AND t.paper_count IS DISTINCT FROM COALESCE(c.n, 0)`;
  },

  /** Cheap per-paper link used inside the ingest transaction. Counts and taxonomy nodes are left to the backfill. */
  async linkPaperTaxonomy(db: Db, paperId: string): Promise<void> {
    await db.$executeRaw`UPDATE paper_topics pt SET topic_id = rt.id FROM research_topics rt WHERE pt.paper_id = ${paperId}::uuid AND rt.level = 'topic' AND rt.openalex_id = pt.openalex_topic_id AND pt.topic_id IS DISTINCT FROM rt.id`;
    const names = await db.$queryRaw<{ keyword_name: string }[]>(Prisma.sql`SELECT DISTINCT keyword_name FROM paper_keywords WHERE paper_id = ${paperId}::uuid AND keyword_id IS NULL`);
    if (names.length) await linkKeywordNames(db, names.map((row) => row.keyword_name), paperId);
  },
};
