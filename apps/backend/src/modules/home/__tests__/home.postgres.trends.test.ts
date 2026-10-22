import { beforeEach, describe, expect, it, vi } from "vitest";

const trends = vi.hoisted(() => ({ getPostgresTrendsOverview: vi.fn() }));
vi.mock("../../trends/trend.postgres.js", () => trends);

const prisma = vi.hoisted(() => ({
  searchLog: { count: vi.fn(async () => 0) },
  paper: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
  user: { count: vi.fn(async () => 0) },
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => prisma }));

import { getPostgresHomeOverview } from "../home.postgres.js";

beforeEach(() => {
  vi.clearAllMocks();
  trends.getPostgresTrendsOverview.mockResolvedValue({
    yearFrom: 2016, yearTo: 2026, lastCompleteYear: 2025, totalPapersInWindow: 0,
    yearlyTotalPapers: [], citationTrend: [], topics: [], risingKeywords: [], computedAt: "2026-10-21T00:00:00.000Z",
  });
});

describe("home trend snapshot (P0.3)", () => {
  it("labels the snapshot as local data and orders topics by size, not by trend", async () => {
    const overview = await getPostgresHomeOverview();
    expect(trends.getPostgresTrendsOverview).toHaveBeenCalledWith(expect.objectContaining({ sortBy: "total" }));
    expect(overview.trends.dataSource).toBe("local");
  });
});
