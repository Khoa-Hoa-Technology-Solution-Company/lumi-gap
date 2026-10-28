import { env } from "../../config/env.js";
import { cache, hashKey } from "../../infrastructure/cache.js";
import { logger } from "../../infrastructure/logger.js";

/**
 * Aggregate-only OpenAlex access for trend statistics. Every call uses
 * `group_by`, so OpenAlex counts on its side and returns a few rows whatever
 * the number of matching works (1 credit per request). No work records are
 * downloaded. Kept separate from the api-sync client on purpose: trend reads
 * must not change how sync and ingest call OpenAlex.
 */

const BASE_URL = "https://api.openalex.org";
const CACHE_TTL_SECONDS = 7 * 24 * 3600;
const CACHE_VERSION = "v2";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
/** Leave this many daily credits to sync and ingest, which share the key. */
const MIN_REMAINING_CREDITS = 1000;
/** OpenAlex allows 10 requests per second per client; stay just under it. */
const MIN_REQUEST_INTERVAL_MS = 110;

export interface OpenAlexGroup {
  /** Short id: "2024", "T10028", "large-language-models". */
  key: string;
  name: string;
  count: number;
}

export interface OpenAlexGroupPage {
  groups: OpenAlexGroup[];
  nextCursor: string | null;
}

export class OpenAlexBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAlexBudgetError";
  }
}

let budgetExhaustedUntil = 0;

export function isOpenAlexBudgetAvailable(): boolean {
  return Date.now() >= budgetExhaustedUntil;
}

/** One page of `group_by` counts, cached for a week. */
export async function openAlexGroupBy(filter: string, groupBy: string, cursor?: string): Promise<OpenAlexGroupPage> {
  const params: Record<string, string> = { filter, group_by: groupBy, per_page: "200" };
  if (cursor) params.cursor = cursor;
  const json = await openAlexGet<GroupByResponse>("works", params);
  return {
    groups: (json.group_by ?? []).map((group) => ({
      key: shortId(String(group.key)),
      name: String(group.key_display_name ?? group.key),
      count: Number(group.count) || 0,
    })),
    nextCursor: cursor ? json.meta?.next_cursor ?? null : null,
  };
}

/**
 * Cached GET on any OpenAlex endpoint, e.g. ("topics", { search: "nlp" }) or
 * ("topics/T10028", {}). Use only for small responses (entities, group_by).
 */
export async function openAlexGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const cacheKey = `trends:openalex:${CACHE_VERSION}:${hashKey({ path, params })}`;
  const cached = await cache.get<T>(cacheKey);
  if (cached) return cached;
  if (!isOpenAlexBudgetAvailable()) throw new OpenAlexBudgetError("OpenAlex daily budget reserved for sync");

  const url = new URL(`${BASE_URL}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (env.OPENALEX_MAILTO) url.searchParams.set("mailto", env.OPENALEX_MAILTO);
  if (env.OPENALEX_API_KEY) url.searchParams.set("api_key", env.OPENALEX_API_KEY);

  const json = (await fetchJson(url)) as T;
  await cache.set(cacheKey, json, CACHE_TTL_SECONDS);
  return json;
}

/** Counts per publication year for one filter, as a year → count map. */
export async function openAlexYearCounts(filter: string): Promise<Map<number, number>> {
  const page = await openAlexGroupBy(filter, "publication_year");
  return new Map(page.groups.map((group) => [Number(group.key), group.count]));
}

type GroupByResponse = {
  meta?: { next_cursor?: string | null };
  group_by?: Array<{ key: string; key_display_name?: string; count: number }>;
};

async function fetchJson(url: URL, attempt = 1): Promise<unknown> {
  try {
    await waitForRequestSlot();
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    // A 429 for going too fast also reports 0 remaining credits: only a
    // successful response says how much of the daily budget is left.
    if (res.ok) trackBudget(res.headers);
    if ((res.status === 429 || res.status >= 500) && attempt <= MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt);
      return fetchJson(url, attempt + 1);
    }
    if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err instanceof OpenAlexBudgetError || attempt > MAX_RETRIES) throw err;
    await sleep(1000 * attempt);
    return fetchJson(url, attempt + 1);
  }
}

let nextRequestAt = 0;

/** Spaces request starts by MIN_REQUEST_INTERVAL_MS across the process. */
async function waitForRequestSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextRequestAt);
  nextRequestAt = at + MIN_REQUEST_INTERVAL_MS;
  if (at > now) await sleep(at - now);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function trackBudget(headers: Headers): void {
  // A missing header (e.g. on a 401) is unknown, not 0 credits left.
  const remaining = numericHeader(headers, "x-ratelimit-remaining");
  const limit = numericHeader(headers, "x-ratelimit-limit");
  const resetSeconds = Number(headers.get("x-ratelimit-reset"));
  // Without an API key the daily limit is 1000 credits: reserve a fifth of it,
  // not the whole of it.
  const reserve = limit !== null ? Math.min(MIN_REMAINING_CREDITS, Math.floor(limit / 5)) : MIN_REMAINING_CREDITS;
  if (remaining !== null && remaining < reserve) {
    budgetExhaustedUntil = Date.now() + (Number.isFinite(resetSeconds) && resetSeconds > 0 ? resetSeconds * 1000 : 3600_000);
    logger.warn({ remaining, resetSeconds }, "openalex trend budget low; trends fall back to cache/local data");
  }
}

function numericHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Test hook: clears a budget lock set by trackBudget. */
export function resetOpenAlexBudget(): void {
  budgetExhaustedUntil = 0;
}

/** "https://openalex.org/T10028" → "T10028"; "https://openalex.org/fields/17" → "17". */
export function shortId(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.split("/").filter(Boolean).at(-1) ?? trimmed;
}
