import { describe, expect, it } from "vitest";
import {
  CalibrationQuestionParamsSchema,
  CheckParamsSchema,
  CreateCalibrationQuestionSchema,
  CreateClosureCalibrationSchema,
  CreateCoverageCheckSchema,
  DecideGapClosureSchema,
  DossierQuerySchema,
  QuestionFacetsSchema,
  ReviewClosureDocumentSchema,
  StartGapClosureCheckSchema,
} from "../dto/closure.schema.js";
import { GapCandidateSchema } from "../../gaps/dto/gaps.schema.js";

const uuid = "3f1c8b2e-6a54-4d8e-9a3b-0c2d5e7f9a11";

describe("QuestionFacetsSchema", () => {
  it("trims, drops blank facets and rejects unknown keys", () => {
    expect(QuestionFacetsSchema.parse({ population: "  adults  ", outcome: "   " })).toEqual({ population: "adults" });
    expect(QuestionFacetsSchema.safeParse({ colour: "red" }).success).toBe(false);
  });

  it("rejects a facet longer than 300 characters", () => {
    expect(QuestionFacetsSchema.safeParse({ context: "x".repeat(301) }).success).toBe(false);
    expect(QuestionFacetsSchema.safeParse({ context: "x".repeat(300) }).success).toBe(true);
  });
});

describe("GapCandidateSchema questionFacets", () => {
  const base = {
    topic: "federated learning",
    title: "Gap title",
    gapType: "OTHER",
    establishedKnowledge: "Established knowledge text",
    observedLimitation: "Observed limitation text",
    missingEvidence: "Missing evidence text",
    significanceExplanation: "Significance text here",
    gapConfidence: "LOW",
    researchPriority: "LOW",
  };

  it("keeps working without facets and accepts valid ones", () => {
    expect(GapCandidateSchema.safeParse(base).success).toBe(true);
    const parsed = GapCandidateSchema.parse({ ...base, questionFacets: { population: "children", outcome: "adherence" } });
    expect(parsed.questionFacets).toEqual({ population: "children", outcome: "adherence" });
  });

  it("rejects an oversized facet", () => {
    expect(GapCandidateSchema.safeParse({ ...base, questionFacets: { population: "x".repeat(301) } }).success).toBe(false);
  });
});

describe("StartGapClosureCheckSchema", () => {
  it("accepts an absent body (the gap's own question is used)", () => {
    expect(StartGapClosureCheckSchema.parse(undefined)).toEqual({});
    expect(StartGapClosureCheckSchema.parse({})).toEqual({});
  });

  it("dedupes queries, caps them at 5 and checks the year range", () => {
    expect(StartGapClosureCheckSchema.parse({ queries: ["federated learning", "federated learning", "split learning"] }).queries).toEqual(["federated learning", "split learning"]);
    expect(StartGapClosureCheckSchema.safeParse({ queries: Array.from({ length: 6 }, (_, i) => `query ${i}`) }).success).toBe(false);
    expect(StartGapClosureCheckSchema.safeParse({ yearFrom: 2024, yearTo: 2020 }).success).toBe(false);
    expect(StartGapClosureCheckSchema.parse({ yearFrom: "2020", yearTo: 2024 })).toMatchObject({ yearFrom: 2020, yearTo: 2024 });
  });

  it("rejects unknown fields", () => {
    expect(StartGapClosureCheckSchema.safeParse({ credits: 0 }).success).toBe(false);
  });
});

describe("ReviewClosureDocumentSchema", () => {
  it("requires a known label and rejects unknown fields", () => {
    expect(ReviewClosureDocumentSchema.safeParse({ label: "UNSURE" }).success).toBe(false);
    expect(ReviewClosureDocumentSchema.safeParse({ label: "ANSWERS", quote: "a verbatim sentence from the abstract", reviewerId: uuid }).success).toBe(false);
    expect(ReviewClosureDocumentSchema.parse({ label: "PARTIAL", quote: " q ", limitationStatement: true, facets: { outcome: false } })).toMatchObject({ label: "PARTIAL", quote: "q" });
  });
});

describe("ids and small bodies", () => {
  it("accepts UUID params only for the closure tables", () => {
    expect(CheckParamsSchema.safeParse({ checkId: uuid }).success).toBe(true);
    expect(CheckParamsSchema.safeParse({ checkId: "507f1f77bcf86cd799439011" }).success).toBe(false);
    expect(CalibrationQuestionParamsSchema.safeParse({ id: uuid, questionId: "nope" }).success).toBe(false);
  });

  it("decide takes optional ids and defaults to {}", () => {
    expect(DecideGapClosureSchema.parse(undefined)).toEqual({});
    expect(DecideGapClosureSchema.safeParse({ coverageCheckId: "x" }).success).toBe(false);
  });

  it("dossier format defaults to json", () => {
    expect(DossierQuerySchema.parse({})).toEqual({ format: "json" });
    expect(DossierQuerySchema.safeParse({ format: "pdf" }).success).toBe(false);
  });
});

describe("coverage and calibration bodies", () => {
  it("coverage accepts 1..200 DOIs", () => {
    const body = { topic: "federated learning", referenceSource: "Reference list of a survey", dois: ["10.1000/xyz"] };
    expect(CreateCoverageCheckSchema.safeParse(body).success).toBe(true);
    expect(CreateCoverageCheckSchema.safeParse({ ...body, dois: [] }).success).toBe(false);
    expect(CreateCoverageCheckSchema.safeParse({ ...body, dois: Array.from({ length: 201 }, (_, i) => `10.1000/${i}`) }).success).toBe(false);
  });

  it("calibration needs a judge kind", () => {
    expect(CreateClosureCalibrationSchema.safeParse({ name: "Nursing 2026", domain: "nursing", judgeKind: "AI" }).success).toBe(true);
    expect(CreateClosureCalibrationSchema.safeParse({ name: "Nursing 2026", domain: "nursing", judgeKind: "ROBOT" }).success).toBe(false);
  });

  it("calibration question normalizes the witness DOI and rejects invalid ones", () => {
    const body = { question: "Does intervention X improve outcome Y?", witnessDoi: "https://doi.org/10.1000/ABC", labelSource: "SURVEY" };
    expect(CreateCalibrationQuestionSchema.parse(body).witnessDoi).toBe("10.1000/abc");
    expect(CreateCalibrationQuestionSchema.safeParse({ ...body, witnessDoi: "not a doi" }).success).toBe(false);
    expect(CreateCalibrationQuestionSchema.safeParse({ ...body, labelSource: "GUESS" }).success).toBe(false);
  });
});
