import { describe, expect, it } from "vitest";
import type { DetectedTag } from "@trend/shared-types";
import { applyDetectedTagBoost, computeTaxonomyBoost, effectiveRelevanceScore, paperCarriesTag, relevanceSortScore } from "../search.taxonomy.js";

describe("computeTaxonomyBoost", () => {
  it("boosts papers whose OpenAlex taxonomy matches the query", () => {
    const boost = computeTaxonomyBoost("pediatrics pharmaceutical medicine", {
      topics: [
        {
          topicName: "Pharmaceutical studies and practices",
          isPrimary: true,
          subfieldName: "Pediatrics, Perinatology and Child Health",
          fieldName: "Medicine",
          domainName: "Health Sciences",
        },
      ],
    });

    expect(boost).toBeGreaterThan(0);
    expect(boost).toBeLessThanOrEqual(0.08);
  });

  it("does not boost unrelated taxonomy", () => {
    expect(
      computeTaxonomyBoost("large language model education", {
        topics: [{ topicName: "Pharmaceutical studies and practices", fieldName: "Medicine" }],
      }),
    ).toBe(0);
  });
});

describe("effectiveRelevanceScore", () => {
  it("keeps vector score as the base and caps the boosted relevance score", () => {
    expect(effectiveRelevanceScore({ score: 0.97, taxonomyBoostScore: 0.08 })).toBe(1);
    expect(effectiveRelevanceScore({ score: 0.7, taxonomyBoostScore: 0.03 })).toBe(0.73);
  });
});

describe("relevanceSortScore", () => {
  it("keeps RRF order that effectiveRelevanceScore rounds away", () => {
    const hi = { score: 0.9, hybridScore: 0.1881 };
    const lo = { score: 0.9, hybridScore: 0.1879 };
    expect(effectiveRelevanceScore(hi)).toBe(effectiveRelevanceScore(lo));
    expect(relevanceSortScore(hi)).toBeGreaterThan(relevanceSortScore(lo));
  });

  it("prefers hybridScore over score, falls back to score, and caps at 1", () => {
    expect(relevanceSortScore({ score: 0.9, hybridScore: 0.2 })).toBeCloseTo(0.2);
    expect(relevanceSortScore({ score: 0.6 })).toBeCloseTo(0.6);
    expect(relevanceSortScore({ score: 0.97, taxonomyBoostScore: 0.08 })).toBe(1);
  });
});

describe("applyDetectedTagBoost", () => {
  const tag = (over: Partial<DetectedTag>): DetectedTag => ({
    kind: "topic",
    id: "id",
    openalexId: "T10028",
    name: "Topic Modeling",
    paperCount: 40,
    confidence: 0.8,
    source: "name",
    matchedText: "topic modeling",
    filter: { key: "topicIds", value: "T10028" },
    ...over,
  });
  const paper = (over: Record<string, unknown> = {}) =>
    ({ topics: [], keywords: [], taxonomyBoostScore: 0, ...over }) as never as Parameters<typeof applyDetectedTagBoost>[0][number];

  it("adds 0.05 x confidence per matched tag at each taxonomy level", () => {
    const papers = [
      paper({ topics: [{ topicName: "t", openalexTopicId: "T10028", subfieldId: "1702", fieldId: "17", domainId: "3" }] }),
      paper({ topics: [{ topicName: "other", openalexTopicId: "T1", subfieldId: "9", fieldId: "9", domainId: "9" }] }),
    ];
    const tags = [
      tag({}),
      tag({ kind: "subfield", openalexId: "1702", confidence: 0.6 }),
      tag({ kind: "field", openalexId: "17", confidence: 0.5 }),
      tag({ kind: "domain", openalexId: "3", confidence: 0.1 }),
    ];

    const [hit, miss] = applyDetectedTagBoost(papers, tags);

    expect(hit!.taxonomyBoostScore).toBeCloseTo(0.05 * (0.8 + 0.6 + 0.5 + 0.1), 3);
    expect(miss!.taxonomyBoostScore).toBe(0);
  });

  it("matches OpenAlex ids written as URLs and in any case", () => {
    const [boosted] = applyDetectedTagBoost(
      [paper({ topics: [{ topicName: "t", openalexTopicId: "https://openalex.org/t10028" }] })],
      [tag({ openalexId: "T10028", confidence: 1 })],
    );
    expect(boosted!.taxonomyBoostScore).toBe(0.05);
  });

  it("matches keyword tags on the normalized keyword string, name or matched alias, never on a fuzzy query", () => {
    const kw = tag({
      kind: "keyword", id: "k1", openalexId: undefined, name: "Machine Learning", confidence: 1,
      source: "alias", matchedText: "hoc may", filter: { key: "keywordIds", value: "k1" },
    });
    const papers = [
      paper({ keywords: ["Machine-Learning"] }),
      paper({ keywords: ["Học máy"] }),
      paper({ keywords: ["deep learning"] }),
      paper({ keywords: [{ keywordId: "k1", keywordName: "ML" }] }),
    ];
    const boosted = applyDetectedTagBoost(papers, [kw]).map((p) => p.taxonomyBoostScore);
    expect(boosted).toEqual([0.05, 0.05, 0, 0.05]);

    const fuzzy = { ...kw, source: "fuzzy" as const, matchedText: "machin lerning" };
    expect(applyDetectedTagBoost([paper({ keywords: ["machin lerning"] })], [fuzzy])[0]!.taxonomyBoostScore).toBe(0);
  });

  it("matches curated tags on the paper's tagIds only", () => {
    const curated = tag({
      kind: "tag", id: "g-1", openalexId: undefined, name: "My Tag", confidence: 1,
      filter: { key: "tagIds", value: "g-1" },
    });
    const papers = [
      paper({ tagIds: ["g-9", "g-1"] }),
      paper({ tagIds: ["g-9"] }),
      paper({}),
      // A matching name or keyword is not enough: only the tag assignment counts.
      paper({ keywords: ["My Tag"], topics: [{ topicName: "My Tag" }] }),
    ];

    expect(applyDetectedTagBoost(papers, [curated]).map((p) => p.taxonomyBoostScore)).toEqual([0.05, 0, 0, 0]);
    expect(paperCarriesTag(papers[0]!, curated)).toBe(true);
    expect(paperCarriesTag(papers[1]!, curated)).toBe(false);
  });

  it("stacks on the name-overlap boost but caps the combined value at 0.12", () => {
    const p = paper({ taxonomyBoostScore: 0.08, topics: [{ topicName: "t", openalexTopicId: "T10028", subfieldId: "1702" }] });
    const [stacked] = applyDetectedTagBoost([p], [tag({ confidence: 0.5 })]);
    expect(stacked!.taxonomyBoostScore).toBeCloseTo(0.105, 3);

    const [capped] = applyDetectedTagBoost(
      [p],
      [tag({ confidence: 1 }), tag({ kind: "subfield", openalexId: "1702", confidence: 1 })],
    );
    expect(capped!.taxonomyBoostScore).toBe(0.12);
  });

  it("returns the papers untouched without tags", () => {
    const papers = [paper()];
    expect(applyDetectedTagBoost(papers, [])).toBe(papers);
  });
});
