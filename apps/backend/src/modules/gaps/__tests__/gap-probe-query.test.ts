import { describe, it, expect } from "vitest";
import { buildProbeTsQuery, probeAppearsIn, probeTerms, stemProbeWord, verifyProbe } from "../gap-probe-query.js";

describe("stemProbeWord", () => {
  it("reduces singular and plural forms to the same stem", () => {
    expect(stemProbeWord("study")).toBe(stemProbeWord("studies"));
    expect(stemProbeWord("strategy")).toBe(stemProbeWord("strategies"));
    expect(stemProbeWord("skill")).toBe(stemProbeWord("skills"));
    expect(stemProbeWord("curriculum")).toBe(stemProbeWord("curricula"));
  });

  it("reduces analysis and analyses to the same stem", () => {
    expect(stemProbeWord("analysis")).toBe("analys");
    expect(stemProbeWord("analyses")).toBe("analys");
  });

  it("does not strip the s of singular words ending in ss, us or is", () => {
    expect(stemProbeWord("class")).toBe("class");
    expect(stemProbeWord("process")).toBe("process");
    expect(stemProbeWord("corpus")).toBe("corpus");
    expect(stemProbeWord("basis")).toBe("basis");
    expect(stemProbeWord("processes")).toBe("process");
  });

  it("strips a final a only from longer words", () => {
    expect(stemProbeWord("media")).toBe("media");
    expect(stemProbeWord("criteria")).toBe("criteri");
  });

  it("keeps short words intact", () => {
    expect(stemProbeWord("llms")).toBe("llms");
    expect(stemProbeWord("data")).toBe("data");
  });
});

describe("buildProbeTsQuery", () => {
  it("ANDs every word as a prefix term", () => {
    expect(buildProbeTsQuery("longitudinal study")).toBe("longitudinal:* & (study:* | studi:*)");
  });

  it("matches two-letter acronyms exactly and longer ones as prefixes", () => {
    expect(buildProbeTsQuery("AI literacy")).toBe("ai & (literacy:* | literaci:*)");
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

describe("probeTerms", () => {
  it("drops stopwords, stems long words, keeps short tokens exact and dedupes", () => {
    expect(probeTerms("The studies of AI literacy and AI")).toEqual([
      { term: "study", exact: false, alt: "studi" },
      { term: "ai", exact: true },
      { term: "literacy", exact: false, alt: "literaci" },
    ]);
  });

  it("returns nothing for a phrase of stopwords", () => {
    expect(probeTerms("of the")).toEqual([]);
  });
});

describe("probeAppearsIn", () => {
  it("matches plural and singular forms", () => {
    expect(probeAppearsIn("longitudinal study", ["Longitudinal studies of teachers"])).toBe(true);
  });

  it("matches both inflections of a consonant + y word without hitting look-alikes", () => {
    expect(probeAppearsIn("study", ["Studies of reading"])).toBe(true);
    expect(probeAppearsIn("studies", ["A pilot study"])).toBe(true);
    expect(probeAppearsIn("study", ["Students and teachers"])).toBe(false);
    expect(probeAppearsIn("analysis", ["Meta-analyses of tutoring"])).toBe(true);
    expect(probeAppearsIn("class", ["Image classification"])).toBe(true); // prefixes still widen; only the stem is fixed
    expect(probeAppearsIn("media", ["Medical imaging"])).toBe(false);
  });

  it("matches a short acronym exactly, not as a prefix", () => {
    expect(probeAppearsIn("AI", ["The aim of this paper"])).toBe(false);
    expect(probeAppearsIn("AI", ["AI tutors in class"])).toBe(true);
  });

  it("needs every term in the same text", () => {
    expect(probeAppearsIn("teacher feedback", ["Teacher training programs"])).toBe(false);
    expect(probeAppearsIn("teacher feedback", ["Teacher training programs", "Peer feedback and teacher beliefs"])).toBe(true);
  });

  it("is false for a phrase without searchable words", () => {
    expect(probeAppearsIn("of the", ["of the people"])).toBe(false);
  });
});

describe("verifyProbe", () => {
  const texts = ["LLM feedback for writing", "Student motivation survey"];

  it("keeps a probe whose topics both occur", () => {
    const probe = { topicA: "LLM feedback", topicB: "student motivation" };
    expect(verifyProbe(probe, texts)).toBe(probe);
  });

  it("drops a probe when one topic never occurs", () => {
    expect(verifyProbe({ topicA: "LLM feedback", topicB: "quantum error correction" }, texts)).toBeUndefined();
  });

  it("drops a missing or incomplete probe", () => {
    expect(verifyProbe(undefined, texts)).toBeUndefined();
    expect(verifyProbe({ topicA: "LLM feedback", topicB: "" }, texts)).toBeUndefined();
  });
});
