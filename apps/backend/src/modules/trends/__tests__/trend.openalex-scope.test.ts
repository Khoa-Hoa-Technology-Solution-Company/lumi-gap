import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({ paperTopic: { findMany: vi.fn() } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => prisma }));

import { buildOpenAlexScope, withScope, yearsClause } from "../trend.openalex-scope.js";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.paperTopic.findMany.mockResolvedValue([]);
});

describe("buildOpenAlexScope", () => {
  it("counts only research publication types without filters", async () => {
    const scope = await buildOpenAlexScope({});
    expect(scope).toEqual({ filter: "type:article|review|preprint|conference-paper|book-chapter", nonTaxonomyFilter: "type:article|review|preprint|conference-paper|book-chapter", notice: { ignoredFilters: [] } });
    expect(withScope(scope.filter, yearsClause(2016, 2025))).toBe("type:article|review|preprint|conference-paper|book-chapter,publication_year:2016-2025");
  });

  it("maps facet filters to OpenAlex clauses", async () => {
    const scope = await buildOpenAlexScope({
      paperKinds: ["article", "review"],
      openAccessStatuses: ["gold"],
      languages: ["EN"],
      citationBands: ["0-9", "1000+"],
      sources: ["https://openalex.org/S4306400194"],
      fieldIds: ["https://openalex.org/fields/17"],
      topicIds: ["t10028"],
    });
    expect(scope.nonTaxonomyFilter).toBe(
      "type:article|review,open_access.oa_status:gold,language:en,cited_by_count:0-9|>999,primary_location.source.id:S4306400194",
    );
    expect(scope.filter).toBe(`${scope.nonTaxonomyFilter},primary_topic.field.id:17,primary_topic.id:T10028`);
  });

  it("resolves taxonomy names through the local lookup and reports what it cannot apply", async () => {
    prisma.paperTopic.findMany.mockResolvedValue([{ fieldName: "Computer Science", fieldId: "https://openalex.org/fields/17" }]);
    const scope = await buildOpenAlexScope({
      fields: ["Computer Science", "Unknown Field"],
      providers: ["semantic_scholar"],
      sources: ["Nature"],
    });
    expect(scope.filter).toBe("type:article|review|preprint|conference-paper|book-chapter,primary_topic.field.id:17");
    expect(scope.notice.ignoredFilters.map((row) => [row.filter, row.values])).toEqual([
      ["sources", ["Nature"]],
      ["providers", ["semantic_scholar"]],
      ["fields", ["Unknown Field"]],
    ]);
  });
});
