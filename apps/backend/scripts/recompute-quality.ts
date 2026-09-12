/**
 * Backfill: re-apply the quality gate (incl. the "real abstract required" rule)
 * to EVERY existing paper, since computeQuality only runs at sync time.
 *
 * For each paper: recompute dataQualityScore / isAiAnalyzable / dataStatus.
 * A paper that is NO LONGER AI-analyzable also has its embedding $unset, so a
 * citation-stub paper that was embedded earlier stops surfacing in semantic
 * search. The next embedding run will re-embed only papers that truly qualify.
 *
 * This MUTATES the corpus (reclassifies papers) — run it consciously.
 * Run: pnpm --filter backend exec tsx scripts/recompute-quality.ts
 */
import "dotenv/config";
import type { AnyBulkWriteOperation } from "mongoose";
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { PaperModel, type PaperHydrated } from "../src/modules/papers/models/paper.model.js";
import { computeQuality } from "../src/modules/api-sync/sync.service.js";

async function main(): Promise<void> {
  await connectMongo();
  // embedding is select:false — we never load it (heavy); we only $unset it.
  const cursor = PaperModel.find(
    {},
    "title abstractText externalIds journalName publicationYear authors openAccessUrl isAiAnalyzable",
  )
    .lean()
    .cursor();

  let scanned = 0;
  let downgraded = 0; // was analyzable, now not (embedding cleared)
  let upgraded = 0; // was not analyzable, now is
  let ops: AnyBulkWriteOperation[] = [];

  const flush = async (): Promise<void> => {
    if (ops.length === 0) return;
    await PaperModel.bulkWrite(ops as AnyBulkWriteOperation<never>[], { ordered: false });
    ops = [];
  };

  for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
    scanned += 1;
    const { checks, qualityScore, checkStatus } = computeQuality(doc as unknown as PaperHydrated);
    const isAiAnalyzable = qualityScore >= 0.7 && checks.hasAbstract;
    const was = !!doc.isAiAnalyzable;
    if (was && !isAiAnalyzable) downgraded += 1;
    if (!was && isAiAnalyzable) upgraded += 1;

    const update: Record<string, unknown> = {
      $set: {
        dataQualityScore: qualityScore,
        isAiAnalyzable,
        dataStatus: checkStatus === "fail" ? "low-quality" : "active",
      },
    };
    // Drop the now-unjustified vector so $vectorSearch stops returning it.
    if (!isAiAnalyzable) update.$unset = { embedding: "" };

    ops.push({ updateOne: { filter: { _id: doc._id }, update } });
    if (ops.length >= 500) await flush();
  }
  await flush();

  const analyzableNow = await PaperModel.countDocuments({ isAiAnalyzable: true });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ scanned, downgraded, upgraded, analyzableNow }, null, 2));
  await disconnectMongo();
  process.exit(0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
