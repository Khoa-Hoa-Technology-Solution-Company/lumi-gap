import { describe, expect, it } from "vitest";
import { CreateReportSchema, PreviewReportEvidenceSchema } from "../dto/report.schema.js";

const paperId = "64f1a7f0a7f0a7f0a7f0a7f0";

describe("report DTO schemas", () => {
  it("accepts selected paper ids when creating a report", () => {
    const parsed = CreateReportSchema.parse({
      query: "What are the research gaps in LLM agents?",
      language: "en",
      scopeFilters: { languages: ["en", "vi"] },
      selectedPaperIds: [paperId],
    });

    expect(parsed.selectedPaperIds).toEqual([paperId]);
    expect(parsed.scopeFilters?.languages).toEqual(["en", "vi"]);
  });

  it("accepts project-scoped report creation without selected paper ids", () => {
    const parsed = CreateReportSchema.parse({
      query: "What can this project conclude?",
      projectId: "64f1a7f0a7f0a7f0a7f0a7f1",
      language: "en",
    });

    expect(parsed.projectId).toBe("64f1a7f0a7f0a7f0a7f0a7f1");
    expect(parsed.selectedPaperIds).toBeUndefined();
  });

  it("validates report evidence preview requests", () => {
    const parsed = PreviewReportEvidenceSchema.parse({
      query: "LLM agent evaluation",
      topic: "LLM agents",
      projectId: "64f1a7f0a7f0a7f0a7f0a7f1",
      yearFrom: "2021",
      yearTo: "2025",
      selectedPaperIds: [paperId],
      fillWithRetrieved: false,
    });

    expect(parsed.yearFrom).toBe(2021);
    expect(parsed.projectId).toBe("64f1a7f0a7f0a7f0a7f0a7f1");
    expect(parsed.selectedPaperIds).toEqual([paperId]);
    expect(parsed.fillWithRetrieved).toBe(false);
  });
});
