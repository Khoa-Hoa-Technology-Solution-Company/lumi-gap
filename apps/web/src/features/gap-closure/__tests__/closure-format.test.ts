import { describe, expect, it } from "vitest";
import type { ClosureAbstainReason } from "@trend/shared-types";
import {
  ABSTAIN_REASON_KEYS,
  abstainReasonKey,
  activeFacetKeys,
  boundEquation,
  buildBoundArithmetic,
  closureBadgeSpec,
  compactFacetMatch,
  compactFacets,
  countPendingDocuments,
  documentExternalUrl,
  formatBoundPercent,
  formatCount,
  formatRate,
  formatSum,
  isClosureCheckRunning,
  parseDoiLines,
  parseLines,
  quoteAppearsInText,
  splitSentences,
} from "../closure-format";

describe("formatBoundPercent", () => {
  it("rounds the bound up so the badge never understates the risk", () => {
    expect(formatBoundPercent(0.1533)).toBe("15.4");
    expect(formatBoundPercent(0.2)).toBe("20");
    expect(formatBoundPercent(0.0001)).toBe("0.1");
    expect(formatBoundPercent(1)).toBe("100");
  });
  it("returns undefined for a missing bound", () => {
    expect(formatBoundPercent(undefined)).toBeUndefined();
    expect(formatBoundPercent(Number.NaN)).toBeUndefined();
  });
});

describe("closureBadgeSpec", () => {
  it("maps every status to its label", () => {
    expect(closureBadgeSpec(undefined)).toEqual({ labelKey: "Not checked", tone: "neutral" });
    expect(closureBadgeSpec("NOT_CHECKED")).toEqual({ labelKey: "Not checked", tone: "neutral" });
    expect(closureBadgeSpec("CLOSED")).toEqual({ labelKey: "Already answered", tone: "closed" });
    expect(closureBadgeSpec("ABSTAIN")).toEqual({ labelKey: "Needs review", tone: "warning" });
  });
  it("shows the false-novelty bound for OPEN_CERTIFIED", () => {
    expect(closureBadgeSpec("OPEN_CERTIFIED", 0.1533)).toEqual({
      labelKey: "Open · false-novelty risk ≤ {{bound}}%",
      tone: "open",
      bound: "15.4",
    });
  });
  it("does not invent a bound when the summary lacks one", () => {
    expect(closureBadgeSpec("OPEN_CERTIFIED")).toEqual({ labelKey: "Open · certified", tone: "open" });
  });
});

describe("bound arithmetic", () => {
  const check = { epsHat: 0.0951, pHat: 0.0582, bound: 0.1533, maxFalseNovelty: 0.2, delta: 0.05 };

  it("collects the numbers and the counts behind them", () => {
    const arithmetic = buildBoundArithmetic(check, { x: 2, m: 40 }, { misses: 3, n: 60 });
    expect(arithmetic.epsHat).toEqual({ value: 0.0951, misses: 3, n: 60 });
    expect(arithmetic.pHat).toEqual({ value: 0.0582, x: 2, m: 40 });
    expect(arithmetic.bound).toBe(0.1533);
    expect(arithmetic.max).toBe(0.2);
    expect(arithmetic.withinMax).toBe(true);
    expect(arithmetic.confidencePercent).toBe(95);
  });

  it("formats the sum and the comparison like the server's example", () => {
    const arithmetic = buildBoundArithmetic(check);
    expect(formatSum(arithmetic)).toBe("0.0951 + 0.0582 = 0.1533");
    expect(boundEquation(formatSum(arithmetic)!, arithmetic)).toBe("B = epsHat + pHat = 0.0951 + 0.0582 = 0.1533 ≤ 0.2000");
  });

  it("flags a bound above the maximum", () => {
    const arithmetic = buildBoundArithmetic({ ...check, bound: 0.31, maxFalseNovelty: 0.2 });
    expect(arithmetic.withinMax).toBe(false);
    expect(boundEquation("x", arithmetic)).toContain("> 0.2000");
  });

  it("derives B from the parts when the server did not send it, capped at 1", () => {
    expect(buildBoundArithmetic({ epsHat: 0.7, pHat: 0.6 }).bound).toBe(1);
  });

  it("has no sum without both parts", () => {
    expect(formatSum(buildBoundArithmetic({ epsHat: 0.1 }))).toBeUndefined();
    expect(buildBoundArithmetic({}).withinMax).toBeUndefined();
  });

  it("formats rates and counts defensively", () => {
    expect(formatRate(0.1)).toBe("0.1000");
    expect(formatRate(undefined)).toBe("-");
    expect(formatCount(3, 60)).toBe("3 / 60");
    expect(formatCount(undefined, 60)).toBe("-");
  });
});

