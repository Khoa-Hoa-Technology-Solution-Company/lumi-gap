import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../exceptions/app-error.js";
import { logger } from "../../infrastructure/logger.js";

function isMulterError(err: unknown): err is Error & { code: string } {
  return err instanceof Error && err.name === "MulterError" && "code" in err;
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (isMulterError(err)) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "PDF file is too large. Maximum size is 10MB."
        : `Invalid file upload: ${err.message}`;
    res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request payload",
        details: err.flatten(),
      },
    });
    return;
  }

  if (err instanceof AppError || (err && typeof err === "object" && "statusCode" in err && "code" in err)) {
    const errorObj = err as any;
    res.status(errorObj.statusCode).json({
      success: false,
      error: { code: errorObj.code, message: errorObj.message, details: errorObj.details },
    });
    return;
  }

  // Mongoose CastError = a malformed value reached a typed field, almost always a
  // non-ObjectId in a `:id` path param (e.g. GET /papers/not-an-id). That's a client
  // error → 400, not a 500. One guard here fixes every bad-id route at once.
  if (err instanceof Error && err.name === "CastError") {
    res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Invalid identifier in request" },
    });
    return;
  }

  logger.error({ err }, "unhandled error");
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL", message: "Internal server error" },
  });
}
