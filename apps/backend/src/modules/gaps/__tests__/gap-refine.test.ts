import { describe, expect, it } from "vitest";
import { applyRefinement, buildRefinePrompt, GAP_REFINE_PROMPT_VERSION, type RefineGapInput } from "../gap-refine.js";

const gap = (counters: RefineGapInput["counters"]): RefineGapInput => ({ title: "APR with LLM feedback", description: "No work combines repair and feedback.", rationale: "Papers [1, 2] treat them apart.", suggestedResearchQuestion: "Does it help novices?", counters });
const pearl = { ref: "C1", paperId: "p-pearl", title: "PEARL: assessment, repair, learning feedback", abstractText: "PEARL is an integrated workflow that combines correctness assessment, automated program repair, and feedback generation for introductory assignments.", publicationYear: 2026 };
const survey = { ref: "C2", paperId: "p-survey", title: "A survey of LLMs in education", abstractText: "An overview of the field.", publicationYear: 2024 };

describe("buildRefinePrompt", () => {
  it("lists each gap with its related papers' abstracts inside untrusted-data markers", () => {
    const prompt = buildRefinePrompt([gap([pearl, survey])]);
    expect(prompt).toContain("GAP 1: APR with LLM feedback");
    expect(prompt).toContain("Research question: Does it help novices?");
    expect(prompt).toContain('[C1] "PEARL: assessment, repair, learning feedback" (2026)');
    expect(prompt).toContain("<<<ABSTRACT_C2");
  });
});

describe("applyRefinement", () => {
  it("drops a gap only with a quote found verbatim in the cited paper", () => {
    const [result] = applyRefinement([gap([pearl])], { decisions: [{ gap: 1, action: "drop", answeredBy: "C1", quote: "combines correctness assessment, automated program repair, and feedback generation", reason: "PEARL does exactly this." }] });
    expect(result!.refinement).toMatchObject({ action: "drop", answeredByPaperId: "p-pearl", counterCount: 1, promptVersion: GAP_REFINE_PROMPT_VERSION });
  });

  it("keeps the gap when the quote is not in the paper or names another paper", () => {
    const invented = applyRefinement([gap([pearl])], { decisions: [{ gap: 1, action: "drop", answeredBy: "C1", quote: "this paper fully solves automated repair feedback for every novice" }] });
    expect(invented[0]!.refinement.action).toBe("keep");
    const wrongPaper = applyRefinement([gap([pearl])], { decisions: [{ gap: 1, action: "drop", answeredBy: "C9", quote: "combines correctness assessment, automated program repair" }] });
    expect(wrongPaper[0]!.refinement.action).toBe("keep");
  });

  it("narrows with a complete rewrite and keeps the original, and keeps an incomplete rewrite as proposed", () => {
    const [narrowed] = applyRefinement([gap([pearl])], { decisions: [{ gap: 1, action: "narrow", reason: "PEARL covers repair quality, not learning.", title: "Learning effect of repair-verified feedback", description: "No controlled study measures learning.", suggestedResearchQuestion: "Does repair-verified LLM feedback improve novices' debugging skill compared with plain LLM feedback?", questionFacets: { population: "novice programmers", outcome: "debugging skill", extra: "x" } }] });
    expect(narrowed!.refinement).toMatchObject({ action: "narrow", original: { title: "APR with LLM feedback" } });
    expect(narrowed!.narrowed).toMatchObject({ title: "Learning effect of repair-verified feedback", rationale: "Papers [1, 2] treat them apart.", questionFacets: { population: "novice programmers", outcome: "debugging skill" } });
    const [incomplete] = applyRefinement([gap([pearl])], { decisions: [{ gap: 1, action: "narrow", title: "Only a title" }] });
    expect(incomplete!.refinement.action).toBe("keep");
    expect(incomplete!.narrowed).toBeUndefined();
  });

  it("keeps every gap without a usable decision, matching decisions by gap number", () => {
    const results = applyRefinement([gap([pearl]), gap([survey])], { decisions: [{ gap: 2, action: "keep", reason: "The survey does not address it." }, { gap: 7, action: "drop" }] });
    expect(results.map((result) => result.refinement.action)).toEqual(["keep", "keep"]);
    expect(results[1]!.refinement.reason).toBe("The survey does not address it.");
    expect(applyRefinement([gap([pearl])], null)[0]!.refinement.action).toBe("keep");
  });
});
