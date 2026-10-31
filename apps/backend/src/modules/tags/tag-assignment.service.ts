import type {
  PaperTagSource, TagApplyJob, TagApplyResult, TaggedPaper, TagStatus,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { taggingQueue } from "../../infrastructure/queue.js";
import type { ListTagPapersQuery } from "./dto/tag.schema.js";

type PrismaClientLike = ReturnType<typeof getPrisma>;
/** Either the client or a transaction client; only the raw-SQL entry points are used here. */
type Db = Pick<PrismaClientLike, "$queryRaw" | "$executeRaw">;

export const APPLY_TAG_JOB = "apply-tag";
export const APPLY_ALL_TAGS_JOB = "apply-all-tags";
export interface ApplyTagJobData { tagId: string }

/** The centroid scan and the big INSERT can run for a while on a large corpus. */
const APPLY_TX_OPTIONS = { maxWait: 10_000, timeout: 300_000 } as const;

/** paper_topics column that carries each taxonomy level's short OpenAlex id (topic nodes use topic_id). */
const LEVEL_COLUMN = { subfield: "subfield_id", field: "field_id", domain: "domain_id" } as const;

export interface RuleNode { id: string; level: string; openalexId: string | null }
export interface RuleLike {
  effect: string;
  researchTopicId: string | null;
  keywordId: string | null;
}
export interface TagRuleMatch {
  /** Papers matching ANY include rule. Null when the rules include nothing. */
  include: Prisma.Sql | null;
  /** Papers matching ANY exclude rule. Null when there are no exclude rules. */
  exclude: Prisma.Sql | null;
}

/** One EXISTS per taxonomy level / keyword set, OR-ed together. Null when the rules name nothing. */
function matchSql(topics: readonly RuleNode[], keywordIds: readonly string[]): Prisma.Sql | null {
  const parts: Prisma.Sql[] = [];
  const topicNodeIds = topics.filter((t) => t.level === "topic").map((t) => t.id);
  if (topicNodeIds.length) {
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM paper_topics pt WHERE pt.paper_id = p.id AND pt.topic_id = ANY(${topicNodeIds}::uuid[]))`);
  }
  for (const [level, column] of Object.entries(LEVEL_COLUMN)) {
    const ids = topics
      .filter((t) => t.level === level && t.openalexId)
      .map((t) => t.openalexId as string);
    if (ids.length) {
      parts.push(Prisma.sql`EXISTS (SELECT 1 FROM paper_topics pt WHERE pt.paper_id = p.id AND ${Prisma.raw(`pt.${column}`)} = ANY(${ids}::text[]))`);
    }
  }
  if (keywordIds.length) {
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM paper_keywords pk WHERE pk.paper_id = p.id AND pk.keyword_id = ANY(${[...keywordIds]}::uuid[]))`);
  }
  return parts.length ? Prisma.sql`(${Prisma.join(parts, " OR ")})` : null;
}

/**
 * Build the SQL predicates (over `papers p`) of a tag's rules: include = any include rule,
 * exclude = any exclude rule. Topic nodes match by pt.topic_id, higher levels by their OpenAlex id.
 */
export function buildTagRuleMatch(rules: readonly RuleLike[], nodes: readonly RuleNode[]): TagRuleMatch {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const pick = (effect: string) => ({
    topics: rules
      .filter((r) => r.effect === effect && r.researchTopicId && nodeById.has(r.researchTopicId))
      .map((r) => nodeById.get(r.researchTopicId as string)!),
    keywordIds: rules.filter((r) => r.effect === effect && r.keywordId).map((r) => r.keywordId as string),
  });
  const include = pick("include");
  const exclude = pick("exclude");
  return {
    include: matchSql(include.topics, include.keywordIds),
    exclude: matchSql(exclude.topics, exclude.keywordIds),
  };
}

/** Load a tag's rules and the taxonomy nodes they point at, then build the match predicates. */
export async function loadTagRuleMatch(tagId: string, prisma: PrismaClientLike = getPrisma()): Promise<TagRuleMatch> {
  const rules = await prisma.tagRule.findMany({ where: { tagId } });
  const topicIds = [...new Set(rules.flatMap((r) => (r.researchTopicId ? [r.researchTopicId] : [])))];
  const nodes = topicIds.length
    ? await prisma.researchTopic.findMany({
      where: { id: { in: topicIds } }, select: { id: true, level: true, openalexId: true },
    })
    : [];
  return buildTagRuleMatch(rules, nodes);
}

async function loadTag(id: string, prisma: PrismaClientLike = getPrisma()) {
  const row = await prisma.tag.findUnique({ where: { id } });
  if (!row) throw AppError.notFound("Tag not found");
  return row;
}

