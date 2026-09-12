/**
 * Mongo connectivity smoke test: connects with MONGODB_URI from .env,
 * pings the server, prints per-collection document counts, disconnects.
 * Run: pnpm --filter backend test:mongo
 */
import mongoose from "mongoose";

import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { logger } from "../src/infrastructure/logger.js";

async function main() {
  await connectMongo();

  const db = mongoose.connection.db;
  if (!db) throw new Error("No db handle after connect");

  await db.admin().ping();
  logger.info({ db: db.databaseName }, "ping OK");

  const collections = await db.listCollections().toArray();
  for (const c of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    const count = await db.collection(c.name).countDocuments();
    logger.info({ collection: c.name, count }, "collection");
  }

  await disconnectMongo();
  logger.info("Mongo connectivity OK.");
  process.exit(0);
}

main().catch((err) => {
  logger.fatal({ err }, "test:mongo failed");
  process.exit(1);
});
