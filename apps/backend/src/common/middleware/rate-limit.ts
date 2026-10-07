import { rateLimit, type Options } from "express-rate-limit";
import type { RequestHandler } from "express";
import { RedisStore } from "rate-limit-redis";
import { env } from "../../config/env.js";
import { redis } from "../../infrastructure/redis.js";

/**
 * Build an express-rate-limit middleware. Every limiter in the backend goes through here so the
 * counter store is chosen in one place (RATE_LIMIT_STORE).
 *
 * `name` must be unique per limiter: it prefixes the Redis keys so counters never mix.
 * A failing store lets the request through instead of returning a 500.
 */
export function createRateLimiter(name: string, options: Partial<Options>): RequestHandler {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    ...(env.RATE_LIMIT_STORE === "redis" ? { store: createRedisStore(name) } : {}),
    ...options,
  });
}

function createRedisStore(name: string): RedisStore {
  const store = new RedisStore({
    prefix: `rl:${name}:`,
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<number | string | (number | string)[]>,
  });
  // The constructor runs SCRIPT LOAD at once and nobody awaits those promises, so a Redis outage at
  // boot would be an unhandled rejection that kills the process. Real errors still surface: the
  // store reloads the script on use, and a failing increment is let through by passOnStoreError.
  store.incrementScriptSha.catch(() => undefined);
  store.getScriptSha.catch(() => undefined);
  return store;
}
