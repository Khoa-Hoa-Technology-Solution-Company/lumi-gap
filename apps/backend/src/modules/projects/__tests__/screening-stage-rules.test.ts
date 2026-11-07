import { describe, expect, it } from "vitest";
import { evaluateScreeningPair, automaticFullTextStage } from "../screening.calculator.js";
import type { ScreeningStageMode } from "@trend/shared-types";

export const combinations = [
  ["INCLUDE", "INCLUDE", "FINAL_INCLUDED", "ADVANCE_TO_FULLTEXT", "FINAL_INCLUDED"],
  ["INCLUDE", "EXCLUDE", "CONFLICT", "CONFLICT", "CONFLICT"],
  ["INCLUDE", "UNSURE", "NEEDS_CLARIFICATION", "ADVANCE_TO_FULLTEXT", "NEEDS_CLARIFICATION"],
  ["EXCLUDE", "INCLUDE", "CONFLICT", "CONFLICT", "CONFLICT"],
  ["EXCLUDE", "EXCLUDE", "EXCLUDED", "EXCLUDED", "EXCLUDED"],
  ["EXCLUDE", "UNSURE", "NEEDS_RESOLUTION", "CONFLICT", "NEEDS_CLARIFICATION"],
  ["UNSURE", "INCLUDE", "NEEDS_CLARIFICATION", "ADVANCE_TO_FULLTEXT", "NEEDS_CLARIFICATION"],
  ["UNSURE", "EXCLUDE", "NEEDS_RESOLUTION", "CONFLICT", "NEEDS_CLARIFICATION"],
  ["UNSURE", "UNSURE", "NEEDS_CLARIFICATION", "ADVANCE_TO_FULLTEXT", "NEEDS_CLARIFICATION"],
] as const;
const pair = (a: string, b: string) => [a, b].map((decision, i) => ({ decision, reviewerId: `r${i}`, roundId: "round", exclusionReason: "Wrong population", revision: 1, fullTextReference: "Source PDF p. 4, population" }));
describe("immutable two-reviewer stage rules", () => {
  for (const [mode, phase, index] of [["SINGLE_STAGE", "TITLE_ABSTRACT", 2], ["TWO_STAGE", "TITLE_ABSTRACT", 3], ["TWO_STAGE", "FULL_TEXT", 4]] as const) {
    it.each(combinations)(`${mode}/${phase}: %s + %s`, (...row) => {
      expect(evaluateScreeningPair({ screeningMode: mode, workflowVersion: 11, exclusionCriteria: ["Wrong population"] }, phase, pair(row[0], row[1]))).toBe(row[index]);
    });
  }
  const settings = { screeningMode: "SINGLE_STAGE" as ScreeningStageMode, exclusionCriteria: ["Wrong population"] };
  it("counts only a distinct effective pair and never creates a conclusion from one ballot", () => {
    expect(evaluateScreeningPair(settings, "TITLE_ABSTRACT", [])).toBe("WAITING_REVIEWS");
    const ballots = pair("INCLUDE", "EXCLUDE");
    expect(evaluateScreeningPair(settings, "TITLE_ABSTRACT", ballots.slice(0, 1))).toBe("WAITING_SECOND_REVIEW");
    expect(evaluateScreeningPair(settings, "TITLE_ABSTRACT", [ballots[0]!, { ...ballots[1]!, reviewerId: "r0" }])).toBe("NEEDS_CLARIFICATION");
    expect(evaluateScreeningPair(settings, "TITLE_ABSTRACT", [ballots[0]!, { ...ballots[1]!, roundId: "other" }])).toBe("NEEDS_CLARIFICATION");
    expect(evaluateScreeningPair(settings, "TITLE_ABSTRACT", [...ballots, ballots[0]!])).toBe("NEEDS_CLARIFICATION");
  });
  it("requires real criteria, source evidence and reconciled fulltext reasons", () => {
    const ballots = pair("EXCLUDE", "EXCLUDE");
    expect(evaluateScreeningPair({ ...settings, exclusionCriteria: [] }, "TITLE_ABSTRACT", ballots)).toBe("NEEDS_CLARIFICATION");
    expect(evaluateScreeningPair(settings, "TITLE_ABSTRACT", ballots, false)).toBe("NEEDS_CLARIFICATION");
    expect(evaluateScreeningPair(settings, "FULL_TEXT", [ballots[0]!, { ...ballots[1]!, fullTextReference: "" }])).toBe("NEEDS_CLARIFICATION");
    expect(evaluateScreeningPair({ ...settings, exclusionCriteria: ["Wrong population", "Wrong method"] }, "FULL_TEXT", [ballots[0]!, { ...ballots[1]!, exclusionReason: "Wrong method" }])).toBe("NEEDS_RESOLUTION");
  });
  it("honors explicit mode while keeping old immutable snapshots compatible", () => {
    expect(automaticFullTextStage({ screeningMode: "TWO_STAGE", workflowVersion: 11 })).toBe(true);
    expect(automaticFullTextStage({ screeningMode: "SINGLE_STAGE", stages: ["TITLE_ABSTRACT", "FULL_TEXT"] })).toBe(false);
    expect(automaticFullTextStage({ workflowVersion: 10, stages: ["TITLE_ABSTRACT", "FULL_TEXT"] })).toBe(false);
    expect(automaticFullTextStage({ workflowVersion: 3, stages: ["TITLE_ABSTRACT", "FULL_TEXT"] })).toBe(true);
  });
});
