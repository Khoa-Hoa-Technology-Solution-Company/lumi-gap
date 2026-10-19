import { describe, it, expect } from "vitest";
import { buildPaperJudgePrompt, buildQualityJudgeInput } from "../quality.prompt.js";

describe("buildPaperJudgePrompt", () => {
  it("includes the title and abstract and asks for JSON only", () => {
    const p = buildPaperJudgePrompt({
      title: "Deep Learning for Protein Folding",
      abstractText: "We propose a transformer method and report 92% accuracy on CASP.",
    });
    expect(p).toContain("Deep Learning for Protein Folding");
    expect(p).toContain("We propose a transformer method");
    expect(p).toMatch(/JSON/i);
  });

  it("truncates a very long abstract to bound tokens", () => {
    const long = "lorem ".repeat(2000); // ~12k chars
    const input = buildQualityJudgeInput({ kind: "paper", title: "T", content: long });
    expect(input.sources.find((item) => item.id === "target")).toMatchObject({ charactersRead: 6000, truncated: true });
    expect(input.sources.find((item) => item.id === "target")?.text).toHaveLength(6000);
  });
});
