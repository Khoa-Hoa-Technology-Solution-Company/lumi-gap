import { describe, expect, it } from "vitest";
import {
  cagrPct,
  fillMissingYears,
  linearSlope,
  truncateToCompleteYears,
  yoyGrowthPct,
} from "../trend.formulas.js";

describe("fillMissingYears", () => {
  it("fills gap years with 0 and sorts ascending", () => {
    expect(fillMissingYears([{ year: 2022, count: 9 }, { year: 2019, count: 5 }])).toEqual([
      { year: 2019, count: 5 },
      { year: 2020, count: 0 },
      { year: 2021, count: 0 },
      { year: 2022, count: 9 },
    ]);
  });

  it("extends to explicit bounds", () => {
    expect(fillMissingYears([{ year: 2021, count: 4 }], 2020, 2022)).toEqual([
      { year: 2020, count: 0 },
      { year: 2021, count: 4 },
      { year: 2022, count: 0 },
    ]);
  });

  it("returns [] for empty input without bounds", () => {
    expect(fillMissingYears([])).toEqual([]);
  });
});

describe("truncateToCompleteYears", () => {
  it("drops the running calendar year", () => {
    const s = [
      { year: 2024, count: 10 },
      { year: 2025, count: 20 },
      { year: 2026, count: 3 }, // incomplete — would fake a crash
    ];
    expect(truncateToCompleteYears(s, 2025)).toEqual(s.slice(0, 2));
  });
});

describe("yoyGrowthPct", () => {
  it("computes plain growth: 10 → 15 = +50%", () => {
    expect(
      yoyGrowthPct([
        { year: 2024, count: 10 },
        { year: 2025, count: 15 },
      ]),
    ).toBe(50);
  });

  it("computes decline: 20 → 15 = -25%", () => {
    expect(
      yoyGrowthPct([
        { year: 2024, count: 20 },
        { year: 2025, count: 15 },
      ]),
    ).toBe(-25);
  });

  it("clamps zero denominator: 0 → 5 = +500%", () => {
    expect(
      yoyGrowthPct([
        { year: 2024, count: 0 },
        { year: 2025, count: 5 },
      ]),
    ).toBe(500);
  });

  it("returns 0 with fewer than 2 points", () => {
    expect(yoyGrowthPct([{ year: 2025, count: 7 }])).toBe(0);
    expect(yoyGrowthPct([])).toBe(0);
  });
});

describe("cagrPct", () => {
  it("10 → 80 over 3 years = +100%/yr (doubling annually)", () => {
    expect(
      cagrPct([
        { year: 2022, count: 10 },
        { year: 2023, count: 20 },
        { year: 2024, count: 40 },
        { year: 2025, count: 80 },
      ]),
    ).toBe(100);
  });

  it("uses only the last maxYears+1 points of a longer series", () => {
    const series = [
      { year: 2020, count: 999 }, // outside the 3y window — must be ignored
      { year: 2022, count: 10 },
      { year: 2023, count: 20 },
      { year: 2024, count: 40 },
      { year: 2025, count: 80 },
    ];
    expect(cagrPct(series)).toBe(100);
  });

  it("null when the window starts at 0 (undefined from zero base)", () => {
    expect(
      cagrPct([
        { year: 2023, count: 0 },
        { year: 2024, count: 5 },
        { year: 2025, count: 9 },
      ]),
    ).toBeNull();
  });

  it("null with fewer than 2 points", () => {
    expect(cagrPct([{ year: 2025, count: 4 }])).toBeNull();
    expect(cagrPct([])).toBeNull();
  });
});

describe("linearSlope", () => {
  it("perfect +1/year line has slope 1", () => {
    expect(
      linearSlope([
        { year: 2023, count: 1 },
        { year: 2024, count: 2 },
        { year: 2025, count: 3 },
      ]),
    ).toBe(1);
  });

  it("flat series has slope 0", () => {
    expect(
      linearSlope([
        { year: 2023, count: 5 },
        { year: 2024, count: 5 },
        { year: 2025, count: 5 },
      ]),
    ).toBe(0);
  });

  it("declining series has negative slope", () => {
    expect(
      linearSlope([
        { year: 2023, count: 30 },
        { year: 2024, count: 20 },
        { year: 2025, count: 10 },
      ]),
    ).toBe(-10);
  });

  it("returns 0 with fewer than 2 points", () => {
    expect(linearSlope([{ year: 2025, count: 9 }])).toBe(0);
    expect(linearSlope([])).toBe(0);
  });
});
