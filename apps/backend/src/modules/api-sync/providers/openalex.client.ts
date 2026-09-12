import { env } from "../../../config/env.js";
import { logger } from "../../../infrastructure/logger.js";
import type { OpenAlexGroupPage, OpenAlexPage, OpenAlexWork } from "./openalex.types.js";

const BASE_URL = "https://api.openalex.org/works";
const RATE_LIMIT_DELAY_MS = 100; // ≤ 10 req/s — OpenAlex polite pool
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
export const OPENALEX_MAX_PER_PAGE = 100;
const OPENALEX_MAX_GROUPS_PER_PAGE = 200;

export interface FetchPageParams {
  /** Legacy topic sync search. Omit for a planned scale-ingest partition. */
  searchText?: string;
  /** Legacy topic sync lower publication-year bound. */
  yearFrom?: number;
  /** Exact, planner-recorded OpenAlex filter for a scale-ingest partition. */
  filterExpression?: string;
  /** "*" for the first page; thereafter use the previous page's nextCursor. */
  cursor?: string;
  /** Reproducible random selection for a planner-approved bounded stratum. */
  sample?: number;
  /** OpenAlex sample seed. Required whenever sample is supplied. */
  seed?: number;
  perPage?: number;
}

export interface FetchGroupCountsParams {
  filterExpression?: string;
  groupBy: OpenAlexGroupBy;
}

export type OpenAlexGroupBy =
  | "primary_topic.domain.id"
  | "primary_topic.field.id"
  | "primary_topic.subfield.id"
  | "primary_topic.id"
  | "publication_year";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Fetch one page of OpenAlex works. Cursor pagination, polite-pool rate
 * limiting (100ms between calls), and exponential-backoff retry on 5xx/429.
 */
export async function fetchOpenAlexPage(params: FetchPageParams): Promise<{
  results: OpenAlexPage["results"];
  nextCursor: string | null;
  total: number;
}> {
  const json = await fetchWithRetry(buildOpenAlexPageUrl(params).toString());
  return {
    results: json.results ?? [],
    nextCursor: json.meta?.next_cursor ?? null,
    total: json.meta?.count ?? 0,
  };
}

/**
 * Read an OpenAlex aggregation snapshot for campaign planning. This is kept
 * separate from paging so a planner never mistakes a sampled page for source
 * population.
 */
export async function fetchOpenAlexGroupCounts(params: FetchGroupCountsParams): Promise<{
  total: number;
  groups: Array<{ key: string; displayName?: string; count: number }>;
}> {
  const url = new URL(BASE_URL);
  if (params.filterExpression) url.searchParams.set("filter", params.filterExpression);
  url.searchParams.set("group_by", params.groupBy);
  // Grouped responses are capped independently from list-work pages. OpenAlex
  // permits up to 200 group buckets, which keeps annual campaign planning from
  // silently dropping older year buckets.
  url.searchParams.set("per_page", String(OPENALEX_MAX_GROUPS_PER_PAGE));
  appendOpenAlexIdentity(url);
  const json = (await fetchWithRetry(url.toString())) as unknown as OpenAlexGroupPage;
  return {
    total: json.meta?.count ?? 0,
    groups: (json.group_by ?? []).map((group) => ({
      key: group.key,
      displayName: group.key_display_name,
      count: group.count,
    })),
  };
}

/**
 * Builds the documented OpenAlex list request. Exported so a contract test can
 * catch accidental reintroduction of the legacy `per-page` parameter or a page
 * size above the provider limit before a large ingest campaign starts.
 */
