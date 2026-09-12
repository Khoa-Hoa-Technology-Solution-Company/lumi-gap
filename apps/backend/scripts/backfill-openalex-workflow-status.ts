import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { PaperModel } from "../src/modules/papers/models/paper.model.js";

const filter = {
  primaryProvider: "openalex",
  paperStatus: "pending",
  $or: [{ requestedBy: { $exists: false } }, { requestedBy: null }],
};

async function main(): Promise<void> {
  await connectMongo();
  try {
    const result = await PaperModel.updateMany(filter, { $set: { paperStatus: "not-downloaded" } });
    console.log(JSON.stringify({ matched: result.matchedCount, modified: result.modifiedCount }));
  } finally {
    await disconnectMongo();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
