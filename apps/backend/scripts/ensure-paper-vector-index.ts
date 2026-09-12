/**
 * Creates the application's MongoDB Vector Search index when it is absent.
 * The command is idempotent: it never replaces an existing index definition.
 *
 * Run: pnpm --filter backend mongo:ensure-paper-vector-index
 */
import { closeMongoConnection, openMongoConnection } from "./lib/mongo-migration.js";
import { env } from "../src/config/env.js";
import { VECTOR_INDEX } from "../src/modules/retrieval/retriever.js";

const READY_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 5_000;

type SearchIndex = {
  name?: string;
  status?: string;
  queryable?: boolean;
  latestDefinition?: {
    fields?: Array<{ type?: string; path?: string; numDimensions?: number; similarity?: string }>;
  };
};

async function main(): Promise<void> {
  let connection: Awaited<ReturnType<typeof openMongoConnection>> | undefined;

  try {
    connection = await openMongoConnection(env.MONGODB_URI);
    const db = connection.db;
    if (!db) throw new Error("Mongo connection has no database handle");
    const collection = db.collection("research_papers");
    const current = await getIndex(collection);

    if (!current) {
      await collection.createSearchIndex({
        name: VECTOR_INDEX,
        type: "vectorSearch",
        definition: {
          fields: [
            { type: "vector", path: "embedding", numDimensions: 768, similarity: "cosine" },
            { type: "filter", path: "dataStatus" },
            { type: "filter", path: "publicationYear" },
          ],
        },
      });
      console.log(`Created ${VECTOR_INDEX}; waiting for MongoDB Search to report READY.`);
    } else {
      assertExpectedDefinition(current);
      console.log(`${VECTOR_INDEX} already exists; waiting for READY.`);
    }

    const ready = await waitForReady(collection);
    console.log(
      JSON.stringify(
        {
          ready: true,
          name: ready.name ?? VECTOR_INDEX,
          status: ready.status ?? null,
          queryable: ready.queryable ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    await closeMongoConnection(connection);
  }
}

async function getIndex(collection: ReturnType<NonNullable<Awaited<ReturnType<typeof openMongoConnection>>["db"]>["collection"]>): Promise<SearchIndex | undefined> {
  const indexes = (await collection.listSearchIndexes(VECTOR_INDEX).toArray()) as SearchIndex[];
  return indexes.find((index) => index.name === VECTOR_INDEX);
}

async function waitForReady(collection: ReturnType<NonNullable<Awaited<ReturnType<typeof openMongoConnection>>["db"]>["collection"]>): Promise<SearchIndex> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const index = await getIndex(collection);
    if (index) {
      assertExpectedDefinition(index);
      if (index.status === "READY" && index.queryable !== false) return index;
      if (index.status === "FAILED") throw new Error(`${VECTOR_INDEX} entered FAILED state`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${VECTOR_INDEX} did not become READY within ${READY_TIMEOUT_MS / 60_000} minutes`);
}

function assertExpectedDefinition(index: SearchIndex): void {
  const fields = index.latestDefinition?.fields ?? [];
  const vector = fields.find((field) => field.type === "vector" && field.path === "embedding");
  if (!vector || vector.numDimensions !== 768 || vector.similarity !== "cosine") {
    throw new Error(`${VECTOR_INDEX} exists but does not match embedding: 768 dimensions, cosine. Refusing to replace it automatically.`);
  }
  const filterPaths = new Set(fields.filter((field) => field.type === "filter").map((field) => field.path));
  const missingFilters = ["dataStatus", "publicationYear"].filter((path) => !filterPaths.has(path));
  if (missingFilters.length > 0) {
    throw new Error(`${VECTOR_INDEX} is missing required filter fields: ${missingFilters.join(", ")}. Refusing to replace it automatically.`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error: unknown) => {
  console.error("Mongo vector index setup failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
