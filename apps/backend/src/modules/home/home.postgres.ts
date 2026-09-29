import type { HomeAdminHealth, HomeOverview, Paper } from "@trend/shared-types";
import { Prisma } from "../../generated/prisma/client.js";
import type { AuthClaims } from "../../common/middleware/auth.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { getPostgresTrendsOverview } from "../trends/trend.postgres.js";

export async function getPostgresHomeOverview(user?: AuthClaims): Promise<HomeOverview> {
  const prisma = getPrisma();
  const [totalSearches, totalPapers, uniqueUsers, trendsOverview, recentPapers] = await Promise.all([
    prisma.searchLog.count(),
    prisma.paper.count({ where: { dataStatus: "active" } }),
    prisma.user.count(),
    getPostgresTrendsOverview({ limit: 6, minPapers: 3, sortBy: "momentum" }),
    getRecentPapers(),
  ]);

  const mode = user?.role === "admin" ? "admin" : user ? "user" : "guest";
  const internalUserId = user ? await resolveUserId(user.sub) : null;
  const workspace = internalUserId ? await getWorkspaceSnapshot(internalUserId) : undefined;
  const admin = user?.role === "admin" ? await getAdminHealth() : undefined;

  return {
    mode,
    generatedAt: new Date().toISOString(),
    summary: { totalSearches, totalPapers, uniqueUsers },
    trends: {
      yearFrom: trendsOverview.yearFrom,
      yearTo: trendsOverview.yearTo,
      lastCompleteYear: trendsOverview.lastCompleteYear,
      totalPapersInWindow: trendsOverview.totalPapersInWindow,
      yearlyTotalPapers: trendsOverview.yearlyTotalPapers,
      citationTrend: trendsOverview.citationTrend,
      topics: trendsOverview.topics,
      risingKeywords: trendsOverview.risingKeywords,
      computedAt: trendsOverview.computedAt,
    },
    recentPapers,
    ...(workspace ? { workspace } : {}),
    ...(admin ? { admin } : {}),
  };
}

async function resolveUserId(publicId: string): Promise<string | null> {
  const parsed = parseDatabaseId(publicId);
  if (!parsed) return null;
  const user = await getPrisma().user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
    select: { id: true },
  });
  return user?.id ?? null;
}

