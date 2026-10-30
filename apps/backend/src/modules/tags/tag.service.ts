import type {
  Tag, TagDetail, TagPreview, TagRule, TagRuleEffect, TagRuleKind, TagStatus, TaxonomyLevel,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { invalidateTaxonomyDictionary } from "../taxonomy/query-tag-resolver.js";
import { slugifyTag } from "../taxonomy/taxonomy.normalize.js";
import type {
  CreateTagInput, ListTagsQuery, ReplaceRulesInput, UpdateTagInput,
} from "./dto/tag.schema.js";
import { loadTagRuleMatch, tagAssignmentService } from "./tag-assignment.service.js";

type PrismaClientLike = ReturnType<typeof getPrisma>;
/** Either the client or a transaction client. */
type Db = Pick<PrismaClientLike, "researchTopic" | "keyword" | "tagRule">;
type TagRow = Awaited<ReturnType<PrismaClientLike["tag"]["findFirstOrThrow"]>>;
type RuleRow = Awaited<ReturnType<PrismaClientLike["tagRule"]["findFirstOrThrow"]>>;
type RuleInput = ReplaceRulesInput["rules"][number];

interface ResolvedRule {
  ruleKind: TagRuleKind;
  effect: TagRuleEffect;
  researchTopicId: string | null;
  keywordId: string | null;
}

const PREVIEW_SAMPLE = 10;
const MERGE_HOPS = 5;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function toTag(row: TagRow, ruleCount: number): Tag {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    status: row.status as TagStatus,
    color: row.color ?? null,
    paperCount: row.paperCount,
    ruleCount,
    createdById: row.createdById ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ruleCount(tagId: string, db: Db = getPrisma()): Promise<number> {
  return db.tagRule.count({ where: { tagId } });
}

async function loadTag(id: string, db: PrismaClientLike = getPrisma()): Promise<TagRow> {
  const row = await db.tag.findUnique({ where: { id } });
  if (!row) throw AppError.notFound("Tag not found");
  return row;
}

/**
 * Validate rule targets and normalize them: every target must exist, a merged keyword is replaced by its
 * survivor, duplicates collapse, and the same target with two different effects is rejected.
 */
async function resolveRules(db: Db, inputs: readonly RuleInput[]): Promise<ResolvedRule[]> {
  const topicIds = [...new Set(inputs.flatMap((r) => (r.ruleKind === "topic" ? [r.researchTopicId] : [])))];
  if (topicIds.length) {
    const found = await db.researchTopic.findMany({ where: { id: { in: topicIds } }, select: { id: true } });
    const known = new Set(found.map((t) => t.id));
    const missing = topicIds.filter((id) => !known.has(id));
    if (missing.length) throw AppError.notFound(`Taxonomy node not found: ${missing.join(", ")}`);
  }

  // id -> survivor id, following merged_into_id up to MERGE_HOPS hops.
  const survivor = new Map<string, string>();
  const keywordIds = [...new Set(inputs.flatMap((r) => (r.ruleKind === "keyword" ? [r.keywordId] : [])))];
  if (keywordIds.length) {
    const loaded = new Map<string, { id: string; status: string; mergedIntoId: string | null }>();
    let pending = keywordIds;
    for (let hop = 0; hop <= MERGE_HOPS && pending.length; hop += 1) {
      const rows = await db.keyword.findMany({
        where: { id: { in: pending } }, select: { id: true, status: true, mergedIntoId: true },
      });
      for (const row of rows) loaded.set(row.id, row);
      const missing = pending.filter((id) => !loaded.has(id));
      if (missing.length) throw AppError.notFound(`Keyword not found: ${missing.join(", ")}`);
      pending = [...new Set(rows
        .filter((r) => r.status === "merged" && r.mergedIntoId && !loaded.has(r.mergedIntoId))
        .map((r) => r.mergedIntoId as string))];
    }
    for (const id of keywordIds) {
      let current = loaded.get(id);
      let hops = 0;
      while (current && current.status === "merged" && current.mergedIntoId && hops <= MERGE_HOPS) {
        current = loaded.get(current.mergedIntoId);
        hops += 1;
      }
      if (!current || current.status === "merged") {
        throw AppError.badRequest("Keyword merge chain could not be resolved", { keywordId: id });
      }
      survivor.set(id, current.id);
    }
  }

  const byTarget = new Map<string, ResolvedRule>();
  for (const input of inputs) {
    const effect: TagRuleEffect = input.effect ?? "include";
    const resolved: ResolvedRule = input.ruleKind === "topic"
      ? { ruleKind: "topic", effect, researchTopicId: input.researchTopicId, keywordId: null }
      : { ruleKind: "keyword", effect, researchTopicId: null, keywordId: survivor.get(input.keywordId) ?? input.keywordId };
    const key = `${resolved.ruleKind}:${resolved.researchTopicId ?? resolved.keywordId}`;
    const existing = byTarget.get(key);
    if (existing && existing.effect !== effect) {
      throw AppError.badRequest("A rule target cannot be both included and excluded", { target: key });
    }
    if (!existing) byTarget.set(key, resolved);
  }
  return [...byTarget.values()];
}

async function describeRules(rows: RuleRow[], db: Db = getPrisma()): Promise<TagRule[]> {
  const topicIds = rows.flatMap((r) => (r.researchTopicId ? [r.researchTopicId] : []));
  const keywordIds = rows.flatMap((r) => (r.keywordId ? [r.keywordId] : []));
  const [topics, keywords] = await Promise.all([
    topicIds.length
      ? db.researchTopic.findMany({ where: { id: { in: topicIds } }, select: { id: true, topicName: true, level: true } })
      : Promise.resolve([]),
    keywordIds.length
      ? db.keyword.findMany({ where: { id: { in: keywordIds } }, select: { id: true, keywordName: true } })
      : Promise.resolve([]),
  ]);
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const keywordById = new Map(keywords.map((k) => [k.id, k]));
  return rows.map((r) => {
    const topic = r.researchTopicId ? topicById.get(r.researchTopicId) : undefined;
    const keyword = r.keywordId ? keywordById.get(r.keywordId) : undefined;
    return {
      id: r.id,
      tagId: r.tagId,
      ruleKind: r.ruleKind as TagRuleKind,
      effect: r.effect as TagRuleEffect,
      researchTopicId: r.researchTopicId ?? null,
      keywordId: r.keywordId ?? null,
      target: topic
        ? { id: topic.id, name: topic.topicName, level: topic.level as TaxonomyLevel }
        : keyword ? { id: keyword.id, name: keyword.keywordName } : null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

async function detail(id: string): Promise<TagDetail> {
  const prisma = getPrisma();
  const tag = await loadTag(id, prisma);
  const rules = await prisma.tagRule.findMany({ where: { tagId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return { ...toTag(tag, rules.length), rules: await describeRules(rules) };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** After an admin write: the query resolver sees the new tag, and the worker re-applies the tag (best effort). */
async function afterTagWrite(tagId: string): Promise<void> {
  invalidateTaxonomyDictionary();
  await tagAssignmentService.tryEnqueueApplyTag(tagId);
}

export const tagService = {
  async list(query: ListTagsQuery) {
    const prisma = getPrisma();
    const where: Prisma.TagWhereInput = { status: query.status };
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: slugifyTag(q) || q.toLowerCase(), mode: "insensitive" } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.tag.count({ where }),
      prisma.tag.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const groups = rows.length
      ? await prisma.tagRule.groupBy({
        by: ["tagId"], where: { tagId: { in: rows.map((r) => r.id) } }, _count: { _all: true },
      })
      : [];
    const counts = new Map(groups.map((g) => [g.tagId, g._count._all]));
    return {
      data: rows.map((r) => toTag(r, counts.get(r.id) ?? 0)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  },

  async create(actorId: string | undefined, input: CreateTagInput): Promise<TagDetail> {
    const prisma = getPrisma();
    const slug = input.slug ?? slugifyTag(input.name);
    if (!slug) throw AppError.badRequest("Could not derive a slug from the tag name; provide one");
    const taken = await prisma.tag.findUnique({ where: { slug }, select: { id: true } });
    if (taken) throw AppError.conflict("A tag with this slug already exists", { slug });

    try {
      const id = await prisma.$transaction(async (tx) => {
        const rules = await resolveRules(tx, input.rules ?? []);
        const tag = await tx.tag.create({
          data: {
            slug,
            name: input.name,
            description: input.description ?? null,
            color: input.color ?? null,
            createdById: actorId && UUID_RE.test(actorId) ? actorId : null,
          },
        });
        if (rules.length) {
          await tx.tagRule.createMany({ data: rules.map((r) => ({ tagId: tag.id, ...r })) });
        }
        return tag.id;
      });
      const created = await detail(id);
      await afterTagWrite(id);
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) throw AppError.conflict("A tag with this slug already exists", { slug });
      throw error;
    }
  },

  async get(id: string): Promise<TagDetail> {
    return detail(id);
  },

  async update(id: string, input: UpdateTagInput): Promise<Tag> {
    const prisma = getPrisma();
    await loadTag(id, prisma);
    const data: Prisma.TagUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.color !== undefined) data.color = input.color;
    if (input.status !== undefined) data.status = input.status;
    const row = await prisma.tag.update({ where: { id }, data });
    if (input.name !== undefined || input.status !== undefined) await afterTagWrite(id);
    return toTag(row, await ruleCount(id));
  },

  async replaceRules(id: string, input: ReplaceRulesInput): Promise<TagDetail> {
    const prisma = getPrisma();
    await loadTag(id, prisma);
    await prisma.$transaction(async (tx) => {
      const rules = await resolveRules(tx, input.rules);
      await tx.tagRule.deleteMany({ where: { tagId: id } });
      if (rules.length) {
        await tx.tagRule.createMany({ data: rules.map((r) => ({ tagId: id, ...r })) });
      }
    });
    await afterTagWrite(id);
    return detail(id);
  },

  /** Archive rather than delete: paper_tags rows and links to the tag stay intact. */
  async archive(id: string): Promise<Tag> {
    const prisma = getPrisma();
    await loadTag(id, prisma);
    const row = await prisma.tag.update({ where: { id }, data: { status: "archived" } });
    await afterTagWrite(id);
    return toTag(row, await ruleCount(id));
  },

  /** Read-only: papers matching ANY include rule and NO exclude rule. Writes nothing. */
  async preview(id: string): Promise<TagPreview> {
    const prisma = getPrisma();
    await loadTag(id, prisma);
    const { include: includeSql, exclude: excludeSql } = await loadTagRuleMatch(id, prisma);
    if (!includeSql) return { matchedPapers: 0, sample: [] };
    const where = Prisma.sql`p.data_status = 'active' AND ${includeSql}${excludeSql ? Prisma.sql` AND NOT ${excludeSql}` : Prisma.empty}`;

    const [counts, sample] = await Promise.all([
      prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT COUNT(*)::int AS count FROM papers p WHERE ${where}`),
      prisma.$queryRaw<Array<{ id: string; title: string; publication_year: number }>>(Prisma.sql`
        SELECT p.id, p.title, p.publication_year
        FROM papers p
        WHERE ${where}
        ORDER BY p.citation_count DESC, p.id
        LIMIT ${PREVIEW_SAMPLE}`),
    ]);
    return {
      matchedPapers: Number(counts[0]?.count ?? 0),
      sample: sample.map((s) => ({ id: s.id, title: s.title, publicationYear: Number(s.publication_year) })),
    };
  },
};
