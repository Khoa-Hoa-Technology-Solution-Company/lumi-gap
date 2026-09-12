import { describe, expect, it } from "vitest";
import { allocateLargestRemainder, planDomainBaseline, splitSeededSampleQuota } from "../campaign-planner.js";

describe("campaign planner", () => {
  it("allocates a deterministic proportional target without exceeding population", () => {
    const first = allocateLargestRemainder(10, [
      { key: "zeta", population: 9 },
      { key: "alpha", population: 1 },
    ]);
    const second = allocateLargestRemainder(10, [
      { key: "zeta", population: 9 },
      { key: "alpha", population: 1 },
    ]);

    expect(first).toEqual(second);
    expect(first.reduce((sum, item) => sum + item.quota, 0)).toBe(10);
    expect(first.every((item) => item.quota <= item.population)).toBe(true);
  });

  it("uses a bounded domain floor before allocating the remaining baseline proportionally", () => {
    const plan = planDomainBaseline(100, [
      { key: "computer-science", population: 900 },
      { key: "health-sciences", population: 90 },
      { key: "small-domain", population: 2 },
    ]);

    expect(plan.reduce((sum, item) => sum + item.quota, 0)).toBe(100);
    expect(plan.find((item) => item.key === "small-domain")).toMatchObject({ floor: 2, quota: 2 });
    expect(plan.every((item) => item.quota <= item.population)).toBe(true);
  });

  it("splits an oversize stratum into reproducible one-page OpenAlex sample partitions", () => {
    const first = splitSeededSampleQuota({
      partitionPrefix: "domain:1:year:2024",
      stratumKey: "domain:1:year:2024",
      filterExpression: "has_abstract:true,primary_topic.domain.id:1,publication_year:2024",
      population: 50_000,
      quota: 25_000,
      seedNamespace: "canary-2026-07",
    });
    const second = splitSeededSampleQuota({
      partitionPrefix: "domain:1:year:2024",
      stratumKey: "domain:1:year:2024",
      filterExpression: "has_abstract:true,primary_topic.domain.id:1,publication_year:2024",
      population: 50_000,
      quota: 25_000,
      seedNamespace: "canary-2026-07",
    });

    expect(first).toEqual(second);
    expect(first).toHaveLength(250);
    expect(first.slice(0, 3).map((partition) => partition.targetCount)).toEqual([100, 100, 100]);
    expect(first.reduce((sum, partition) => sum + partition.targetCount, 0)).toBe(25_000);
    expect(first.reduce((sum, partition) => sum + partition.plannedPopulation, 0)).toBe(25_000);
    expect(first.every((partition) => partition.targetCount <= 100 && partition.seed > 0)).toBe(true);
  });
});
