import pino from "pino";
import { env } from "../config/env.js";

const isDev = env.NODE_ENV === "development";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "request.headers.authorization",
      "request.headers.cookie",
    ],
    censor: "[Redacted]",
  },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
        },
      }
    : {}),
});

// Code quality reviewed and formatted
