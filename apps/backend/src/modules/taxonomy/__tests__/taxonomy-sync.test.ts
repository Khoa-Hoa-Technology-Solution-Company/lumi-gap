import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../../generated/prisma/client.js";
import {
  buildTaxonomyPageUrl,
  buildTaxonomyUpsertSql,
  mapOpenAlexTaxonomyEntity,
  shortOpenAlexId,
  taxonomySyncService,
} from "../taxonomy-sync.service.js";

const mocks = vi.hoisted(() => ({ fetchWithRetry: vi.fn(), findMany: vi.fn(), executeRaw: vi.fn() }));
vi.mock("../../api-sync/providers/openalex.client.js", () => ({
  fetchWithRetry: mocks.fetchWithRetry,
  appendOpenAlexIdentity: (url: URL) => url.searchParams.set("mailto", "test@example.com"),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({ researchTopic: { findMany: mocks.findMany }, $executeRaw: mocks.executeRaw }),
}));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

const page = (results: unknown[], next: string | null) => ({ meta: { count: results.length, next_cursor: next, per_page: 200 }, results });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.executeRaw.mockResolvedValue(0);
});

describe("OpenAlex taxonomy mapping", () => {
  it("shortens OpenAlex ids", () => {
    expect(shortOpenAlexId("https://openalex.org/T10028")).toBe("T10028");
    expect(shortOpenAlexId("https://openalex.org/fields/17")).toBe("17");
    expect(shortOpenAlexId(undefined)).toBeNull();
  });

  it("maps a domain without parent or keywords", () => {
    expect(mapOpenAlexTaxonomyEntity("domain", { id: "https://openalex.org/domains/3", display_name: " Physical Sciences ", description: "d", works_count: 10 }))
      .toEqual({ level: "domain", openalexId: "3", topicName: "Physical Sciences", description: "d", worksCount: 10, openalexKeywords: [], parentOpenalexId: null });
  });

  it("maps field -> domain and subfield -> field parents", () => {
    expect(mapOpenAlexTaxonomyEntity("field", { id: "https://openalex.org/fields/17", display_name: "Computer Science", domain: { id: "https://openalex.org/domains/3" } }))
      .toMatchObject({ openalexId: "17", parentOpenalexId: "3", description: null, worksCount: 0 });
    expect(mapOpenAlexTaxonomyEntity("subfield", { id: "https://openalex.org/subfields/1702", display_name: "AI", field: { id: "https://openalex.org/fields/17" } }))
      .toMatchObject({ openalexId: "1702", parentOpenalexId: "17" });
  });

  it("maps a topic with its subfield parent and de-duplicated keywords", () => {
    const node = mapOpenAlexTaxonomyEntity("topic", {
      id: "https://openalex.org/T10028",
      display_name: "Topic Modeling",
      works_count: 42,
      subfield: { id: "https://openalex.org/subfields/1702" },
      keywords: ["topic model", " lda ", "topic model", ""],
    });
    expect(node).toMatchObject({ openalexId: "T10028", parentOpenalexId: "1702", worksCount: 42, openalexKeywords: ["topic model", "lda"] });
  });

  it("reads keyword objects as the live API returns them", () => {
    const node = mapOpenAlexTaxonomyEntity("topic", {
      id: "https://openalex.org/T10346",
      display_name: "Plasma Diagnostics",
      keywords: [
        { display_name: "Doppler reflectometry" },
        { display_name: " neutral beam injection " },
        { display_name: null },
      ],
    });
    expect(node?.openalexKeywords).toEqual(["Doppler reflectometry", "neutral beam injection"]);
  });

  it("drops entities without id or name", () => {
    expect(mapOpenAlexTaxonomyEntity("topic", { id: "", display_name: "x" })).toBeNull();
    expect(mapOpenAlexTaxonomyEntity("topic", { id: "https://openalex.org/T1", display_name: "  " })).toBeNull();
  });

  it("builds a cursor page URL with identity", () => {
    const url = new URL(buildTaxonomyPageUrl("subfield", "*"));
    expect(url.pathname).toBe("/subfields");
    expect(url.searchParams.get("per_page")).toBe("200");
    expect(url.searchParams.get("cursor")).toBe("*");
    expect(url.searchParams.get("mailto")).toBe("test@example.com");
  });
});

