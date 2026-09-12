import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

/** Validate `req.body`, `req.query`, or `req.params` and replace with parsed value. */
export function validate<T>(
  schema: ZodSchema<T>,
  source: "body" | "query" | "params" = "body",
) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }
    Object.defineProperty(req, source, {
      value: parsed.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}
