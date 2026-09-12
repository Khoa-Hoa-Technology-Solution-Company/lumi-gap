/**
 * Backfill referenced_works for existing papers that have an openalexId but no
 * referencedWorks yet. Batches 50 ids/request (~300 requests for 15k papers),
 * resumable (skips filled papers). Run: pnpm --filter backend exec tsx scripts/backfill-references.ts
 */
import "dotenv/config";
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { PaperModel } from "../src/modules/papers/models/paper.model.js";
import { fetchWorksByIds } from "../src/modules/api-sync/providers/openalex.client.js";

const BATCH = 50;

async function main(): Promise<void> {
  await connectMongo();
  const docs = await PaperModel.find(
    {
      "externalIds.openalexId": { $exists: true, $ne: null },
      // Match both empty arrays AND papers synced before the field existed.
      $or: [{ referencedWorks: { $size: 0 } }, { referencedWorks: { $exists: false } }],
    },
    "externalIds.openalexId",
  )
    .lean()
    .exec();

  let updated = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const slice = docs.slice(i, i + BATCH);
    const byOpenalex = new Map(
      slice
        .map((d) => [(d.externalIds as { openalexId?: string })?.openalexId, d._id] as const)
        .filter((e): e is [string, typeof slice[number]["_id"]] => !!e[0]),
    );
    const ids = [...byOpenalex.keys()];
    const works = await fetchWorksByIds(ids);
    const ops = works
      .map((w) => {
        const _id = byOpenalex.get(w.id);
        if (!_id || w.referenced_works.length === 0) return null;
        return { updateOne: { filter: { _id }, update: { $set: { referencedWorks: w.referenced_works } } } };
      })
      .filter(Boolean);
    if (ops.length) {
      await PaperModel.bulkWrite(ops as never[], { ordered: false });
      updated += ops.length;
    }
    // eslint-disable-next-line no-console
    console.log(`batch ${i / BATCH + 1}: +${ops.length} (total ${updated})`);
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ candidates: docs.length, updated }, null, 2));
  await disconnectMongo();
  process.exit(0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
