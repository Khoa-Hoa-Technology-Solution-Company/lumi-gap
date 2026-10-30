/**
 * Loads the OpenAlex taxonomy (domain > field > subfield > topic) into `research_topics`.
 * Re-running is safe: rows are upserted on (level, openalex_id) and only OpenAlex-owned columns are
 * written, so admin-managed `aliases` and `status` survive every sync.
 */
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { appendOpenAlexIdentity, fetchWithRetry } from "../api-sync/providers/openalex.client.js";
import { TAXONOMY_LEVELS, type TaxonomyLevel } from "./taxonomy.normalize.js";

const OPENALEX_ROOT = "https://api.openalex.org";
const PER_PAGE = 200;
const UPSERT_BATCH_SIZE = 500;
const MAX_PAGES_PER_LEVEL = 200;

const LEVEL_PATH: Record<TaxonomyLevel, string> = { domain: "domains", field: "fields", subfield: "subfields", topic: "topics" };
const PARENT_LEVEL: Record<TaxonomyLevel, "domain" | "field" | "subfield" | null> = { domain: null, field: "domain", subfield: "field", topic: "subfield" };
const SELECT: Record<TaxonomyLevel, string> = {
  domain: "id,display_name,description,works_count",
  field: "id,display_name,description,works_count,domain",
  subfield: "id,display_name,description,works_count,field",
  topic: "id,display_name,description,works_count,subfield,keywords",
};

interface OpenAlexRef { id?: string | null }
export interface OpenAlexTaxonomyEntity {
  id: string;
  display_name?: string | null;
  description?: string | null;
  works_count?: number | null;
  /** Live API returns `{ id, display_name, score }` objects; plain strings are accepted too. */
  keywords?: Array<string | { display_name?: string | null }> | null;
  domain?: OpenAlexRef | null;
  field?: OpenAlexRef | null;
  subfield?: OpenAlexRef | null;
}

export interface TaxonomyNodeInput {
  level: TaxonomyLevel;
  openalexId: string;
  topicName: string;
  description: string | null;
  worksCount: number;
  openalexKeywords: string[];
  /** Short OpenAlex id of the parent one level up; null for domains. */
  parentOpenalexId: string | null;
}

export type TaxonomySyncSummary = Record<TaxonomyLevel, number>;

/** "https://openalex.org/T10028" -> "T10028". */
export function shortOpenAlexId(id: string | null | undefined): string | null {
  const last = id?.trim().split("/").filter(Boolean).pop();
  return last ? last : null;
}

/** Maps one OpenAlex entity of the given level to a row input; null when it has no usable id or name. */
export function mapOpenAlexTaxonomyEntity(level: TaxonomyLevel, raw: OpenAlexTaxonomyEntity): TaxonomyNodeInput | null {
  const openalexId = shortOpenAlexId(raw.id);
  const topicName = raw.display_name?.trim();
  if (!openalexId || !topicName) return null;
  const parentLevel = PARENT_LEVEL[level];
  const parentOpenalexId = parentLevel ? shortOpenAlexId(raw[parentLevel]?.id) : null;
  const keywords = level === "topic" && Array.isArray(raw.keywords)
    ? [...new Set(raw.keywords.map((keyword) => (typeof keyword === "string" ? keyword : keyword?.display_name ?? "").trim()).filter(Boolean))]
    : [];
  return {
    level,
    openalexId,
    topicName,
    description: raw.description?.trim() || null,
    worksCount: Number.isFinite(raw.works_count) ? Math.max(0, Math.trunc(raw.works_count as number)) : 0,
    openalexKeywords: keywords,
    parentOpenalexId,
  };
}

export function buildTaxonomyPageUrl(level: TaxonomyLevel, cursor: string): string {
  const url = new URL(`${OPENALEX_ROOT}/${LEVEL_PATH[level]}`);
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("cursor", cursor);
  url.searchParams.set("select", SELECT[level]);
  appendOpenAlexIdentity(url);
  return url.toString();
}

/**
 * One parameterized statement per batch (rows travel as a single jsonb parameter). Only OpenAlex-owned
 * columns are in the DO UPDATE SET list; `aliases` and `status` are deliberately absent so admin edits
 * are never overwritten.
 */
