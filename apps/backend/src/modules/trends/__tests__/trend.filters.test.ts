import { describe, expect, it } from "vitest";
import { buildTrendMatchStage, buildUnwoundTopicMatch, describeAppliedTrendFilters } from "../trend.filters.js";

describe("trend filters", () => {
  it("builds an active-paper match stage with year range by default", () => {
    expect(buildTrendMatchStage({ yearFrom: 2021, yearTo: 2025 })).toEqual({
      dataStatus: "active",
      publicationYear: { $gte: 2021, $lte: 2025 },
    });
  });

  it("adds OpenAlex-style scalar and taxonomy filters", () => {
    expect(
      buildTrendMatchStage({
        yearFrom: 2021,
        yearTo: 2025,
        paperKinds: ["article", "review"],
        openAccessStatuses: ["gold"],
        providers: ["openalex"],
        sources: ["Nature Medicine"],
        languages: ["en", "vi"],
        domains: ["Health Sciences"],
        fields: ["Medicine"],
        subfields: ["Pediatrics"],
        topics: ["Digital health"],
        domainIds: ["https://openalex.org/domains/4"],
        fieldIds: ["https://openalex.org/fields/27"],
        subfieldIds: ["https://openalex.org/subfields/2735"],
        topicIds: ["https://openalex.org/topics/t12547"],
      }),
    ).toEqual({
      dataStatus: "active",
      publicationYear: { $gte: 2021, $lte: 2025 },
      paperKind: { $in: ["article", "review"] },
      openAccessStatus: { $in: ["gold"] },
      primaryProvider: { $in: ["openalex"] },
      journalName: { $in: ["Nature Medicine"] },
      language: { $in: ["en", "vi"] },
      topics: {
        $elemMatch: {
          domainName: { $in: ["Health Sciences"] },
          fieldName: { $in: ["Medicine"] },
          subfieldName: { $in: ["Pediatrics"] },
          topicName: { $in: ["Digital health"] },
          domainId: { $in: ["https://openalex.org/domains/4", "4"] },
          fieldId: { $in: ["https://openalex.org/fields/27", "27"] },
          subfieldId: { $in: ["https://openalex.org/subfields/2735", "2735"] },
          openalexTopicId: { $in: ["https://openalex.org/topics/t12547", "t12547", "T12547"] },
        },
      },
    });
  });

  it("combines citation bands into a deterministic $or range", () => {
    expect(
      buildTrendMatchStage({
        yearFrom: 2021,
        yearTo: 2025,
        citationBands: ["10-49", "1000+"],
      }),
    ).toEqual({
      dataStatus: "active",
      publicationYear: { $gte: 2021, $lte: 2025 },
      $or: [{ citationCount: { $gte: 10, $lte: 49 } }, { citationCount: { $gte: 1000 } }],
    });
  });

  it("describes only user-applied filters for observability and UI proof", () => {
    expect(
      describeAppliedTrendFilters({
        yearFrom: 2021,
        yearTo: 2025,
        paperKinds: ["article"],
        languages: ["en"],
        domains: ["Health Sciences"],
        domainIds: ["https://openalex.org/domains/4"],
        citationBands: ["50-99"],
      }),
    ).toEqual({
      paperKinds: ["article"],
      languages: ["en"],
      domains: ["Health Sciences"],
      domainIds: ["https://openalex.org/domains/4"],
      citationBands: ["50-99"],
    });
  });

  it("builds a post-unwind topic match so scoped facets do not count unrelated co-topics", () => {
    expect(
      buildUnwoundTopicMatch({
        yearFrom: 2021,
        yearTo: 2025,
        domainIds: ["https://openalex.org/domains/4"],
        fieldIds: ["27"],
        topicIds: ["t12547"],
      }),
    ).toEqual({
      "topics.domainId": { $in: ["https://openalex.org/domains/4", "4"] },
      "topics.fieldId": { $in: ["27"] },
      "topics.openalexTopicId": { $in: ["t12547", "T12547"] },
    });
  });
});
