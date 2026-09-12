/**
 * Free Atlas storage by purging paper_source_records — the heavy `rawMetadata`
 * provenance log that nothing reads. This is what fills an M0 (512 MB) cluster
 * when sync is run repeatedly. DELETE operations are allowed even when the cluster
 * is over its storage quota, so this unblocks a "writes blocked" cluster.
 *
 * Run:
 *   pnpm --filter backend db:purge-sources         # dry run — just counts
 *   pnpm --filter backend db:purge-sources --yes    # actually delete
 *
 * Safe: research_papers, embeddings, reports, gaps are untouched — AI features
 * do not use source records.
 */
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { PaperSourceRecordModel } from "../src/modules/papers/models/paper-source-record.model.js";

async function main(): Promise<void> {
  const confirmed = process.argv.includes("--yes");
  await connectMongo();
  try {
    const count = await PaperSourceRecordModel.estimatedDocumentCount();
    if (!confirmed) {
      // eslint-disable-next-line no-console
      console.log(
        `paper_source_records: ${count} documents.\n` +
          "Dry run — nothing deleted. To free the space, re-run with --yes:\n" +
          "  pnpm --filter backend db:purge-sources --yes",
      );
      return;
    }
    const res = await PaperSourceRecordModel.deleteMany({});
    // eslint-disable-next-line no-console
    console.log(`✅ Deleted ${res.deletedCount} source records. Atlas storage frees within a minute.`);
  } finally {
    await disconnectMongo();
  }
}

void main();
