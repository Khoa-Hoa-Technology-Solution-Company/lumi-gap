import { describe, expect, it } from "vitest";
import {
  binomialCdf,
  calibrationOutcome,
  clopperPearsonUpper,
  cohenKappa,
  decideClosure,
  describeBoundArithmetic,
  effectiveLabel,
  falseNoveltyBound,
  judgeKindOf,
  normalizeDoi,
  quoteAppearsIn,
  type ScreenedDocument,
} from "../closure.rules.js";

describe("clopperPearsonUpper", () => {
  it("uses the closed form for zero events", () => {
    // 1 - 0.05^(1/50) = 0.05815...
    expect(clopperPearsonUpper(0, 50, 0.05)).toBe(0.0582);
    // 1 - 0.05^(1/30) = 0.09503..., rounded up
    expect(clopperPearsonUpper(0, 30, 0.05)).toBe(0.0951);
  });

  it("matches published one-sided 95% bounds", () => {
    // Exact Clopper-Pearson upper limits (one-sided 95%): 1/10 -> 0.3942, 3/30 -> 0.2386, 5/100 -> 0.1023
    expect(clopperPearsonUpper(1, 10, 0.05)).toBeCloseTo(0.3942, 3);
    expect(clopperPearsonUpper(3, 30, 0.05)).toBeCloseTo(0.2386, 3);
    expect(clopperPearsonUpper(5, 100, 0.05)).toBe(0.1023);
  });

  it("is 1 when every trial is an event and rejects invalid counts", () => {
    expect(clopperPearsonUpper(4, 4, 0.05)).toBe(1);
    expect(() => clopperPearsonUpper(5, 4, 0.05)).toThrow(RangeError);
    expect(() => clopperPearsonUpper(0, 0, 0.05)).toThrow(RangeError);
    expect(() => clopperPearsonUpper(0, 10, 0)).toThrow(RangeError);
  });

  it("never reports a value below the exact bound", () => {
    for (const [x, m] of [[2, 40], [7, 200], [0, 500], [12, 500]] as const) {
      const upper = clopperPearsonUpper(x, m, 0.05);
      expect(binomialCdf(x, m, upper)).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });
});

describe("binomialCdf", () => {
  it("handles edges and large m without underflow", () => {
    expect(binomialCdf(0, 1, 0.5)).toBeCloseTo(0.5, 10);
    expect(binomialCdf(3, 3, 0.9)).toBe(1);
    expect(binomialCdf(400, 500, 0.8)).toBeGreaterThan(0.5);
  });
});

describe("quoteAppearsIn", () => {
  const text = "We find that federated learning reduces detection latency by 30% on edge devices.";
  it("accepts verbatim quotes despite case, whitespace and typographic quotes", () => {
    expect(quoteAppearsIn("Federated learning  reduces detection latency by 30%", text)).toBe(true);
    expect(quoteAppearsIn("“federated learning reduces detection latency”.", text)).toBe(true);
  });
  it("rejects paraphrases and quotes that are too short", () => {
    expect(quoteAppearsIn("federated learning lowers detection latency", text)).toBe(false);
    expect(quoteAppearsIn("edge devices", text)).toBe(false);
    expect(quoteAppearsIn(undefined, text)).toBe(false);
  });
});

describe("normalizeDoi", () => {
  it("strips resolvers and lowercases", () => {
    expect(normalizeDoi("https://doi.org/10.1016/J.JCLINEPI.2016.05.015")).toBe("10.1016/j.jclinepi.2016.05.015");
    expect(normalizeDoi("doi: 10.1002/asi.21075")).toBe("10.1002/asi.21075");
    expect(normalizeDoi("not a doi")).toBeNull();
  });
});

const doc = (id: string, fields: Partial<ScreenedDocument>): ScreenedDocument => ({ id, ...fields });

describe("effectiveLabel and judgeKindOf", () => {
  it("prefers the human label and needs a verified quote for AI ANSWERS/PARTIAL", () => {
    expect(effectiveLabel(doc("a", { aiLabel: "ANSWERS", aiQuoteVerified: false }))).toBeUndefined();
    expect(effectiveLabel(doc("a", { aiLabel: "ANSWERS", aiQuoteVerified: true }))).toBe("ANSWERS");
    expect(effectiveLabel(doc("a", { aiLabel: "UNRELATED" }))).toBe("UNRELATED");
    expect(effectiveLabel(doc("a", { aiLabel: "ANSWERS", aiQuoteVerified: true, humanLabel: "PARTIAL" }))).toBe("PARTIAL");
  });
  it("is HUMAN only when a person labelled every document", () => {
    expect(judgeKindOf([])).toBe("AI");
    expect(judgeKindOf([doc("a", { humanLabel: "UNRELATED" }), doc("b", { aiLabel: "UNRELATED" })])).toBe("AI");
    expect(judgeKindOf([doc("a", { humanLabel: "UNRELATED" })])).toBe("HUMAN");
  });
});

describe("decideClosure", () => {
  const base = { searchErrors: 0, coverage: { pHat: 0.0582 }, calibration: { epsHat: 0.0951, judgeKind: "AI" }, maxFalseNovelty: 0.2 };

  it("closes on a witness, preferring a person-confirmed one", () => {
    const result = decideClosure({ ...base, documents: [doc("a", { aiLabel: "ANSWERS", aiQuoteVerified: true }), doc("b", { humanLabel: "ANSWERS" })] });
    expect(result).toMatchObject({ decision: "CLOSED", witnessDocumentId: "b", reasons: [] });
  });

  it("certifies an open question when the bound is within the maximum", () => {
    const result = decideClosure({ ...base, documents: [doc("a", { aiLabel: "UNRELATED" })] });
    expect(result).toMatchObject({ decision: "OPEN_CERTIFIED", bound: 0.1533, reasons: [], judgeKind: "AI" });
  });

  it("abstains with every reason that applies", () => {
    const result = decideClosure({ documents: [doc("a", { aiLabel: "PARTIAL", aiQuoteVerified: false })], searchErrors: 1, coverage: null, calibration: null, maxFalseNovelty: 0.2 });
    expect(result.decision).toBe("ABSTAIN");
    expect(result.reasons).toEqual(["SEARCH_ERRORS", "PENDING_REVIEW", "NO_COVERAGE", "NO_CALIBRATION"]);
    expect(result.bound).toBeUndefined();
  });

  it("abstains when the bound is too large or the calibration measured another judge", () => {
    expect(decideClosure({ ...base, coverage: { pHat: 0.3 }, documents: [] }).reasons).toEqual(["BOUND_EXCEEDS_MAX"]);
    expect(decideClosure({ ...base, documents: [doc("a", { humanLabel: "UNRELATED" })] }).reasons).toEqual(["CALIBRATION_JUDGE_MISMATCH"]);
  });

  it("counts corroboration only from limitation statements of other papers", () => {
    const docs = [doc("a", { paperId: "p1", humanLabel: "PARTIAL", limitationStatement: true })];
    expect(decideClosure({ ...base, documents: docs }).corroborated).toBe(true);
    expect(decideClosure({ ...base, documents: docs, excludeCorroborationPaperIds: ["p1"] }).corroborated).toBe(false);
  });
});

describe("calibrationOutcome", () => {
  it("is FOUND, MISSED or PENDING", () => {
    expect(calibrationOutcome([doc("a", { humanLabel: "ANSWERS" })])).toBe("FOUND");
    expect(calibrationOutcome([doc("a", { aiLabel: "UNRELATED" })])).toBe("MISSED");
    expect(calibrationOutcome([doc("a", { aiLabel: "UNRELATED" })], 1)).toBe("PENDING");
    expect(calibrationOutcome([doc("a", { aiLabel: "ANSWERS" })])).toBe("PENDING");
  });
});

describe("cohenKappa", () => {
  it("is 1 for perfect agreement and null with too few pairs", () => {
    expect(cohenKappa([["ANSWERS", "ANSWERS"], ["UNRELATED", "UNRELATED"]])).toBe(1);
    expect(cohenKappa([["ANSWERS", "ANSWERS"]])).toBeNull();
  });
  it("matches a hand-computed value", () => {
    // po = 2/4, pe = 0.5 -> kappa = 0
    expect(cohenKappa([["ANSWERS", "ANSWERS"], ["ANSWERS", "UNRELATED"], ["UNRELATED", "UNRELATED"], ["UNRELATED", "ANSWERS"]])).toBe(0);
    // po = 3/4, pe = (2/4)(3/4) + (2/4)(1/4) = 0.5 -> kappa = 0.5
    expect(cohenKappa([["ANSWERS", "ANSWERS"], ["ANSWERS", "ANSWERS"], ["UNRELATED", "UNRELATED"], ["UNRELATED", "ANSWERS"]])).toBe(0.5);
  });
});

describe("falseNoveltyBound and describeBoundArithmetic", () => {
  it("adds and caps", () => {
    expect(falseNoveltyBound(0.0951, 0.0582)).toBe(0.1533);
    expect(falseNoveltyBound(0.8, 0.5)).toBe(1);
  });
  it("prints the arithmetic a person can redo", () => {
    const lines = describeBoundArithmetic({ calibration: { n: 30, misses: 0, epsHat: 0.0951 }, coverage: { m: 50, x: 0, pHat: 0.0582 }, delta: 0.05, bound: 0.1533, maxFalseNovelty: 0.2 });
    expect(lines.at(-1)).toBe("B = 0.0951 + 0.0582 = 0.1533 <= 0.2");
  });
});