async function loadActiveTag(id: string, prisma: PrismaClientLike = getPrisma()) {
  const row = await loadTag(id, prisma);
  if (row.status !== "active") throw AppError.conflict("Tag is archived");
  return row;
}

/** tags.paper_count = distinct ACTIVE papers carrying the tag, blocked rows excluded. Returns the new count. */
async function refreshPaperCount(db: Db, tagId: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ paper_count: number }>>(Prisma.sql`
    UPDATE tags t
    SET paper_count = (
      SELECT COUNT(DISTINCT pt.paper_id)::int
      FROM paper_tags pt
      JOIN papers p ON p.id = pt.paper_id
      WHERE pt.tag_id = t.id AND pt.source <> 'blocked' AND p.data_status = 'active')
    WHERE t.id = ${tagId}::uuid
    RETURNING t.paper_count`);
  return Number(rows[0]?.paper_count ?? 0);
}

async function countBySource(db: Db, tagId: string): Promise<Record<PaperTagSource, number>> {
  const rows = await db.$queryRaw<Array<{ source: string; n: number }>>(Prisma.sql`
    SELECT pt.source, COUNT(*)::int AS n
    FROM paper_tags pt
    JOIN papers p ON p.id = pt.paper_id
    WHERE pt.tag_id = ${tagId}::uuid AND p.data_status = 'active'
    GROUP BY pt.source`);
  const counts: Record<PaperTagSource, number> = { rule: 0, embedding: 0, manual: 0, blocked: 0 };
  for (const row of rows) {
    if (row.source in counts) counts[row.source as PaperTagSource] = Number(row.n);
  }
  return counts;
}

function resultOf(tagId: string, counts: Record<PaperTagSource, number>, reason: string | null): TagApplyResult {
  return {
    tagId,
    ruleTagged: counts.rule,
    embeddingTagged: counts.embedding,
    manual: counts.manual,
    blocked: counts.blocked,
    paperCount: counts.rule + counts.embedding + counts.manual,
    embeddingSkippedReason: reason,
  };
}

/** Drops the tag's automatic rows (rule + embedding); manual and blocked rows stay. */
async function clearAutomaticRows(db: Db, tagId: string): Promise<void> {
  await db.$executeRaw(Prisma.sql`DELETE FROM paper_tags WHERE tag_id = ${tagId}::uuid AND source IN ('rule', 'embedding')`);
}

/**
 * Add papers close to the centroid of the tag's rule + manual papers. Returns why it did not run, if it did not.
 * The centroid is computed in SQL (AVG over pgvector) so no vector leaves the database.
 */