export function buildOpenAlexPageUrl(params: FetchPageParams): URL {
  const url = new URL(BASE_URL);
  const perPage = Math.min(Math.max(1, params.perPage ?? env.SYNC_BATCH_SIZE), OPENALEX_MAX_PER_PAGE);
  if (params.searchText) url.searchParams.set("search", params.searchText);
  const filterExpression = params.filterExpression ??
    (params.yearFrom ? `from_publication_date:${params.yearFrom}-01-01` : undefined);
  if (filterExpression) url.searchParams.set("filter", filterExpression);
  url.searchParams.set("per_page", String(perPage));
  if (params.sample !== undefined) {
    if (!Number.isInteger(params.sample) || params.sample < 1 || params.sample > 10_000) {
      throw new Error("OpenAlex sample must be an integer between 1 and 10000");
    }
    if (!Number.isInteger(params.seed)) throw new Error("OpenAlex sample requests require an integer seed");
    url.searchParams.set("sample", String(params.sample));
    url.searchParams.set("seed", String(params.seed));
  }
  if (params.cursor) {
    url.searchParams.set("cursor", params.cursor);
  } else if (params.sample === undefined) {
    throw new Error("OpenAlex cursor is required unless using a seeded sample");
  }
  appendOpenAlexIdentity(url);
  return url;
}

/**
 * Fetch `referenced_works` for up to 50 works by OpenAlex ID in ONE request
 * (filter=openalex_id:W1|W2..., select trims the payload). Returns the stripped
 * id + its referenced_works (also stripped of the URL prefix).
 */
export async function fetchWorksByIds(
  ids: string[],
): Promise<Array<{ id: string; referenced_works: string[] }>> {
  if (ids.length === 0) return [];
  const works = await fetchOpenAlexWorksByIds(ids, "id,referenced_works");
  return works.map((w) => ({
    id: (w.id ?? "").replace("https://openalex.org/", ""),
    referenced_works: (w.referenced_works ?? []).map((r) => r.replace("https://openalex.org/", "")),
  }));
}

/**
 * Fetch up to 50 works by OpenAlex ID in one request. Use `select` to keep
 * backfills cheap; OpenAlex accepts pipe-separated IDs in `filter=openalex_id`.
 */
export async function fetchOpenAlexWorksByIds(
  ids: string[],
  select: string,
): Promise<OpenAlexWork[]> {
  if (ids.length === 0) return [];
  const url = new URL(BASE_URL);
  url.searchParams.set("filter", `openalex_id:${ids.join("|")}`);
  url.searchParams.set("select", select);
  url.searchParams.set("per_page", String(Math.min(ids.length, OPENALEX_MAX_PER_PAGE)));
  appendOpenAlexIdentity(url);

  const json = await fetchWithRetry(url.toString());
  return json.results ?? [];
}

function appendOpenAlexIdentity(url: URL): void {
  if (env.OPENALEX_MAILTO) url.searchParams.set("mailto", env.OPENALEX_MAILTO);
  if (env.OPENALEX_API_KEY) url.searchParams.set("api_key", env.OPENALEX_API_KEY);
}

async function fetchWithRetry(url: string, attempt = 1): Promise<OpenAlexPage> {
  await sleep(RATE_LIMIT_DELAY_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "User-Agent": `TrendSystem/0.1 (mailto:${env.OPENALEX_MAILTO ?? "unknown"})`,
        Accept: "application/json",
      },
    });

    if ((res.status >= 500 || res.status === 429) && attempt <= MAX_RETRIES) {
      const backoff = 2000 * 2 ** (attempt - 1); // 2s, 4s, 8s
      logger.warn({ status: res.status, attempt, backoffMs: backoff }, "openalex retry");
      await sleep(backoff);
      return fetchWithRetry(url, attempt + 1);
    }
    if (!res.ok) {
      throw new Error(`OpenAlex ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    }

    const json = (await res.json()) as OpenAlexPage;
    logger.debug(
      { ms: Date.now() - t0, results: json.results?.length ?? 0 },
      "openalex page fetched",
    );
    return json;
  } catch (err) {
    if (attempt <= MAX_RETRIES) {
      const backoff = 2000 * 2 ** (attempt - 1);
      logger.warn({ err, attempt, backoffMs: backoff }, "openalex fetch error — retrying");
      await sleep(backoff);
      return fetchWithRetry(url, attempt + 1);
    }
    throw err;
  }
}
