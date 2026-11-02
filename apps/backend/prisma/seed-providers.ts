import "../src/config/load-env.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPrisma, disconnectPostgres } from "../src/infrastructure/database/prisma.js";

/** Reference data the sync/ingest paths need in every environment: safe in production, never overwrites existing rows. */
export async function seedApiProviders() {
  const prisma = getPrisma();
  return prisma.apiProvider.upsert({
    where: { providerName: "openalex" },
    create: {
      providerName: "openalex",
      baseUrl: "https://api.openalex.org",
      providerKind: "academic-api",
      providerStatus: "enabled",
      rateLimitPerMin: 600,
    },
    update: {},
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedApiProviders()
    .then((provider) => console.log(`OpenAlex provider ready (${provider.id}).`))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(disconnectPostgres);
}
