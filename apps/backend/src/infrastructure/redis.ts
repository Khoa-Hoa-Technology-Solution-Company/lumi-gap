import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Shared Redis client for caching. BullMQ creates its own connections internally
 * because it requires `maxRetriesPerRequest: null`, which would break normal
 * command behaviour if shared.
 */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on("error", (err) => logger.error({ err }, "redis error"));

export async function connectRedis(): Promise<void> {
  await redis.connect();
  logger.info("redis connected");
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  logger.info("redis disconnected");
}
