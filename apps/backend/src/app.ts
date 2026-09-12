import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import passport from "./modules/auth/passport.js";
import path from "path";

import { env } from "./config/env.js";
import { logger } from "./infrastructure/logger.js";
import { errorHandler, notFoundHandler } from "./common/middleware/error-handler.js";
import { apiRouter } from "./routes/index.js";
import { openapiSpec } from "./openapi.js";
import { getReadiness } from "./infrastructure/readiness.js";

export function isAllowedCorsOrigin(origin: string | undefined, allowedOrigins: string[], nodeEnv: string): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  if (nodeEnv !== "production") {
    try {
      const url = new URL(origin);
      return ["localhost", "127.0.0.1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
    } catch {
      return false;
    }
  }

  return false;
}

export function createApp(): Express {
  const app = express();
  const allowedCorsOrigins = env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);

  // Trust the first proxy (Render/Vercel/Nginx) so `req.ip` is the real client IP
  // from X-Forwarded-For — without this the rerank rate-limiter (keyed on req.ip)
  // sees every request as one upstream socket IP and its per-user throttle, which
  // guards Gemini quota, is useless.
  app.set("trust proxy", 1);

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, isAllowedCorsOrigin(origin, allowedCorsOrigins, env.NODE_ENV));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));
  app.use(passport.initialize());

  app.get("/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok", ts: new Date().toISOString() } });
  });

  app.get("/ready", async (_req, res) => {
    const readiness = await getReadiness();
    const data = { ...readiness, ts: new Date().toISOString() };
    if (readiness.status === "ready") {
      res.json({ success: true, data });
      return;
    }
    res.status(503).json({
      success: false,
      error: {
        code: "SERVICE_NOT_READY",
        message: "One or more required dependencies are unavailable",
        details: data,
      },
    });
  });

  // Interactive API docs (browsable + testable). Helmet's default CSP blocks
  // Swagger UI's inline assets, so disable CSP for this route only.
  app.use(
    "/api-docs",
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec as Record<string, unknown>, {
      customSiteTitle: "Publication Trend API",
    }),
  );

  app.use("/api/v1", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
