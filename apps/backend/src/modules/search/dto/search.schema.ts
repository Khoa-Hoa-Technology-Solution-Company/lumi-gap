import { z } from "zod";
import { paperFilterShape } from "../../papers/dto/paper-filters.schema.js";

/**
 * Single source of truth for "is the LLM rerank requested?". Used by BOTH the
 * Zod schema (to enable rerank) and the route's rate-limiter (to decide whether
 * to throttle) — they MUST agree, or a spelling like `?rerank` (→ "") could
 * enable rerank while escaping the limiter and draining Gemini quota.
 */
export function isRerankRequested(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (v === undefined) return false;
  return ["true", "1", "on", "yes", ""].includes(String(v).toLowerCase());
}

/** Unlike `rerank`, auto tagging is opt-out: only an explicit false-like value disables it. */
export function isAutoTagsRequested(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  return !["false", "0", "off", "no"].includes(String(Array.isArray(v) ? v.at(-1) : v).toLowerCase());
}

/**
 * Query params for GET /api/v1/search (semantic search).
 * Shares the complete paper-filter vocabulary with GET /papers. `minScore` is
 * a semantic-only cosine-similarity floor.
 */
export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1, "q (search query) is required").max(500, "q must be at most 500 characters"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  ...paperFilterShape,
  minScore: z.coerce.number().min(0).max(1).default(0),
  /**
   * Opt-in LLM re-ranking of the top candidate pool (explicit AI analysis).
   * Tolerant of common flag spellings so a bare `?rerank` or `?rerank=1` from a
   * checkbox doesn't 400 the WHOLE search — only an explicit truthy enables it.
   */
  rerank: z.preprocess((v) => isRerankRequested(v), z.boolean()).default(false),
  /**
   * Query understanding: resolve `q` to taxonomy nodes / keywords and filter or boost by them
   * (deterministic, no LLM). On by default; `?autoTags=false` (or `0`/`off`/`no`) opts out.
   */
  autoTags: z.preprocess((v) => (v === undefined ? true : isAutoTagsRequested(v)), z.boolean()).default(true),
});

export type SearchQueryInput = z.infer<typeof SearchQuerySchema>;
