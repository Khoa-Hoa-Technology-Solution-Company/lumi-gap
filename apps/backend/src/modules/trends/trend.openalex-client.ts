import { AsyncLocalStorage } from "node:async_hooks";
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
/**
 * Bump when the query logic changes or OpenAlex announces a data change.
 * v3 (2026-10-21): the cached value now carries `fetchedAt`, and OpenAlex
 * replaced its topic classifier "in October 2026" with no exact date given
 * (help.openalex.org/data/topics), so older entries may hold pre-change counts.
 */
export const OPENALEX_CACHE_VERSION = "v3";
/** Value of the `corpus` parameter sent to /works (OpenAlex default: core). */
export const OPENALEX_CORPUS = "core";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
/**
 * Share of the daily budget (`X-RateLimit-Limit`) left to sync and ingest,
 * which use the same key. Project convention. A fraction, not a fixed number of
 * credits: the keyless limit is 1 000 credits a day and a free key 10 000
 * (OpenAlex Authentication/Pricing docs, read 2026-10-21), so a fixed reserve
 * of 1 000 locked trends out after the first keyless request.
 */
export const BUDGET_RESERVE_FRACTION = 0.2;

if (env.NODE_ENV === "production" && !env.OPENALEX_API_KEY) {
  logger.warn(
    "OPENALEX_API_KEY is not set: trends share the keyless OpenAlex budget (1 000 credits a day per IP) and cannot page with cursors; counts will often fall back to the local corpus",
  );
}

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

/** A non-retryable HTTP answer. The message stays "OpenAlex <status>" because
 *  callers match on it (e.g. a 404 means "unknown topic"). */
