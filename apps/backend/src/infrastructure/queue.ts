import { Queue, type QueueOptions } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";

/**
 * BullMQ requires `maxRetriesPerRequest: null` and `enableReadyCheck: false`
 * on its Redis connections, so we create dedicated connections rather than
 * sharing the cache Redis client.
 */
function makeConnection() {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

const defaultJobOptions: QueueOptions["defaultJobOptions"] = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export const QUEUE_NAMES = {
  apiSync: "api-sync",
  openAlexIngest: "openalex-ingest",
  corpusValidation: "corpus-validation",
  embedding: "embedding",
  paperAnalysis: "paper-analysis",
  report: "report",
  gaps: "gaps", // Phase D
  notifications: "notifications",
} as const;

export const apiSyncQueue = new Queue(QUEUE_NAMES.apiSync, {
  connection: makeConnection(),
  defaultJobOptions,
});

/** Million-scale campaign partitions. Kept separate from the legacy topic sync. */
export const openAlexIngestQueue = new Queue(QUEUE_NAMES.openAlexIngest, {
  connection: makeConnection(),
  defaultJobOptions,
});

export const corpusValidationQueue = new Queue(QUEUE_NAMES.corpusValidation, {
  connection: makeConnection(),
  defaultJobOptions: {
    ...defaultJobOptions,
    backoff: { type: "exponential", delay: 10_000 },
  },
});

export const embeddingQueue = new Queue(QUEUE_NAMES.embedding, {
  connection: makeConnection(),
  defaultJobOptions,
});

export const paperAnalysisQueue = new Queue(QUEUE_NAMES.paperAnalysis, {
  connection: makeConnection(),
  defaultJobOptions,
});

export const reportQueue = new Queue(QUEUE_NAMES.report, {
  connection: makeConnection(),
  defaultJobOptions,
});

export const gapsQueue = new Queue(QUEUE_NAMES.gaps, {
  connection: makeConnection(),
  defaultJobOptions,
});

export const notificationQueue = new Queue(QUEUE_NAMES.notifications, {
  connection: makeConnection(),
  defaultJobOptions,
});

export { makeConnection };
