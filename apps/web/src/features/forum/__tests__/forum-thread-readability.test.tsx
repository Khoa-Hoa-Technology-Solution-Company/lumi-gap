// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForumDetailPage } from "@/pages/forum/forum-detail";
import { vi as vietnamese } from "@/i18n/locales/vi";
import { forumApi, type ForumCommentView, type ForumPostView, type ForumReactionName } from "../api/forum.api";
import { forumCategoryApi } from "../api/forum-category.api";
import { FORUM_REACTIONS } from "../utils/forum-reactions";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: "reader", fullName: "Current reader" }, tokens: { accessToken: "test-only" } }) }));
vi.mock("../components/forum-composer", () => ({ ForumComposer: () => <textarea aria-label="Reply draft" /> }));

const counts = () => Object.fromEntries(FORUM_REACTIONS.map(({ value }) => [value, 0])) as Record<ForumReactionName, number>;
const author = { id: "author", fullName: "Author" };
const topic = (overrides: Partial<ForumPostView> = {}): ForumPostView => ({
  id: "topic-id", publicSlug: "evaluation-design", type: "DISCUSSION", title: "Evaluation design", content: "A discussion of evaluation design.", tags: [], status: "active",
  voteScore: 0, commentCount: 0, replyCount: 0, helpfulCount: 0, viewCount: 60, reactionCount: 0, likeCount: 0,
  participants: [author], author, viewerVote: 0, viewerReactions: [], reactionCounts: counts(), reactionUsers: {}, isFollowing: false, isPinned: false, canModerate: false, canReply: true,
  references: [], createdAt: "2026-10-01T00:00:00Z", lastActivityAt: "2026-10-02T00:00:00Z", ...overrides,
}) as ForumPostView;
const reply = (index: number): ForumCommentView => ({
  id: `reply-${index}`, postId: "topic-id", postNumber: index + 1, content: `Reply number ${index}.`, voteScore: 0, helpfulCount: 0, viewerVote: 0, viewerReactions: [], reactionCounts: counts(), reactionUsers: {},
  author: { id: `replier-${index}`, fullName: `Replier ${index}` }, createdAt: "2026-10-01T01:00:00Z", status: "active", isAccepted: false, references: [],
}) as ForumCommentView;

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(forumCategoryApi, "list").mockResolvedValue([]);
  vi.spyOn(forumApi, "discovery").mockResolvedValue({ suggested: [], related: [] });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function open(post: ForumPostView, replies: number) {
  vi.spyOn(forumApi, "post").mockResolvedValue(post);
  vi.spyOn(forumApi, "commentsPage").mockResolvedValue({ data: Array.from({ length: replies }, (_, index) => reply(index + 1)), meta: { page: 1, pageSize: 25, total: replies, totalPages: 1 } });
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/forum/evaluation-design"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/forum/:id" element={<ForumDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>));
  await vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); expect(container.querySelector("#opening-post")).not.toBeNull(); expect(container.querySelector(replies ? `#comment-reply-${replies}` : "#responses-section")).not.toBeNull(); });
}
const before = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
const stats = () => container.querySelectorAll('[aria-label="Discussion statistics"]');

