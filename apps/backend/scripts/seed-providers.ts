/**
 * Seed the api_providers collection. Idempotent (upsert by providerName).
 * Run: pnpm --filter backend seed:providers
 */
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { ApiProviderModel } from "../src/modules/api-sync/models/api-provider.model.js";
import { logger } from "../src/infrastructure/logger.js";

const providers = [
  {
    providerName: "openalex",
    baseUrl: "https://api.openalex.org",
    providerKind: "academic-api" as const,
    providerStatus: "active" as const,
    rateLimitPerMin: 600,
  },
  {
    providerName: "semanticscholar",
    baseUrl: "https://api.semanticscholar.org",
    providerKind: "academic-api" as const,
    providerStatus: "disabled" as const, // Phase B
    rateLimitPerMin: 100,
  },
  {
    providerName: "crossref",
    baseUrl: "https://api.crossref.org",
    providerKind: "academic-api" as const,
    providerStatus: "disabled" as const, // Phase B
    rateLimitPerMin: 50,
  },
  {
    providerName: "arxiv",
    baseUrl: "http://export.arxiv.org",
    providerKind: "academic-api" as const,
    providerStatus: "disabled" as const, // Phase D (optional)
    rateLimitPerMin: 20,
  },
];

async function main() {
  await connectMongo();
  for (const p of providers) {
    await ApiProviderModel.updateOne({ providerName: p.providerName }, { $set: p }, { upsert: true });
    logger.info({ provider: p.providerName, status: p.providerStatus }, "provider seeded");
  }
  await disconnectMongo();
  logger.info(`Seeded ${providers.length} providers.`);
  process.exit(0);
}

main().catch((err) => {
  logger.fatal({ err }, "seed:providers failed");
  process.exit(1);
});
