import { describe, it, expect } from "vitest";
import { buildProbeTsQuery, stemProbeWord } from "../gap-probe-query.js";

describe("stemProbeWord", () => {
  it("reduces singular and plural forms to the same stem", () => {
    expect(stemProbeWord("study")).toBe(stemProbeWord("studies"));
    expect(stemProbeWord("strategy")).toBe(stemProbeWord("strategies"));
    expect(stemProbeWord("skill")).toBe(stemProbeWord("skills"));
    expect(stemProbeWord("curriculum")).toBe(stemProbeWord("curricula"));
  });

  it("keeps short words intact", () => {
    expect(stemProbeWord("llms")).toBe("llms");
    expect(stemProbeWord("data")).toBe("data");
  });
});

describe("buildProbeTsQuery", () => {
  it("ANDs every word as a prefix term", () => {
    expect(buildProbeTsQuery("longitudinal study")).toBe("longitudinal:* & stud:*");
  });

  it("matches two-letter acronyms exactly and longer ones as prefixes", () => {
    expect(buildProbeTsQuery("AI literacy")).toBe("ai & literac:*");
    expect(buildProbeTsQuery("LLM")).toBe("llm:*");
  });

  it("splits hyphens and drops stopwords and punctuation", () => {
    expect(buildProbeTsQuery("LLM-integrated curriculum")).toBe("llm:* & integrat:* & curricul:*");
    expect(buildProbeTsQuery("ethics of the AI (in) & 'education'!")).toBe("ethic:* & ai & education:*");
  });

  it("keeps non-Latin letters", () => {
    expect(buildProbeTsQuery("giáo dục")).toBe("giáo:* & dục:*");
  });

  it("returns null when nothing searchable remains", () => {
    expect(buildProbeTsQuery("  of the  ")).toBeNull();
    expect(buildProbeTsQuery("&|!")).toBeNull();
  });
});
