import crypto from "node:crypto";
import type { AnyBulkWriteOperation } from "mongoose";
import { env } from "../../config/env.js";
import { computePaperScore } from "../scoring/paper-score.js";
import { logger } from "../../infrastructure/logger.js";
import { auditService } from "../audit/audit.service.js";
import { PaperModel, type PaperHydrated } from "../papers/models/paper.model.js";
import { PaperSourceRecordModel } from "../papers/models/paper-source-record.model.js";
import { PaperQualityCheckModel } from "../papers/models/paper-quality-check.model.js";
import { ApiProviderModel } from "./models/api-provider.model.js";
import { ApiSyncRunModel, type ApiSyncRunDoc } from "./models/api-sync-run.model.js";
import { fetchOpenAlexPage } from "./providers/openalex.client.js";
import {
  normalizeOpenAlexWork,
  type NormalizedPaper,
} from "./providers/openalex.normalizer.js";
import type { OpenAlexWork } from "./providers/openalex.types.js";
import { shouldReplaceTopics } from "./topic-merge.js";
import { OPENALEX_PAPER_STATUS } from "../papers/paper-workflow.js";
import { calculatePaperQuality } from "../papers/paper-quality.js";

export interface RunSyncJob {
  searchText: string;
  yearFrom: number;
  maxPages: number;
  syncConfigId?: string;
}

/** How many paper upserts to run concurrently within a page (M0-friendly). */
const UPSERT_CONCURRENCY = 8;

/** Run a full OpenAlex sync. Returns the completed api_sync_runs document. */
export async function runSync(job: RunSyncJob): Promise<ApiSyncRunDoc> {
  const provider = await ApiProviderModel.findOne({ providerName: "openalex" });
  if (!provider) {
    throw new Error(
      "openalex provider not seeded — run `pnpm --filter backend seed:providers` first",
    );
  }

  const run = await ApiSyncRunModel.create({
    syncConfigId: job.syncConfigId,
    providerId: provider._id,
    runStatus: "running",
    searchText: job.searchText,
    startedAt: new Date(),
  });

  await auditService.log("sync.started", {
    targetTableName: "api_sync_runs",
    targetRecordId: run._id.toString(),
    details: job,
  });
  logger.info({ runId: run._id.toString(), ...job }, "sync run started");

  let cursor = "*";
  let page = 0;
  try {
    while (page < job.maxPages) {
      const { results, nextCursor, total } = await fetchOpenAlexPage({
        searchText: job.searchText,
        yearFrom: job.yearFrom,
        cursor,
      });
      logger.info(
        { runId: run._id.toString(), page: page + 1, results: results.length, total },
        "openalex page fetched",
      );

      const ingestResult = await ingestOpenAlexWorks(results, provider._id);
      run.totalFetched += ingestResult.fetchedCount;
      run.totalInserted += ingestResult.insertedCount;
      run.totalUpdated += ingestResult.updatedCount;
      run.totalDuplicates += ingestResult.updatedCount;

      await run.save(); // persist running stats after each page
      if (!nextCursor || results.length === 0) break;
      cursor = nextCursor;
      page += 1;
    }

    run.runStatus = "succeeded";
  } catch (err) {
    run.runStatus = "failed";
    run.errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, runId: run._id.toString() }, "sync run failed");
  } finally {
    run.finishedAt = new Date();
    await run.save();
    await auditService.log("sync.completed", {
      targetTableName: "api_sync_runs",
      targetRecordId: run._id.toString(),
      details: {
        runStatus: run.runStatus,
        totalFetched: run.totalFetched,
        totalInserted: run.totalInserted,
        totalUpdated: run.totalUpdated,
        totalDuplicates: run.totalDuplicates,
      },
    });
    logger.info(
      {
        runId: run._id.toString(),
        status: run.runStatus,
        fetched: run.totalFetched,
        inserted: run.totalInserted,
        updated: run.totalUpdated,
        duplicates: run.totalDuplicates,
      },
      "sync run completed",
    );
  }

  return run;
}

/**
 * Ingest one page of works. The per-paper upsert (dedup + conditional merge) runs
 * with bounded concurrency; the always-insert source records and the quality
 * writes are then flushed in BULK — so a 200-paper page does ~3 bulk DB ops
 * instead of ~1200 sequential round-trips (the old hot path on Atlas M0).
 */
type IngestedOpenAlexWork = {
  paper: PaperHydrated;
  work: OpenAlexWork;
  action: "insert" | "update";
};

type RejectedOpenAlexWork = {
  work: OpenAlexWork;
  errorMessage: string;
};

export type OpenAlexIngestResult = {
  records: IngestedOpenAlexWork[];
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  rejectedCount: number;
  rejectedWorks: RejectedOpenAlexWork[];
};

/**
 * Ingest one OpenAlex page through the canonical normalization, deduplication,
 * source-record, and quality paths. Both the legacy sync and the scale campaign
 * call this function so a paper never receives different write semantics merely
 * because it arrived through a different scheduler.
 */
