import crypto from "node:crypto";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { auditService } from "../audit/audit.service.js";
import { fetchOpenAlexPage } from "./providers/openalex.client.js";
import { hasOpenAlexCitationMetadata, normalizeOpenAlexWork, type NormalizedPaper } from "./providers/openalex.normalizer.js";
import type { OpenAlexWork } from "./providers/openalex.types.js";
import { OPENALEX_PAPER_STATUS } from "../papers/paper-workflow.js";

export interface RunSyncJob { searchText: string; yearFrom: number; maxPages: number; syncConfigId?: string }
type PaperRow = Awaited<ReturnType<typeof getPrisma>> extends never ? never : any;
type Ingested = { paper: PaperRow; work: OpenAlexWork; action: "insert" | "update" };
export type OpenAlexIngestResult = { records: Ingested[]; fetchedCount: number; insertedCount: number; updatedCount: number; rejectedCount: number; rejectedWorks: Array<{ work: OpenAlexWork; errorMessage: string }> };

export async function runSync(job: RunSyncJob): Promise<any> {
  const prisma = getPrisma(); const provider = await prisma.apiProvider.findUnique({ where: { providerName: "openalex" } }); if (!provider) throw new Error("openalex provider not seeded — run seed:providers first");
  const config = job.syncConfigId ? await prisma.apiSyncConfig.findUnique({ where: { id: job.syncConfigId } }).catch(() => null) : null;
  let run = await prisma.apiSyncRun.create({ data: { syncConfigId: config?.id, providerId: provider.id, runStatus: "running", searchText: job.searchText, startedAt: new Date() } });
  await auditService.log("sync.started", { targetTableName: "api_sync_runs", targetRecordId: run.id, details: job }); let cursor = "*";
  try { for (let page = 0; page < job.maxPages; page++) { const result = await fetchOpenAlexPage({ searchText: job.searchText, yearFrom: job.yearFrom, cursor }); const ingested = await ingestOpenAlexWorks(result.results, provider.id); run = await prisma.apiSyncRun.update({ where: { id: run.id }, data: { totalFetched: { increment: ingested.fetchedCount }, totalInserted: { increment: ingested.insertedCount }, totalUpdated: { increment: ingested.updatedCount }, totalDuplicates: { increment: ingested.updatedCount } } }); if (!result.nextCursor || !result.results.length) break; cursor = result.nextCursor; } run = await prisma.apiSyncRun.update({ where: { id: run.id }, data: { runStatus: "succeeded", finishedAt: new Date() } }); } catch (error) { run = await prisma.apiSyncRun.update({ where: { id: run.id }, data: { runStatus: "failed", errorMessage: error instanceof Error ? error.message : String(error), finishedAt: new Date() } }); logger.error({ error, runId: run.id }, "sync run failed"); }
  await auditService.log("sync.completed", { targetTableName: "api_sync_runs", targetRecordId: run.id, details: { runStatus: run.runStatus, totalFetched: run.totalFetched, totalInserted: run.totalInserted, totalUpdated: run.totalUpdated } }); return { ...run, _id: { toString: () => publicDatabaseId(run) } };
}

export async function ingestOpenAlexWorks(works: OpenAlexWork[], providerId: string, options: { purpose?: "citation" } = {}): Promise<OpenAlexIngestResult> {
  const records: Ingested[] = [], rejectedWorks: Array<{ work: OpenAlexWork; errorMessage: string }> = [];
  for (const work of works) { try { const normalized = normalizeOpenAlexWork(work); const result = await upsertPaper(normalized, options.purpose); records.push({ ...result, work }); const hash = crypto.createHash("sha256").update(JSON.stringify(work)).digest("hex"); const source = await getPrisma().paperSourceRecord.findFirst({ where: { paperId: result.paper.id, providerId } }); if (source) await getPrisma().paperSourceRecord.update({ where: { id: source.id }, data: { externalRecordId: work.id ?? "", metadataHash: hash, fetchedAt: new Date() } }); else await getPrisma().paperSourceRecord.create({ data: { paperId: result.paper.id, providerId, externalRecordId: work.id ?? "", metadataHash: hash, fetchedAt: new Date() } }); } catch (error) { rejectedWorks.push({ work, errorMessage: error instanceof Error ? error.message : String(error) }); } }
  return { records, fetchedCount: works.length, insertedCount: records.filter((row) => row.action === "insert").length, updatedCount: records.filter((row) => row.action === "update").length, rejectedCount: rejectedWorks.length, rejectedWorks };
}

