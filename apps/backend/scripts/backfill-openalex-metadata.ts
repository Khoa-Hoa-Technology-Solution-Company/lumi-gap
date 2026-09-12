/**
 * Backfill OpenAlex facts for papers already in the corpus.
 *
 * This does not create new papers. It fetches existing `externalIds.openalexId`
 * in batches and fills richer metadata used by Paper Detail:
 * fwci, relatedWorksCount, relatedWorks, and topic/subfield/field/domain.
 *
 * Run:
 *   pnpm --filter backend openalex:backfill-metadata
 *   pnpm --filter backend openalex:backfill-metadata 500
 */
import type { AnyBulkWriteOperation } from "mongoose";
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { logger } from "../src/infrastructure/logger.js";
import { fetchOpenAlexWorksByIds } from "../src/modules/api-sync/providers/openalex.client.js";
import { normalizeOpenAlexWork } from "../src/modules/api-sync/providers/openalex.normalizer.js";
import { shouldReplaceTopics } from "../src/modules/api-sync/topic-merge.js";
import { PaperModel } from "../src/modules/papers/models/paper.model.js";

const BATCH_SIZE = 50;
const SELECT_FIELDS = [
  "id",
  "fwci",
  "related_works",
  "primary_topic",
  "topics",
].join(",");

type PaperBackfillRow = {
  _id: unknown;
  externalIds?: { openalexId?: string | null };
  topics?: unknown[];
};

async function main() {
  await connectMongo();

  const limit = Number(process.argv[2] ?? 0);
  const query = {
    "externalIds.openalexId": { $exists: true, $ne: null },
    $or: [
      { fwci: { $exists: false } },
      { relatedWorksCount: { $exists: false } },
      { "topics.subfieldName": { $exists: false } },
      { "topics.fieldName": { $exists: false } },
      { "topics.domainName": { $exists: false } },
    ],
  };

  const total = await PaperModel.countDocuments(query);
  const target = limit > 0 ? Math.min(limit, total) : total;
  logger.info({ total, target, batchSize: BATCH_SIZE }, "openalex metadata backfill started");

  const cursor = PaperModel.find(query)
    .select("_id externalIds.openalexId topics")
    .limit(target)
    .lean<PaperBackfillRow[]>()
    .cursor();

  let batch: PaperBackfillRow[] = [];
  let scanned = 0;
  let updated = 0;
  let missingFromOpenAlex = 0;

  for await (const paper of cursor) {
    batch.push(paper);
    if (batch.length >= BATCH_SIZE) {
      const result = await backfillBatch(batch);
      scanned += batch.length;
      updated += result.updated;
      missingFromOpenAlex += result.missing;
      logger.info({ scanned, target, updated, missingFromOpenAlex }, "openalex metadata backfill progress");
      batch = [];
    }
  }

  if (batch.length > 0) {
    const result = await backfillBatch(batch);
    scanned += batch.length;
    updated += result.updated;
    missingFromOpenAlex += result.missing;
  }

  logger.info({ scanned, updated, missingFromOpenAlex }, "openalex metadata backfill finished");
  await disconnectMongo();
}

async function backfillBatch(batch: PaperBackfillRow[]) {
  const ids = batch
    .map((paper) => paper.externalIds?.openalexId)
    .filter((id): id is string => Boolean(id));
  const works = await fetchOpenAlexWorksByIds(ids, SELECT_FIELDS);
  const byId = new Map(works.map((work) => [stripOpenAlexId(work.id), work]));
  const ops: AnyBulkWriteOperation[] = [];
  let missing = 0;

  for (const paper of batch) {
    const openalexId = paper.externalIds?.openalexId;
    const work = openalexId ? byId.get(openalexId) : undefined;
    if (!work) {
      missing += 1;
      continue;
    }

    const normalized = normalizeOpenAlexWork(work);
    const set: Record<string, unknown> = {
      relatedWorksCount: normalized.relatedWorksCount,
    };

    if (normalized.fwci !== undefined) set.fwci = normalized.fwci;
    if (normalized.relatedWorks.length > 0) set.relatedWorks = normalized.relatedWorks;
    if (shouldReplaceTopics(paper.topics as never, normalized.topics)) {
      set.topics = normalized.topics;
    }

    ops.push({
      updateOne: {
        filter: { _id: paper._id },
        update: { $set: set },
      },
    });
  }

  if (ops.length === 0) return { updated: 0, missing };
  const result = await PaperModel.bulkWrite(ops, { ordered: false });
  return { updated: result.modifiedCount + result.upsertedCount, missing };
}

function stripOpenAlexId(value: string | null | undefined) {
  return (value ?? "").replace("https://openalex.org/", "");
}

main().catch(async (err) => {
  logger.fatal({ err }, "openalex metadata backfill failed");
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
