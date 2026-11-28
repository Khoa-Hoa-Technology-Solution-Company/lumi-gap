import { DEFAULT_COOLDOWN_MS, type ApiKeyFailure } from "./api-key-pool.js";

function text(error: unknown): string {
  return String(error instanceof Error ? error.message : (error as { message?: unknown } | null)?.message ?? error);
}

function retryDelayMs(message: string): number | undefined {
  const seconds = Number(/retry(?:delay| in)\W*(\d+(?:\.\d+)?)s/i.exec(message)?.[1] ?? 0);
  return seconds > 0 ? Math.ceil(seconds * 1000) : undefined;
}

/**
 * Whether a Gemini error means the key itself cannot serve the call, so another key should be tried:
 * - 400 API_KEY_INVALID, 401 or an expired key: INVALID (skipped until an admin tests or replaces it);
 * - 403 (billing, region, permission) and 429 for a daily or zero quota: COOLDOWN.
 * A per-minute 429 or a 5xx is not about the key and is left to the caller's own retry.
 */
export function classifyGeminiKeyError(error: unknown): ApiKeyFailure | null {
  const status = (error as { status?: unknown } | null)?.status;
  const message = text(error);
  const lower = message.toLowerCase();
  if (status === 401 || (status === 400 && /api_key_invalid|api key not valid|api key expired/.test(lower)) || /api key expired/.test(lower)) {
    return { kind: "INVALID", reason: `Gemini rejected the key (${status ?? "error"}): ${summary(message)}` };
  }
  if (status === 403) return { kind: "COOLDOWN", reason: `Gemini denied access (403): ${summary(message)}`, cooldownMs: DEFAULT_COOLDOWN_MS };
  if (status === 429) {
    const perMinute = /perminute|persecond/.test(lower) && !/perday|daily|permonth/.test(lower);
    const zeroOrDaily = /"quotavalue"\s*:\s*"0"|perday|daily|permonth/.test(lower);
    const quota = /quota exceeded|exceeded your current quota|free_tier_requests|resource_exhausted/.test(lower);
    if (!perMinute && (zeroOrDaily || quota)) {
      return { kind: "COOLDOWN", reason: `Gemini quota exhausted (429): ${summary(message)}`, cooldownMs: Math.max(DEFAULT_COOLDOWN_MS, retryDelayMs(message) ?? 0) };
    }
  }
  return null;
}

/**
 * OpenAlex: 401/403 means the api_key is wrong or revoked (INVALID). A 429 whose body mentions the daily budget means
 * the key is used up until the next UTC day (COOLDOWN). A 429 for requests that come too fast is not about the key.
 */
export function classifyOpenAlexKeyResponse(status: number, body: string): ApiKeyFailure | null {
  if (status === 401 || status === 403) return { kind: "INVALID", reason: `OpenAlex rejected the api_key (${status}): ${summary(body)}` };
  // The remaining-credits header also reads 0 on a too-fast 429, so only the body tells the daily budget apart.
  if (status === 429 && /daily|budget|credits/i.test(body)) {
    const now = new Date();
    const nextUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return { kind: "COOLDOWN", reason: `OpenAlex daily budget exhausted (429): ${summary(body)}`, cooldownMs: Math.max(60_000, nextUtcDay - now.getTime()) };
  }
  return null;
}

/** First line of a provider message, with the key parameter removed in case the provider echoes the URL. */
function summary(message: string): string {
  let short = message;
  try {
    const parsed = JSON.parse(message) as { error?: { message?: string } | string; message?: string };
    short = (typeof parsed.error === "object" ? parsed.error?.message : parsed.error) ?? parsed.message ?? message;
  } catch { /* not JSON */ }
  return short.replace(/(api_key|key)=[^&\s"]+/gi, "$1=***").split("\n")[0]!.slice(0, 300);
}
