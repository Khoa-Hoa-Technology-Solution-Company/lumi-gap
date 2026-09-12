import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";

interface LibreTranslateResponse {
  translatedText?: string;
  error?: string;
}

interface LibreTranslateLanguage {
  code?: unknown;
  targets?: unknown;
}

export const LIBRETRANSLATE_PROVIDER_VERSION = "libretranslate-v1";

const LANGUAGE_CACHE_TTL_MS = 5 * 60 * 1000;
let languageCache: { languages: string[]; expiresAt: number } | undefined;

/** Returns the languages actually installed by the configured LibreTranslate instance. */
export async function getSupportedLanguages(): Promise<string[]> {
  if (languageCache && languageCache.expiresAt > Date.now()) return languageCache.languages;

  const response = await fetch(`${env.LIBRETRANSLATE_URL.replace(/\/$/, "")}/languages`, {
    signal: AbortSignal.timeout(env.TRANSLATION_TIMEOUT_MS),
  }).catch((error: unknown) => {
    throw AppError.serviceUnavailable(
      error instanceof Error && error.name === "TimeoutError"
        ? "Translation language catalogue timed out."
        : "Translation service is unavailable.",
    );
  });

  const payload = (await response.json().catch(() => [])) as unknown;
  if (!response.ok || !Array.isArray(payload)) {
    throw AppError.serviceUnavailable("Translation language catalogue is unavailable.");
  }

  const languages = new Set<string>();
  for (const item of payload as LibreTranslateLanguage[]) {
    if (Array.isArray(item.targets)) {
      for (const target of item.targets) {
        if (typeof target === "string" && /^[a-z]{2,3}(?:-[a-z]{4}|-[a-z]{2}|-[0-9]{3})?$/i.test(target)) {
          languages.add(target.toLowerCase());
        }
      }
    }
  }

  const result = [...languages].sort((a, b) => a.localeCompare(b));
  if (result.length === 0) throw AppError.serviceUnavailable("No translation languages are installed.");
  languageCache = { languages: result, expiresAt: Date.now() + LANGUAGE_CACHE_TTL_MS };
  return result;
}

export async function translateText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string> {
  if (!text.trim()) return "";

  const response = await fetch(`${env.LIBRETRANSLATE_URL.replace(/\/$/, "")}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: sourceLanguage === "und" ? "auto" : sourceLanguage,
      target: targetLanguage,
      format: "text",
      ...(env.LIBRETRANSLATE_API_KEY ? { api_key: env.LIBRETRANSLATE_API_KEY } : {}),
    }),
    signal: AbortSignal.timeout(env.TRANSLATION_TIMEOUT_MS),
  }).catch((error: unknown) => {
    throw AppError.serviceUnavailable(
      error instanceof Error && error.name === "TimeoutError"
        ? "Translation timed out. Please try again."
        : "Translation service is unavailable.",
    );
  });

  const payload = (await response.json().catch(() => ({}))) as LibreTranslateResponse;
  if (!response.ok || typeof payload.translatedText !== "string") {
    throw AppError.serviceUnavailable(payload.error || "Translation service could not translate this paper.");
  }
  return payload.translatedText.trim();
}
