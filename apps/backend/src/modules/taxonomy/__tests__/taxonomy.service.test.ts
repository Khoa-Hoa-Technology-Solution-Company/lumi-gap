import { beforeEach, describe, expect, it, vi } from "vitest";
import { taxonomyService } from "../taxonomy.service.js";

const m = vi.hoisted(() => ({
  topicCount: vi.fn(), topicFindMany: vi.fn(), topicGroupBy: vi.fn(),
  kwFind: vi.fn(), kwUpdate: vi.fn(), kwUpdateMany: vi.fn(),
  pkUpdateMany: vi.fn(),
  ruleFindMany: vi.fn(), ruleDeleteMany: vi.fn(), ruleUpdateMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => {
  const tx = {
    keyword: { findUnique: m.kwFind, update: m.kwUpdate, updateMany: m.kwUpdateMany },
    paperKeyword: { updateMany: m.pkUpdateMany },
    tagRule: { findMany: m.ruleFindMany, deleteMany: m.ruleDeleteMany, updateMany: m.ruleUpdateMany },
    $queryRaw: m.queryRaw,
  };
  return {
    getPrisma: () => ({
      researchTopic: { count: m.topicCount, findMany: m.topicFindMany, groupBy: m.topicGroupBy },
      $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
    }),
  };
});

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const now = new Date("2026-10-30T00:00:00.000Z");
const keyword = (over: Record<string, unknown>) => ({
  id: A, keywordName: "Deep Learning", normalizedName: "deep learning", aliases: [], status: "active",
  mergedIntoId: null, paperCount: 0, createdAt: now, updatedAt: now, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.kwUpdate.mockImplementation(async ({ where, data }) => keyword({ id: where.id, ...data }));
  m.queryRaw.mockResolvedValue([{ count: 7 }]);
  m.ruleFindMany.mockResolvedValue([]);
});

describe("keyword merge", () => {
  it("rejects merging a keyword into itself before touching the database", async () => {
    await expect(taxonomyService.mergeKeywords(A, A)).rejects.toMatchObject({ statusCode: 400 });
    expect(m.kwFind).not.toHaveBeenCalled();
  });

  it("rejects a merged source, a merged target and a hidden target", async () => {
    const source = keyword({ id: A });
    m.kwFind.mockImplementation(async ({ where }) => (where.id === A ? source : keyword({ id: B, status: "merged", mergedIntoId: A })));
    await expect(taxonomyService.mergeKeywords(A, B)).rejects.toMatchObject({ statusCode: 409 });

    m.kwFind.mockImplementation(async ({ where }) => (where.id === A ? keyword({ id: A, status: "merged", mergedIntoId: B }) : keyword({ id: B })));
    await expect(taxonomyService.mergeKeywords(A, B)).rejects.toMatchObject({ statusCode: 409 });

    m.kwFind.mockImplementation(async ({ where }) => (where.id === A ? source : keyword({ id: B, status: "hidden" })));
    await expect(taxonomyService.mergeKeywords(A, B)).rejects.toMatchObject({ statusCode: 400 });
    expect(m.pkUpdateMany).not.toHaveBeenCalled();
  });

  it("repoints papers and rules, unions aliases with the source name, and tombstones the source", async () => {
    m.kwFind.mockImplementation(async ({ where }) => where.id === A
      ? keyword({ id: A, normalizedName: "dl", keywordName: "DL", aliases: ["Deep-Learning"] })
      : keyword({ id: B, normalizedName: "deep learning", aliases: ["Hoc sau", "DEEP learning"] }));
    m.ruleFindMany.mockResolvedValue([{ tagId: "tag-1" }, { tagId: "tag-2" }]);

    const result = await taxonomyService.mergeKeywords(A, B);

    expect(m.pkUpdateMany).toHaveBeenCalledWith({ where: { keywordId: A }, data: { keywordId: B } });
    // Source rules on tags that already have a target rule are removed first (partial unique index).
    expect(m.ruleDeleteMany).toHaveBeenCalledWith({ where: { keywordId: A, tagId: { in: ["tag-1", "tag-2"] } } });
    expect(m.ruleUpdateMany).toHaveBeenCalledWith({ where: { keywordId: A }, data: { keywordId: B } });
    expect(m.ruleDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(m.ruleUpdateMany.mock.invocationCallOrder[0]!);
    expect(m.kwUpdateMany).toHaveBeenCalledWith({ where: { mergedIntoId: A }, data: { mergedIntoId: B } });
    expect(m.kwUpdate).toHaveBeenCalledWith({
      where: { id: A }, data: { status: "merged", mergedIntoId: B, aliases: [], paperCount: 0 },
    });
    // Normalized, de-duplicated, includes the source's normalized name, never the target's own name.
    expect(m.kwUpdate).toHaveBeenCalledWith({
      where: { id: B }, data: { aliases: ["hoc sau", "dl"], paperCount: 7 },
    });
    expect(result.id).toBe(B);
  });

  it("skips the rule delete when the target has no keyword rules", async () => {
    m.kwFind.mockImplementation(async ({ where }) => keyword({ id: where.id, normalizedName: where.id === A ? "a" : "b" }));
    await taxonomyService.mergeKeywords(A, B);
    expect(m.ruleDeleteMany).not.toHaveBeenCalled();
    expect(m.ruleUpdateMany).toHaveBeenCalled();
  });
});

describe("node list", () => {
  it("matches the name case-insensitively and the alias by its normalized form", async () => {
    m.topicCount.mockResolvedValue(0);
    m.topicFindMany.mockResolvedValue([]);
    await taxonomyService.listNodes({ q: "  Học Máy! ", page: 2, pageSize: 10, sort: "paperCount", level: "topic" });
    const where = m.topicFindMany.mock.calls[0]![0].where;
    expect(where.level).toBe("topic");
    expect(where.OR).toEqual([
      { topicName: { contains: "Học Máy!", mode: "insensitive" } },
      { aliases: { has: "hoc may" } },
    ]);
    expect(m.topicFindMany.mock.calls[0]![0]).toMatchObject({ skip: 10, take: 10 });
  });

  it("returns childCount and pagination meta", async () => {
    m.topicCount.mockResolvedValue(41);
    m.topicFindMany.mockResolvedValue([{
      id: A, level: "field", topicName: "Computer Science", description: null, openalexId: "17", parentTopicId: null,
      aliases: [], worksCount: 5, paperCount: 3, status: "active", syncedAt: null, openalexKeywords: [],
    }]);
    m.topicGroupBy.mockResolvedValue([{ parentTopicId: A, _count: { _all: 9 } }]);
    const result = await taxonomyService.listNodes({ page: 1, pageSize: 20, sort: "name" });
    expect(result.data[0]).toMatchObject({ id: A, name: "Computer Science", childCount: 9, syncedAt: null });
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 41, totalPages: 3 });
  });
});
