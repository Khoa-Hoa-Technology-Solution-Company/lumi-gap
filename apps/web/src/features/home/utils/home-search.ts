import type { SearchParams } from "@/features/search/api/search.api";

export const LITERATURE_PATH = "/literature";

export const HOME_SCOPE_FILTERS = ["paperKinds", "openAccessStatuses", "providers", "sources", "languages", "citationBands", "domains", "fields", "subfields", "topics", "domainIds", "fieldIds", "subfieldIds", "topicIds"] as const;
const filterKeys = ["yearFrom", "yearTo", "type", "paperKind", "provider", "openAccess", "minScore", ...HOME_SCOPE_FILTERS];

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
  return { mode, request: { ...request, page: request.page ?? 1 } } as const;
}
