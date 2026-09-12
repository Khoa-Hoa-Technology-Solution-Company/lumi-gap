/**
 * Run one structured paper knowledge pass directly (no queue/worker).
 * Run: pnpm --filter backend paper-analysis:once
 */
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { logger } from "../src/infrastructure/logger.js";
import { runPaperAnalysis } from "../src/modules/papers/paper-analysis.service.js";

async function main() {
  await connectMongo();
  const result = await runPaperAnalysis({});
  logger.info(result, "paper-analysis:once finished");
  await disconnectMongo();
  process.exit(0);
}

main().catch((err) => {
  logger.fatal({ err }, "paper-analysis:once failed");
  process.exit(1);
});
