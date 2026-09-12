import { describe, expect, it } from "vitest";
import {
  averageSearchesPerDay,
  buildSearchTarget,
  getTopQueryLabel,
  totalSearchVolume,
  fillMissingDays
} from "../dashboard.helpers";

describe("dashboard helpers", () => {
  it("summarizes search volume", () => {
    const points = [
      { date: "2026-06-29", count: 2 },
      { date: "2026-06-30", count: 4 },
    ];
    expect(totalSearchVolume(points)).toBe(6);
    expect(averageSearchesPerDay(points, 2)).toBe(3);
    expect(averageSearchesPerDay(points, 7)).toBe(0.9);
  });

  it("falls back when there is no top query", () => {
    expect(getTopQueryLabel([])).toBe("No query yet");
  });

  it("builds search route for recent query", () => {
    expect(buildSearchTarget("LLM education")).toBe("/search?q=LLM%20education");
  });

  it("fills missing days with zero counts", () => {
    const points = [
      { date: "2026-06-30", count: 5 }
    ];
    const filled = fillMissingDays(points, 3);
    expect(filled.length).toBe(3);

    const match = filled.find(p => p.date === "2026-06-30");
    if (match) {
      expect(match.count).toBe(5);
    }

    const other = filled.find(p => p.date !== "2026-06-30");
    if (other) {
      expect(other.count).toBe(0);
    }
  });
});
