import type { DetectedTagFilterKey } from "@trend/shared-types";
import type { SearchParams } from "@/features/search/api/search.api";

export const LITERATURE_PATH = "/literature";

export const HOME_SCOPE_FILTERS = ["paperKinds", "openAccessStatuses", "providers", "sources", "languages", "citationBands", "domains", "fields", "subfields", "topics", "domainIds", "fieldIds", "subfieldIds", "topicIds", "keywordIds", "tagIds"] as const;
const filterKeys = ["yearFrom", "yearTo", "type", "paperKind", "provider", "openAccess", "minScore", "tag", ...HOME_SCOPE_FILTERS];

/** URL params owned by query understanding; a brand-new query must start without them. */
export const HOME_TAG_PARAMS = ["tag", "tagLabel", "autoTags"] as const;
const TAG_FILTER_KEYS: readonly DetectedTagFilterKey[] = ["domainIds", "fieldIds", "subfieldIds", "topicIds", "keywordIds", "tagIds"];

export interface HomeTagFilter { key: DetectedTagFilterKey; value: string; label: string }

/** Reads the chip-applied filter (`tag=<filterKey>:<value>` + `tagLabel`). Unknown keys or empty values are ignored. */
export function homeTagFilter(params: URLSearchParams): HomeTagFilter | null {
  const raw = params.get("tag")?.trim();
  if (!raw) return null;
  const separator = raw.indexOf(":");
  const key = raw.slice(0, Math.max(separator, 0)) as DetectedTagFilterKey;
  const value = raw.slice(separator + 1).trim();
  if (separator < 1 || !value || !TAG_FILTER_KEYS.includes(key)) return null;
  return { key, value, label: params.get("tagLabel")?.trim() || value };
}

/** Pins a detected tag as an explicit filter, replacing any previous one, and returns to page 1. */
export function withTagFilter(params: URLSearchParams, tag: { key: DetectedTagFilterKey; value: string; label: string }) {
  const next = new URLSearchParams(params);
  next.set("tag", `${tag.key}:${tag.value}`);
  next.set("tagLabel", tag.label);
  next.delete("autoTags");
  next.delete("page");
  return next;
}

/** Drops the pinned tag (auto detection resumes) and returns to page 1. */
export function withoutTagFilter(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  next.delete("tag");
  next.delete("tagLabel");
  next.delete("page");
  return next;
}

/** Searches all papers: switches automatic tag detection off and returns to page 1. */
export function withAutoTagsOff(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  next.set("autoTags", "false");
  next.delete("page");
  return next;
}

/** Re-enables automatic tag detection and returns to page 1. */
export function withAutoTagsOn(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  next.delete("autoTags");
  next.delete("page");
  return next;
}

export function homePaperKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = value.flatMap((keyword: unknown) => {
    const name = typeof keyword === "string" ? keyword : keyword && typeof keyword === "object" && "keywordName" in keyword ? keyword.keywordName : undefined;
    return typeof name === "string" && name.trim() ? [name.trim()] : [];
  });
  return [...new Set(names)].slice(0, 5);
}

export function hasHomeSearch(params: URLSearchParams) {
  return Boolean(params.get("q")?.trim()) || filterKeys.some((key) => params.getAll(key).some((value) => value.trim()));
}

export function homeSearchRequest(params: URLSearchParams) {
  const integer = (key: string, min: number, max: number) => {
    const raw = params.get(key);
    if (!raw?.trim()) return undefined;
    const value = Number(raw);
    return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
  };
  const values = (key: string) => [...new Set(params.getAll(key).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean))];
  const q = params.get("q")?.trim() ?? "";
  const mode = params.get("mode") === "keyword" || !q ? "keyword" : "semantic";
  const kinds = [...new Set([...values("type"), ...values("paperKind")])];
  const sort = params.get("sort");
  const minScore = Number(params.get("minScore"));
  const request: SearchParams = {
    q, page: integer("page", 1, Number.MAX_SAFE_INTEGER) ?? 1, pageSize: 10,
    yearFrom: integer("yearFrom", 1900, 2100), yearTo: integer("yearTo", 1900, 2100),
    provider: params.get("provider") && params.get("provider") !== "all" ? params.get("provider")! : undefined,
    paperKind: kinds.length ? kinds : undefined, openAccess: params.get("openAccess") === "true" || undefined,
    sort: sort === "year" || sort === "date" ? "year" : sort === "citations" ? "citations" : "relevance",
    ...(mode === "semantic" ? { rerank: params.get("rerank") === "true" || undefined, minScore: Number.isFinite(minScore) && minScore > 0 && minScore <= 1 ? minScore : undefined } : {}),
  };
  for (const key of HOME_SCOPE_FILTERS) { const list = values(key); if (list.length) request[key] = list; }
  // A pinned tag is an explicit filter in both modes; automatic detection only exists for semantic search.
  const tag = homeTagFilter(params);
  if (tag) request[tag.key] = [...new Set([...(request[tag.key] ?? []), tag.value])];
  if (mode === "semantic" && params.get("autoTags") === "false") request.autoTags = false;
  return { mode, request: { ...request, page: request.page ?? 1 } } as const;
}