describe("forum thread readability (§3)", () => {
  it("renders the statistics strip exactly once, under the title and before the opening post", async () => {
    await open(topic({ replyCount: 3 }), 3);
    expect(stats()).toHaveLength(1);
    expect(container.querySelectorAll(".forum-topic-summary-button")).toHaveLength(1);
    expect(container.querySelectorAll(".forum-topic-reading-time")).toHaveLength(1);
    expect(before(container.querySelector("h1")!, stats()[0]!)).toBe(true);
    expect(before(stats()[0]!, container.querySelector("#opening-post")!)).toBe(true);
    expect(container.querySelector("#thread-end [aria-label='Discussion overview']")).toBeNull();
  });

  it("reads as a sentence with units, with singular and plural forms in English and Vietnamese", async () => {
    await open(topic({ replyCount: 3, viewCount: 60, reactionCount: 0 }), 3);
    expect(stats()[0]!.querySelector(".forum-topic-stats-metrics")!.textContent).toBe("3 replies60 views0 reactions");
    await act(async () => root.unmount());
    root = createRoot(container);
    client.clear();
    await open(topic({ replyCount: 1, viewCount: 1, reactionCount: 1 }), 1);
    expect(stats()[0]!.querySelector(".forum-topic-stats-metrics")!.textContent).toBe("1 reply1 view1 reaction");
    const t = vietnamese as Record<string, string>;
    for (const key of ["reply", "replies", "view", "views", "reaction", "reactions", "link", "links"]) expect(t[key], key).toBeTruthy();
    expect(t.reply).toBe("trả lời");
    expect(t.views).toBe("lượt xem");
    expect(t.reactions).toBe("cảm xúc");
  });

  it("shows an 'N replies' heading between the opening post and the first reply, and none without replies", async () => {
    await open(topic({ replyCount: 3 }), 3);
    const heading = container.querySelector("[data-testid='replies-heading']")!;
    expect(heading.tagName).toBe("H2");
    expect(heading.textContent).toBe("3 replies");
    expect(before(container.querySelector("#opening-post")!, heading)).toBe(true);
    expect(before(heading, container.querySelector("#comment-reply-1")!)).toBe(true);
    await act(async () => root.unmount());
    root = createRoot(container);
    client.clear();
    await open(topic({ replyCount: 0 }), 0);
    expect(container.querySelector("[data-testid='replies-heading']")).toBeNull();
    expect(container.textContent).toContain("No replies yet.");
  });

  it("puts every post in its own card, with its actions inside the card, left aligned and after the body", async () => {
    await open(topic({ replyCount: 2 }), 2);
    for (const id of ["opening-post", "comment-reply-1", "comment-reply-2"]) {
      const card = container.querySelector(`#${id}`)!;
      expect(card.tagName).toBe("ARTICLE");
      expect(card.className).toContain("rounded-xl");
      expect(card.className).toContain("bg-card");
      const actions = card.querySelector(".forum-post-actions")!;
      expect(card.contains(actions)).toBe(true);
      expect(actions.className).not.toContain("ml-auto");
      expect(actions.querySelector(".forum-post-action-links")!.className).not.toContain("ml-auto");
      const body = card.querySelector(".prose, .forum-markdown, p")!;
      expect(before(body, actions)).toBe(true);
    }
    expect(container.querySelector("#opening-post")!.className).toContain("border-slate-300");
    // 40px hit area for the icon-only actions, each labelled
    for (const label of ["Share", "More discussion actions"]) expect(container.querySelector(`#opening-post button[aria-label="${label}"]`)!.className).toContain("h-10 w-10");
    // replies sit in a column with a 12px gap
    expect(container.querySelector("#responses-section")!.className).toContain("gap-3");
  });

  it("uses no Sparkles icon anywhere on the thread page; the summary button has a neutral document icon", async () => {
    await open(topic({ replyCount: 3 }), 3);
    expect(container.querySelector("svg.lucide-sparkles")).toBeNull();
    expect(container.querySelector(".forum-topic-summary-button svg.lucide-file-text")).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>(".forum-topic-summary-button")!.click());
    expect(container.querySelector("[aria-label='Discussion summary']")).not.toBeNull();
    expect(container.querySelector("svg.lucide-sparkles")).toBeNull();
  });

  it("labels the notification level in the bottom bar", async () => {
    await open(topic({ replyCount: 3, notificationLevel: "NORMAL" }), 3);
    const bar = container.querySelector(".forum-thread-bottom-bar")!;
    expect(bar.textContent).toContain("Notifications:");
    expect(bar.querySelector("button[data-notification-level='NORMAL']")!.textContent).toBe("Normal");
    const order = Array.from(bar.querySelectorAll("button")).map((button) => button.textContent);
    expect(order.slice(0, 2)).toEqual(["Reply", "Follow"]);
  });

  it("hides the timeline for a thread of 3 posts or fewer and shows it from 4", async () => {
    await open(topic({ replyCount: 1 }), 1);
    expect(container.querySelector("aside[aria-label='Discussion timeline']")).toBeNull();
    expect(container.querySelector(".forum-detail-grid")!.className).not.toContain("xl:grid-cols-[minmax(0,1fr)_168px]");
    await act(async () => root.unmount());
    root = createRoot(container);
    client.clear();
    await open(topic({ replyCount: 2 }), 2);
    expect(container.querySelector("aside[aria-label='Discussion timeline']")).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(container);
    client.clear();
    await open(topic({ replyCount: 3 }), 3);
    expect(container.querySelector("aside[aria-label='Discussion timeline']")).not.toBeNull();
    expect(container.querySelector(".forum-detail-grid")!.className).toContain("xl:grid-cols-[minmax(0,1fr)_168px]");
  });
});
