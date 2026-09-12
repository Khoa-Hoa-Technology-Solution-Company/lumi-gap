import type {
  HomeAdminHealth,
  HomeOverview,
  HomeProjectSummary,
  HomeRecentSearch,
  HomeReportSummary,
  HomeTrendSnapshot,
} from "@trend/shared-types";
import type { AuthClaims } from "../../common/middleware/auth.js";
import { analyticsService } from "../analytics/analytics.service.js";
import { SearchLogModel } from "../analytics/models/search-log.model.js";
import { ApiSyncRunModel } from "../api-sync/models/api-sync-run.model.js";
import { buildUserPaperRequestFilter } from "../papers/paper-workflow.js";
import { BookmarkModel } from "../bookmarks/models/bookmark.model.js";
import { PaperModel } from "../papers/models/paper.model.js";
import { paperService } from "../papers/paper.service.js";
import { ProjectModel } from "../projects/models/project.model.js";
import { ReportModel } from "../reports/models/report.model.js";
import { trendService } from "../trends/trend.service.js";

export const homeService = {
  async getOverview(user?: AuthClaims): Promise<HomeOverview> {
    const [summary, trendsOverview, recentPapersResult] = await Promise.all([
      analyticsService.getSummary(),
      trendService.overview({ limit: 6, minPapers: 3, sortBy: "momentum" }),
      paperService.list({ page: 1, pageSize: 3, sort: "year" }),
    ]);

    const mode = user?.role === "admin" ? "admin" : user ? "user" : "guest";
    const workspace = user ? await getWorkspaceSnapshot(user.sub) : undefined;
    const admin = user?.role === "admin" ? await getAdminHealth() : undefined;

    return {
      mode,
      generatedAt: new Date().toISOString(),
      summary,
      trends: toHomeTrendSnapshot(trendsOverview),
      recentPapers: recentPapersResult.papers,
      ...(workspace ? { workspace } : {}),
      ...(admin ? { admin } : {}),
    };
  },
};

function toHomeTrendSnapshot(trends: {
  yearFrom: number;
  yearTo: number;
  lastCompleteYear: number;
  totalPapersInWindow: number;
  yearlyTotalPapers: HomeTrendSnapshot["yearlyTotalPapers"];
  citationTrend: HomeTrendSnapshot["citationTrend"];
  topics: HomeTrendSnapshot["topics"];
  risingKeywords: HomeTrendSnapshot["risingKeywords"];
  computedAt: string;
}): HomeTrendSnapshot {
  return {
    yearFrom: trends.yearFrom,
    yearTo: trends.yearTo,
    lastCompleteYear: trends.lastCompleteYear,
    totalPapersInWindow: trends.totalPapersInWindow,
    yearlyTotalPapers: trends.yearlyTotalPapers,
    citationTrend: trends.citationTrend,
    topics: trends.topics,
    risingKeywords: trends.risingKeywords,
    computedAt: trends.computedAt,
  };
}

async function getWorkspaceSnapshot(userId: string): Promise<HomeOverview["workspace"]> {
  const projectFilter = {
    $or: [{ ownerId: userId }, { "members.targetId": userId }],
  };

  const [recentSearchDocs, bookmarkCount, reportCount, projectCount, reportDocs, projectDocs] = await Promise.all([
    SearchLogModel.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
    BookmarkModel.countDocuments({ userId }),
    ReportModel.countDocuments({ userId }),
    ProjectModel.countDocuments(projectFilter),
    ReportModel.find({ userId }).select("_id topic query status createdAt").sort({ createdAt: -1 }).limit(3).lean(),
    ProjectModel.find(projectFilter).select("_id title papers updatedAt").sort({ updatedAt: -1 }).limit(3).lean(),
  ]);

  return {
    bookmarkCount,
    reportCount,
    projectCount,
    recentSearches: recentSearchDocs.map(toHomeRecentSearch),
    latestReports: reportDocs.map(toHomeReportSummary),
    latestProjects: projectDocs.map(toHomeProjectSummary),
  };
}

async function getAdminHealth(): Promise<HomeAdminHealth> {
  const failedSince = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [pendingPaperRequests, analyzable, embedded, latestSync, queued, generating, failedRecent] = await Promise.all([
    PaperModel.countDocuments(buildUserPaperRequestFilter("pending")),
    PaperModel.countDocuments({ isAiAnalyzable: true }),
    PaperModel.countDocuments({ isAiAnalyzable: true, embedding: { $exists: true } }),
    ApiSyncRunModel.findOne().sort({ startedAt: -1 }).lean(),
    ReportModel.countDocuments({ status: "queued" }),
    ReportModel.countDocuments({ status: "generating" }),
    ReportModel.countDocuments({ status: "failed", updatedAt: { $gte: failedSince } }),
  ]);

  return {
    pendingPaperRequests,
    embedding: {
      analyzable,
      embedded,
      pending: Math.max(0, analyzable - embedded),
    },
    sync: {
      running: latestSync?.runStatus === "running",
      latest: latestSync
        ? {
            id: String(latestSync._id),
            status: latestSync.runStatus,
            searchText: latestSync.searchText ?? undefined,
            startedAt: toIso(latestSync.startedAt),
            finishedAt: latestSync.finishedAt ? toIso(latestSync.finishedAt) : undefined,
            totalFetched: latestSync.totalFetched ?? 0,
            totalInserted: latestSync.totalInserted ?? 0,
            totalUpdated: latestSync.totalUpdated ?? 0,
            totalDuplicates: latestSync.totalDuplicates ?? 0,
            errorMessage: latestSync.errorMessage ?? undefined,
          }
        : null,
    },
    reports: {
      queued,
      generating,
      failedRecent,
    },
  };
}

function toHomeRecentSearch(doc: {
  query: string;
  mode: string;
  resultCount: number;
  createdAt: Date | string;
}): HomeRecentSearch {
  return {
    query: doc.query,
    mode: doc.mode,
    resultCount: doc.resultCount,
    createdAt: toIso(doc.createdAt),
  };
}

function toHomeReportSummary(doc: {
  _id: unknown;
  topic?: string | null;
  query: string;
  status: HomeReportSummary["status"];
  createdAt: Date | string;
}): HomeReportSummary {
  return {
    id: String(doc._id),
    topic: doc.topic ?? undefined,
    query: doc.query,
    status: doc.status,
    createdAt: toIso(doc.createdAt),
  };
}

function toHomeProjectSummary(doc: {
  _id: unknown;
  title: string;
  papers?: unknown[];
  updatedAt: Date | string;
}): HomeProjectSummary {
  return {
    id: String(doc._id),
    title: doc.title,
    paperCount: doc.papers?.length ?? 0,
    updatedAt: toIso(doc.updatedAt),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
