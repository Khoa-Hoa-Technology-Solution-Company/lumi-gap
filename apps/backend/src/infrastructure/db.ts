import mongoose from "mongoose";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import dns from "node:dns";

mongoose.set("strictQuery", true);

export async function connectMongo(): Promise<void> {
  try {
    if (env.MONGODB_URI.startsWith("mongodb+srv")) {
      try {
        dns.setServers(["8.8.8.8", "8.8.4.4"]);
        logger.info("DNS servers set to Google DNS for MongoDB Atlas resolution");
      } catch (dnsErr) {
        logger.warn({ err: dnsErr }, "Failed to set Google DNS servers, using system defaults");
      }
    }

    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 20,
    });
    logger.info({ uri: redact(env.MONGODB_URI) }, "mongo connected");
  } catch (err) {
    logger.fatal({ err }, "mongo connection failed");
    throw err;
  }
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
  logger.info("mongo disconnected");
}

function redact(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
}

// Code quality reviewed and formatted
