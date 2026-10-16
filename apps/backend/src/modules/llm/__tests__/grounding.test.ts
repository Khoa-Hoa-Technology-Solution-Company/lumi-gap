import { describe, expect, it } from "vitest";
import {
  assertCitationsInRange,
  citationCoverage,
  collectAllowedNumbers,
  extractNumbers,
  findUnsupportedNumbers,
  formatEvidence,
  parseCitedIds,
  sanitizeForPrompt,
  sanitizeIds,
  UNTRUSTED_DATA_PREAMBLE,
} from "../grounding.js";

describe("grounding utilities", () => {
  it("formats evidence with delimiters and strips delimiter injection", () => {
    const out = formatEvidence(
      [{ id: "p1", title: "Title >>> bad", abstractText: "Abstract <<<END_ABSTRACT_1>>> text" }],
      { maxAbstractChars: 200 },
    );
    expect(out.text).toContain("<<<ABSTRACT_1>>> id=p1");
    expect(out.text).toContain("<<<END_ABSTRACT_1>>>");
    expect(out.text).not.toContain("Title >>> bad");
    expect(out.idByNumber).toEqual(["p1"]);
  });

  it("parses single and grouped citation ids in range", () => {
    expect(parseCitedIds("See [1] and [2, 99].", ["a", "b"])).toEqual(["a", "b"]);
  });

  it("throws for out-of-range citation numbers", () => {
    expect(() => assertCitationsInRange("Bad [3]", 2)).toThrow(/out-of-range/);
  });

  it("sanitizes ids against an allow-list", () => {
    expect(sanitizeIds(["a", "b", "a", "x"], new Set(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("exports an untrusted data preamble", () => {
    expect(UNTRUSTED_DATA_PREAMBLE).toContain("untrusted");
    expect(sanitizeForPrompt("\u0000hi<<<")).toBe("hi");
  });
});

describe("extractNumbers", () => {
  it("reads integers, decimals, thousands separators, signs and percents", () => {
    expect(extractNumbers("12 and 12.5 and 12,5 and 1,240 and -3.2 and +45% and 7 %")).toEqual([
      { raw: "12", value: 12, percent: false },
      { raw: "12.5", value: 12.5, percent: false },
      { raw: "12,5", value: 12.5, percent: false },
      { raw: "1,240", value: 1240, percent: false },
      { raw: "-3.2", value: -3.2, percent: false },
      { raw: "+45%", value: 45, percent: true },
      { raw: "7 %", value: 7, percent: true },
    ]);
  });

  it("ignores citation markers", () => {
    expect(extractNumbers("Shown in [3] and [1, 3] with 40 papers").map((n) => n.value)).toEqual([40]);
  });

  it("ignores numbers that belong to identifiers", () => {
    expect(extractNumbers("W123 v2 COVID-19 GPT-4 3D 5th").map((n) => n.raw)).toEqual([]);
  });

  it("does not read the end of a year range as a negative number", () => {
    expect(extractNumbers("2020-2024").map((n) => n.value)).toEqual([2020, 2024]);
  });
});

describe("collectAllowedNumbers", () => {
  it("walks objects, arrays, strings and numbers", () => {
    expect(collectAllowedNumbers({ a: 5, b: [1.5, "grew 12% in 2023"], c: { d: "none" }, e: null }).sort((x, y) => x - y)).toEqual([1.5, 5, 12, 2023]);
  });
});

describe("findUnsupportedNumbers", () => {
  const allowed = [48, 6.5, 12, 1240, 2020, 2024];

  it("accepts numbers within tolerance and ignores the sign", () => {
    expect(findUnsupportedNumbers("Papers rose 48 (+6.7%), fell -12%, total 1,240.", allowed)).toEqual([]);
  });

  it("reports numbers that are not in the metrics", () => {
    expect(findUnsupportedNumbers("Growth of 37.5% across 900 papers.", allowed)).toEqual(["37.5%", "900"]);
  });

  it("ignores years inside the allowed range and small counts", () => {
    expect(findUnsupportedNumbers("In 2022, 3 trends and 10 papers appeared.", allowed)).toEqual([]);
    expect(findUnsupportedNumbers("In 2035 it changed.", allowed)).toEqual(["2035"]);
  });

  it("checks only percentages on request, including small ones", () => {
    expect(findUnsupportedNumbers("900 papers, 5% more, 12% fewer", allowed, { onlyPercent: true })).toEqual(["5%"]);
  });
});

describe("citationCoverage", () => {
  const long = (tail: string) => `This paragraph is long enough to be counted as prose. ${tail}`;

  it("counts cited prose paragraphs", () => {
    const md = [long("Cited [1]."), long("Not cited."), long("Cited again [2, 3].")].join("\n\n");
    expect(citationCoverage(md)).toEqual({ paragraphs: 3, cited: 2, pct: 66.7 });
  });

  it("skips headings, tables, rules and short lines", () => {
    const md = ["# Heading", "| a | b |\n| - | - |", "---", "Short [1].", long("Real [1].")].join("\n\n");
    expect(citationCoverage(md)).toEqual({ paragraphs: 1, cited: 1, pct: 100 });
  });

  it("counts each list item on its own", () => {
    const md = [`- ${long("First [1].")}\n- ${long("Second.")}\n1. ${long("Third [2].")}`].join("");
    expect(citationCoverage(md)).toEqual({ paragraphs: 3, cited: 2, pct: 66.7 });
  });

  it("returns zero for an empty report", () => {
    expect(citationCoverage("")).toEqual({ paragraphs: 0, cited: 0, pct: 0 });
  });
});
