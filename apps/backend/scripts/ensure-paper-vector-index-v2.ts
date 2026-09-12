/**
 * Creates and validates the filtered vector index used by million-scale search.
 * It never mutates or drops the legacy index, so rollout and rollback stay safe.
 */
import { closeMongoConnection, openMongoConnection } from "./lib/mongo-migration.js";
import { env } from "../src/config/env.js";
import {
  FILTERED_PAPER_VECTOR_INDEX,
  PAPER_VECTOR_FILTER_PATHS,
  paperVectorIndexDefinition,
} from "../src/modules/retrieval/paper-vector-index.js";

const READY_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 10_000;

type SearchIndex = {
  name?: string;
  status?: string;
  queryable?: boolean;
  latestDefinition?: {
    fields?: Array<{
      type?: string;
      path?: string;
      numDimensions?: number;
      similarity?: string;
    }>;
  };
};

type SearchIndexCollection = ReturnType<
  NonNullable<Awaited<ReturnType<typeof openMongoConnection>>["db"]>["collection"]
>;

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
        name: FILTERED_PAPER_VECTOR_INDEX,
        type: "vectorSearch",
        definition: paperVectorIndexDefinition(),
      });
      console.log(
        `Created ${FILTERED_PAPER_VECTOR_INDEX}; waiting for MongoDB Search to report READY.`,
      );
    } else {
      assertExpectedDefinition(current);
      console.log(`${FILTERED_PAPER_VECTOR_INDEX} already exists; waiting for READY.`);
    }

    const ready = await waitForReady(collection);
    console.log(
      JSON.stringify(
        {
          ready: true,
          name: ready.name ?? FILTERED_PAPER_VECTOR_INDEX,
          status: ready.status ?? null,
          queryable: ready.queryable ?? null,
          filterPaths: PAPER_VECTOR_FILTER_PATHS,
        },
        null,
        2,
      ),
    );
  } finally {
    await closeMongoConnection(connection);
  }
}

async function getIndex(collection: SearchIndexCollection): Promise<SearchIndex | undefined> {
  const indexes = (await collection
    .listSearchIndexes(FILTERED_PAPER_VECTOR_INDEX)
    .toArray()) as SearchIndex[];
  return indexes.find((index) => index.name === FILTERED_PAPER_VECTOR_INDEX);
}

async function waitForReady(collection: SearchIndexCollection): Promise<SearchIndex> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const index = await getIndex(collection);
    if (index) {
      assertExpectedDefinition(index);
      if (index.status === "READY" && index.queryable !== false) return index;
      if (index.status === "FAILED") {
        throw new Error(`${FILTERED_PAPER_VECTOR_INDEX} entered FAILED state`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(
    `${FILTERED_PAPER_VECTOR_INDEX} did not become READY within ${
      READY_TIMEOUT_MS / 60_000
    } minutes`,
  );
}

function assertExpectedDefinition(index: SearchIndex): void {
  const fields = index.latestDefinition?.fields ?? [];
  const vector = fields.find((field) => field.type === "vector" && field.path === "embedding");
  if (!vector || vector.numDimensions !== 768 || vector.similarity !== "cosine") {
    throw new Error(
      `${FILTERED_PAPER_VECTOR_INDEX} has an incompatible embedding definition`,
    );
  }

  const filterPaths = new Set(
    fields.filter((field) => field.type === "filter").map((field) => field.path),
  );
  const missing = PAPER_VECTOR_FILTER_PATHS.filter((path) => !filterPaths.has(path));
  if (missing.length > 0) {
    throw new Error(
      `${FILTERED_PAPER_VECTOR_INDEX} is missing filter fields: ${missing.join(", ")}`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error(
    "Mongo filtered vector index setup failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
