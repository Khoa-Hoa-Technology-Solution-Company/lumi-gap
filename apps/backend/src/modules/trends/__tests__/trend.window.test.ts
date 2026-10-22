import { describe, expect, it } from "vitest";
import { DEFAULT_TREND_WINDOW_COMPLETE_YEARS, resolveTrendWindow } from "@trend/shared-types";

const completeYears = (window: { yearFrom: number; lastCompleteYear: number }) => window.lastCompleteYear - window.yearFrom + 1;

describe("resolveTrendWindow (P0.4 off-by-one)", () => {
  it("defaults to exactly 10 complete years when yearTo is the current, incomplete year", () => {
    const window = resolveTrendWindow({}, 2026);
    expect(window).toEqual({ yearFrom: 2016, yearTo: 2026, lastCompleteYear: 2025 });
    expect(completeYears(window)).toBe(DEFAULT_TREND_WINDOW_COMPLETE_YEARS);
  });

  it("still gives 10 complete years when yearTo is a complete year (old rule gave 11)", () => {
    const window = resolveTrendWindow({ yearTo: 2025 }, 2026);
    expect(window).toEqual({ yearFrom: 2016, yearTo: 2025, lastCompleteYear: 2025 });
    expect(completeYears(window)).toBe(10);
    const oldRule = { yearFrom: 2025 - 10, lastCompleteYear: 2025 };
    expect(completeYears(oldRule)).toBe(11);
  });

  it("anchors on the last complete year for a past or future yearTo", () => {
    expect(resolveTrendWindow({ yearTo: 2020 }, 2026)).toEqual({ yearFrom: 2011, yearTo: 2020, lastCompleteYear: 2020 });
    expect(resolveTrendWindow({ yearTo: 2030 }, 2026)).toEqual({ yearFrom: 2016, yearTo: 2030, lastCompleteYear: 2025 });
  });

  it("keeps an explicit yearFrom", () => {
    expect(resolveTrendWindow({ yearFrom: 2018, yearTo: 2025 }, 2026)).toEqual({ yearFrom: 2018, yearTo: 2025, lastCompleteYear: 2025 });
  });
});
