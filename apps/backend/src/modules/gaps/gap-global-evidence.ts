/**
 * Probe counts over the whole literature (OpenAlex), to check the local corpus count against.
 * BEST-EFFORT: any failure returns null and the gap pipeline carries on with corpus counts only.
 */
import type { GapGlobalEvidence } from "@trend/shared-types";
import { env } from "../../config/env.js";
import { cache, hashKey, LLM_CACHE_TTL_SECONDS } from "../../infrastructure/cache.js";
import { logger } from "../../infrastructure/logger.js";
import { fetchOpenAlexGroupCounts } from "../api-sync/providers/openalex.client.js";
import type { YearRange } from "./gap-evidence.js";

/** Strips characters that would break out of an OpenAlex filter value (`,` `|` `:` `!` and quotes). */
export function openAlexSearchValue(phrase: string): string | null {
  const value = phrase.replace(/[,|:!"“”]/g, " ").replace(/\s+/g, " ").trim();
  return value || null;
}

/**
 * OpenAlex filter for papers matching every given topic inside a year window. A closed window uses `Y1-Y2`;
 * a single bound uses OpenAlex's exclusive `>` / `<` comparison, hence the +/-1.
 */
export function buildIntersectionFilter(topics: string[], years: YearRange): string {
  const parts = topics.map((topic) => `title_and_abstract.search:${topic}`);
  const { yearFrom, yearTo } = years;
  if (yearFrom !== undefined && yearTo !== undefined) parts.push(`publication_year:${yearFrom}-${yearTo}`);
  else if (yearFrom !== undefined) parts.push(`publication_year:>${yearFrom - 1}`);
  else if (yearTo !== undefined) parts.push(`publication_year:<${yearTo + 1}`);
  return parts.join(",");
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`OpenAlex count timed out after ${ms}ms`)), ms); });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Counts papers about A, about B, about both, and all works in the window (N, for the O/E test) in OpenAlex.
 * Null when disabled, unusable phrases, or on any failure.
 */
export async function countOpenAlexIntersection(topicA: string, topicB: string, years: YearRange): Promise<GapGlobalEvidence | null> {
  if (!env.GAP_GLOBAL_EVIDENCE_ENABLED) return null;
  const a = openAlexSearchValue(topicA), b = openAlexSearchValue(topicB);
  if (!a || !b) return null;
  const key = `gap:openalex:v2:${hashKey({ a: a.toLowerCase(), b: b.toLowerCase(), yearFrom: years.yearFrom, yearTo: years.yearTo })}`;
  try {
    const cached = await cache.get<GapGlobalEvidence>(key);
    if (cached) return cached;
    const count = async (topics: string[]) => (await fetchOpenAlexGroupCounts({ filterExpression: buildIntersectionFilter(topics, years), groupBy: "publication_year" })).total;
    const [intersectionCount, countA, countB, scopeSize] = await withTimeout(Promise.all([count([a, b]), count([a]), count([b]), count([])]), env.GAP_GLOBAL_EVIDENCE_TIMEOUT_MS);
    const evidence: GapGlobalEvidence = { source: "openalex", intersectionCount, parentCounts: { a: countA, b: countB }, scopeSize, ...(years.yearFrom !== undefined ? { yearFrom: years.yearFrom } : {}), ...(years.yearTo !== undefined ? { yearTo: years.yearTo } : {}), fetchedAt: new Date().toISOString() };
    await cache.set(key, evidence, LLM_CACHE_TTL_SECONDS);
    return evidence;
  } catch (err) {
    logger.warn({ err, topicA, topicB }, "OpenAlex global evidence unavailable; scoring on the local corpus only");
    return null;
  }
}
