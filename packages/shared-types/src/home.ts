import type { SearchSummary } from "./analytics.js";
import type { Paper } from "./paper.js";
import type { ReportStatus } from "./report.js";
import type { RisingKeyword, TrendingTopic, YearlyCitationMetric, YearlyCount } from "./trend.js";

export type HomeOverviewMode = "guest" | "user" | "admin";

export interface HomeTrendSnapshot {
  yearFrom: number;
  yearTo: number;
  lastCompleteYear: number;
  totalPapersInWindow: number;
  yearlyTotalPapers: YearlyCount[];
  citationTrend: YearlyCitationMetric[];
  topics: TrendingTopic[];
  risingKeywords: RisingKeyword[];
  computedAt: string;
}

export interface HomeRecentSearch {
  query: string;
  mode: string;
  resultCount: number;
  createdAt: string;
}

export interface HomeReportSummary {
  id: string;
  topic?: string;
  query: string;
  status: ReportStatus;
  createdAt: string;
}

export interface HomeProjectSummary {
  id: string;
  title: string;
  paperCount: number;
  updatedAt: string;
}

export interface HomeWorkspaceSnapshot {
  bookmarkCount: number;
  reportCount: number;
  projectCount: number;
  recentSearches: HomeRecentSearch[];
  latestReports: HomeReportSummary[];
  latestProjects: HomeProjectSummary[];
}

export interface HomeAdminHealth {
  pendingPaperRequests: number;
  embedding: {
    analyzable: number;
    embedded: number;
    pending: number;
  };
  sync: {
    running: boolean;
    latest: {
      id: string;
      status: "running" | "succeeded" | "failed" | "cancelled";
      searchText?: string;
      startedAt: string;
      finishedAt?: string;
      totalFetched: number;
      totalInserted: number;
      totalUpdated: number;
      totalDuplicates: number;
      errorMessage?: string;
    } | null;
  };
  reports: {
    queued: number;
    generating: number;
    failedRecent: number;
  };
}

export interface HomeOverview {
  mode: HomeOverviewMode;
  generatedAt: string;
  summary: SearchSummary;
  trends: HomeTrendSnapshot;
  recentPapers: Paper[];
  workspace?: HomeWorkspaceSnapshot;
  admin?: HomeAdminHealth;
}
