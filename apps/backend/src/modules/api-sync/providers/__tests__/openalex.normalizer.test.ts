import { describe, expect, it } from "vitest";
import { normalizeOpenAlexWork, reconstructAbstract } from "../openalex.normalizer.js";
import type { OpenAlexWork } from "../openalex.types.js";

describe("reconstructAbstract", () => {
  it("rebuilds text from an inverted index", () => {
    // "the model is fast"
    const idx = { the: [0], model: [1], is: [2], fast: [3] };
    expect(reconstructAbstract(idx)).toBe("the model is fast");
  });

  it("handles words at multiple positions", () => {
    const idx = { ai: [0, 2], for: [1], education: [3] };
    expect(reconstructAbstract(idx)).toBe("ai for ai education");
  });

  it("returns undefined for missing or empty index", () => {
    expect(reconstructAbstract(undefined)).toBeUndefined();
    expect(reconstructAbstract(null)).toBeUndefined();
    expect(reconstructAbstract({})).toBeUndefined();
  });
});

describe("normalizeOpenAlexWork", () => {
  const base: OpenAlexWork = {
    id: "https://openalex.org/W123",
    doi: "https://doi.org/10.1234/ABC",
    title: "LLMs in Education",
    publication_year: 2024,
    publication_date: "2024-03-01",
    type: "article",
    language: "en",
    cited_by_count: 87,
    fwci: 2.35,
    citation_normalized_percentile: {
      value: 0.91,
      is_in_top_1_percent: false,
      is_in_top_10_percent: true,
    },
    abstract_inverted_index: { This: [0], paper: [1] },
    authorships: [
      {
        author_position: "first",
        is_corresponding: true,
        author: { display_name: "Sarah Chen" },
        institutions: [{ display_name: "MIT", country_code: "US" }],
      },
      { author_position: "middle", author: { display_name: "Mike Rodriguez" } },
    ],
    primary_location: { source: { display_name: "Nature Education" }, license: "cc-by" },
    open_access: { is_oa: true, oa_status: "gold", oa_url: "https://oa.example/paper.pdf" },
    topics: [{ display_name: "Educational Technology", score: 0.9 }],
    keywords: [{ display_name: "LLM", score: 0.8 }],
  };

  it("maps a standard article correctly", () => {
    const n = normalizeOpenAlexWork(base);
    expect(n.externalIds.doi).toBe("10.1234/abc"); // prefix stripped + lowercased
    expect(n.externalIds.openalexId).toBe("W123");
    expect(n.title).toBe("LLMs in Education");
    expect(n.abstractText).toBe("This paper");
    expect(n.publicationYear).toBe(2024);
    expect(n.paperKind).toBe("article");
    expect(n.language).toBe("en");
    expect(n.textSearchLanguage).toBe("none");
    expect(n.citationCount).toBe(87);
    expect(n.fwci).toBe(2.35);
    expect(n.citationNormalizedPercentile).toEqual({
      value: 0.91,
      isInTop1Percent: false,
      isInTop10Percent: true,
    });
    expect(n.relatedWorksCount).toBe(0);
    expect(n.openAccessStatus).toBe("gold");
    expect(n.openAccessUrl).toBe("https://oa.example/paper.pdf");
    expect(n.journalName).toBe("Nature Education");
    expect(n.primaryProvider).toBe("openalex");
  });

  it("maps multiple authors with positions and corresponding flag", () => {
    const n = normalizeOpenAlexWork(base);
    expect(n.authors).toHaveLength(2);
    expect(n.authors[0]).toMatchObject({
      displayName: "Sarah Chen",
      position: 0,
      isCorresponding: true,
      affiliation: "MIT",
    });
    expect(n.authors[1]).toMatchObject({ displayName: "Mike Rodriguez", position: 1 });
  });

  it("handles a missing DOI", () => {
    const n = normalizeOpenAlexWork({ ...base, doi: null });
    expect(n.externalIds.doi).toBeUndefined();
    expect(n.externalIds.openalexId).toBe("W123");
  });

  it("handles a missing abstract", () => {
    const n = normalizeOpenAlexWork({ ...base, abstract_inverted_index: null });
    expect(n.abstractText).toBeUndefined();
  });

  it("falls back to safe defaults for a sparse work", () => {
    const n = normalizeOpenAlexWork({ id: "https://openalex.org/W999" });
    expect(n.title).toBe("Untitled");
    expect(n.publicationYear).toBe(0);
    expect(n.authors).toEqual([]);
    expect(n.keywords).toEqual([]);
    expect(n.topics).toEqual([]);
    expect(n.openAccessStatus).toBe("unknown");
    expect(n.paperKind).toBe("other");
    expect(n.language).toBe("und");
  });

  it("normalizes language codes and never assumes missing language is English", () => {
    expect(normalizeOpenAlexWork({ ...base, language: " FR " }).language).toBe("fr");
    expect(normalizeOpenAlexWork({ ...base, language: null }).language).toBe("und");
  });

  it("uses a safe title when OpenAlex provides a blank display value", () => {
    expect(normalizeOpenAlexWork({ ...base, title: "  ", display_name: "" }).title).toBe("Untitled");
  });

  it("normalizes encoded HTML in OpenAlex titles", () => {
    const normalized = normalizeOpenAlexWork({
      ...base,
      title: "&lt;p&gt;AI &amp; Precision Medicine&lt;/p&gt;",
    });

    expect(normalized.title).toBe("AI & Precision Medicine");
  });

  it("maps referenced_works, stripping the OpenAlex URL prefix", () => {
    const n = normalizeOpenAlexWork({
      ...base,
      referenced_works: ["https://openalex.org/W111", "https://openalex.org/W222"],
      related_works: ["https://openalex.org/W333", "https://openalex.org/W444"],
    });
    expect(n.referencedWorks).toEqual(["W111", "W222"]);
    expect(n.relatedWorks).toEqual(["W333", "W444"]);
    expect(n.relatedWorksCount).toBe(2);
  });

  it("preserves OpenAlex topic hierarchy and primary topic metadata", () => {
    const n = normalizeOpenAlexWork({
      ...base,
      primary_topic: {
        id: "https://openalex.org/T12547",
        display_name: "Pharmaceutical studies and practices",
        score: 0.98,
        subfield: {
          id: "https://openalex.org/subfields/2735",
          display_name: "Pediatrics, Perinatology and Child Health",
        },
        field: { id: "https://openalex.org/fields/27", display_name: "Medicine" },
        domain: { id: "https://openalex.org/domains/4", display_name: "Health Sciences" },
      },
      topics: [
        {
          id: "https://openalex.org/T12547",
          display_name: "Pharmaceutical studies and practices",
          score: 0.96,
          subfield: {
            id: "https://openalex.org/subfields/2735",
            display_name: "Pediatrics, Perinatology and Child Health",
          },
          field: { id: "https://openalex.org/fields/27", display_name: "Medicine" },
          domain: { id: "https://openalex.org/domains/4", display_name: "Health Sciences" },
        },
      ],
    });

    expect(n.topics).toEqual([
      {
        openalexTopicId: "T12547",
        topicName: "Pharmaceutical studies and practices",
        detectedBy: "openalex",
        confidence: 0.98,
        isPrimary: true,
        subfieldId: "2735",
        subfieldName: "Pediatrics, Perinatology and Child Health",
        fieldId: "27",
        fieldName: "Medicine",
        domainId: "4",
        domainName: "Health Sciences",
      },
    ]);
  });

  it("defaults referenced_works to [] when missing", () => {
    expect(normalizeOpenAlexWork({ ...base, referenced_works: null }).referencedWorks).toEqual([]);
    expect(normalizeOpenAlexWork({ id: "https://openalex.org/W999" }).referencedWorks).toEqual([]);
  });
});
