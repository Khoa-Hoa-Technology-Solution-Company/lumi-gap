import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { connectMongo, disconnectMongo } from "./infrastructure/db.js";
import { connectRedis, disconnectRedis } from "./infrastructure/redis.js";
import { logger } from "./infrastructure/logger.js";

function printReadyBanner(port: number) {
  const url = `http://localhost:${port}`;
  // Pretty banner so the URL is obvious in the terminal. Printed to stderr-
  // adjacent stdout intentionally — Pino logs go through pino-pretty above,
  // this banner is a one-time human-facing readiness signal.
  const lines = [
    "",
    "  ┌──────────────────────────────────────────────────────────┐",
    "  │  🚀  Backend ready                                       │",
    `  │                                                          │`,
    `  │     Local:    ${url.padEnd(43)}│`,
    `  │     Health:   ${url}/health${" ".repeat(43 - (url + "/health").length)}│`,
    `  │     API:      ${url}/api/v1${" ".repeat(43 - (url + "/api/v1").length)}│`,
    `  │                                                          │`,
    `  │     Env:      ${env.NODE_ENV.padEnd(43)}│`,
    "  └──────────────────────────────────────────────────────────┘",
    "",
  ];
  for (const line of lines) console.log(line);
}

async function main() {
  await connectMongo();
  await connectRedis();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "backend listening");
    printReadyBanner(env.PORT);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close();
    await disconnectMongo();
    await disconnectRedis();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "failed to start backend");
  process.exit(1);
});
