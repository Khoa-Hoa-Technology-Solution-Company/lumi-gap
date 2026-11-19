import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/services/api-client", () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

import { trendsApi } from "../api/trends.api";
import {
  EMERGING_LIMIT,
  buildEmergingParams,
  buildSparkBars,
  emergingView,
  emergingWindowYears,
  formatLogOddsRatio,
  formatNoveltyPercent,
  formatPeriodYears,
  formatQCell,
  formatZ,
} from "../emerging";
import { makeEmerging } from "./emerging.fixture";

describe("emerging helpers", () => {
  it("chooses the view from the data source and the signals", () => {
    expect(emergingView(makeEmerging())).toBe("signals");
    expect(emergingView(makeEmerging({ keywords: [], matchedCount: 0 }))).toBe("empty");
    expect(emergingView(makeEmerging({ dataSource: "local", keywords: [] }))).toBe("local");
  });

  it("sends only the topic scope that is set", () => {
    expect(buildEmergingParams({ subfieldIds: [], topicIds: [] })).toEqual({ limit: EMERGING_LIMIT });
    expect(buildEmergingParams({ subfieldIds: ["1702"], topicIds: ["T1"] }, 10)).toEqual({ limit: 10, subfieldIds: ["1702"], topicIds: ["T1"] });
  });

  it("formats the columns", () => {
    expect(formatNoveltyPercent(0.9967)).toBe("100%");
    expect(formatNoveltyPercent(0.7)).toBe("70%");
    expect(formatLogOddsRatio(5.4321)).toBe("+5.43");
    expect(formatLogOddsRatio(-0.5)).toBe("−0.50");
    expect(formatLogOddsRatio(Number.NaN)).toBe("—");
    expect(formatZ(12.3456)).toBe("12.35");
    expect(formatQCell(0.0000004)).toBe("< 0.001");
    expect(formatQCell(0.0123)).toBe("0.012");
    expect(formatPeriodYears({ yearFrom: 2016, yearTo: 2022 })).toBe("2016–2022");
    expect(formatPeriodYears({ yearFrom: 2025, yearTo: 2025 })).toBe("2025");
  });

  it("counts the years of both periods", () => {
    expect(emergingWindowYears(makeEmerging())).toBe(10);
  });

  it("scales the bars to the row maximum and flags the running year", () => {
    const bars = buildSparkBars(makeEmerging().keywords[0]!.yearlyBreakdown, 2025);
    expect(bars.map((bar) => bar.partial)).toEqual([false, false, false, true]);
    expect(bars[2]!.height).toBe(1);
    expect(bars[0]!.height).toBeCloseTo(100 / 600);
    expect(buildSparkBars([{ year: 2024, count: 0 }], 2025)[0]!.height).toBe(0);
    expect(buildSparkBars([], 2025)).toEqual([]);
  });
});

describe("trendsApi.emerging", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("calls GET /trends/emerging with comma-joined lists, leaving out empty ones", async () => {
    const payload = makeEmerging();
    get.mockResolvedValue({ data: { success: true, data: payload } });
    const result = await trendsApi.emerging({ limit: 30, subfieldIds: ["1702", "1707"], topicIds: [] });
    expect(result).toBe(payload);
    const [url, config] = get.mock.calls[0]!;
    expect(url).toBe("/trends/emerging");
    expect(config.paramsSerializer.serialize(config.params)).toBe("limit=30&subfieldIds=1702%2C1707");
  });
});
