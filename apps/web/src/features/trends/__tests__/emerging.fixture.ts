import type { TrendEmergingResponse } from "@trend/shared-types";

export function makeEmerging(overrides: Partial<TrendEmergingResponse> = {}): TrendEmergingResponse {
  return {
    dataSource: "openalex",
    scopeVersion: "it-v1",
    earlierPeriod: { yearFrom: 2016, yearTo: 2022, papers: 1_200_000 },
    recentPeriod: { yearFrom: 2023, yearTo: 2025, papers: 900_000 },
    lastCompleteYear: 2025,
    criteria: { minRecentPapers: 20, noveltyShare: 0.7, significanceLevel: 0.05 },
    termsTested: 200,
    matchedCount: 2,
    keywords: [
      {
        keyword: "retrieval-augmented generation",
        earlierPapers: 4,
        recentPapers: 1200,
        noveltyShare: 0.9967,
        shift: {
          term: "retrieval-augmented generation",
          papersA: 4,
          papersB: 1200,
          logOddsRatio: 5.4321,
          z: 12.3456,
          pValue: 0,
          qValue: 0.0000004,
        },
        yearlyBreakdown: [
          { year: 2023, count: 100 },
          { year: 2024, count: 500 },
          { year: 2025, count: 600 },
          { year: 2026, count: 40 },
        ],
      },
      {
        keyword: "YOLOv8",
        earlierPapers: 0,
        recentPapers: 80,
        noveltyShare: 1,
        shift: { term: "YOLOv8", papersA: 0, papersB: 80, logOddsRatio: 4.1, z: 6.5, pValue: 0.00001, qValue: 0.0123 },
        yearlyBreakdown: [
          { year: 2023, count: 10 },
          { year: 2025, count: 50 },
        ],
      },
    ],
    computedAt: "2026-11-19T10:00:00.000Z",
    ...overrides,
  } as TrendEmergingResponse;
}
