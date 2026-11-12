import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { classifyScreeningPair, screeningConsensus } from "../screening.calculator.js";
describe("Historical independent ballot classification", () => {
  const reviewerA = randomUUID(), reviewerB = randomUUID();

  describe("Disagreement Detection & Consensus Rules", () => {
    it("two opposing reviews (INCLUDE vs EXCLUDE) create a CONFLICT", () => {
      const reviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "INCLUDE" as const, exclusionReason: "" },
        { roundId: "r1", reviewerId: reviewerB, decision: "EXCLUDE" as const, exclusionReason: "Out of scope" },
      ];
      const classification = classifyScreeningPair(reviews, "TITLE_ABSTRACT", true);
      expect(classification).toBe("CONFLICT");

      const consensus = screeningConsensus(["INCLUDE", "EXCLUDE"], 2, 2, "UNANIMOUS");
      expect(consensus).toBe("NEEDS_RESOLUTION");
    });

    it("INCLUDE vs UNSURE creates NEEDS_CLARIFICATION", () => {
      const reviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "INCLUDE" as const, exclusionReason: "" },
        { roundId: "r1", reviewerId: reviewerB, decision: "UNSURE" as const, exclusionReason: "" },
      ];
      const classification = classifyScreeningPair(reviews, "TITLE_ABSTRACT", true);
      expect(classification).toBe("NEEDS_CLARIFICATION");

      const consensus = screeningConsensus(["INCLUDE", "UNSURE"], 2, 2, "UNANIMOUS");
      expect(consensus).toBe("NEEDS_RESOLUTION");
    });

    it("two matching reviews (INCLUDE vs INCLUDE) resolve automatically as consensus", () => {
      const reviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "INCLUDE" as const, exclusionReason: "" },
        { roundId: "r1", reviewerId: reviewerB, decision: "INCLUDE" as const, exclusionReason: "" },
      ];
      const classification = classifyScreeningPair(reviews, "TITLE_ABSTRACT", true);
      expect(classification).toBe("AGREEMENT_INCLUDE");

      const consensus = screeningConsensus(["INCLUDE", "INCLUDE"], 2, 2, "UNANIMOUS");
      expect(consensus).toBe("INCLUDED");
    });

    it("two matching reviews (EXCLUDE vs EXCLUDE) resolve as EXCLUDED", () => {
      const reviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "EXCLUDE" as const, exclusionReason: "Not peer reviewed" },
        { roundId: "r1", reviewerId: reviewerB, decision: "EXCLUDE" as const, exclusionReason: "Not peer reviewed" },
      ];
      const classification = classifyScreeningPair(reviews, "TITLE_ABSTRACT", true);
      expect(classification).toBe("AGREEMENT_EXCLUDE");

      const consensus = screeningConsensus(["EXCLUDE", "EXCLUDE"], 2, 2, "UNANIMOUS");
      expect(consensus).toBe("EXCLUDED");
    });

    it("post-discussion reassessment: changing EXCLUDE to INCLUDE converts CONFLICT into AGREEMENT_INCLUDE", () => {
      // Initially in conflict: Reviewer A is INCLUDE, Reviewer B is EXCLUDE
      const initialReviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "INCLUDE" as const, exclusionReason: "" },
        { roundId: "r1", reviewerId: reviewerB, decision: "EXCLUDE" as const, exclusionReason: "Lý do cũ" },
      ];
      expect(classifyScreeningPair(initialReviews, "TITLE_ABSTRACT", true)).toBe("CONFLICT");

      // Reviewer B discusses and reassesses to INCLUDE
      const revisedReviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "INCLUDE" as const, exclusionReason: "" },
        { roundId: "r1", reviewerId: reviewerB, decision: "INCLUDE" as const, exclusionReason: "" },
      ];
      expect(classifyScreeningPair(revisedReviews, "TITLE_ABSTRACT", true)).toBe("AGREEMENT_INCLUDE");
      expect(screeningConsensus(["INCLUDE", "INCLUDE"], 2, 2, "UNANIMOUS")).toBe("INCLUDED");
    });

    it("post-discussion reassessment: changing INCLUDE to EXCLUDE converts CONFLICT into AGREEMENT_EXCLUDE", () => {
      // Reviewer A reassesses to EXCLUDE with same exclusion reason
      const revisedReviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "EXCLUDE" as const, exclusionReason: "Not peer reviewed" },
        { roundId: "r1", reviewerId: reviewerB, decision: "EXCLUDE" as const, exclusionReason: "Not peer reviewed" },
      ];
      expect(classifyScreeningPair(revisedReviews, "TITLE_ABSTRACT", true)).toBe("AGREEMENT_EXCLUDE");
      expect(screeningConsensus(["EXCLUDE", "EXCLUDE"], 2, 2, "UNANIMOUS")).toBe("EXCLUDED");
    });
  });

});
