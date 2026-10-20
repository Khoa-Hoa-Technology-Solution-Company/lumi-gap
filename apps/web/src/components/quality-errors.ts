import type { QualityErrorCode } from "@trend/shared-types";

const MESSAGES: Record<QualityErrorCode, string> = {
  AI_EVALUATION_BUSY: "The AI service is busy right now. Try again in a few minutes.",
  AI_EVALUATION_INVALID_OUTPUT: "The AI returned an answer that could not be used. Try evaluating again.",
  AI_EVALUATION_QUOTA: "The AI quota is used up. Try again later or check your AI connection.",
  AI_EVALUATION_UNAVAILABLE: "The AI evaluation is unavailable right now. Try again later.",
};

/** Translate a quality error code; unknown or missing codes fall back to the given text. */
export function qualityErrorMessage(code: string | undefined, fallback: string, t: (key: string) => string): string {
  return code && code in MESSAGES ? t(MESSAGES[code as QualityErrorCode]) : fallback;
}

/** Message for a failed HTTP call: translated `error.code`, else the server message, else the generic text. */
export function qualityRequestError(err: unknown, fallback: string, t: (key: string) => string): string {
  const error = (err as { response?: { data?: { error?: { code?: string; message?: string } } } }).response?.data?.error;
  return qualityErrorMessage(error?.code, error?.message || fallback, t);
}
