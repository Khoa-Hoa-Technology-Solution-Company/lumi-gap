/**
 * Run the FULL RAG report pipeline once, directly (no HTTP server, no worker,
 * no auth) — embed query → vector search → Gemini generate → persist. Prints the
 * resulting markdown. The fastest way to verify reports end-to-end.
 *
 * Run: pnpm --filter backend exec tsx scripts/run-report-once.ts "your question" [deep]
 */
import mongoose from "mongoose";
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { ReportModel } from "../src/modules/reports/models/report.model.js";
import { runRagPipeline } from "../src/modules/reports/rag.service.js";

async function main(): Promise<void> {
  const query = process.argv[2] ?? "trends in large language models for education";
  const deep = process.argv[3] === "deep";
  // eslint-disable-next-line no-console
  const log = console.log;

  await connectMongo();
  try {
    const report = await ReportModel.create({
      userId: new mongoose.Types.ObjectId(), // standalone test user
      query,
      topic: query,
      fast: !deep,
      deepAnalysis: deep,
      status: "queued",
    });
    log(`Report ${String(report._id)} created (mode=${deep ? "deep" : "fast"}). Running pipeline...`);

    const t0 = Date.now();
    try {
      await runRagPipeline({ reportId: String(report._id) });
    } catch (err) {
      log(`\n⚠️ Pipeline threw: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`);
    }
    const ms = ((Date.now() - t0) / 1000).toFixed(1);

    const done = await ReportModel.findById(report._id).lean();
    log(`\nStatus: ${done?.status}   (${ms}s)`);
    if (done?.status === "ready") {
      log(`Grounded on ${done.groundingPaperIds?.length ?? 0} papers · ${done.researchGaps?.length ?? 0} gaps`);
      log("\n===================== REPORT MARKDOWN =====================\n");
      log(done.markdown ?? "(empty)");
    } else {
      log(`Error: ${done?.errorMessage ?? "(none)"}`);
    }
  } finally {
    await disconnectMongo();
  }
  process.exit(0);
}

void main();