export function buildTaxonomyUpsertSql(level: TaxonomyLevel, rows: Array<TaxonomyNodeInput & { parentId: string | null }>): Prisma.Sql {
  const payload = JSON.stringify(rows.map((row) => ({
    openalex_id: row.openalexId,
    topic_name: row.topicName,
    description: row.description,
    works_count: row.worksCount,
    openalex_keywords: row.openalexKeywords,
    parent_topic_id: row.parentId,
  })));
  return Prisma.sql`
    INSERT INTO "research_topics" ("level", "openalex_id", "topic_name", "description", "works_count", "openalex_keywords", "parent_topic_id", "synced_at")
    SELECT ${level}::varchar, r."openalex_id", r."topic_name", r."description", r."works_count",
      ARRAY(SELECT jsonb_array_elements_text(r."openalex_keywords")), r."parent_topic_id", now()
    FROM jsonb_to_recordset(${payload}::jsonb) AS r("openalex_id" text, "topic_name" text, "description" text, "works_count" integer, "openalex_keywords" jsonb, "parent_topic_id" uuid)
    ON CONFLICT ("level", "openalex_id") DO UPDATE SET
      "topic_name" = EXCLUDED."topic_name",
      "description" = EXCLUDED."description",
      "works_count" = EXCLUDED."works_count",
      "openalex_keywords" = EXCLUDED."openalex_keywords",
      "parent_topic_id" = EXCLUDED."parent_topic_id",
      "synced_at" = now(),
      "updated_at" = now()`;
}

interface TaxonomyPage { meta?: { next_cursor?: string | null }; results?: unknown[] }

async function* fetchLevelPages(level: TaxonomyLevel): AsyncGenerator<OpenAlexTaxonomyEntity[]> {
  let cursor: string | null = "*";
  let pages = 0;
  while (cursor && pages < MAX_PAGES_PER_LEVEL) {
    const page = (await fetchWithRetry(buildTaxonomyPageUrl(level, cursor))) as unknown as TaxonomyPage;
    pages += 1;
    const results = (page.results ?? []) as OpenAlexTaxonomyEntity[];
    if (results.length > 0) yield results;
    cursor = results.length > 0 ? page.meta?.next_cursor ?? null : null;
  }
}

async function loadParentIds(level: TaxonomyLevel): Promise<Map<string, string>> {
  const rows = await getPrisma().researchTopic.findMany({ where: { level, openalexId: { not: null } }, select: { id: true, openalexId: true } });
  const ids = new Map<string, string>();
  for (const row of rows) if (row.openalexId) ids.set(row.openalexId, row.id);
  return ids;
}

async function syncLevel(level: TaxonomyLevel): Promise<number> {
  const parentLevel = PARENT_LEVEL[level];
  const parentIds = parentLevel ? await loadParentIds(parentLevel) : new Map<string, string>();
  // Keyed by id: a repeated id inside one upsert batch would make ON CONFLICT fail.
  const byId = new Map<string, TaxonomyNodeInput>();
  for await (const results of fetchLevelPages(level)) {
    for (const raw of results) {
      const node = mapOpenAlexTaxonomyEntity(level, raw);
      if (node) byId.set(node.openalexId, node);
    }
    logger.info({ level, fetched: byId.size }, "taxonomy sync: page fetched");
  }
  const nodes = [...byId.values()];

  let orphans = 0;
  const rows = nodes.map((node) => {
    const parentId = node.parentOpenalexId ? parentIds.get(node.parentOpenalexId) ?? null : null;
    if (node.parentOpenalexId && !parentId) orphans += 1;
    return { ...node, parentId };
  });
  if (orphans > 0) logger.warn({ level, orphans }, "taxonomy sync: parent not found, stored without parent");

  const prisma = getPrisma();
  for (let start = 0; start < rows.length; start += UPSERT_BATCH_SIZE) {
    await prisma.$executeRaw(buildTaxonomyUpsertSql(level, rows.slice(start, start + UPSERT_BATCH_SIZE)));
  }
  logger.info({ level, upserted: rows.length }, "taxonomy sync: level done");
  return rows.length;
}

export const taxonomySyncService = {
  async syncAll(options: { levels?: TaxonomyLevel[] } = {}): Promise<TaxonomySyncSummary> {
    const wanted = new Set<TaxonomyLevel>(options.levels?.length ? options.levels : TAXONOMY_LEVELS);
    const summary: TaxonomySyncSummary = { domain: 0, field: 0, subfield: 0, topic: 0 };
    // Fixed order so each level can resolve its parent ids.
    for (const level of TAXONOMY_LEVELS) {
      if (wanted.has(level)) summary[level] = await syncLevel(level);
    }
    return summary;
  },
};
