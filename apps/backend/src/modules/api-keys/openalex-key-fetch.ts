import { classifyOpenAlexKeyResponse } from "./api-key-errors.js";
import { currentApiKey, refreshApiKeys, reportApiKeyFailure, reportApiKeySuccess, type SelectedApiKey } from "./api-key-pool.js";

/** Puts the key calls should use now into `url` (or removes `api_key` when no key exists). */
export function applyOpenAlexKey(url: URL, key: SelectedApiKey | null = currentApiKey("OPENALEX")): void {
  if (key?.secret) url.searchParams.set("api_key", key.secret);
  else url.searchParams.delete("api_key");
}

/**
 * `fetch` for an OpenAlex URL that rotates the pooled api_key: when OpenAlex rejects the key (401/403) or its daily
 * budget is used up, the key is taken out of rotation and the request is repeated once per remaining key.
 * Any other response, including a per-second 429, is returned unchanged for the caller's own handling.
 */
export async function openAlexFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  await refreshApiKeys();
  const url = new URL(input);
  const tried = new Set<string>();
  for (;;) {
    const key = currentApiKey("OPENALEX");
    applyOpenAlexKey(url, key);
    const response = await fetch(url, init);
    if (!key?.secret) return response;
    if (response.ok) {
      reportApiKeySuccess(key);
      return response;
    }
    if (response.status !== 401 && response.status !== 403 && response.status !== 429) return response;
    const body = await response.clone().text().catch(() => "");
    const failure = classifyOpenAlexKeyResponse(response.status, body);
    if (!failure) return response;
    tried.add(key.id ?? "env");
    reportApiKeyFailure("OPENALEX", key, failure);
    const next = currentApiKey("OPENALEX");
    // No other usable key: return the provider's response so the caller reports it as before.
    if (!next?.secret || tried.has(next.id ?? "env")) return response;
  }
}