export class OpenAlexHttpError extends Error {
  constructor(readonly status: number) {
    super(`OpenAlex ${status}`);
    this.name = "OpenAlexHttpError";
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
 * The cache keeps the time of the original request with the body, so a cached
 * answer still reports when OpenAlex produced it (see withOpenAlexProvenance).
 */
export async function openAlexGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const cleanPath = path.replace(/^\/+/, "");
  // `corpus` exists on /works only; sent explicitly so the scope is visible and
  // does not change if OpenAlex changes its default.
  const query = cleanPath === "works" ? { ...params, corpus: OPENALEX_CORPUS } : params;
  const cacheKey = `trends:openalex:${OPENALEX_CACHE_VERSION}:${hashKey({ path: cleanPath, params: query })}`;
  const cached = await cache.get<CachedResponse<T>>(cacheKey);
  if (cached) {
    recordFetchedAt(cached.fetchedAt);
    return cached.body;
  }
  if (!isOpenAlexBudgetAvailable()) throw new OpenAlexBudgetError("OpenAlex daily budget reserved for sync");

  // No mailto: OpenAlex ignores it since the polite pool was replaced by API keys.
  const url = new URL(`${BASE_URL}/${cleanPath}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const fetchedAt = new Date().toISOString();
  const body = (await fetchJson(url)).body as T;
  await cache.set<CachedResponse<T>>(cacheKey, { fetchedAt, body }, CACHE_TTL_SECONDS);
  recordFetchedAt(fetchedAt);
  return body;
}

type CachedResponse<T> = { fetchedAt: string; body: T };

/** Rate-limit headers of one OpenAlex answer (credits; null when absent). */
export interface OpenAlexRateLimitHeaders {
  limit: number | null;
  remaining: number | null;
  creditsUsed: number | null;
  resetSeconds: number | null;
}

export interface OpenAlexLiveResponse<T> {
  body: T;
  rateLimit: OpenAlexRateLimitHeaders;
  fetchedAt: string;
}

/**
 * Uncached GET for collection jobs (P2.1 trend snapshots): a snapshot must hold
 * what OpenAlex answered during the collection, not a week-old cached page.
 * Same 429 / budget-reserve handling as openAlexGet, plus the rate-limit
 * headers so the caller can account for real credits. `baseUrl` exists for the
 * mock server in tests.
 */
export async function openAlexGetLive<T>(path: string, params: Record<string, string>, options: { baseUrl?: string } = {}): Promise<OpenAlexLiveResponse<T>> {
  if (!isOpenAlexBudgetAvailable()) throw new OpenAlexBudgetError("OpenAlex daily budget reserved for sync");
  const cleanPath = path.replace(/^\/+/, "");
  const query = cleanPath === "works" ? { ...params, corpus: OPENALEX_CORPUS } : params;
  const url = new URL(`${options.baseUrl ?? BASE_URL}/${cleanPath}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const fetchedAt = new Date().toISOString();
  const { body, headers } = await fetchJson(url);
  return {
    body: body as T,
    fetchedAt,
    rateLimit: {
      limit: headerNumber(headers, "x-ratelimit-limit"),
      remaining: headerNumber(headers, "x-ratelimit-remaining"),
      creditsUsed: headerNumber(headers, "x-ratelimit-credits-used"),
      resetSeconds: headerNumber(headers, "x-ratelimit-reset"),
    },
  };
}

/** Today's usage of the key from `/rate-limit` (free, 0 credits), including
 *  what other processes sharing the key spent. Null when OpenAlex omits it. */
export async function openAlexRateLimitStatus(options: { baseUrl?: string } = {}): Promise<{ creditsLimit: number; creditsUsed: number; creditsRemaining: number; resetsAt: string | null } | null> {
  const url = new URL(`${options.baseUrl ?? BASE_URL}/rate-limit`);
  const { body } = await fetchJson(url);
  const r = (body as { rate_limit?: Record<string, unknown> } | null)?.rate_limit;
  const limit = Number(r?.credits_limit), used = Number(r?.credits_used), remaining = Number(r?.credits_remaining);
  if (!Number.isFinite(limit) || !Number.isFinite(used) || !Number.isFinite(remaining)) return null;
  return { creditsLimit: limit, creditsUsed: used, creditsRemaining: remaining, resetsAt: typeof r?.resets_at === "string" ? r.resets_at : null };
}

/** Clears the in-process budget lock. Tests only (the lock otherwise expires at the reset time). */
export function resetOpenAlexBudgetLockForTests(): void {
  budgetExhaustedUntil = 0;
}

// ---------------------------------------------------------------------------
// Provenance: what a response can truthfully say about its OpenAlex data.
// OpenAlex exposes no data or classifier version, so only observed facts are
// reported: when the counts were fetched, the cache version and the corpus.
// ---------------------------------------------------------------------------

const provenanceStore = new AsyncLocalStorage<{ oldestFetchedAt: string | null }>();

function recordFetchedAt(fetchedAt: string | undefined): void {
  const collector = provenanceStore.getStore();
  if (!collector || !fetchedAt) return;
  if (collector.oldestFetchedAt === null || fetchedAt < collector.oldestFetchedAt) collector.oldestFetchedAt = fetchedAt;
}

/** Runs fn and returns the oldest fetch time of every OpenAlex answer it used
 *  (null when it used none). */
export async function withOpenAlexProvenance<T>(fn: () => Promise<T>): Promise<{ result: T; fetchedAt: string | null }> {
  const collector = { oldestFetchedAt: null as string | null };
  const result = await provenanceStore.run(collector, fn);
  return { result, fetchedAt: collector.oldestFetchedAt };
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

async function fetchJson(url: URL, attempt = 1): Promise<{ body: unknown; headers: Headers }> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (env.OPENALEX_API_KEY) headers.Authorization = `Bearer ${env.OPENALEX_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers });
    trackBudget(res.headers);
    if (res.status === 429) {
      // 429 means either "too many requests per second" or "daily budget spent".
      // Retrying only helps the first; the second resets at midnight UTC.
      if (isDailyBudgetSpent(res.headers)) {
        lockUntilReset(res.headers, "openalex daily budget spent; trends fall back to cache/local data");
        throw new OpenAlexBudgetError("OpenAlex daily budget spent");
      }
      if (attempt <= MAX_RETRIES) {
        await wait(retryAfterMs(res.headers) ?? 1000 * attempt);
        return fetchJson(url, attempt + 1);
      }
    }
    if (res.status >= 500 && attempt <= MAX_RETRIES) {
      await wait(1000 * attempt);
      return fetchJson(url, attempt + 1);
    }
    if (!res.ok) throw new OpenAlexHttpError(res.status);
    return { body: await res.json(), headers: res.headers };
  } catch (err) {
    // Network errors and timeouts are retried; HTTP answers and budget stops are final.
    if (err instanceof OpenAlexBudgetError || err instanceof OpenAlexHttpError || attempt > MAX_RETRIES) throw err;
    await wait(1000 * attempt);
    return fetchJson(url, attempt + 1);
  }
}

function headerNumber(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Stop using OpenAlex for trends once less than BUDGET_RESERVE_FRACTION of
 *  today's budget is left. `X-RateLimit-Remaining` and `-Limit` are credits. */
function trackBudget(headers: Headers): void {
  const remaining = headerNumber(headers, "x-ratelimit-remaining");
  const limit = headerNumber(headers, "x-ratelimit-limit");
  if (remaining === null || limit === null || limit <= 0) return;
  if (remaining / limit < BUDGET_RESERVE_FRACTION) {
    lockUntilReset(headers, "openalex trend budget reserve reached; trends fall back to cache/local data");
  }
}

function isDailyBudgetSpent(headers: Headers): boolean {
  const remaining = headerNumber(headers, "x-ratelimit-remaining");
  return remaining !== null && remaining < 1;
}

function lockUntilReset(headers: Headers, message: string): void {
  const resetSeconds = headerNumber(headers, "x-ratelimit-reset");
  budgetExhaustedUntil = Date.now() + (resetSeconds !== null && resetSeconds > 0 ? resetSeconds * 1000 : 3600_000);
  logger.warn(
    { remaining: headers.get("x-ratelimit-remaining"), limit: headers.get("x-ratelimit-limit"), resetSeconds },
    message,
  );
}

function retryAfterMs(headers: Headers): number | null {
  const seconds = headerNumber(headers, "retry-after");
  return seconds !== null && seconds >= 0 ? Math.min(seconds, 10) * 1000 : null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** "https://openalex.org/T10028" → "T10028"; "https://openalex.org/fields/17" → "17". */
export function shortId(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.split("/").filter(Boolean).at(-1) ?? trimmed;
}
