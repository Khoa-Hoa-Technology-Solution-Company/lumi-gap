import { beforeEach, describe, expect, it, vi } from "vitest";
import { homeService } from "../home.service.js";
import { analyticsService } from "../../analytics/analytics.service.js";
import { trendService } from "../../trends/trend.service.js";
import { paperService } from "../../papers/paper.service.js";
import { SearchLogModel } from "../../analytics/models/search-log.model.js";
import { BookmarkModel } from "../../bookmarks/models/bookmark.model.js";
import { ReportModel } from "../../reports/models/report.model.js";
import { ProjectModel } from "../../projects/models/project.model.js";
import { PaperModel } from "../../papers/models/paper.model.js";
import { ApiSyncRunModel } from "../../api-sync/models/api-sync-run.model.js";

vi.mock("../../analytics/analytics.service.js", () => ({
  analyticsService: {
    getSummary: vi.fn(),
  },
}));

vi.mock("../../trends/trend.service.js", () => ({
  trendService: {
    overview: vi.fn(),
  },
}));

vi.mock("../../papers/paper.service.js", () => ({
  paperService: {
    list: vi.fn(),
  },
}));

vi.mock("../../analytics/models/search-log.model.js", () => ({
  SearchLogModel: {
    find: vi.fn(),
  },
}));

vi.mock("../../bookmarks/models/bookmark.model.js", () => ({
  BookmarkModel: {
    countDocuments: vi.fn(),
  },
}));

vi.mock("../../reports/models/report.model.js", () => ({
  ReportModel: {
    countDocuments: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock("../../projects/models/project.model.js", () => ({
  ProjectModel: {
    countDocuments: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock("../../papers/models/paper.model.js", () => ({
  PaperModel: {
    countDocuments: vi.fn(),
  },
}));

vi.mock("../../api-sync/models/api-sync-run.model.js", () => ({
  ApiSyncRunModel: {
    findOne: vi.fn(),
  },
}));

function chain<T>(value: T) {
  const methods = {
    select: vi.fn(() => methods),
    sort: vi.fn(() => methods),
    limit: vi.fn(() => methods),
    lean: vi.fn(async () => value),
  };
  return methods;
}

const trendSnapshot = {
  yearFrom: 2020,
  yearTo: 2026,
  lastCompleteYear: 2025,
  totalPapersInWindow: 10,
  yearlyTotalPapers: [{ year: 2025, count: 10 }],
  citationTrend: [{ year: 2025, count: 10, totalCitations: 50, avgCitations: 5 }],
  topics: [],
  risingKeywords: [],
  computedAt: "2026-07-01T00:00:00.000Z",
};

describe("homeService.getOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyticsService.getSummary).mockResolvedValue({
      totalSearches: 12,
      totalPapers: 34,
      uniqueUsers: 5,
    });
    vi.mocked(trendService.overview).mockResolvedValue(trendSnapshot as any);
    vi.mocked(paperService.list).mockResolvedValue({ papers: [{ id: "p1", title: "Paper" } as any], total: 1 });
  });

  it("returns public home data without personal or admin sections for guests", async () => {
    const overview = await homeService.getOverview();

    expect(overview.mode).toBe("guest");
    expect(overview.summary.totalPapers).toBe(34);
    expect(overview.trends.yearlyTotalPapers).toEqual([{ year: 2025, count: 10 }]);
    expect(overview.recentPapers).toHaveLength(1);
    expect(overview.workspace).toBeUndefined();
    expect(overview.admin).toBeUndefined();
    expect(paperService.list).toHaveBeenCalledWith({ page: 1, pageSize: 3, sort: "year" });
  });

  it("adds workspace data for authenticated non-admin users", async () => {
    vi.mocked(SearchLogModel.find).mockReturnValue(chain([{ query: "LLM", mode: "semantic", resultCount: 9, createdAt: new Date("2026-07-01T01:00:00.000Z") }]) as any);
    vi.mocked(BookmarkModel.countDocuments).mockResolvedValue(2);
    vi.mocked(ReportModel.countDocuments).mockResolvedValue(3);
    vi.mocked(ProjectModel.countDocuments).mockResolvedValue(4);
    vi.mocked(ReportModel.find).mockReturnValue(chain([{ _id: "r1", query: "AI feedback", status: "ready", createdAt: new Date("2026-07-01T02:00:00.000Z") }]) as any);
    vi.mocked(ProjectModel.find).mockReturnValue(chain([{ _id: "pr1", title: "Capstone", papers: [{ targetId: "p1" }], updatedAt: new Date("2026-07-01T03:00:00.000Z") }]) as any);

    const overview = await homeService.getOverview({ sub: "u1", email: "u@example.com", role: "student" });

    expect(overview.mode).toBe("user");
    expect(overview.workspace?.bookmarkCount).toBe(2);
    expect(overview.workspace?.recentSearches[0]?.query).toBe("LLM");
    expect(overview.workspace?.latestReports[0]?.id).toBe("r1");
    expect(overview.workspace?.latestProjects[0]).toMatchObject({ id: "pr1", paperCount: 1 });
    expect(overview.admin).toBeUndefined();
  });

  it("adds system health data for admins", async () => {
    vi.mocked(SearchLogModel.find).mockReturnValue(chain([]) as any);
    vi.mocked(BookmarkModel.countDocuments).mockResolvedValue(0);
    vi.mocked(ReportModel.countDocuments)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);
    vi.mocked(ProjectModel.countDocuments).mockResolvedValue(0);
    vi.mocked(ReportModel.find).mockReturnValue(chain([]) as any);
    vi.mocked(ProjectModel.find).mockReturnValue(chain([]) as any);
    vi.mocked(PaperModel.countDocuments)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(6);
    vi.mocked(ApiSyncRunModel.findOne).mockReturnValue(chain({
      _id: "s1",
      runStatus: "running",
      searchText: "LLM",
      startedAt: new Date("2026-07-01T04:00:00.000Z"),
      totalFetched: 20,
      totalInserted: 10,
      totalUpdated: 8,
      totalDuplicates: 2,
    }) as any);

    const overview = await homeService.getOverview({ sub: "admin1", email: "a@example.com", role: "admin" });

    expect(overview.mode).toBe("admin");
    expect(overview.admin?.pendingPaperRequests).toBe(7);
    expect(overview.admin?.embedding).toEqual({ analyzable: 10, embedded: 6, pending: 4 });
    expect(overview.admin?.sync.running).toBe(true);
    expect(overview.admin?.sync.latest?.id).toBe("s1");
    expect(overview.admin?.reports).toEqual({ queued: 2, generating: 3, failedRecent: 4 });
  });
});
