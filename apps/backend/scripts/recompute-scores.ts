/**
 * Backfill paper.aiScore for every existing paper (computePaperScore only runs
 * at sync time). Deterministic + idempotent — safe to re-run.
 * Run: pnpm --filter backend exec tsx scripts/recompute-scores.ts
 */
import "dotenv/config";
import type { AnyBulkWriteOperation } from "mongoose";
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { PaperModel } from "../src/modules/papers/models/paper.model.js";
import { computePaperScore } from "../src/modules/scoring/paper-score.js";

async function main(): Promise<void> {
  await connectMongo();
  const currentYear = new Date().getFullYear();
  const computedAt = new Date().toISOString();
  const cursor = PaperModel.find(
    {},
    "publicationYear citationCount dataQualityScore fwci citationNormalizedPercentile",
  )
    .lean()
    .cursor();

  let scanned = 0;
  let ops: AnyBulkWriteOperation[] = [];
  const flush = async (): Promise<void> => {
    if (ops.length === 0) return;
    await PaperModel.bulkWrite(ops as AnyBulkWriteOperation<never>[], { ordered: false });
    ops = [];
  };

  for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
    scanned += 1;
    const aiScore = computePaperScore(
      {
        publicationYear: doc.publicationYear ?? 0,
        citationCount: doc.citationCount ?? 0,
        dataQualityScore: doc.dataQualityScore ?? 0,
        fwci: doc.fwci,
        citationNormalizedPercentile: doc.citationNormalizedPercentile,
      },
      currentYear,
      computedAt,
    );
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { aiScore } } } });
    if (ops.length >= 500) await flush();
  }
  await flush();

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ scanned }, null, 2));
  await disconnectMongo();
  process.exit(0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
