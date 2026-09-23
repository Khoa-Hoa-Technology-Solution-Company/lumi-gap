import { describe, expect, it } from "vitest";
import { addCorpusPaperSchema, createCorpusSchema } from "../literature.schema.js";

describe("literature workspace validation", () => {
  it("normalizes duplicate keywords while preserving the PICOC scope", () => {
    const parsed = createCorpusSchema.parse({
      name: "Industrial LLM requirements corpus",
      topic: "LLM-assisted requirements analysis",
      keywords: ["LLM", "Requirements", "LLM"],
      picoc: { population: "Industrial software teams", context: "Production projects" },
    });
    expect(parsed.keywords).toEqual(["LLM", "Requirements"]);
    expect(parsed.picoc.context).toBe("Production projects");
  });

  it("requires a reason when a paper is excluded", () => {
    const result = addCorpusPaperSchema.safeParse({
      paperId: "507f1f77bcf86cd799439011",
      included: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts structured per-study evidence without inventing missing fields", () => {
    const parsed = addCorpusPaperSchema.parse({
      paperId: "507f1f77bcf86cd799439011",
      evidence: { methodology: "Case study", context: "Vietnamese universities", limitations: "Single institution" },
    });
    expect(parsed.evidence.findings).toBeUndefined();
    expect(parsed.evidence.methodology).toBe("Case study");
  });
});