export async function ingestOpenAlexWorks(
  works: OpenAlexWork[],
  providerId: ApiSyncRunDoc["providerId"],
): Promise<OpenAlexIngestResult> {
  // ① Upsert papers concurrently (keeps the conditional merge semantics intact).
  const ingested: Array<{ paper: PaperHydrated; work: OpenAlexWork; action: "insert" | "update" }> = [];
  const rejectedWorks: RejectedOpenAlexWork[] = [];
  let rejectedCount = 0;
  for (let i = 0; i < works.length; i += UPSERT_CONCURRENCY) {
    const slice = works.slice(i, i + UPSERT_CONCURRENCY);
    const settled = await Promise.allSettled(
      slice.map(async (work) => {
        const normalized = normalizeOpenAlexWork(work);
        const { action, paper } = await upsertPaper(normalized);
        return { paper, work, action } as const;
      }),
    );
    for (const [index, r] of settled.entries()) {
      if (r.status === "fulfilled") ingested.push(r.value);
      else {
        rejectedCount += 1;
        rejectedWorks.push({
          work: slice[index]!,
          errorMessage: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
        logger.error({ err: r.reason }, "paper ingest failed — skipped");
      }
    }
  }

  if (ingested.length === 0) {
    return {
      records: [],
      fetchedCount: works.length,
      insertedCount: 0,
      updatedCount: 0,
      rejectedCount,
      rejectedWorks,
    };
  }

  // ② Upsert ONE source record per (paper, provider). Keyed by (paperId, providerId)
  //    — re-syncing the same paper UPDATES that record (refresh fetchedAt/hash)
  //    instead of inserting a new doc every time cited_by_count changes. Keying by
  //    metadataHash (which covers the whole work incl. citation count) made every
  //    re-sync insert a fresh row → unbounded growth on the 512MB M0 tier.
  //    rawMetadata (the full provider JSON) is heavy and read by nothing, so it is
  //    only stored when SYNC_STORE_RAW_METADATA is on.
  const sourceOps: AnyBulkWriteOperation[] = ingested.map(({ paper, work }) => {
    const metadataHash = crypto.createHash("sha256").update(JSON.stringify(work)).digest("hex");
    return {
      updateOne: {
        filter: { paperId: paper._id, providerId },
        update: {
          $set: {
            externalRecordId: work.id,
            metadataHash,
            fetchedAt: new Date(),
            ...(env.SYNC_STORE_RAW_METADATA ? { rawMetadata: work } : {}),
          },
          $setOnInsert: { paperId: paper._id, providerId },
        },
        upsert: true,
      },
    };
  });
  try {
    await PaperSourceRecordModel.bulkWrite(sourceOps as AnyBulkWriteOperation<never>[], {
      ordered: false,
    });
  } catch (err) {
    logger.error({ err }, "source-record bulk upsert partially failed (non-fatal)");
  }

  // ③ Bulk-write quality checks + denormalize quality onto the papers.
  const qualityOps: AnyBulkWriteOperation[] = [];
  const paperOps: AnyBulkWriteOperation[] = [];
  const currentYear = new Date().getFullYear();
  const computedAt = new Date().toISOString();
  for (const { paper } of ingested) {
    const { checks, qualityScore, checkStatus } = computeQuality(paper);
    // OpenAlex papers use the same deterministic, public six-dimension rubric
    // as manually uploaded papers. PDF availability is deliberately optional:
    // metadata-only records remain visible and can be enriched with a PDF later.
    const publicQuality = calculatePaperQuality(paper.toObject());
    const aiScore = computePaperScore(
      {
        publicationYear: paper.publicationYear,
        citationCount: paper.citationCount,
        dataQualityScore: qualityScore,
        fwci: paper.fwci,
        citationNormalizedPercentile: paper.citationNormalizedPercentile,
      },
      currentYear,
      computedAt,
    );
    qualityOps.push({
      updateOne: {
        filter: { paperId: paper._id },
        update: {
          $set: { ...checks, paperId: paper._id, qualityScore, checkStatus, checkedAt: new Date() },
        },
        upsert: true,
      },
    });
    paperOps.push({
      updateOne: {
        filter: { _id: paper._id },
        update: {
          $set: {
            dataQualityScore: qualityScore,
            // A real abstract is MANDATORY for AI: embeddings, RAG and semantic
            // search all run on title+abstract. Without one (or with a citation
            // stub), the paper must not enter the AI pipeline regardless of its
            // other fields.
            isAiAnalyzable: qualityScore >= 0.7 && checks.hasAbstract,
            dataStatus: checkStatus === "fail" ? "low-quality" : "active",
            aiScore,
            ...publicQuality,
          },
        },
      },
    });
  }
  try {
    await PaperQualityCheckModel.bulkWrite(qualityOps as AnyBulkWriteOperation<never>[], { ordered: false });
    await PaperModel.bulkWrite(paperOps as AnyBulkWriteOperation<never>[], { ordered: false });
  } catch (err) {
    logger.error({ err }, "quality bulk write partially failed (non-fatal)");
  }

  return {
    records: ingested,
    fetchedCount: works.length,
    insertedCount: ingested.filter((record) => record.action === "insert").length,
    updatedCount: ingested.filter((record) => record.action === "update").length,
    rejectedCount,
    rejectedWorks,
  };
}

/** Dedup by DOI, fallback OpenAlex ID; insert new or merge into existing. */
async function upsertPaper(
  n: NormalizedPaper,
): Promise<{ action: "insert" | "update"; paper: PaperHydrated }> {
  const existing = await findExisting(n);

  if (!existing) {
    const created = await PaperModel.create({
      ...n,
      dataStatus: "active",
      paperStatus: OPENALEX_PAPER_STATUS,
    });
    return { action: "insert", paper: created };
  }

  // Older OpenAlex records were created before the explicit workflow status
  // existed, so Mongoose assigned the user-request default ("pending").
  // External corpus records must never enter the admin approval queue.
  if (existing.primaryProvider === "openalex" && !existing.requestedBy && existing.paperStatus === "pending") {
    existing.paperStatus = OPENALEX_PAPER_STATUS;
  }

  // Merge: only overwrite when the incoming value is clearly better.
  existing.citationCount = Math.max(existing.citationCount ?? 0, n.citationCount);
  if (n.fwci !== undefined && (existing.fwci === undefined || existing.fwci === null)) existing.fwci = n.fwci;
  if (n.citationNormalizedPercentile && !existing.citationNormalizedPercentile) {
    existing.set("citationNormalizedPercentile", n.citationNormalizedPercentile);
  }
  if (n.relatedWorksCount > (existing.relatedWorksCount ?? 0)) existing.relatedWorksCount = n.relatedWorksCount;
  if (n.abstractText && n.abstractText.length > (existing.abstractText?.length ?? 0)) {
    existing.abstractText = n.abstractText;
  }
  if (!existing.journalName && n.journalName) existing.journalName = n.journalName;
  if (!existing.openAccessUrl && n.openAccessUrl) existing.openAccessUrl = n.openAccessUrl;
  // Backfill identifiers/year the FIRST sync may have lacked. Without this, a paper
  // first seen with no DOI (later matched via openalexId) never gains one — so
  // `hasDoi` stays false forever and keeps qualityScore below the 0.7 AI gate.
  if (!existing.externalIds?.doi && n.externalIds.doi) existing.set("externalIds.doi", n.externalIds.doi);
  if (!existing.externalIds?.openalexId && n.externalIds.openalexId)
    existing.set("externalIds.openalexId", n.externalIds.openalexId);
  if ((!existing.publicationYear || existing.publicationYear === 0) && n.publicationYear)
    existing.publicationYear = n.publicationYear;
  // `.set()` so TypeScript accepts plain arrays into Mongoose DocumentArray paths.
  if (shouldReplaceTopics(existing.topics, n.topics)) existing.set("topics", n.topics);
  if (n.keywords.length > (existing.keywords?.length ?? 0)) existing.set("keywords", n.keywords);
  if ((n.referencedWorks?.length ?? 0) > 0 && (existing.referencedWorks?.length ?? 0) === 0) {
    existing.referencedWorks = n.referencedWorks;
  }
  if ((n.relatedWorks?.length ?? 0) > 0 && (existing.relatedWorks?.length ?? 0) === 0) {
    existing.relatedWorks = n.relatedWorks;
  }

  await existing.save();
  return { action: "update", paper: existing };
}

async function findExisting(n: NormalizedPaper): Promise<PaperHydrated | null> {
  if (n.externalIds.doi) {
    const byDoi = await PaperModel.findOne({ "externalIds.doi": n.externalIds.doi });
    if (byDoi) return byDoi;
  }
  if (n.externalIds.openalexId) {
    return PaperModel.findOne({ "externalIds.openalexId": n.externalIds.openalexId });
  }
  return null;
}

const QUALITY_FIELDS = 7;
/**
 * Minimum abstract length to count as a REAL abstract. OpenAlex often stores a
 * citation/front-matter line (~150-230 chars) in the abstract field for papers
 * with no true abstract (common for ACL/proceedings). A real abstract is almost
 * always far longer, so this floor filters out those stubs. Heuristic.
 */
const MIN_ABSTRACT_CHARS = 250;

/** Pure 7-field presence check → score + status. No I/O (caller flushes in bulk). */
export function computeQuality(paper: PaperHydrated): {
  checks: Record<string, boolean>;
  qualityScore: number;
  checkStatus: "pass" | "warn" | "fail";
} {
  const checks = {
    hasTitle: !!paper.title,
    hasAbstract: (paper.abstractText?.trim().length ?? 0) >= MIN_ABSTRACT_CHARS,
    hasDoi: !!paper.externalIds?.doi,
    hasJournal: !!paper.journalName,
    hasPublicationYear: !!paper.publicationYear,
    hasAuthors: (paper.authors?.length ?? 0) > 0,
    hasOpenAccessUrl: !!paper.openAccessUrl,
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const qualityScore = passed / QUALITY_FIELDS;
  const checkStatus = qualityScore >= 0.7 ? "pass" : qualityScore >= 0.4 ? "warn" : "fail";
  return { checks, qualityScore, checkStatus };
}
