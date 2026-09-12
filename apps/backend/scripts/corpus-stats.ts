/**
 * Print corpus health stats — how many papers exist, how many are actually
 * USABLE by semantic search / RAG / gaps (active + embedded), and the year /
 * status breakdown. Read-only. Reads apps/backend/.env for the Atlas connection.
 *
 * Run: pnpm --filter backend corpus:stats
 */
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { PaperModel } from "../src/modules/papers/models/paper.model.js";
import { ReportModel } from "../src/modules/reports/models/report.model.js";
import { ResearchGapModel } from "../src/modules/gaps/models/research-gap.model.js";
import { UserModel } from "../src/modules/auth/models/user.model.js";

async function main(): Promise<void> {
  await connectMongo();
  try {
    const [
      total,
      active,
      embedded,
      analyzable,
      searchable, // active AND embedded — the set vector search can actually return
      reports,
      gaps,
      users,
    ] = await Promise.all([
      PaperModel.countDocuments({}),
      PaperModel.countDocuments({ dataStatus: "active" }),
      PaperModel.countDocuments({ embedding: { $exists: true } }),
      PaperModel.countDocuments({ isAiAnalyzable: true }),
      PaperModel.countDocuments({ dataStatus: "active", embedding: { $exists: true } }),
      ReportModel.countDocuments({}),
      ResearchGapModel.countDocuments({}),
      UserModel.countDocuments({}),
    ]);

    const byStatus = await PaperModel.aggregate<{ _id: string; n: number }>([
      { $group: { _id: "$dataStatus", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]);

    const byYear = await PaperModel.aggregate<{ _id: number; n: number }>([
      { $match: { publicationYear: { $ne: null } } },
      { $group: { _id: "$publicationYear", n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    const pct = (n: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : "—");

    /* eslint-disable no-console */
    console.log("\n================  CORPUS STATS  ================");
    console.log(`Papers (total)        : ${total}`);
    console.log(`  active              : ${active} (${pct(active)})`);
    console.log(`  embedded            : ${embedded} (${pct(embedded)})`);
    console.log(`  isAiAnalyzable      : ${analyzable} (${pct(analyzable)})`);
    console.log(`  USABLE (active+emb) : ${searchable} (${pct(searchable)})  <- semantic search / RAG / gaps use THIS`);
    console.log("\nBy dataStatus:");
    for (const s of byStatus) console.log(`  ${String(s._id).padEnd(12)} ${s.n}`);
    console.log("\nBy publicationYear:");
    for (const y of byYear) console.log(`  ${y._id}  ${"█".repeat(Math.min(40, y.n))} ${y.n}`);
    console.log("\nOther collections:");
    console.log(`  AI reports          : ${reports}`);
    console.log(`  research gaps       : ${gaps}`);
    console.log(`  users               : ${users}`);
    if (searchable < total) {
      console.log(
        `\n⚠️  ${total - searchable} paper(s) are NOT usable by AI features (not active and/or not embedded).`,
      );
      console.log("   Run the embedding worker to embed pending papers: pnpm --filter backend worker:embedding");
    }
    console.log("===============================================\n");
    /* eslint-enable no-console */
  } finally {
    await disconnectMongo();
  }
}

void main();
