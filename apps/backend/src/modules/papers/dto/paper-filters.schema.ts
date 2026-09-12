import { z } from "zod";
import { TREND_CITATION_BANDS } from "../../trends/trend.filters.js";

/**
 * Shared paper-filter vocabulary + Zod shape, reused by GET /search (semantic)
 * and GET /papers (keyword) so BOTH honor the same filters server-side.
 *
 * The enum domains mirror paper.model.ts. Coercion is tolerant: query strings
 * arrive as `?paperKind=a,b`, repeated `?paperKind=a&paperKind=b`, or a single
 * value, and unknown values are dropped rather than 400-ing the whole request.
 */

export const PAPER_KINDS = [
  "article",
  "proceedings",
  "preprint",
  "review",
  "book-chapter",
  "other",
] as const;

export const PAPER_PROVIDERS = ["openalex", "semanticscholar", "crossref", "arxiv", "user"] as const;

export const SEARCH_SORT_KEYS = ["relevance", "year", "citations"] as const;
export type SearchSortKey = (typeof SEARCH_SORT_KEYS)[number];

/** Tolerant boolean coercion for query flags: `?openAccess`, `=1`, `=true`, `=on`. */
export function toQueryBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (v === undefined) return false;
  return ["true", "1", "on", "yes", ""].includes(String(v).toLowerCase());
}

/** Normalize the kind param to a clean string[] of known kinds (empty → undefined). */
function toPaperKinds(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  const raw = Array.isArray(v) ? v : String(v).split(",");
  const cleaned = raw
    .map((s) => String(s).trim())
    .filter((s) => (PAPER_KINDS as readonly string[]).includes(s));
  return cleaned.length ? cleaned : undefined;
}

export function toCsvList(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  const raw = Array.isArray(v) ? v.flatMap((item) => String(item).split(",")) : String(v).split(",");
  const values = Array.from(new Set(raw.map((value) => value.trim()).filter(Boolean)));
  return values.length > 0 ? values : undefined;
}

function toCitationBands(v: unknown): string[] | undefined {
  const values = toCsvList(v)?.filter((value) =>
    (TREND_CITATION_BANDS as readonly string[]).includes(value),
  );
  return values && values.length > 0 ? values : undefined;
}

/** Normalize ISO-style language query values; unknown language is represented by `und`. */
export function toLanguageCodes(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  const raw = Array.isArray(v) ? v.flatMap((item) => String(item).split(",")) : String(v).split(",");
  const values = Array.from(
    new Set(
      raw
        .map((value) => value.trim().toLowerCase())
        .filter((value) => /^[a-z]{2,3}(?:-[a-z0-9]+)*$/.test(value)),
    ),
  );
  return values.length > 0 ? values : undefined;
}

/**
 * Common filter fields. `minScore` is semantic-only, so it lives on the search
 * schema rather than here.
 */
export const paperFilterShape = {
  yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
  yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
  paperKind: z.preprocess(toPaperKinds, z.array(z.enum(PAPER_KINDS)).optional()),
  paperKinds: z.preprocess(toPaperKinds, z.array(z.enum(PAPER_KINDS)).optional()),
  openAccess: z.preprocess(toQueryBool, z.boolean()).default(false),
  provider: z.enum(PAPER_PROVIDERS).optional(),
  openAccessStatuses: z.preprocess(toCsvList, z.array(z.string()).max(20).optional()),
  providers: z.preprocess(toCsvList, z.array(z.string()).max(20).optional()),
  sources: z.preprocess(toCsvList, z.array(z.string()).max(50).optional()),
  languages: z.preprocess(toLanguageCodes, z.array(z.string()).max(50).optional()),
  citationBands: z.preprocess(
    toCitationBands,
    z.array(z.enum(TREND_CITATION_BANDS)).max(TREND_CITATION_BANDS.length).optional(),
  ),
  domains: z.preprocess(toCsvList, z.array(z.string()).max(50).optional()),
  fields: z.preprocess(toCsvList, z.array(z.string()).max(50).optional()),
  subfields: z.preprocess(toCsvList, z.array(z.string()).max(50).optional()),
  topics: z.preprocess(toCsvList, z.array(z.string()).max(50).optional()),
  domainIds: z.preprocess(toCsvList, z.array(z.string()).max(50).optional()),
  fieldIds: z.preprocess(toCsvList, z.array(z.string()).max(50).optional()),
  subfieldIds: z.preprocess(toCsvList, z.array(z.string()).max(50).optional()),
  topicIds: z.preprocess(toCsvList, z.array(z.string()).max(50).optional()),
  sort: z.enum(SEARCH_SORT_KEYS).default("relevance"),
} as const;