describe("upsert statement", () => {

  it("never writes aliases or status on conflict, and keeps values as parameters", () => {
    const sql = buildTaxonomyUpsertSql("topic", [{
      level: "topic", openalexId: "T1", topicName: "'; DROP TABLE x; --", description: null, worksCount: 1, openalexKeywords: ["a"], parentOpenalexId: "1702", parentId: "uuid-1",
    }]);
    const [, update] = sql.sql.split("DO UPDATE SET");
    expect(update).toBeDefined();
    expect(update).not.toMatch(/aliases|status/);
    expect(update).toContain('"openalex_keywords" = EXCLUDED."openalex_keywords"');
    expect(update).toContain('"synced_at" = now()');
    expect(sql.sql).not.toContain("DROP TABLE");
    expect(sql.values).toContain("topic");
    expect(sql.values.some((value) => typeof value === "string" && value.includes("DROP TABLE x"))).toBe(true);
  });
});

describe("taxonomySyncService.syncAll", () => {
  it("follows next_cursor until it is null and upserts each level", async () => {
    mocks.fetchWithRetry
      .mockResolvedValueOnce(page([{ id: "https://openalex.org/domains/1", display_name: "Life Sciences" }], "abc"))
      .mockResolvedValueOnce(page([{ id: "https://openalex.org/domains/2", display_name: "Social Sciences" }], null));

    const summary = await taxonomySyncService.syncAll({ levels: ["domain"] });

    expect(summary).toEqual({ domain: 2, field: 0, subfield: 0, topic: 0 });
    expect(mocks.fetchWithRetry).toHaveBeenCalledTimes(2);
    expect(new URL(mocks.fetchWithRetry.mock.calls[0]![0]).searchParams.get("cursor")).toBe("*");
    expect(new URL(mocks.fetchWithRetry.mock.calls[1]![0]).searchParams.get("cursor")).toBe("abc");
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
  });

  it("stops on an empty page even if a cursor is returned", async () => {
    mocks.fetchWithRetry.mockResolvedValueOnce(page([], "still-here"));
    const summary = await taxonomySyncService.syncAll({ levels: ["domain"] });
    expect(summary.domain).toBe(0);
    expect(mocks.fetchWithRetry).toHaveBeenCalledTimes(1);
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("resolves parent ids from the already-synced parent level and batches upserts", async () => {
    mocks.findMany.mockResolvedValue([{ id: "uuid-17", openalexId: "17" }]);
    const results = Array.from({ length: 501 }, (_, i) => ({
      id: `https://openalex.org/subfields/${1700 + i}`,
      display_name: `Sub ${i}`,
      field: { id: i === 500 ? "https://openalex.org/fields/99" : "https://openalex.org/fields/17" },
    }));
    mocks.fetchWithRetry.mockResolvedValueOnce(page(results, null));

    const summary = await taxonomySyncService.syncAll({ levels: ["subfield"] });

    expect(summary.subfield).toBe(501);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ level: "field" }) }));
    expect(mocks.executeRaw).toHaveBeenCalledTimes(2);
    const first = JSON.parse((mocks.executeRaw.mock.calls[0]![0] as Prisma.Sql).values.find((v) => typeof v === "string" && v.startsWith("[")) as string);
    expect(first).toHaveLength(500);
    expect(first[0]).toMatchObject({ openalex_id: "1700", parent_topic_id: "uuid-17" });
    const last = JSON.parse((mocks.executeRaw.mock.calls[1]![0] as Prisma.Sql).values.find((v) => typeof v === "string" && v.startsWith("[")) as string);
    expect(last).toEqual([expect.objectContaining({ openalex_id: "2200", parent_topic_id: null })]);
  });

  it("propagates an HTTP failure", async () => {
    mocks.fetchWithRetry.mockRejectedValueOnce(new Error("OpenAlex 500"));
    await expect(taxonomySyncService.syncAll({ levels: ["domain"] })).rejects.toThrow("OpenAlex 500");
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });
});
