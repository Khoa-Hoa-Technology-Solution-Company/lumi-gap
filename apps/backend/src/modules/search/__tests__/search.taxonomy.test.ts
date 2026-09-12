import { describe, expect, it } from "vitest";
import { computeTaxonomyBoost, effectiveRelevanceScore } from "../search.taxonomy.js";

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
