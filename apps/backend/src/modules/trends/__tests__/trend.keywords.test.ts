import { describe, expect, it } from "vitest";
import { keywordShifts, risingShifts, splitPeriods } from "../trend.keywords.js";
import { benjaminiHochberg } from "../trend.statistics.js";

describe("splitPeriods", () => {
  it("splits the years into an earlier and a later half; the later half takes the middle year", () => {
    expect(splitPeriods([2021, 2019, 2020, 2022])).toEqual({ periodA: [2019, 2020], periodB: [2021, 2022] });
    expect(splitPeriods([2019, 2020, 2021])).toEqual({ periodA: [2019], periodB: [2020, 2021] });
  });

  it("needs at least two years", () => {
    expect(splitPeriods([2020])).toBeNull();
    expect(splitPeriods([])).toBeNull();
  });
});

describe("keywordShifts", () => {
  const rows = [
    { term: "llm", papersA: 10, papersB: 300 },
    { term: "svm", papersA: 200, papersB: 50 },
    { term: "flat", papersA: 100, papersB: 100 },
  ];

  it("computes the log odds ratio with the Haldane correction and BH q-values across all keywords", () => {
    const shifts = keywordShifts(rows, 1000, 1000);
    expect(shifts.map((shift) => shift.term)).toEqual(["llm", "svm", "flat"]);
    // llm: a = 300.5, b = 700.5, c = 10.5, d = 990.5 → log OR = ln(300.5 · 990.5 / (700.5 · 10.5))
    expect(shifts[0]!.logOddsRatio).toBeCloseTo(Math.log((300.5 * 990.5) / (700.5 * 10.5)), 12);
    expect(shifts[0]!.z).toBeGreaterThan(0);
    expect(shifts[1]!.z).toBeLessThan(0);
    // Equal shares: log OR = 0, z = 0, p = 1.
    expect(shifts[2]!.logOddsRatio).toBeCloseTo(0, 12);
    expect(shifts[2]!.pValue).toBeCloseTo(1, 6);
    const q = benjaminiHochberg(shifts.map((shift) => shift.pValue));
    shifts.forEach((shift, index) => expect(shift.qValue).toBeCloseTo(q[index]!, 12));
  });

  it("drops keywords that cannot be tested", () => {
    expect(keywordShifts([{ term: "impossible", papersA: 5, papersB: 20 }], 0, 10)).toEqual([]);
    expect(keywordShifts([{ term: "more than total", papersA: 1, papersB: 20 }], 10, 10)).toEqual([]);
  });

  it("a jump from a tiny base is weaker evidence than a large steady rise", () => {
    // +900% from 1 → 10 papers against +50% from 200 → 300: the raw growth favours the first, the test the second.
    const [tiny, solid] = keywordShifts([{ term: "tiny", papersA: 1, papersB: 10 }, { term: "solid", papersA: 200, papersB: 300 }], 1000, 1000);
    expect(solid!.z).toBeGreaterThan(tiny!.z);
  });
});

describe("risingShifts", () => {
  it("keeps the keywords that rose, strongest first, up to the limit", () => {
    const shifts = keywordShifts(
      [
        { term: "b", papersA: 100, papersB: 180 },
        { term: "down", papersA: 200, papersB: 50 },
        { term: "a", papersA: 10, papersB: 300 },
        { term: "c", papersA: 100, papersB: 120 },
      ],
      1000,
      1000,
    );
    expect(risingShifts(shifts, 10).map((shift) => shift.term)).toEqual(["a", "b", "c"]);
    expect(risingShifts(shifts, 2).map((shift) => shift.term)).toEqual(["a", "b"]);
  });
});
