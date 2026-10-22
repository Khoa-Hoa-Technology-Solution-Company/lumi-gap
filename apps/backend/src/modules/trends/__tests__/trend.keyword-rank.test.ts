import { describe, expect, it } from "vitest";
import { KEYWORD_SHIFT_MIN_PAPERS } from "@trend/shared-types";
import { benjaminiHochberg, logOddsRatio2x2 } from "../trend.statistics.js";
import { rankKeywordShifts } from "../trend.verdict.js";

/** Periods of OpenAlex size: 4 million papers in A, 5 million in B. */
const TOTAL_A = 4_000_000;
const TOTAL_B = 5_000_000;

function shiftsFor(rows: Array<{ term: string; papersA: number; papersB: number }>) {
  const tested = rows.map((row) => ({ row, result: logOddsRatio2x2({ withA: row.papersA, totalA: TOTAL_A, withB: row.papersB, totalB: TOTAL_B })! }));
  const q = benjaminiHochberg(tested.map((item) => item.result.pValue));
  return tested.map(({ row, result }, index) => ({ ...row, logOddsRatio: result.logOddsRatio, z: result.z, pValue: result.pValue, qValue: q[index]! }));
}

describe("rankKeywordShifts (P0.5)", () => {
  // A frequent keyword with a small relative rise and a smaller keyword that
  // grew tenfold. Both are significant; the frequent one has the larger z.
  const shifts = shiftsFor([
    { term: "machine learning", papersA: 1_000_000, papersB: 1_400_000 },
    { term: "large language models", papersA: 400, papersB: 5_000 },
    { term: "tiny new term", papersA: 1, papersB: 12 },
  ]);

  it("the old z ordering favoured the frequent keyword", () => {
    const byZ = [...shifts].filter((s) => s.z > 0).sort((a, b) => b.z - a.z).map((s) => s.term);
    expect(byZ[0]).toBe("machine learning");
  });

  it("ranks by effect size: the keyword that grew tenfold comes before the frequent one", () => {
    const ranked = rankKeywordShifts(shifts, "rising").map((s) => s.term);
    expect(ranked.indexOf("large language models")).toBeLessThan(ranked.indexOf("machine learning"));
  });

  it("puts a shift below the support threshold after every supported shift, even with a larger log OR", () => {
    const tiny = shifts.find((s) => s.term === "tiny new term")!;
    expect(tiny.papersB).toBeLessThan(KEYWORD_SHIFT_MIN_PAPERS);
    const ranked = rankKeywordShifts(shifts, "rising").map((s) => s.term);
    expect(ranked.at(-1)).toBe("tiny new term");
  });

  it("orders falling keywords from the steepest fall", () => {
    const falling = rankKeywordShifts(
      shiftsFor([
        { term: "slow decline", papersA: 100_000, papersB: 110_000 },
        { term: "fast decline", papersA: 50_000, papersB: 5_000 },
      ]),
      "falling",
    ).map((s) => s.term);
    expect(falling).toEqual(["fast decline", "slow decline"]);
  });
});
