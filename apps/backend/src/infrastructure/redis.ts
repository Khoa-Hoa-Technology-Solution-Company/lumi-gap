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
  // With RATE_LIMIT_STORE=redis the limiter store sends commands at import time, which already
  // starts the lazy connection; calling connect() again would throw "already connecting".
  if (redis.status === "wait") await redis.connect();
  else if (redis.status !== "ready") {
    // Already connecting: wait for ready, but fail on error/end instead of hanging while ioredis keeps retrying.
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        redis.off("ready", onReady);
        redis.off("error", onFail);
        redis.off("end", onEnd);
      };
      const onReady = () => { cleanup(); resolve(); };
      const onFail = (err: Error) => { cleanup(); reject(err); };
      const onEnd = () => onFail(new Error("Redis connection ended before it was ready"));
      redis.once("ready", onReady);
      redis.once("error", onFail);
      redis.once("end", onEnd);
    });
  }
  logger.info("redis connected");
}

export async function disconnectRedis(): Promise<void> {
  // QUIT on a client that never connected (lazyConnect) would wait for a connection; just drop it.
  if (redis.status === "ready") await redis.quit();
  else redis.disconnect();
  logger.info("redis disconnected");
}