async function upsertPaper(normalized: NormalizedPaper, purpose?: "citation"): Promise<{ action: "insert" | "update"; paper: any }> {
  const prisma = getPrisma(); const existing = await prisma.paper.findFirst({ where: { OR: [...(normalized.externalIds.doi ? [{ doi: normalized.externalIds.doi }] : []), ...(normalized.externalIds.openalexId ? [{ openalexId: normalized.externalIds.openalexId }] : [])] } });
  const citationMetadata = hasOpenAlexCitationMetadata(normalized);
  if (purpose === "citation") {
    if (!citationMetadata) throw new Error("The provider returned incomplete citation metadata");
    // A DOI import must never republish a draft or rejected record, including one created during lookup.
    if (existing) {
      if (existing.dataStatus !== "active") throw new Error("This paper is not available for public forum references");
      return { action: "update", paper: existing };
    }
  }
  const isAiAnalyzable = Boolean(normalized.abstractText && normalized.abstractText.length >= 250);
  const publicCitationMetadata = citationMetadata && (purpose === "citation" || (existing?.dataStatus === "active" && existing.isAiAnalyzable === false));
  const data = { doi: normalized.externalIds.doi, openalexId: normalized.externalIds.openalexId, title: normalized.title, abstractText: normalized.abstractText, journalName: normalized.journalName, publicationYear: normalized.publicationYear, publicationDate: normalized.publicationDate, paperKind: normalized.paperKind, language: normalized.language, openAccessStatus: normalized.openAccessStatus, openAccessUrl: normalized.openAccessUrl, licenseName: normalized.licenseName, citationCount: normalized.citationCount, fwci: normalized.fwci, citationNormalizedPercentile: normalized.citationNormalizedPercentile as never, relatedWorksCount: normalized.relatedWorksCount, primaryProvider: "openalex", paperStatus: OPENALEX_PAPER_STATUS, dataStatus: isAiAnalyzable || publicCitationMetadata ? "active" : "low-quality", isAiAnalyzable, referencedWorks: normalized.referencedWorks, relatedWorks: normalized.relatedWorks };
  const paper = existing ? await prisma.paper.update({ where: { id: existing.id }, data: { ...data, citationCount: Math.max(existing.citationCount, normalized.citationCount) } }) : await prisma.paper.create({ data });
  await prisma.$transaction(async (tx) => { await Promise.all([tx.paperAuthor.deleteMany({ where: { paperId: paper.id } }), tx.paperKeyword.deleteMany({ where: { paperId: paper.id } }), tx.paperTopic.deleteMany({ where: { paperId: paper.id } })]); if (normalized.authors.length) await tx.paperAuthor.createMany({ data: normalized.authors.map((author) => ({ paperId: paper.id, displayName: author.displayName, position: author.position, isCorresponding: author.isCorresponding })) }); if (normalized.keywords.length) await tx.paperKeyword.createMany({ data: normalized.keywords.map((keyword, position) => ({ paperId: paper.id, keywordName: keyword.keywordName, detectedBy: keyword.detectedBy, confidence: keyword.confidence, position })) }); if (normalized.topics.length) await tx.paperTopic.createMany({ data: normalized.topics.map((topic, position) => ({ paperId: paper.id, ...topic, position })) }); });
  return { action: existing ? "update" : "insert", paper: { ...paper, _id: { toString: () => publicDatabaseId(paper) } } };
}

export function computeQuality(paper: { title?: string; abstractText?: string | null; doi?: string | null; externalIds?: { doi?: string }; journalName?: string | null; publicationYear?: number; authors?: unknown[]; openAccessUrl?: string | null }) { const checks = { hasTitle: Boolean(paper.title), hasAbstract: (paper.abstractText?.trim().length ?? 0) >= 250, hasDoi: Boolean(paper.doi ?? paper.externalIds?.doi), hasJournal: Boolean(paper.journalName), hasPublicationYear: Boolean(paper.publicationYear), hasAuthors: Boolean(paper.authors?.length), hasOpenAccessUrl: Boolean(paper.openAccessUrl) }; const qualityScore = Object.values(checks).filter(Boolean).length / 7; return { checks, qualityScore, checkStatus: qualityScore >= 0.7 ? "pass" as const : qualityScore >= 0.5 ? "warn" as const : "fail" as const }; }
