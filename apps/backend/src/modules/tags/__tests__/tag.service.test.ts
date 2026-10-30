import { beforeEach, describe, expect, it, vi } from "vitest";
import { tagService } from "../tag.service.js";

const m = vi.hoisted(() => ({
  tagFind: vi.fn(), tagCreate: vi.fn(),
  topicFindMany: vi.fn(), kwFindMany: vi.fn(),
  ruleFindMany: vi.fn(), ruleCreateMany: vi.fn(), ruleDeleteMany: vi.fn(), ruleCount: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => {
  const client = {
    tag: { findUnique: m.tagFind, create: m.tagCreate },
    researchTopic: { findMany: m.topicFindMany },
    keyword: { findMany: m.kwFindMany },
    tagRule: { findMany: m.ruleFindMany, createMany: m.ruleCreateMany, deleteMany: m.ruleDeleteMany, count: m.ruleCount },
    $queryRaw: m.queryRaw,
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(client),
  };
  return { getPrisma: () => client };
});

const TAG = "00000000-0000-4000-8000-0000000000aa";
const T1 = "00000000-0000-4000-8000-000000000001";
const K1 = "00000000-0000-4000-8000-0000000000b1";
const K2 = "00000000-0000-4000-8000-0000000000b2";
const USER = "00000000-0000-4000-8000-0000000000cc";
const now = new Date("2026-10-30T00:00:00.000Z");
const tagRow = (over: Record<string, unknown> = {}) => ({
  id: TAG, slug: "llm-in-education", name: "LLM in education", description: null, status: "active", color: null,
  paperCount: 0, createdById: USER, createdAt: now, updatedAt: now, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.ruleFindMany.mockResolvedValue([]);
  m.topicFindMany.mockResolvedValue([]);
  m.kwFindMany.mockResolvedValue([]);
});

describe("tag create", () => {
  it("derives the slug from the name and writes the tag with its rules in one transaction", async () => {
    m.tagFind.mockImplementation(async ({ where }) => (where.id ? tagRow() : null));
    m.tagCreate.mockResolvedValue(tagRow());
    m.topicFindMany.mockResolvedValue([{ id: T1 }]);

    await tagService.create(USER, {
      name: "LLM in education",
      rules: [{ ruleKind: "topic", researchTopicId: T1 }],
    });

    expect(m.tagFind).toHaveBeenCalledWith({ where: { slug: "llm-in-education" }, select: { id: true } });
    expect(m.tagCreate).toHaveBeenCalledWith({
      data: { slug: "llm-in-education", name: "LLM in education", description: null, color: null, createdById: USER },
    });
    expect(m.ruleCreateMany).toHaveBeenCalledWith({
      data: [{ tagId: TAG, ruleKind: "topic", effect: "include", researchTopicId: T1, keywordId: null }],
    });
  });

  it("returns 409 when the slug is taken and creates nothing", async () => {
    m.tagFind.mockResolvedValue({ id: "existing" });
    await expect(tagService.create(USER, { name: "Anything", slug: "taken" })).rejects.toMatchObject({ statusCode: 409 });
    expect(m.tagCreate).not.toHaveBeenCalled();
  });

  it("asks for an explicit slug when the name has no usable characters", async () => {
    await expect(tagService.create(USER, { name: "???" })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("tag rule replacement", () => {
  beforeEach(() => m.tagFind.mockResolvedValue(tagRow()));

  it("resolves a merged keyword to its survivor, dedupes, and replaces the old rules", async () => {
    m.kwFindMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => {
      const all = [
        { id: K1, status: "merged", mergedIntoId: K2 },
        { id: K2, status: "active", mergedIntoId: null },
      ];
      return all.filter((k) => where.id.in.includes(k.id));
    });

    await tagService.replaceRules(TAG, {
      rules: [
        { ruleKind: "keyword", keywordId: K1 },
        { ruleKind: "keyword", keywordId: K2, effect: "include" },
      ],
    });

    expect(m.ruleDeleteMany).toHaveBeenCalledWith({ where: { tagId: TAG } });
    expect(m.ruleCreateMany).toHaveBeenCalledTimes(1);
    expect(m.ruleCreateMany).toHaveBeenCalledWith({
      data: [{ tagId: TAG, ruleKind: "keyword", effect: "include", researchTopicId: null, keywordId: K2 }],
    });
  });

  it("rejects a missing taxonomy node or keyword without deleting existing rules", async () => {
    m.topicFindMany.mockResolvedValue([]);
    await expect(tagService.replaceRules(TAG, { rules: [{ ruleKind: "topic", researchTopicId: T1 }] }))
      .rejects.toMatchObject({ statusCode: 404 });
    m.kwFindMany.mockResolvedValue([]);
    await expect(tagService.replaceRules(TAG, { rules: [{ ruleKind: "keyword", keywordId: K1 }] }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(m.ruleDeleteMany).not.toHaveBeenCalled();
  });

  it("rejects one target that is both included and excluded", async () => {
    m.topicFindMany.mockResolvedValue([{ id: T1 }]);
    await expect(tagService.replaceRules(TAG, {
      rules: [
        { ruleKind: "topic", researchTopicId: T1 },
        { ruleKind: "topic", researchTopicId: T1, effect: "exclude" },
      ],
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(m.ruleDeleteMany).not.toHaveBeenCalled();
  });
});

describe("tag preview", () => {
  it("returns an empty preview without querying papers when there are no include rules", async () => {
    m.tagFind.mockResolvedValue(tagRow());
    m.ruleFindMany.mockResolvedValue([{
      id: "r1", tagId: TAG, ruleKind: "keyword", effect: "exclude", researchTopicId: null, keywordId: K1, createdAt: now,
    }]);
    expect(await tagService.preview(TAG)).toEqual({ matchedPapers: 0, sample: [] });
    expect(m.queryRaw).not.toHaveBeenCalled();
  });

  it("maps count and sample rows", async () => {
    m.tagFind.mockResolvedValue(tagRow());
    m.ruleFindMany.mockResolvedValue([{
      id: "r1", tagId: TAG, ruleKind: "keyword", effect: "include", researchTopicId: null, keywordId: K1, createdAt: now,
    }]);
    m.queryRaw
      .mockResolvedValueOnce([{ count: 12 }])
      .mockResolvedValueOnce([{ id: "p1", title: "A paper", publication_year: 2024 }]);
    expect(await tagService.preview(TAG)).toEqual({
      matchedPapers: 12, sample: [{ id: "p1", title: "A paper", publicationYear: 2024 }],
    });
  });
});
