import { z } from "zod";
import type { QualityErrorCode } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { LlmContentError, LlmQuotaError, LlmTruncationError, LlmUnavailableError } from "../llm/gemini.client.js";
import { QualityStructureError } from "./quality.assessment.js";

const MESSAGES: Record<QualityErrorCode, { status: number; message: string }> = {
  AI_EVALUATION_BUSY: { status: 503, message: "The AI provider is busy. Please try again in a few minutes." },
  AI_EVALUATION_INVALID_OUTPUT: { status: 502, message: "The AI model returned an unusable answer. Please try again or choose another model." },
  AI_EVALUATION_QUOTA: { status: 429, message: "The AI quota is exhausted. Try again after it resets or configure another AI connection." },
  AI_EVALUATION_UNAVAILABLE: { status: 503, message: "AI evaluation is temporarily unavailable. Please try again." },
};
const CODES = new Set(Object.keys(MESSAGES));

/** Clients translate the code (envelope `error.code`, task `errorCode`); the message is an English fallback. */
export function qualityError(code: QualityErrorCode, message = MESSAGES[code].message) {
  return new AppError(MESSAGES[code].status, code, message);
}
export function isQualityErrorCode(value: unknown): value is QualityErrorCode {
  return typeof value === "string" && CODES.has(value);
}

/** Shape failures (schema, missing criteria, non-JSON) earn exactly one repair attempt that bypasses the cache. */
export function isStructuralFailure(error: unknown) {
  return error instanceof QualityStructureError || error instanceof z.ZodError || error instanceof LlmContentError;
}

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const TRANSIENT_MESSAGE = /overloaded|high demand|unavailable|timed? ?out|timeout|try again later|rate limit|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed/i;
function providerStatus(error: unknown): number | undefined {
  const value = (error ?? {}) as { status?: unknown; statusCode?: unknown; code?: unknown };
  const status = typeof value.status === "number" ? value.status : typeof value.statusCode === "number" ? value.statusCode : Number(value.code);
  return Number.isInteger(status) ? status : undefined;
}
/** Provider overload, rate limiting, 5xx and network failures can recover with a later retry. */
export function isTransientProviderFailure(error: unknown) {
  if (error instanceof LlmUnavailableError) return true;
  if (error instanceof LlmQuotaError || error instanceof AppError) return false;
  const status = providerStatus(error);
  if (status !== undefined && TRANSIENT_STATUS.has(status)) return true;
  return TRANSIENT_MESSAGE.test(String((error as { message?: unknown })?.message ?? ""));
}

/** Short, secret-free description of the root cause for logs: Zod issues or provider status, never prompts or keys. */
export function describeFailure(error: unknown) {
  if (error instanceof z.ZodError) return { kind: "schema", issues: error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`) };
  const status = providerStatus(error);
  const name = (error as { name?: unknown })?.name;
  const message = String((error as { message?: unknown })?.message ?? error).replace(/(key|token|authorization)[=:]\s*\S+/gi, "$1=[redacted]").slice(0, 300);
  return { kind: typeof name === "string" ? name : "Error", ...(status !== undefined ? { status } : {}), message };
}

/** Map any failure of an evaluation to a coded AppError; existing AppErrors (404, 400, ...) pass through. */
export function toQualityError(error: unknown): AppError {
  if (error instanceof LlmQuotaError) return qualityError("AI_EVALUATION_QUOTA", error.message);
  if (error instanceof LlmUnavailableError) return qualityError("AI_EVALUATION_BUSY");
  if (error instanceof AppError) return error;
  if (isStructuralFailure(error) || error instanceof LlmTruncationError) return qualityError("AI_EVALUATION_INVALID_OUTPUT");
  if (isTransientProviderFailure(error)) return qualityError("AI_EVALUATION_BUSY");
  return qualityError("AI_EVALUATION_UNAVAILABLE");
}
