import type { ForumPostType, ForumSort } from "@trend/shared-types";

export const FORUM_PAGE_SIZES = [10, 20, 30] as const;
export const FORUM_DEFAULT_PAGE_SIZE = 20;
const sorts: ForumSort[] = ["latest", "popular", "unanswered", "following"];
const types: ForumPostType[] = ["QUESTION", "DISCUSSION", "PAPER_DISCUSSION", "RESEARCH_GAP_DISCUSSION"];

export function parseForumListParams(params: URLSearchParams) {
  const rawPage = params.get("page");
  const candidate = Number(rawPage);
  const page = rawPage && /^\d+$/.test(rawPage) && Number.isSafeInteger(candidate) && candidate > 0 && candidate <= 1_000_000 ? candidate : 1;
  const size = Number(params.get("pageSize"));
  const pageSize = FORUM_PAGE_SIZES.find((value) => value === size) ?? FORUM_DEFAULT_PAGE_SIZE;
  const rawFeed = params.get("feed") as ForumSort;
  const rawSort = sorts.includes(rawFeed) ? rawFeed : params.get("sort") as ForumSort;
  const rawType = params.get("type") as ForumPostType;
  return {
    page, pageSize,
    sort: sorts.includes(rawSort) ? rawSort : "latest" as ForumSort,
    type: types.includes(rawType) ? rawType : "" as const,
    query: (params.get("q") ?? params.get("search") ?? "").slice(0, 240),
  };
}

/** Keep filters together; every non-page edit starts at page one. */
export function updateForumListParam(params: URLSearchParams, key: string, value?: string) {
  const next = new URLSearchParams(params);
  if (key === "sort" || key === "feed") {
    next.delete("sort");
    next.delete("feed");
    key = "feed";
    value = value || "latest";
  }
  if (key === "q") next.delete("search");
  if (value && !(key === "page" && value === "1")) next.set(key, value);
  else next.delete(key);
  if (key !== "page") next.delete("page");
  return next;
}

export function forumListHref(params: URLSearchParams, key: string, value?: string) {
  const query = updateForumListParam(params, key, value).toString();
  return `/forum${query ? `?${query}` : ""}`;
}

export function forumPageNumbers(page: number, totalPages: number): Array<number | "ellipsis-start" | "ellipsis-end"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(page - 1, totalPages - 4));
  const end = Math.min(totalPages - 1, Math.max(page + 1, 5));
  return [1, ...(start > 2 ? ["ellipsis-start" as const] : []),
    ...Array.from({ length: end - start + 1 }, (_, index) => start + index),
    ...(end < totalPages - 1 ? ["ellipsis-end" as const] : []), totalPages];
}
