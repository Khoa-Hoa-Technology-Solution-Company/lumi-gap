import os from "node:os";
import type { PipelineQueueName } from "../modules/pipeline/pipeline.service.js";
import { redis } from "./redis.js";
import { logger } from "./logger.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TTL_SECONDS = 180;

const WORKER_KEYS = [
  "worker:report",
  "worker:gaps",
  "worker:embedding",
  "worker:paper-analysis",
  "worker:notifications",
  "worker:sync",
  "worker:openalex-ingest",
  "worker:corpus-validation",
] as const;

export type WorkerName = (typeof WORKER_KEYS)[number];

export interface WorkerHeartbeatRecord {
  workerName: WorkerName;
  queueName: PipelineQueueName;
  hostname: string;
  pid: number;
  startedAt: string;
  lastSeenAt: string;
}

export function startWorkerHeartbeat(input: {
  workerName: WorkerName;
  queueName: PipelineQueueName;
}): () => Promise<void> {
  const startedAt = new Date().toISOString();
  const write = async () => {
    const heartbeat: WorkerHeartbeatRecord = {
      workerName: input.workerName,
      queueName: input.queueName,
      hostname: os.hostname(),
      pid: process.pid,
      startedAt,
      lastSeenAt: new Date().toISOString(),
    };
    try {
      await redis.set(heartbeatKey(input.workerName), JSON.stringify(heartbeat), "EX", HEARTBEAT_TTL_SECONDS);
    } catch (err) {
      logger.warn({ err, workerName: input.workerName }, "worker heartbeat write failed");
    }
  };

  void write();
  const timer = setInterval(() => void write(), HEARTBEAT_INTERVAL_MS);

  return async () => {
    clearInterval(timer);
    try {
      await redis.del(heartbeatKey(input.workerName));
    } catch (err) {
      logger.warn({ err, workerName: input.workerName }, "worker heartbeat cleanup failed");
    }
  };
}

export async function readWorkerHeartbeats(): Promise<WorkerHeartbeatRecord[]> {
  const values = await redis.mget(WORKER_KEYS.map(heartbeatKey));
  return values.flatMap((value) => {
    if (!value) return [];
    try {
      return [JSON.parse(value) as WorkerHeartbeatRecord];
    } catch {
      return [];
    }
  });
}

function heartbeatKey(workerName: WorkerName): string {
  return `worker-heartbeat:${workerName}`;
}
