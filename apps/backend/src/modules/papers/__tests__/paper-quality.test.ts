import { describe, it, expect } from "vitest";
import { QUALITY_TIERS, QUALITY_RAW_MAX, getQualityTier, calculatePaperQuality } from "../paper-quality.js";

describe("QUALITY_TIERS reward ladder", () => {
  // Guards the configured reward ladder, including 150 credits for High Value PDFs.
  it("rewards are 0/60/90/150/180 by tier", () => {
    expect(QUALITY_TIERS.map((t) => t.uploadCreditReward)).toEqual([0, 60, 90, 150, 180]);
  });

  it("download costs are unchanged", () => {
    expect(QUALITY_TIERS.map((t) => t.downloadCost)).toEqual([null, 20, 30, 50, 80]);
  });
});

describe("getQualityTier", () => {
  it("maps a score to the band it falls in", () => {
    expect(getQualityTier(40).tier).toBe(0);
    expect(getQualityTier(50).tier).toBe(1);
    expect(getQualityTier(79).tier).toBe(2);
    expect(getQualityTier(92).tier).toBe(4);
  });

  it("a fully-formed paper with a DOI scores a high tier", () => {
    const q = calculatePaperQuality({
      title: "A study of X",
      authors: [{ displayName: "A" }],
      publicationYear: 2024,
      abstractText: "We present a method and experiment with results ".repeat(5),
      keywords: [{ keyword: "x" }],
      topics: [{ topicName: "y" }],
      doi: "10.1234/abc.def",
      paperKind: "article",
    });
    expect(q.qualityTier).toBeGreaterThanOrEqual(3);
    expect(q.uploadCreditReward).toBe(QUALITY_TIERS[q.qualityTier]!.uploadCreditReward);
  });

  it("awards stronger relevance when OpenAlex taxonomy is complete", () => {
    const basic = calculatePaperQuality({
      abstractText: "This paper presents a method and experiment with results ".repeat(4),
      keywords: [{ keywordName: "medicine" }],
      topics: [{ topicName: "Pharmaceutical studies and practices" }],
    });

    const taxonomyRich = calculatePaperQuality({
      abstractText: "This paper presents a method and experiment with results ".repeat(4),
      keywords: [{ keywordName: "medicine" }],
      topics: [
        {
          openalexTopicId: "T12547",
          topicName: "Pharmaceutical studies and practices",
          isPrimary: true,
          subfieldName: "Pediatrics, Perinatology and Child Health",
          fieldName: "Medicine",
          domainName: "Health Sciences",
        },
      ],
    });

    expect(basic.relevanceScore).toBe(11);
    expect(taxonomyRich.relevanceScore).toBe(15);
  });

  it("counts non-Latin abstracts as valid scholarly text", () => {
    const russianAbstract = [
      "Исследование представляет новый метод автоматической классификации научных статей.",
      "Авторы описывают набор данных, экспериментальную методологию и полученные результаты.",
      "Предложенный подход повышает точность и сокращает ручную обработку документов.",
    ].join(" ");

    const quality = calculatePaperQuality({
      abstractText: russianAbstract,
      keywords: [{ keywordName: "классификация" }],
      topics: [{ topicName: "Искусственный интеллект" }],
    });

    expect(quality.relevanceScore).toBe(11);
  });

  it("scores a metadata-only OpenAlex paper without requiring a PDF", () => {
    const quality = calculatePaperQuality({
      title: "Retrieval-augmented generation in education",
      authors: [{ displayName: "Researcher A" }],
      publicationYear: 2025,
      abstractText: "We present a method, dataset, experiment, and result for classroom retrieval systems. ".repeat(3),
      keywords: [{ keywordName: "retrieval augmented generation" }],
      topics: [{
        openalexTopicId: "T123",
        topicName: "Artificial intelligence in education",
        isPrimary: true,
        subfieldName: "Education",
        fieldName: "Social Sciences",
        domainName: "Social Sciences",
      }],
      externalIds: { doi: "10.1234/rag.education" },
      paperKind: "article",
      pdfPath: undefined,
    });

    expect(quality.qualityScore).toBeGreaterThanOrEqual(80);
    expect(quality.qualityTier).toBeGreaterThanOrEqual(3);
  });

  it("uses an uploaded PDF as a source signal when no DOI or source URL exists", () => {
    const basePaper = {
      title: "Local working paper",
      authors: [{ displayName: "Researcher A" }],
      publicationYear: 2025,
      abstractText: "A short abstract describing the study method and result.",
      keywords: [],
      topics: [],
      paperKind: "other",
    };

    expect(calculatePaperQuality(basePaper).sourceScore).toBe(0);
    expect(calculatePaperQuality({ ...basePaper, pdfPath: "r2://papers/paper.pdf" }).sourceScore).toBe(2);
  });
});

describe("calculatePaperQuality scale", () => {
  const fullPaper = {
    title: "A benchmark for retrieval",
    authors: [{ displayName: "A" }],
    publicationYear: 2024,
    abstractText: "We release a benchmark dataset and code for retrieval evaluation in classrooms. ".repeat(3),
    keywords: [{ keywordName: "retrieval" }],
    topics: [{
      openalexTopicId: "T1",
      topicName: "Information retrieval",
      isPrimary: true,
      subfieldName: "Information Systems",
      fieldName: "Computer Science",
      domainName: "Physical Sciences",
    }],
    doi: "10.1234/bench",
    paperKind: "article",
  };

  it("normalizes the raw component sum (max 95) to 0..100 so Elite is reachable", () => {
    const q = calculatePaperQuality(fullPaper);
    const raw = q.metadataScore + q.sourceScore + q.duplicateScore + q.relevanceScore + q.prestigeScore + q.utilityScore;
    expect(raw).toBe(QUALITY_RAW_MAX);
    expect(q.qualityScore).toBe(100);
    expect(q.qualityTierName).toBe("Elite");
  });

  it("keeps a duplicate with no metadata in the Invalid tier", () => {
    const q = calculatePaperQuality({ isDuplicate: true });
    expect(q.qualityScore).toBe(Math.round((3 / QUALITY_RAW_MAX) * 100));
    expect(q.qualityTier).toBe(0);
  });

  it("does not treat decode/encoded as released code", () => {
    const q = calculatePaperQuality({
      abstractText: "The encoder decodes encoded signals into short summaries for readers.",
    });
    expect(q.utilityScore).toBe(3);
  });

  it("still credits whole-word code, datasets and benchmarks", () => {
    for (const abstractText of ["Our code is public.", "Two datasets are released.", "A new benchmark."]) {
      expect(calculatePaperQuality({ abstractText }).utilityScore).toBe(15);
    }
  });

  it("credits method words by prefix", () => {
    expect(calculatePaperQuality({ abstractText: "An experimental methodology." }).utilityScore).toBe(12);
  });
});