async function expandByEmbedding(db: Db, tagId: string, exclude: Prisma.Sql | null): Promise<string | null> {
  if (!env.TAG_EMBEDDING_ENABLED) return "disabled";

  const seedRows = await db.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS n
    FROM paper_tags pt
    JOIN papers p ON p.id = pt.paper_id
    WHERE pt.tag_id = ${tagId}::uuid AND pt.source IN ('rule', 'manual')
      AND p.data_status = 'active' AND p.embedding IS NOT NULL`);
  const seeds = Number(seedRows[0]?.n ?? 0);
  if (seeds < env.TAG_EMBEDDING_MIN_SEED) {
    return `only ${seeds} seed papers have embeddings, need ${env.TAG_EMBEDDING_MIN_SEED}`;
  }

  const excludeClause = exclude ? Prisma.sql` AND NOT ${exclude}` : Prisma.empty;
  await db.$executeRaw(Prisma.sql`
    WITH centroid AS (
      SELECT AVG(p.embedding) AS v
      FROM paper_tags pt
      JOIN papers p ON p.id = pt.paper_id
      WHERE pt.tag_id = ${tagId}::uuid AND pt.source IN ('rule', 'manual')
        AND p.data_status = 'active' AND p.embedding IS NOT NULL
    ), candidates AS (
      SELECT p.id, 1 - (p.embedding <=> c.v) AS similarity
      FROM papers p
      CROSS JOIN centroid c
      WHERE p.data_status = 'active' AND p.embedding IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM paper_tags x WHERE x.paper_id = p.id AND x.tag_id = ${tagId}::uuid)${excludeClause}
        AND 1 - (p.embedding <=> c.v) >= ${env.TAG_EMBEDDING_MIN_SIMILARITY}::float8
      ORDER BY p.embedding <=> c.v
      LIMIT ${env.TAG_EMBEDDING_MAX_PAPERS}::int
    )
    INSERT INTO paper_tags (paper_id, tag_id, source, confidence)
    SELECT id, ${tagId}::uuid, 'embedding', LEAST(1, GREATEST(0, similarity))
    FROM candidates
    ON CONFLICT (paper_id, tag_id) DO NOTHING`);
  return null;
}

interface TaggedRow {
  paper_id: string;
  title: string;
  publication_year: number | null;
  citation_count: number | null;
  source: string;
  confidence: number | null;
  created_at: Date;
}

function toTaggedPaper(row: TaggedRow): TaggedPaper {
  return {
    paperId: row.paper_id,
    title: row.title,
    publicationYear: Number(row.publication_year ?? 0),
    citationCount: Number(row.citation_count ?? 0),
    source: row.source as PaperTagSource,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    taggedAt: row.created_at.toISOString(),
  };
}

const SOURCE_ORDER = Prisma.sql`CASE pt.source WHEN 'manual' THEN 0 WHEN 'rule' THEN 1 WHEN 'embedding' THEN 2 ELSE 3 END`;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function toJob(jobId: string | undefined, tagId: string | null): TagApplyJob {
  return { jobId: String(jobId ?? ""), tagId };
}

export const tagAssignmentService = {
  /** Recompute one tag: rule matches, then embedding expansion. Manual and blocked rows always win. */
  async applyTag(tagId: string): Promise<TagApplyResult> {
    const prisma = getPrisma();
    const tag = await loadTag(tagId, prisma);

    if ((tag.status as TagStatus) === "archived") {
      return prisma.$transaction(async (tx) => {
        await clearAutomaticRows(tx, tagId);
        await refreshPaperCount(tx, tagId);
        return resultOf(tagId, await countBySource(tx, tagId), "tag archived");
      }, APPLY_TX_OPTIONS);
    }

    const match = await loadTagRuleMatch(tagId, prisma);
    return prisma.$transaction(async (tx) => {
      await clearAutomaticRows(tx, tagId);
      if (match.include) {
        const excludeClause = match.exclude ? Prisma.sql` AND NOT ${match.exclude}` : Prisma.empty;
        // DO NOTHING: an existing manual or blocked row for the paper wins over the rule.
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO paper_tags (paper_id, tag_id, source)
          SELECT p.id, ${tagId}::uuid, 'rule'
          FROM papers p
          WHERE p.data_status = 'active' AND ${match.include}${excludeClause}
          ON CONFLICT (paper_id, tag_id) DO NOTHING`);
      }
      const skipped = await expandByEmbedding(tx, tagId, match.exclude);
      await refreshPaperCount(tx, tagId);
      return resultOf(tagId, await countBySource(tx, tagId), skipped);
    }, APPLY_TX_OPTIONS);
  },

  /** Apply every tag in turn. One tag failing is logged and does not stop the rest. */
  async applyAllTags(): Promise<{ results: TagApplyResult[]; failures: Array<{ tagId: string; message: string }> }> {
    const tags = await getPrisma().tag.findMany({
      select: { id: true }, orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const results: TagApplyResult[] = [];
    const failures: Array<{ tagId: string; message: string }> = [];
    for (const { id } of tags) {
      try {
        results.push(await tagAssignmentService.applyTag(id));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ tagId: id, error }, "tag apply failed; continuing with the next tag");
        failures.push({ tagId: id, message });
      }
    }
    return { results, failures };
  },

  /** Manually tag papers. Also un-blocks a paper an admin removed earlier. */
  async addPapers(tagId: string, paperIds: readonly string[]): Promise<TaggedPaper[]> {
    const prisma = getPrisma();
    await loadActiveTag(tagId, prisma);
    const ids = [...new Set(paperIds)];
    const found = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM papers WHERE id = ANY(${ids}::uuid[])`,
    );
    const known = new Set(found.map((r) => r.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length) throw AppError.notFound(`Papers not found: ${missing.join(", ")}`);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO paper_tags (paper_id, tag_id, source, confidence)
        SELECT x, ${tagId}::uuid, 'manual', NULL FROM unnest(${ids}::uuid[]) AS x
        ON CONFLICT (paper_id, tag_id) DO UPDATE
          SET source = 'manual', confidence = NULL, created_at = now()`);
      await refreshPaperCount(tx, tagId);
    });
    return tagAssignmentService.fetchTagged(tagId, ids);
  },

  /** Manual rows are deleted; rule/embedding rows become `blocked` so automatic tagging keeps the paper out. */
  async removePaper(tagId: string, paperId: string): Promise<{ paperId: string; source: "blocked" | null }> {
    const prisma = getPrisma();
    await loadTag(tagId, prisma);
    const outcome = await prisma.$transaction(async (tx) => {
      const deleted = await tx.$queryRaw<Array<{ paper_id: string }>>(Prisma.sql`
        DELETE FROM paper_tags
        WHERE tag_id = ${tagId}::uuid AND paper_id = ${paperId}::uuid AND source = 'manual'
        RETURNING paper_id`);
      let source: "blocked" | null = null;
      if (!deleted.length) {
        const blocked = await tx.$queryRaw<Array<{ paper_id: string }>>(Prisma.sql`
          UPDATE paper_tags SET source = 'blocked', confidence = NULL
          WHERE tag_id = ${tagId}::uuid AND paper_id = ${paperId}::uuid AND source IN ('rule', 'embedding')
          RETURNING paper_id`);
        if (!blocked.length) return null;
        source = "blocked";
      }
      await refreshPaperCount(tx, tagId);
      return { paperId, source };
    });
    if (!outcome) throw AppError.notFound("Paper is not tagged with this tag");
    return outcome;
  },

  /** Remove a block, then re-run the tag so its rules may add the paper back. */
  async unblockPaper(tagId: string, paperId: string): Promise<TagApplyJob> {
    const prisma = getPrisma();
    await loadTag(tagId, prisma);
    const removed = await prisma.$queryRaw<Array<{ paper_id: string }>>(Prisma.sql`
      DELETE FROM paper_tags
      WHERE tag_id = ${tagId}::uuid AND paper_id = ${paperId}::uuid AND source = 'blocked'
      RETURNING paper_id`);
    if (!removed.length) throw AppError.conflict("Paper is not blocked for this tag");
    return tagAssignmentService.enqueueApplyTag(tagId);
  },

  async listPapers(tagId: string, query: ListTagPapersQuery) {
    const prisma = getPrisma();
    await loadTag(tagId, prisma);
    const conditions: Prisma.Sql[] = [
      Prisma.sql`pt.tag_id = ${tagId}::uuid`,
      Prisma.sql`p.data_status = 'active'`,
    ];
    if (query.source) conditions.push(Prisma.sql`pt.source = ${query.source}`);
    const q = query.q?.trim();
    if (q) conditions.push(Prisma.sql`p.title ILIKE ${`%${escapeLike(q)}%`}`);
    const where = Prisma.join(conditions, " AND ");

    const [counts, rows] = await Promise.all([
      prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS count FROM paper_tags pt JOIN papers p ON p.id = pt.paper_id WHERE ${where}`),
      prisma.$queryRaw<TaggedRow[]>(Prisma.sql`
        SELECT pt.paper_id, p.title, p.publication_year, p.citation_count, pt.source, pt.confidence, pt.created_at
        FROM paper_tags pt
        JOIN papers p ON p.id = pt.paper_id
        WHERE ${where}
        ORDER BY ${SOURCE_ORDER}, pt.confidence DESC NULLS LAST, p.citation_count DESC, p.id
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`),
    ]);
    const total = Number(counts[0]?.count ?? 0);
    return {
      data: rows.map(toTaggedPaper),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  },

  async fetchTagged(tagId: string, paperIds: readonly string[]): Promise<TaggedPaper[]> {
    const rows = await getPrisma().$queryRaw<TaggedRow[]>(Prisma.sql`
      SELECT pt.paper_id, p.title, p.publication_year, p.citation_count, pt.source, pt.confidence, pt.created_at
      FROM paper_tags pt
      JOIN papers p ON p.id = pt.paper_id
      WHERE pt.tag_id = ${tagId}::uuid AND pt.paper_id = ANY(${[...paperIds]}::uuid[])
      ORDER BY p.citation_count DESC, p.id`);
    return rows.map(toTaggedPaper);
  },

  async enqueueApplyTag(tagId: string): Promise<TagApplyJob> {
    try {
      const job = await taggingQueue.add(APPLY_TAG_JOB, { tagId } satisfies ApplyTagJobData);
      return toJob(job.id, tagId);
    } catch (error) {
      logger.error({ tagId, error }, "could not enqueue tag apply job");
      throw AppError.serviceUnavailable("Could not queue the tagging job; try again shortly");
    }
  },

  async enqueueApplyAll(): Promise<TagApplyJob> {
    try {
      const job = await taggingQueue.add(APPLY_ALL_TAGS_JOB, {});
      return toJob(job.id, null);
    } catch (error) {
      logger.error({ error }, "could not enqueue apply-all-tags job");
      throw AppError.serviceUnavailable("Could not queue the tagging job; try again shortly");
    }
  },

  /** Best-effort enqueue after an admin write: a Redis outage must not fail the write itself. */
  async tryEnqueueApplyTag(tagId: string): Promise<void> {
    try {
      await taggingQueue.add(APPLY_TAG_JOB, { tagId } satisfies ApplyTagJobData);
    } catch (error) {
      logger.warn({ tagId, error }, "could not enqueue tag apply job; the nightly run will pick the change up");
    }
  },
};
