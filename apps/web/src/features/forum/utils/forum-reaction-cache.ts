import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import type { ForumCommentsPage, ForumPostView, ForumReactionName, ForumReactionSummary, ForumReactionUser } from "../api/forum.api";
import { FORUM_REACTIONS } from "./forum-reactions";

export type ForumReactionChange = { kind: "post" | "comment"; id: string; postId?: string; reaction: ForumReactionName; active: boolean };
type PostList = { data: ForumPostView[]; meta: { page: number; pageSize: number; total: number; totalPages: number } };
type CacheEntry =
  | { kind: "post"; key: QueryKey; data: ForumPostView }
  | { kind: "posts"; key: QueryKey; data: PostList }
  | { kind: "comments"; key: QueryKey; data: InfiniteData<ForumCommentsPage> };

const total = (counts?: Partial<Record<ForumReactionName, number>>) => Object.values(counts ?? {}).reduce((sum, count) => sum + (count ?? 0), 0);

/** Only touch the acting viewer's thread aliases, list rows and reply pages. */
export function captureForumReactionCache(client: QueryClient, viewer: string, change: ForumReactionChange) {
  const predicate = (query: { queryKey: QueryKey }) => query.queryKey.at(-1) === viewer;
  const comments = client.getQueriesData<InfiniteData<ForumCommentsPage>>({ queryKey: ["forum", "comments"], predicate });
  const subject = comments.flatMap(([, data]) => data?.pages.flatMap((page) => page.data) ?? []).find((row) => row.id === change.id);
  const postId = change.kind === "post" ? change.id : subject?.postId ?? change.postId;
  const entries: CacheEntry[] = [];
  for (const [key, data] of client.getQueriesData<ForumPostView>({ queryKey: ["forum", "post"], predicate })) {
    if (data && data.id === postId) entries.push({ kind: "post", key, data });
  }
  for (const [key, data] of client.getQueriesData<PostList>({ queryKey: ["forum", "posts"], predicate })) {
    if (data?.data.some((post) => post.id === postId)) entries.push({ kind: "posts", key, data });
  }
  if (change.kind === "comment") for (const [key, data] of comments) {
    if (data?.pages.some((page) => page.data.some((row) => row.id === change.id))) entries.push({ kind: "comments", key, data });
  }
  const postSubject = entries.flatMap((entry) => entry.kind === "post" ? [entry.data] : entry.kind === "posts" ? entry.data.data : []).find((post) => post.id === change.id);
  return { entries, postId, subject: change.kind === "post" ? postSubject : subject };
}

export function optimisticForumReaction(current: Pick<ForumPostView, "reactionCounts" | "viewerReactions" | "reactionUsers">, change: ForumReactionChange, viewer?: ForumReactionUser): ForumReactionSummary {
  const reactionCounts = Object.fromEntries(FORUM_REACTIONS.map(({ value }) => [value, current.reactionCounts?.[value] ?? 0])) as Record<ForumReactionName, number>;
  const previous = current.viewerReactions?.[0];
  const selected = change.active ? change.reaction : previous === change.reaction ? undefined : previous;
  if (previous !== selected) {
    if (previous) reactionCounts[previous] = Math.max(0, reactionCounts[previous] - 1);
    if (selected) reactionCounts[selected] += 1;
  }
  const reactionUsers = Object.fromEntries(FORUM_REACTIONS.map(({ value }) => [value, (current.reactionUsers?.[value] ?? []).filter((user) => user.id !== viewer?.id)]));
  if (selected && viewer) reactionUsers[selected] = [...reactionUsers[selected]!, viewer];
  return { reactionCounts, viewerReactions: selected ? [selected] : [], reactionUsers };
}

/** Apply the server summary without fetching the entire discussion again. */
export function applyForumReactionCache(client: QueryClient, viewer: string, change: ForumReactionChange, summary: ForumReactionSummary) {
  const snapshot = captureForumReactionCache(client, viewer, change);
  const countDelta = total(summary.reactionCounts) - total(snapshot.subject?.reactionCounts);
  const likeDelta = summary.reactionCounts.LIKE - (snapshot.subject?.reactionCounts?.LIKE ?? 0);
  const updatePost = (post: ForumPostView): ForumPostView => {
    if (post.id !== snapshot.postId) return post;
    const ownCountDelta = change.kind === "post" ? total(summary.reactionCounts) - total(post.reactionCounts) : countDelta;
    const ownLikeDelta = change.kind === "post" ? summary.reactionCounts.LIKE - (post.reactionCounts?.LIKE ?? 0) : likeDelta;
    return {
      ...post,
      ...(change.kind === "post" ? summary : {}),
      reactionCount: post.reactionCount === undefined ? undefined : Math.max(0, post.reactionCount + ownCountDelta),
      likeCount: post.likeCount === undefined ? undefined : Math.max(0, post.likeCount + ownLikeDelta),
    };
  };
  for (const entry of snapshot.entries) {
    if (entry.kind === "post") client.setQueryData(entry.key, updatePost(entry.data));
    else if (entry.kind === "posts") client.setQueryData(entry.key, { ...entry.data, data: entry.data.data.map(updatePost) });
    else client.setQueryData(entry.key, {
      ...entry.data,
      pages: entry.data.pages.map((page) => ({ ...page, data: page.data.map((comment) => comment.id !== change.id ? comment : { ...comment, ...summary }) })),
    });
  }
}

export function restoreForumReactionCache(client: QueryClient, entries: CacheEntry[]) {
  for (const { key, data } of entries) client.setQueryData(key, data);
}
