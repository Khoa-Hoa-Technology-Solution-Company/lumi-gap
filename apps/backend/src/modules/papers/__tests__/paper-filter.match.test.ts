import { describe, expect, it } from "vitest";
import { PaperListQuerySchema } from "../dto/paper.schema.js";
import { buildPaperMetadataMatch } from "../paper-filter.match.js";

describe("paper keyword filter parity", () => {
  it("accepts the same advanced filters as semantic search", () => {
    const parsed = PaperListQuerySchema.parse({
      q: "retrieval augmented generation",
      paperKinds: "article,review",
      openAccessStatuses: "gold,green",
      providers: "openalex,crossref",
      sources: "Nature,Science",
      languages: "EN,vi",
      citationBands: "10-49,1000+",
      domainIds: "https://openalex.org/domains/3",
      topicIds: "T100",
    });

    expect(parsed).toMatchObject({
      paperKinds: ["article", "review"],
      openAccessStatuses: ["gold", "green"],
      providers: ["openalex", "crossref"],
      sources: ["Nature", "Science"],
      languages: ["en", "vi"],
      citationBands: ["10-49", "1000+"],
      domainIds: ["https://openalex.org/domains/3"],
      topicIds: ["T100"],
    });
  });

  it("builds one complete Mongo match for keyword and semantic fallback paths", () => {
    expect(
      buildPaperMetadataMatch({
        yearFrom: 2020,
        yearTo: 2025,
        paperKinds: ["article"],
        openAccess: true,
        openAccessStatuses: ["Gold"],
        providers: ["OpenAlex"],
        sources: ["Nature"],
        languages: ["EN"],
        citationBands: ["10-49", "1000+"],
        domainIds: ["https://openalex.org/domains/3"],
        topicIds: ["T100"],
      }),
    ).toEqual({
      dataStatus: "active",
      publicationYear: { $gte: 2020, $lte: 2025 },
      paperKind: { $in: ["article"] },
      openAccessUrl: { $type: "string", $ne: "" },
      openAccessStatus: { $in: ["gold"] },
      primaryProvider: { $in: ["openalex"] },
      journalName: { $in: ["Nature"] },
      language: { $in: ["en"] },
      $or: [
        { citationCount: { $gte: 10, $lte: 49 } },
        { citationCount: { $gte: 1000 } },
      ],
      topics: {
        $elemMatch: {
          domainId: { $in: ["https://openalex.org/domains/3", "3"] },
          openalexTopicId: { $in: ["T100"] },
        },
      },
    });
  });
});
