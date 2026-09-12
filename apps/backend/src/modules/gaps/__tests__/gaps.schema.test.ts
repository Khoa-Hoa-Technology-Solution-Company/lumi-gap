import { describe, expect, it } from "vitest";
import {
  AnalyzeGapSchema,
  ListGapsQuerySchema,
  PreviewGapEvidenceSchema,
} from "../dto/gaps.schema.js";

const ids = [
  "507f1f77bcf86cd799439011",
  "507f1f77bcf86cd799439012",
  "507f1f77bcf86cd799439013",
];

describe("gap evidence request schemas", () => {
  it("accepts a frozen reviewed pack with at least three papers", () => {
    const parsed = AnalyzeGapSchema.parse({
      topic: "federated learning in medical imaging",
      selectedPaperIds: ids,
      evidenceMode: "selected",
      yearFrom: 2020,
      yearTo: 2025,
    });

    expect(parsed.evidenceMode).toBe("selected");
    expect(parsed.selectedPaperIds).toEqual(ids);
  });

  it("rejects selected analysis with fewer than three papers", () => {
    const result = AnalyzeGapSchema.safeParse({
      topic: "federated learning",
      selectedPaperIds: ids.slice(0, 2),
      evidenceMode: "selected",
    });

    expect(result.success).toBe(false);
  });

  it("allows previewing a partially curated hybrid pack without charging analysis", () => {
    const parsed = PreviewGapEvidenceSchema.parse({
      topic: "federated learning",
      selectedPaperIds: [ids[0]],
      evidenceMode: "hybrid",
    });

    expect(parsed.evidenceMode).toBe("hybrid");
    expect(parsed.selectedPaperIds).toEqual([ids[0]]);
  });

  it("deduplicates selected paper ids and rejects reversed years", () => {
    const duplicate = PreviewGapEvidenceSchema.parse({
      topic: "federated learning",
      selectedPaperIds: [ids[0], ids[0]],
    });
    expect(duplicate.selectedPaperIds).toEqual([ids[0]]);

    const invalidYears = PreviewGapEvidenceSchema.safeParse({
      topic: "federated learning",
      yearFrom: 2025,
      yearTo: 2020,
    });
    expect(invalidYears.success).toBe(false);
  });

  it("parses global list search and sorting controls", () => {
    const parsed = ListGapsQuerySchema.parse({
      search: "federated learning",
      sortBy: "papers",
      page: "2",
    });

    expect(parsed.search).toBe("federated learning");
    expect(parsed.sortBy).toBe("papers");
    expect(parsed.page).toBe(2);
  });
});