async function getWorkspaceSnapshot(userId: string): Promise<NonNullable<HomeOverview["workspace"]>> {
  const prisma = getPrisma();
  const memberships = await prisma.projectMember.findMany({
    where: { userId, status: "ACTIVE" },
    select: { projectId: true },
  });
  const memberProjectIds = memberships.map((row) => row.projectId);
  const projectWhere = memberProjectIds.length > 0
    ? { OR: [{ ownerId: userId }, { id: { in: memberProjectIds } }] }
    : { ownerId: userId };

  const [recentSearches, bookmarkCount, reportCount, projectCount, latestReports, latestProjects] = await Promise.all([
    prisma.searchLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { query: true, mode: true, resultCount: true, createdAt: true },
    }),
    prisma.bookmark.count({ where: { userId } }),
    prisma.report.count({ where: { userId } }),
    prisma.project.count({ where: projectWhere }),
    prisma.report.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, legacyMongoId: true, topic: true, query: true, status: true, createdAt: true },
    }),
    prisma.project.findMany({
      where: projectWhere,
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { id: true, legacyMongoId: true, title: true, updatedAt: true },
    }),
  ]);

  const paperCounts = latestProjects.length > 0
    ? await prisma.projectPaper.groupBy({
        by: ["projectId"],
        where: { projectId: { in: latestProjects.map((project) => project.id) } },
        _count: { _all: true },
      })
    : [];
  const paperCountByProject = new Map(paperCounts.map((row) => [row.projectId, row._count._all]));

  return {
    bookmarkCount,
    reportCount,
    projectCount,
    recentSearches: recentSearches.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    latestReports: latestReports.map((row) => ({
      id: publicDatabaseId(row),
      ...(row.topic ? { topic: row.topic } : {}),
      query: row.query,
      status: row.status as NonNullable<HomeOverview["workspace"]>["latestReports"][number]["status"],
      createdAt: row.createdAt.toISOString(),
    })),
    latestProjects: latestProjects.map((row) => ({
      id: publicDatabaseId(row),
      title: row.title,
      paperCount: paperCountByProject.get(row.id) ?? 0,
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

async function getAdminHealth(): Promise<HomeAdminHealth> {
  const prisma = getPrisma();
  const failedSince = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [pendingPaperRequests, analyzable, embeddedRows, latestSync, queued, generating, failedRecent] = await Promise.all([
    prisma.paper.count({ where: { paperStatus: "pending", requestedById: { not: null } } }),
    prisma.paper.count({ where: { isAiAnalyzable: true } }),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count FROM papers
      WHERE is_ai_analyzable = TRUE AND embedding IS NOT NULL
    `),
    prisma.apiSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.report.count({ where: { status: "queued" } }),
    prisma.report.count({ where: { status: "generating" } }),
    prisma.report.count({ where: { status: "failed", updatedAt: { gte: failedSince } } }),
  ]);
  const embedded = Number(embeddedRows[0]?.count ?? 0);
  return {
    pendingPaperRequests,
    embedding: { analyzable, embedded, pending: Math.max(0, analyzable - embedded) },
    sync: {
      running: latestSync?.runStatus === "running",
      latest: latestSync
        ? {
            id: publicDatabaseId(latestSync),
            status: latestSync.runStatus as HomeAdminHealth["sync"]["latest"] extends infer T
              ? T extends { status: infer S } ? S : never
              : never,
            ...(latestSync.searchText ? { searchText: latestSync.searchText } : {}),
            startedAt: latestSync.startedAt.toISOString(),
            ...(latestSync.finishedAt ? { finishedAt: latestSync.finishedAt.toISOString() } : {}),
            totalFetched: latestSync.totalFetched,
            totalInserted: latestSync.totalInserted,
            totalUpdated: latestSync.totalUpdated,
            totalDuplicates: latestSync.totalDuplicates,
            ...(latestSync.errorMessage ? { errorMessage: latestSync.errorMessage } : {}),
          }
        : null,
    },
    reports: { queued, generating, failedRecent },
  };
}

async function getRecentPapers(): Promise<Paper[]> {
  const prisma = getPrisma();
  const papers = await prisma.paper.findMany({
    where: { dataStatus: "active" },
    orderBy: [{ publicationYear: "desc" }, { citationCount: "desc" }],
    take: 3,
  });
  if (papers.length === 0) return [];
  const ids = papers.map((paper) => paper.id);
  const [authors, keywords, topics] = await Promise.all([
    prisma.paperAuthor.findMany({ where: { paperId: { in: ids } }, orderBy: { position: "asc" } }),
    prisma.paperKeyword.findMany({ where: { paperId: { in: ids } }, orderBy: { position: "asc" } }),
    prisma.paperTopic.findMany({ where: { paperId: { in: ids } }, orderBy: { position: "asc" } }),
  ]);

  return papers.map((paper) => ({
    id: publicDatabaseId(paper),
    externalIds: {
      ...(paper.doi ? { doi: paper.doi } : {}),
      ...(paper.openalexId ? { openalexId: paper.openalexId } : {}),
      ...(paper.semanticScholarId ? { semanticScholarId: paper.semanticScholarId } : {}),
      ...(paper.arxivId ? { arxivId: paper.arxivId } : {}),
      ...(paper.pubmedId ? { pubmedId: paper.pubmedId } : {}),
    },
    title: paper.title,
    ...(paper.abstractText ? { abstractText: paper.abstractText } : {}),
    authors: authors.filter((row) => row.paperId === paper.id).map((row) => ({
      ...(row.authorId ? { authorId: row.authorId } : {}),
      displayName: row.displayName,
      position: row.position,
      isCorresponding: row.isCorresponding,
    })),
    ...(paper.journalId ? { journalId: paper.journalId } : {}),
    ...(paper.journalName ? { journalName: paper.journalName } : {}),
    publicationYear: paper.publicationYear,
    ...(paper.publicationDate ? { publicationDate: paper.publicationDate.toISOString() } : {}),
    paperKind: paper.paperKind as Paper["paperKind"],
    language: paper.language,
    openAccessStatus: paper.openAccessStatus as Paper["openAccessStatus"],
    ...(paper.openAccessUrl ? { openAccessUrl: paper.openAccessUrl } : {}),
    ...(paper.licenseName ? { licenseName: paper.licenseName } : {}),
    citationCount: paper.citationCount,
    ...(paper.fwci !== null ? { fwci: paper.fwci } : {}),
    ...(paper.citationNormalizedPercentile
      ? { citationNormalizedPercentile: paper.citationNormalizedPercentile as unknown as NonNullable<Paper["citationNormalizedPercentile"]> }
      : {}),
    relatedWorksCount: paper.relatedWorksCount,
    keywords: keywords.filter((row) => row.paperId === paper.id).map((row) => ({
      ...(row.keywordId ? { keywordId: row.keywordId } : {}),
      keywordName: row.keywordName,
      detectedBy: row.detectedBy as NonNullable<Paper["keywords"][number]["detectedBy"]>,
      ...(row.confidence !== null ? { confidence: row.confidence } : {}),
    })),
    topics: topics.filter((row) => row.paperId === paper.id).map((row) => ({
      ...(row.topicId ? { topicId: row.topicId } : {}),
      ...(row.openalexTopicId ? { openalexTopicId: row.openalexTopicId } : {}),
      topicName: row.topicName,
      detectedBy: row.detectedBy as NonNullable<Paper["topics"][number]["detectedBy"]>,
      ...(row.confidence !== null ? { confidence: row.confidence } : {}),
      isPrimary: row.isPrimary,
      ...(row.subfieldId ? { subfieldId: row.subfieldId } : {}),
      ...(row.subfieldName ? { subfieldName: row.subfieldName } : {}),
      ...(row.fieldId ? { fieldId: row.fieldId } : {}),
      ...(row.fieldName ? { fieldName: row.fieldName } : {}),
      ...(row.domainId ? { domainId: row.domainId } : {}),
      ...(row.domainName ? { domainName: row.domainName } : {}),
    })),
    primaryProvider: paper.primaryProvider as Paper["primaryProvider"],
    dataStatus: paper.dataStatus as Paper["dataStatus"],
    dataQualityScore: paper.dataQualityScore,
    isAiAnalyzable: paper.isAiAnalyzable,
    ...(paper.aiScore ? { aiScore: paper.aiScore as unknown as NonNullable<Paper["aiScore"]> } : {}),
    ...(paper.aiAnalysis ? { aiAnalysis: paper.aiAnalysis as unknown as NonNullable<Paper["aiAnalysis"]> } : {}),
    metadataScore: paper.metadataScore,
    sourceScore: paper.sourceScore,
    duplicateScore: paper.duplicateScore,
    relevanceScore: paper.relevanceScore,
    prestigeScore: paper.prestigeScore,
    utilityScore: paper.utilityScore,
    qualityScore: paper.qualityScore,
    qualityTier: paper.qualityTier,
    qualityTierName: paper.qualityTierName,
    downloadCost: paper.downloadCost,
    uploadCreditReward: paper.uploadCreditReward,
    ...(paper.pdfPath ? { pdfPath: paper.pdfPath, pdfAvailable: true } : { pdfAvailable: false }),
    ...(paper.paperLink ? { paperLink: paper.paperLink } : {}),
    ...(paper.rejectionReason ? { rejectionReason: paper.rejectionReason } : {}),
    paperStatus: paper.paperStatus as Paper["paperStatus"],
    ...(paper.uploadedAt ? { uploadedAt: paper.uploadedAt.toISOString() } : {}),
    ...(paper.uploadRewardedAt ? { uploadRewardedAt: paper.uploadRewardedAt.toISOString() } : {}),
    createdAt: paper.createdAt.toISOString(),
    updatedAt: paper.updatedAt.toISOString(),
  }));
}
