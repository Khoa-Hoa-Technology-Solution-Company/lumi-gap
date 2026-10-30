import type {
  CatalogKeyword, KeywordStatus, TaxonomyLevel, TaxonomyNode, TaxonomyNodeDetail, TaxonomyStats,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import type {
  ListKeywordsQuery, ListNodesQuery, UpdateKeywordInput, UpdateNodeInput,
} from "./dto/taxonomy.schema.js";
import { normalizeAliases, normalizeTerm, TAXONOMY_LEVELS } from "./taxonomy.normalize.js";

type TopicRow = Awaited<ReturnType<ReturnType<typeof getPrisma>["researchTopic"]["findFirstOrThrow"]>>;
type KeywordRow = Awaited<ReturnType<ReturnType<typeof getPrisma>["keyword"]["findFirstOrThrow"]>>;

const CHILDREN_LIMIT = 50;

function toNode(row: TopicRow, childCount: number): TaxonomyNode {
  return {
    id: row.id,
    level: row.level as TaxonomyLevel,
    name: row.topicName,
    description: row.description ?? null,
    openalexId: row.openalexId ?? null,
    parentId: row.parentTopicId ?? null,
    aliases: row.aliases,
    worksCount: row.worksCount,
    paperCount: row.paperCount,
    status: row.status as TaxonomyNode["status"],
    childCount,
    syncedAt: row.syncedAt ? row.syncedAt.toISOString() : null,
  };
}

export function toCatalogKeyword(row: KeywordRow): CatalogKeyword {
  return {
    id: row.id,
    keywordName: row.keywordName,
    normalizedName: row.normalizedName,
    aliases: row.aliases,
    status: row.status as KeywordStatus,
    mergedIntoId: row.mergedIntoId ?? null,
    paperCount: row.paperCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function meta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function childCounts(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const groups = await getPrisma().researchTopic.groupBy({
    by: ["parentTopicId"],
    where: { parentTopicId: { in: ids } },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.parentTopicId as string, g._count._all]));
}

export const taxonomyService = {
  async listNodes(query: ListNodesQuery) {
    const prisma = getPrisma();
    const where: Prisma.ResearchTopicWhereInput = {};
    if (query.level) where.level = query.level;
    if (query.parentId) where.parentTopicId = query.parentId;
    if (query.status) where.status = query.status;
    const q = query.q?.trim();
    if (q) {
      const normalized = normalizeTerm(q);
      where.OR = [
        { topicName: { contains: q, mode: "insensitive" } },
        ...(normalized ? [{ aliases: { has: normalized } }] : []),
      ];
    }
    const orderBy: Prisma.ResearchTopicOrderByWithRelationInput[] = query.sort === "name"
      ? [{ topicName: "asc" }, { id: "asc" }]
      : query.sort === "worksCount"
        ? [{ worksCount: "desc" }, { topicName: "asc" }, { id: "asc" }]
        : [{ paperCount: "desc" }, { topicName: "asc" }, { id: "asc" }];

    const [total, rows] = await Promise.all([
      prisma.researchTopic.count({ where }),
      prisma.researchTopic.findMany({
        where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
      }),
    ]);
    const counts = await childCounts(rows.map((r) => r.id));
    return {
      data: rows.map((r) => toNode(r, counts.get(r.id) ?? 0)),
      meta: meta(query.page, query.pageSize, total),
    };
  },

  async getNode(id: string): Promise<TaxonomyNodeDetail> {
    const prisma = getPrisma();
    const row = await prisma.researchTopic.findUnique({ where: { id } });
    if (!row) throw AppError.notFound("Taxonomy node not found");

    // The tree is at most four levels deep; the guard also stops a corrupted parent cycle.
    const chain: TopicRow[] = [];
    const seen = new Set<string>([row.id]);
    let parentId = row.parentTopicId;
    while (parentId && chain.length < TAXONOMY_LEVELS.length && !seen.has(parentId)) {
      const parent = await prisma.researchTopic.findUnique({ where: { id: parentId } });
      if (!parent) break;
      seen.add(parent.id);
      chain.unshift(parent);
      parentId = parent.parentTopicId;
    }

    const [children, childTotal] = await Promise.all([
      prisma.researchTopic.findMany({
        where: { parentTopicId: row.id },
        orderBy: [{ paperCount: "desc" }, { topicName: "asc" }, { id: "asc" }],
        take: CHILDREN_LIMIT,
      }),
      prisma.researchTopic.count({ where: { parentTopicId: row.id } }),
    ]);
    const grandCounts = await childCounts(children.map((c) => c.id));
    return {
      ...toNode(row, childTotal),
      openalexKeywords: row.openalexKeywords,
      // Ancestors only need their display fields; childCount is not meaningful for them.
      ancestors: chain.map((a) => toNode(a, 0)),
      children: children.map((c) => toNode(c, grandCounts.get(c.id) ?? 0)),
    };
  },

  async updateNode(id: string, input: UpdateNodeInput): Promise<TaxonomyNode> {
    const prisma = getPrisma();
    const existing = await prisma.researchTopic.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw AppError.notFound("Taxonomy node not found");
    const data: Prisma.ResearchTopicUpdateInput = {};
    if (input.aliases !== undefined) data.aliases = normalizeAliases(input.aliases);
    if (input.status !== undefined) data.status = input.status;
    if (input.description !== undefined) data.description = input.description;
    const row = await prisma.researchTopic.update({ where: { id }, data });
    const counts = await childCounts([row.id]);
    return toNode(row, counts.get(row.id) ?? 0);
  },

  async listKeywords(query: ListKeywordsQuery) {
    const prisma = getPrisma();
    const where: Prisma.KeywordWhereInput = { status: query.status };
    const q = query.q?.trim();
    if (q) {
      const normalized = normalizeTerm(q);
      if (normalized) {
        where.OR = [
          { normalizedName: { contains: normalized, mode: "insensitive" } },
          { aliases: { has: normalized } },
        ];
      } else {
        where.keywordName = { contains: q, mode: "insensitive" };
      }
    }
    const orderBy: Prisma.KeywordOrderByWithRelationInput[] = query.sort === "name"
      ? [{ keywordName: "asc" }, { id: "asc" }]
      : [{ paperCount: "desc" }, { keywordName: "asc" }, { id: "asc" }];
    const [total, rows] = await Promise.all([
      prisma.keyword.count({ where }),
      prisma.keyword.findMany({
        where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
      }),
    ]);
    return { data: rows.map(toCatalogKeyword), meta: meta(query.page, query.pageSize, total) };
  },

  async updateKeyword(id: string, input: UpdateKeywordInput): Promise<CatalogKeyword> {
    const prisma = getPrisma();
    const existing = await prisma.keyword.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Keyword not found");
    if (existing.status === "merged") {
      throw AppError.conflict("Keyword was merged into another keyword; edit the target instead");
    }
    const data: Prisma.KeywordUpdateInput = {};
    if (input.keywordName !== undefined) data.keywordName = input.keywordName;
    if (input.aliases !== undefined) {
      data.aliases = normalizeAliases(input.aliases).filter((a) => a !== existing.normalizedName);
    }
    if (input.status !== undefined) data.status = input.status;
    return toCatalogKeyword(await prisma.keyword.update({ where: { id }, data }));
  },

  /**
   * Fold `sourceId` into `targetId`: papers, tag rules, aliases and earlier merges all move to the
   * target, and the source stays as a tombstone (status merged) so old ids still resolve.
   */
  async mergeKeywords(sourceId: string, targetId: string): Promise<CatalogKeyword> {
    if (sourceId === targetId) throw AppError.badRequest("A keyword cannot be merged into itself");
    return getPrisma().$transaction(async (tx) => {
      const source = await tx.keyword.findUnique({ where: { id: sourceId } });
      const target = await tx.keyword.findUnique({ where: { id: targetId } });
      if (!source) throw AppError.notFound("Source keyword not found");
      if (!target) throw AppError.notFound("Target keyword not found");
      if (source.status === "merged") throw AppError.conflict("Source keyword is already merged");
      if (target.status === "merged") {
        throw AppError.conflict("Target keyword is merged; merge into its survivor instead");
      }
      if (target.status === "hidden") throw AppError.badRequest("Cannot merge into a hidden keyword");

      await tx.paperKeyword.updateMany({ where: { keywordId: source.id }, data: { keywordId: target.id } });

      // tag_rules is unique on (tag_id, keyword_id): drop source rules whose tag already has a target rule.
      const targetRules = await tx.tagRule.findMany({
        where: { keywordId: target.id }, select: { tagId: true },
      });
      if (targetRules.length) {
        await tx.tagRule.deleteMany({
          where: { keywordId: source.id, tagId: { in: targetRules.map((r) => r.tagId) } },
        });
      }
      await tx.tagRule.updateMany({ where: { keywordId: source.id }, data: { keywordId: target.id } });

      // Keywords merged into the source earlier now point at the survivor.
      await tx.keyword.updateMany({ where: { mergedIntoId: source.id }, data: { mergedIntoId: target.id } });

      const aliases = normalizeAliases([...target.aliases, ...source.aliases, source.normalizedName])
        .filter((a) => a !== target.normalizedName);
      await tx.keyword.update({
        where: { id: source.id },
        data: { status: "merged", mergedIntoId: target.id, aliases: [], paperCount: 0 },
      });

      const rows = await tx.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(DISTINCT pk.paper_id)::int AS count
        FROM paper_keywords pk
        JOIN papers p ON p.id = pk.paper_id
        WHERE pk.keyword_id = ${target.id}::uuid AND p.data_status = 'active'`);
      const paperCount = Number(rows[0]?.count ?? 0);

      return toCatalogKeyword(await tx.keyword.update({
        where: { id: target.id }, data: { aliases, paperCount },
      }));
    });
  },

  async stats(): Promise<TaxonomyStats> {
    const prisma = getPrisma();
    const [papers, coverage, levels, keywordGroups, tagGroups, domains, topics] = await Promise.all([
      prisma.paper.count({ where: { dataStatus: "active" } }),
      prisma.$queryRaw<Array<{ with_topic: number; with_keyword: number }>>(Prisma.sql`
        SELECT
          (SELECT COUNT(DISTINCT pt.paper_id)::int FROM paper_topics pt
             JOIN papers p ON p.id = pt.paper_id
             WHERE pt.topic_id IS NOT NULL AND p.data_status = 'active') AS with_topic,
          (SELECT COUNT(DISTINCT pk.paper_id)::int FROM paper_keywords pk
             JOIN papers p ON p.id = pk.paper_id
             WHERE pk.keyword_id IS NOT NULL AND p.data_status = 'active') AS with_keyword`),
      prisma.researchTopic.groupBy({ by: ["level"], _count: { _all: true } }),
      prisma.keyword.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.tag.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.researchTopic.findMany({
        where: { level: "domain", status: "active" },
        orderBy: [{ paperCount: "desc" }, { topicName: "asc" }],
        take: 10,
        select: { id: true, topicName: true, paperCount: true },
      }),
      prisma.researchTopic.findMany({
        where: { level: "topic", status: "active" },
        orderBy: [{ paperCount: "desc" }, { topicName: "asc" }],
        take: 10,
        select: { id: true, topicName: true, paperCount: true },
      }),
    ]);
    const nodesByLevel: Record<TaxonomyLevel, number> = { domain: 0, field: 0, subfield: 0, topic: 0 };
    for (const g of levels) {
      if (g.level in nodesByLevel) nodesByLevel[g.level as TaxonomyLevel] = g._count._all;
    }
    const keywords = { active: 0, merged: 0, hidden: 0 };
    for (const g of keywordGroups) {
      if (g.status in keywords) keywords[g.status as keyof typeof keywords] = g._count._all;
    }
    const tags = { active: 0, archived: 0 };
    for (const g of tagGroups) {
      if (g.status in tags) tags[g.status as keyof typeof tags] = g._count._all;
    }
    const brief = (r: { id: string; topicName: string; paperCount: number }) => ({
      id: r.id, name: r.topicName, paperCount: r.paperCount,
    });
    return {
      papers,
      withTopic: Number(coverage[0]?.with_topic ?? 0),
      withKeyword: Number(coverage[0]?.with_keyword ?? 0),
      nodesByLevel,
      keywords,
      tags,
      topDomains: domains.map(brief),
      topTopics: topics.map(brief),
    };
  },
};
