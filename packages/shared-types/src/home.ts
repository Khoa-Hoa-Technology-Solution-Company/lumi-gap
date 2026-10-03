import type { SearchSummary } from "./analytics.js";
import type { Paper } from "./paper.js";
import type { ReportStatus } from "./report.js";
import type { AcademicRole } from "./user.js";
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

export type HomeWorkflowStage = "collection" | "screening" | "evidence" | "gaps" | "revision";
export interface HomeResearchWorkspace {
  id: string;
  title: string;
  researchField?: string;
  stage: HomeWorkflowStage;
  href: string;
  updatedAt: string;
  isOwner: boolean;
  paperCount: number;
  screenedCount: number;
  awaitingScreening: number;
  includedCount: number;
  evidenceCount: number;
  papersWithEvidence: number;
  candidateGapCount: number;
}
export type HomeAttentionType = "screening" | "evidence" | "revision" | "review" | "invitation" | "mentorship" | "contribution";
export interface HomeAttentionItem {
  id: string;
  type: HomeAttentionType;
  title: string;
  description?: string;
  count?: number;
  href: string;
  occurredAt: string;
  priority: number;
  projectId?: string;
  relationshipId?: string;
}
export interface HomeRecommendedPaper {
  id: string;
  title: string;
  authors: string[];
  venue?: string;
  year: number;
  reason: "interest" | "project" | "recent";
  reasonLabel?: string;
}
export interface HomeCommunityTopic {
  id: string;
  title: string;
  href: string;
  community?: string;
  replyCount: number;
  occurredAt: string;
  reason: "following" | "joined" | "interest" | "recent";
}
export type HomeSection<T> = { status: "ready"; data: T } | { status: "unavailable"; data: null };
export interface HomeResearchOverview {
  currentUser: { id: string; name: string; academicRole?: AcademicRole };
  workspace: HomeSection<{ continueResearch: HomeResearchWorkspace[]; attention: HomeAttentionItem[] }>;
  recommendations: HomeSection<HomeRecommendedPaper[]>;
  communityActivity: HomeSection<HomeCommunityTopic[]>;
}
