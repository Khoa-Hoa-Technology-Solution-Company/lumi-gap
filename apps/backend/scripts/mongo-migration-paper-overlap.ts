/**
 * Read-only natural-key conflict check before copying old papers into a target
 * that already contains OpenAlex campaign canaries. Paper `_id` values are not
 * interchangeable because reports, projects and audits reference them.
 *
 * Run: pnpm --filter backend mongo:migration-paper-overlap
 */
import { env } from "../src/config/env.js";
import { closeMongoConnection, openMongoConnection } from "./lib/mongo-migration.js";

type PaperIdentity = {
  _id: { toString(): string };
  externalIds?: { doi?: string; openalexId?: string };
};

async function main(): Promise<void> {
  if (!env.MIGRATION_SOURCE_MONGODB_URI) {
    throw new Error("MIGRATION_SOURCE_MONGODB_URI is required locally");
  }

  let source: Awaited<ReturnType<typeof openMongoConnection>> | undefined;
  let target: Awaited<ReturnType<typeof openMongoConnection>> | undefined;
  try {
    [source, target] = await Promise.all([
      openMongoConnection(env.MIGRATION_SOURCE_MONGODB_URI, env.MIGRATION_SOURCE_DATABASE),
      openMongoConnection(env.MONGODB_URI),
    ]);
    if (!source.db || !target.db) throw new Error("Source or target Mongo connection has no database handle");

    const targetKeys = new Map<string, string>();
    const targetCursor = target.db.collection<PaperIdentity>("research_papers").find({}, { projection: { externalIds: 1 } });
    for await (const paper of targetCursor) {
      for (const key of identityKeys(paper)) targetKeys.set(key, paper._id.toString());
    }

    const conflicts: Array<{ sourcePaperId: string; targetPaperId: string; key: string }> = [];
    const sourceCursor = source.db.collection<PaperIdentity>("research_papers").find({}, { projection: { externalIds: 1 } });
    for await (const paper of sourceCursor) {
      for (const key of identityKeys(paper)) {
        const targetPaperId = targetKeys.get(key);
        if (targetPaperId && targetPaperId !== paper._id.toString()) {
          conflicts.push({ sourcePaperId: paper._id.toString(), targetPaperId, key });
          break;
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          sourceDatabase: source.db.databaseName,
          targetDatabase: target.db.databaseName,
          conflictCount: conflicts.length,
          targetCanaryPaperCount: new Set(targetKeys.values()).size,
          samples: conflicts.slice(0, 20),
          safeToCopyPapersWithoutReconciliation: conflicts.length === 0,
        },
        null,
        2,
      ),
    );
    if (conflicts.length > 0) process.exitCode = 2;
  } finally {
    await Promise.all([closeMongoConnection(source), closeMongoConnection(target)]);
  }
}

function identityKeys(paper: PaperIdentity): string[] {
  const doi = normalizeDoi(paper.externalIds?.doi);
  const openAlex = normalizeOpenAlexId(paper.externalIds?.openalexId);
  return [doi ? `doi:${doi}` : undefined, openAlex ? `openalex:${openAlex}` : undefined].filter(
    (value): value is string => Boolean(value),
  );
}

function normalizeDoi(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  return normalized || undefined;
}

function normalizeOpenAlexId(value: string | undefined): string | undefined {
  const normalized = value?.trim().split("/").filter(Boolean).at(-1)?.toUpperCase();
  return normalized || undefined;
}

void main().catch((error: unknown) => {
  console.error("Mongo migration paper overlap check failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
