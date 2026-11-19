import { describe, expect, it } from "vitest";
import { EMERGING_RECENT_YEARS, EMERGING_THRESHOLDS, EMERGING_WINDOW_YEARS, emergingPeriods, selectEmerging } from "../trend.emerging.js";

describe("emergingPeriods", () => {
  it("splits the last 10 complete years into 7 earlier and 3 recent years", () => {
    const { earlier, recent } = emergingPeriods(2025);
    expect(earlier).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022]);
    expect(recent).toEqual([2023, 2024, 2025]);
    expect(earlier.length + recent.length).toBe(EMERGING_WINDOW_YEARS);
    expect(recent).toHaveLength(EMERGING_RECENT_YEARS);
  });
});

describe("selectEmerging", () => {
  const totalEarlier = 1_000_000;
  const totalRecent = 600_000;

  it("keeps keywords that are large enough, new and rising significantly, largest effect first", () => {
    const { termsTested, keywords } = selectEmerging(
      [
        { term: "brand new", papersA: 2, papersB: 400 }, // 99% new
        { term: "growing", papersA: 900, papersB: 2_400 }, // 73% new, large
        { term: "old and big", papersA: 50_000, papersB: 40_000 }, // 44% new: not new
        { term: "tiny", papersA: 0, papersB: 12 }, // under 20 papers in R
        { term: "fading", papersA: 5_000, papersB: 100 }, // falling
      ],
      totalEarlier,
      totalRecent,
    );
    expect(termsTested).toBe(5);
    expect(keywords.map((keyword) => keyword.term)).toEqual(["brand new", "growing"]);
    expect(keywords[0]!.noveltyShare).toBeCloseTo(400 / 402, 6);
    expect(keywords.every((keyword) => keyword.qValue < EMERGING_THRESHOLDS.significanceLevel && keyword.z > 0)).toBe(true);
  });

  it("applies the novelty threshold inclusively", () => {
    // exactly 70% of the window's papers in R
    const { keywords } = selectEmerging([{ term: "edge", papersA: 300, papersB: 700 }], totalEarlier, totalRecent);
    expect(keywords.map((keyword) => keyword.term)).toEqual(["edge"]);
  });

  it("accepts custom thresholds (calibration)", () => {
    const rows = [{ term: "growing", papersA: 900, papersB: 2_400 }];
    expect(selectEmerging(rows, totalEarlier, totalRecent, { ...EMERGING_THRESHOLDS, noveltyShare: 0.8 }).keywords).toEqual([]);
  });
});
