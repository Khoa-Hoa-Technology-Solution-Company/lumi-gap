import { describe, expect, it } from "vitest";
import { isAcronym, keywordMatchCandidates, keywordMatchKey } from "../taxonomy.normalize.js";

describe("keywordMatchKey", () => {
  it.each([
    ["large language models", "large language model"],
    ["health care", "healthcare"],
    ["pre trained language models", "pretrained language model"],
    ["hallucinations", "hallucination"],
    ["case studies", "case study"],
    ["search approaches", "search approach"],
  ])("matches %s with %s", (a, b) => {
    expect(keywordMatchKey(a)).toBe(keywordMatchKey(b));
  });

  it.each([
    ["analysis", "analysi"],
    ["corpus", "corpu"],
    ["glass", "glas"],
    ["gas", "ga"],
  ])("keeps words that are not plurals: %s", (word, wrong) => {
    expect(keywordMatchKey(word)).not.toBe(wrong);
  });

  it("keeps short words that are often acronyms", () => {
    expect(keywordMatchKey("umls")).not.toBe(keywordMatchKey("uml"));
  });

  it("recognizes acronyms by their capitals", () => {
    expect(isAcronym("GRADE")).toBe(true);
    expect(isAcronym("GPT-4")).toBe(true);
    expect(isAcronym("grades")).toBe(false);
    expect(isAcronym("ChatGPT")).toBe(false);
  });

  it("only singularizes the last word", () => {
    expect(keywordMatchKey("systems biology")).toBe("systemsbiology");
  });

  it("lists every spacing-free spelling that shares the key", () => {
    for (const term of ["large language models", "case studies", "search approaches"]) {
      const key = keywordMatchKey(term);
      expect(keywordMatchCandidates(key)).toContain(term.replace(/ /g, ""));
    }
  });
});
