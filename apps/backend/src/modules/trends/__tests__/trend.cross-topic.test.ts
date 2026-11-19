import type { TrendClassification, TrendVerdict } from "@trend/shared-types";
import { describe, expect, it } from "vitest";
import { MIN_POPULATION, analyseCrossTopics, tukeyFences } from "../trend.cross-topic.js";

function classification(verdict: TrendVerdict, r: number | null): TrendClassification {
  return {
    verdict,
    confidence: null,
    yearsUsed: 15,
    totalPapers: 0,
    mannKendall: null,
    qValue: null,
    senSlope: null,
    senSlopeCi95: null,
    relativeChangePct: r,
    recentRelativeChangePct: null,
    peakRatio: null,
    reasons: [],
  };
}

const topic = (name: string, totalPapers: number, verdict: TrendVerdict, r: number | null) => ({ topic: name, totalPapers, classification: classification(verdict, r) });

describe("tukeyFences", () => {
  it("uses type-7 quartiles and 1.5 IQR", () => {
    // 1..8: Q1 = 2.75, Q3 = 6.25, IQR = 3.5
    expect(tukeyFences([8, 1, 2, 3, 4, 5, 6, 7])).toEqual({ q1: 2.75, q3: 6.25, iqr: 3.5, lower: -2.5, upper: 11.5 });
  });

  it("has no fences below 4 values", () => {
    expect(tukeyFences([1, 2, 3])).toBeNull();
  });
});

describe("analyseCrossTopics", () => {
  // Three bands of four topics each (totals 10–40, 100–400, 1000–4000).
  const population = [
    topic("s1", 10, "stable", 1),
    topic("s2", 20, "stable", 2),
    topic("s3", 30, "rising", 3),
    topic("s4", 40, "rising", 60), // far above its band: clear
    topic("m1", 100, "declining", -2),
    topic("m2", 200, "stable", -1),
    topic("m3", 300, "stable", 0),
    topic("m4", 400, "declining", -50), // far below its band: clear
    topic("l1", 1000, "stable", 1),
    topic("l2", 2000, "stable", 2),
    topic("l3", 3000, "saturated", 3),
    topic("l4", 4000, "past_peak", 40), // anomalous but not rising: not clear
    topic("too-small", 5, "insufficient", 500), // insufficient: not in the population
  ];

  const result = analyseCrossTopics(population)!;

  it("leaves topics without r out of the population", () => {
    expect(result.analysis.population).toBe(12);
    expect(result.analysis.points.map((point) => point.topic)).not.toContain("too-small");
  });

  it("splits the population into tertiles of total papers", () => {
    // type-7 quantiles of the 12 sorted totals: h = 11/3 → 40 + ⅔·60 = 80; h = 22/3 → 400 + ⅓·600 = 600
    expect(result.analysis.bandCutoffs.smallMax).toBeCloseTo(80, 6);
    expect(result.analysis.bandCutoffs.mediumMax).toBeCloseTo(600, 6);
    const bands = Object.fromEntries(result.analysis.points.map((point) => [point.topic, point.sizeBand]));
    expect([bands.s1, bands.s4, bands.m1, bands.m4, bands.l1, bands.l4]).toEqual(["small", "small", "medium", "medium", "large", "large"]);
  });

  it("flags anomalous topics per band and marks rising/declining ones clear in their direction", () => {
    const byName = Object.fromEntries(result.analysis.points.map((point) => [point.topic, point]));
    expect(byName.s4).toMatchObject({ outlier: true, clear: true });
    expect(byName.m4).toMatchObject({ outlier: true, clear: true });
    expect(byName.l4).toMatchObject({ outlier: true, clear: false });
    expect(byName.s3).toMatchObject({ outlier: false, clear: false });
  });

  it("describes r over the population and per band", () => {
    expect(result.analysis.rStats.all?.n).toBe(12);
    expect(result.analysis.rStats.small?.median).toBe(2.5);
    expect(result.analysis.fences.medium).not.toBeNull();
  });

  it("labels topics outside the population with a size band only", () => {
    expect(result.labelsOf(population.at(-1)!)).toEqual({ sizeBand: "small", outlier: false, clear: false });
  });

  it("returns null when too few topics have r", () => {
    expect(analyseCrossTopics(population.slice(0, MIN_POPULATION - 1))).toBeNull();
  });
});