describe("abstain reasons", () => {
  it("has a plain-language message for every reason", () => {
    const reasons: ClosureAbstainReason[] = ["SEARCH_ERRORS", "PENDING_REVIEW", "NO_COVERAGE", "NO_CALIBRATION", "CALIBRATION_JUDGE_MISMATCH", "BOUND_EXCEEDS_MAX"];
    expect(Object.keys(ABSTAIN_REASON_KEYS).sort()).toEqual([...reasons].sort());
    for (const reason of reasons) {
      expect(abstainReasonKey(reason)).not.toBe(reason);
      expect(abstainReasonKey(reason).endsWith(".")).toBe(true);
    }
  });
});

describe("check status", () => {
  it("polls only while the runner works", () => {
    expect(isClosureCheckRunning("QUEUED")).toBe(true);
    expect(isClosureCheckRunning("SEARCHING")).toBe(true);
    for (const status of ["SCREENING", "DECIDED", "FAILED"] as const) expect(isClosureCheckRunning(status)).toBe(false);
    expect(isClosureCheckRunning(undefined)).toBe(false);
  });

  it("counts documents without an effective label", () => {
    expect(countPendingDocuments([{ effectiveLabel: "ANSWERS" }, { effectiveLabel: undefined }, { effectiveLabel: "UNRELATED" }, {}])).toBe(2);
  });
});

describe("quotes", () => {
  const text = "Deep learning improves accuracy.\nWe show that graph networks reduce error by 12% in traffic forecasting.";
  it("accepts a verbatim quote regardless of case, quotes and spacing", () => {
    expect(quoteAppearsInText("graph  networks reduce ERROR by 12% in traffic forecasting", text)).toBe(true);
    expect(quoteAppearsInText("“graph networks reduce error by 12% in traffic forecasting.”", text)).toBe(true);
  });
  it("rejects a short or invented quote", () => {
    expect(quoteAppearsInText("graph networks", text)).toBe(false);
    expect(quoteAppearsInText("transformers beat graph networks on every dataset", text)).toBe(false);
    expect(quoteAppearsInText("", text)).toBe(false);
  });
  it("splits an abstract into sentences", () => {
    expect(splitSentences("First one. Second one? Third (with parens) one!  Fourth")).toEqual(["First one.", "Second one?", "Third (with parens) one!", "Fourth"]);
    expect(splitSentences(undefined)).toEqual([]);
  });
});

describe("input parsing", () => {
  it("parses one query per line without blanks or duplicates", () => {
    expect(parseLines("a\r\n\n  b  \na\n")).toEqual(["a", "b"]);
  });
  it("parses DOIs split by lines, commas or semicolons, ignoring case duplicates", () => {
    expect(parseDoiLines("10.1/ABC\n10.1/abc; 10.2/x, https://doi.org/10.3/y\n")).toEqual(["10.1/ABC", "10.2/x", "https://doi.org/10.3/y"]);
  });
  it("keeps non-empty facets only", () => {
    expect(compactFacets({ population: " adults ", intervention: "  ", outcome: "pain" })).toEqual({ population: "adults", outcome: "pain" });
    expect(compactFacets({ population: " " })).toBeUndefined();
    expect(compactFacets(undefined)).toBeUndefined();
    expect(activeFacetKeys({ population: "a", comparison: "", context: "c" })).toEqual(["population", "context"]);
  });
  it("keeps decided facet matches only", () => {
    expect(compactFacetMatch({ population: true, outcome: false })).toEqual({ population: true, outcome: false });
    expect(compactFacetMatch({})).toBeUndefined();
  });
});

describe("documentExternalUrl", () => {
  it("prefers the DOI, then OpenAlex", () => {
    expect(documentExternalUrl({ doi: "10.1/abc", openalexId: "W1" })).toBe("https://doi.org/10.1/abc");
    expect(documentExternalUrl({ doi: "https://doi.org/10.1/abc" })).toBe("https://doi.org/10.1/abc");
    expect(documentExternalUrl({ openalexId: "W123" })).toBe("https://openalex.org/W123");
    expect(documentExternalUrl({ openalexId: "https://openalex.org/W123" })).toBe("https://openalex.org/W123");
    expect(documentExternalUrl({})).toBeUndefined();
  });
});
