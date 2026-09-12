import { disconnectMongo, connectMongo } from "../src/infrastructure/db.js";
import { PaperModel } from "../src/modules/papers/models/paper.model.js";

const INDEX_NAME = "paper_search_text";

/**
 * Idempotently replace the legacy `language`-overridden text index. OpenAlex
 * language values are ISO codes while Mongo's override vocabulary is smaller;
 * the replacement always uses `textSearchLanguage: none` and preserves the
 * raw provider language in `language` for the API/UI.
 */
async function main(): Promise<void> {
  await connectMongo();
  try {
    const indexes = await PaperModel.collection.indexes();
    const textIndexes = indexes.filter((index) => index.key && "_fts" in index.key);
    const desired = textIndexes.find((index) => index.name === INDEX_NAME);

    if (!desired) {
      for (const index of textIndexes) {
        if (index.name) await PaperModel.collection.dropIndex(index.name);
      }
      await PaperModel.collection.createIndex(
        { title: "text", abstractText: "text" },
        {
          name: INDEX_NAME,
          default_language: "none",
          language_override: "textSearchLanguage",
          weights: { title: 10, abstractText: 2 },
        },
      );
      console.log(JSON.stringify({ changed: true, index: INDEX_NAME }));
      return;
    }

    const valid = desired.default_language === "none" && desired.language_override === "textSearchLanguage";
    if (valid) {
      console.log(JSON.stringify({ changed: false, index: INDEX_NAME }));
      return;
    }

    await PaperModel.collection.dropIndex(INDEX_NAME);
    await PaperModel.collection.createIndex(
      { title: "text", abstractText: "text" },
      {
        name: INDEX_NAME,
        default_language: "none",
        language_override: "textSearchLanguage",
        weights: { title: 10, abstractText: 2 },
      },
    );
    console.log(JSON.stringify({ changed: true, index: INDEX_NAME }));
  } finally {
    await disconnectMongo();
  }
}

void main().catch((error: unknown) => {
  console.error("Failed to ensure paper text index:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
