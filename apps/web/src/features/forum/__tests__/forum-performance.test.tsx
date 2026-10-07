// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForumDetailPage } from "@/pages/forum/forum-detail";
import { ForumListPage } from "@/pages/forum/forum-list";
import { ForumCategoryDirectoryPage } from "@/pages/forum/forum-category-directory";
import { forumApi, type ForumCommentView, type ForumCommentsPage, type ForumPostView, type ForumReactionName, type ForumReactionSummary } from "../api/forum.api";
import { useForumComments, useForumPost, useForumPosts, useForumReaction } from "../hooks/use-forum";
import { FORUM_REACTIONS } from "../utils/forum-reactions";
import { forumCategoryApi } from "../api/forum-category.api";

const mocks = vi.hoisted(() => ({ viewer: "reader" as string | null, composerMounts: 0 }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: mocks.viewer ? { id: mocks.viewer, fullName: "Current reader" } : null, tokens: mocks.viewer ? { accessToken: "test-only" } : null }) }));
// Isolate editor mounting/draft lifetime from the editor's formatting internals.
vi.mock("../components/forum-composer", async () => {
  const { useEffect, useState } = await import("react");
  return { ForumComposer: function TestComposer() {
    const [draft, setDraft] = useState("");
    useEffect(() => { mocks.composerMounts += 1; }, []);
    return <textarea aria-label="Reply draft" value={draft} onChange={(event) => setDraft(event.target.value)} />;
  } };
});

const counts = (values: Partial<Record<ForumReactionName, number>> = {}) => Object.fromEntries(FORUM_REACTIONS.map(({ value }) => [value, values[value] ?? 0])) as Record<ForumReactionName, number>;
const topic: ForumPostView = {
  id: "topic-id", publicSlug: "evaluation-design", type: "DISCUSSION", title: "Evaluation design", content: "A discussion of evaluation design.", tags: [], status: "active",
  voteScore: 3, commentCount: 6, replyCount: 6, helpfulCount: 3, viewCount: 1063, reactionCount: 4, likeCount: 4,
  participants: [{ id: "author", fullName: "Author" }], author: { id: "author", fullName: "Author" },
  viewerVote: 0, viewerReactions: [], reactionCounts: counts({ LIKE: 3 }), reactionUsers: {}, isFollowing: false, isPinned: false, canModerate: false, canReply: true,
  references: [], createdAt: "2026-10-01T00:00:00Z", lastActivityAt: "2026-10-02T00:00:00Z",
};
const reply: ForumCommentView = { id: "reply-id", postId: topic.id, postNumber: 2, content: "A reply.", voteScore: 1, helpfulCount: 1, viewerVote: 1, viewerReactions: ["LIKE"], reactionCounts: counts({ LIKE: 1 }), reactionUsers: { LIKE: [{ id: "reader", fullName: "Current reader" }] }, author: topic.author, createdAt: topic.createdAt, status: "active", isAccepted: false, references: [] };
const page: ForumCommentsPage = { data: [reply], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } };
const replyPages: InfiniteData<ForumCommentsPage> = { pages: [page], pageParams: [1] };
const listParams = { sort: "latest" as const };
const list = { data: [topic], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let mutation: ReturnType<typeof useForumReaction>;

beforeEach(() => {
  mocks.viewer = "reader"; mocks.composerMounts = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false }, mutations: { retry: false } } });
  vi.spyOn(forumCategoryApi, "list").mockResolvedValue([]);
  vi.spyOn(forumApi, "discovery").mockResolvedValue({ suggested: [], related: [] });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const render = async (children: React.ReactNode) => act(async () => root.render(<QueryClientProvider client={client}>{children}</QueryClientProvider>));
const settle = async (assertion: () => void) => vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); assertion(); });
const detail = <MemoryRouter initialEntries={["/forum/evaluation-design"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/forum/:id" element={<ForumDetailPage />} /></Routes></MemoryRouter>;
function MutationHarness({ reads = false }: { reads?: boolean }) {
  mutation = useForumReaction();
  return <>{reads ? <ReadHarness /> : null}<p>{mutation.status}</p></>;
}
function ReadHarness() { useForumPost(topic.publicSlug); useForumComments(topic.publicSlug); useForumPosts(listParams); return null; }
function prime(viewer = "reader") {
  client.setQueryData(["forum", "post", topic.id, viewer], topic);
  client.setQueryData(["forum", "post", topic.publicSlug, viewer], topic);
  client.setQueryData(["forum", "comments", topic.publicSlug, viewer], replyPages);
  client.setQueryData(["forum", "posts", listParams, viewer], list);
}

describe("Forum loading and reading interactions", () => {
  it("retains the category table and navigation when a background refresh fails, then retries", async () => {
    mocks.viewer = null;
    const category = { id: "software", slug: "software-engineering", name: "Software Engineering", description: "Developer tools", status: "ACTIVE" as const, sortOrder: 0, topicCount: 12, topicsThisWeek: 3 };
    const queryKey = ["forum", "categories", false, "anonymous"];
    client.setQueryData(queryKey, [category]);
    vi.mocked(forumCategoryApi.list).mockRejectedValue(new Error("Refresh unavailable"));
    await render(<MemoryRouter initialEntries={["/forum/categories"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ForumCategoryDirectoryPage /></MemoryRouter>);
    const table = container.querySelector(".forum-category-directory-table");
    const row = container.querySelector(".forum-category-directory-row");
    await act(async () => { await client.invalidateQueries({ queryKey }); });
    await settle(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not refresh categories. Showing the last loaded list."));
    expect(container.querySelector(".forum-category-directory-table")).toBe(table);
    expect(container.querySelector(".forum-category-directory-row")).toBe(row);
    expect(container.querySelector('.forum-sidebar-nav a[href="/forum?category=software-engineering"]')).not.toBeNull();
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="Category"]')?.disabled).toBe(false);
    vi.mocked(forumCategoryApi.list).mockResolvedValue([{ ...category, topicCount: 13, topicsThisWeek: 4 }]);
    await act(async () => container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    await settle(() => expect(container.querySelector(".forum-category-directory-count")?.textContent).toBe("4/ week"));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector(".forum-category-directory-row")).toBe(row);
  });

  it("lets guests browse category counts and open a category's discussions", async () => {
    mocks.viewer = null;
    const posts = vi.spyOn(forumApi, "posts").mockResolvedValue(list);
    vi.mocked(forumCategoryApi.list).mockResolvedValue([
      { id: "software", slug: "software-engineering", name: "Software Engineering", description: "Developer tools and methods", status: "ACTIVE", sortOrder: 0, topicCount: 12, topicsThisWeek: 3 },
      { id: "methods", slug: "research-methodology", name: "Research Methodology", description: "Research design", status: "ACTIVE", sortOrder: 1, topicCount: 8, topicsThisWeek: 0 },
      { id: "general", slug: "general-research", name: "General Research", description: "", status: "ACTIVE", sortOrder: 2 },
    ]);
    await render(<MemoryRouter initialEntries={["/forum/categories"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/forum/categories" element={<ForumCategoryDirectoryPage />} /><Route path="/forum" element={<ForumListPage />} /></Routes></MemoryRouter>);
    await settle(() => expect(container.querySelectorAll(".forum-category-directory-row")).toHaveLength(3));
    expect(container.querySelector("h1")?.textContent).toBe("All categories");
    const rows = container.querySelectorAll(".forum-category-directory-row");
    expect(rows[0]?.textContent).toContain("Developer tools and methods");
    expect(rows[0]?.querySelector(".forum-category-directory-count")?.textContent).toBe("3/ week");
    expect(rows[0]?.querySelector(".forum-category-directory-count")?.getAttribute("title")).toBe("Topics: 12");
    expect(rows[1]?.querySelector(".forum-category-directory-count")?.textContent).toBe("8");
    expect(rows[2]?.querySelector(".forum-category-directory-count")?.textContent).toBe("—");
    expect(container.querySelector('a[href="/forum/categories/manage"]')).toBeNull();
    expect(container.querySelector('.forum-topic-toolbar-actions a')?.getAttribute("href")).toBe("/login?returnTo=%2Fforum%2Fnew");
    await act(async () => rows[0]!.querySelector<HTMLAnchorElement>("a")!.click());
    await settle(() => expect(posts).toHaveBeenLastCalledWith(expect.objectContaining({ category: "software-engineering" }), expect.any(AbortSignal)));
    expect(container.querySelector("h1")?.textContent).toBe("Software Engineering");
  });

  it("retains the conversation canvas, panel and navigation from loading to the actual post", async () => {
    let finish!: (post: ForumPostView) => void;
    vi.spyOn(forumApi, "post").mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.spyOn(forumApi, "commentsPage").mockResolvedValue(page);
    await render(detail);
    const panel = container.querySelector(".forum-detail-surface");
    const navigation = container.querySelector(".forum-sidebar-shell");
    expect(panel?.classList.contains("forum-detail-loading")).toBe(true);
    expect(container.querySelector(".forum-conversation-content")).not.toBeNull();
    await act(async () => finish(topic));
    await settle(() => expect(container.querySelector("#thread-title h1")?.textContent).toBe(topic.title));
    expect(container.querySelector(".forum-detail-surface")).toBe(panel);
    expect(container.querySelector(".forum-sidebar-shell")).toBe(navigation);
    expect(panel?.classList.contains("forum-detail-loading")).toBe(false);
  });

  it("retains category scope across feed links and lets a category-route dropdown change scope", async () => {
    const posts = vi.spyOn(forumApi, "posts").mockResolvedValue(list);
    vi.mocked(forumCategoryApi.list).mockResolvedValue([
      { id: "software", slug: "software-engineering", name: "Software Engineering", description: "", status: "ACTIVE", sortOrder: 0 },
      { id: "methods", slug: "research-methodology", name: "Research Methodology", description: "", status: "ACTIVE", sortOrder: 1 },
    ]);
    const scroll = vi.fn();
    vi.stubGlobal("HTMLElement", window.HTMLElement);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    await render(<MemoryRouter initialEntries={["/forum/category/software-engineering"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/forum" element={<ForumListPage />} /><Route path="/forum/category/:categorySlug" element={<ForumListPage />} /></Routes></MemoryRouter>);
    await settle(() => expect(container.querySelector<HTMLSelectElement>('select[aria-label="Category"]')?.value).toBe("software-engineering"));
    expect(container.querySelector('.forum-topic-feeds a[href*="feed=popular"]')?.getAttribute("href")).toContain("category=software-engineering");
    const category = container.querySelector<HTMLSelectElement>('select[aria-label="Category"]')!;
    await act(async () => { category.value = "research-methodology"; category.dispatchEvent(new Event("change", { bubbles: true })); });
    await settle(() => expect(posts).toHaveBeenLastCalledWith(expect.objectContaining({ category: "research-methodology" }), expect.any(AbortSignal)));
    expect(container.querySelector("h1")?.textContent).toBe("Research Methodology");
    await act(async () => { category.value = ""; category.dispatchEvent(new Event("change", { bubbles: true })); });
    await settle(() => expect(container.querySelector("h1")?.textContent).toBe("Research Forum"));
    expect(container.querySelector(".forum-category-workspace")).toBeNull();
    delete (HTMLElement.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  });
  it("persists Helpful separately on the opening post and responses, retaining server state after a failed vote", async () => {
    let savedTopic = topic;
    let savedReply = reply;
    vi.spyOn(forumApi, "post").mockImplementation(async () => savedTopic);
    vi.spyOn(forumApi, "commentsPage").mockImplementation(async () => ({ ...page, data: [savedReply] }));
    const postVote = vi.spyOn(forumApi, "votePost").mockImplementation(async (_id, value) => {
      if (value === 0) throw new Error("Vote unavailable");
      savedTopic = { ...savedTopic, helpfulCount: 4, viewerVote: value };
      return { value };
    });
    const responseVote = vi.spyOn(forumApi, "voteComment").mockImplementation(async (_id, value) => {
      savedReply = { ...savedReply, helpfulCount: 0, viewerVote: value };
      return { value };
    });
    const react = vi.spyOn(forumApi, "react");
    const openingHelpful = () => container.querySelector<HTMLButtonElement>('#opening-post button[aria-label^="Helpful "]')!;
    const responseHelpful = () => container.querySelector<HTMLButtonElement>('#comment-reply-id button[aria-label^="Helpful "]')!;
    await render(detail);
    await settle(() => expect(openingHelpful()?.getAttribute("aria-label")).toBe("Helpful 3"));
    await act(async () => openingHelpful().click());
    await settle(() => {
      expect(postVote).toHaveBeenCalledWith(topic.id, 1);
      expect(openingHelpful().getAttribute("aria-pressed")).toBe("true");
      expect(openingHelpful().getAttribute("aria-label")).toBe("Helpful 4");
    });
    expect(responseVote).not.toHaveBeenCalled();
    await act(async () => responseHelpful().click());
    await settle(() => {
      expect(responseVote).toHaveBeenCalledWith(reply.id, 0);
      expect(responseHelpful().getAttribute("aria-pressed")).toBe("false");
      expect(responseHelpful().getAttribute("aria-label")).toBe("Helpful 0");
    });
    expect(openingHelpful().getAttribute("aria-label")).toBe("Helpful 4");
    await act(async () => openingHelpful().click());
    await settle(() => {
      expect(postVote).toHaveBeenLastCalledWith(topic.id, 0);
      expect(openingHelpful().getAttribute("aria-busy")).toBe("false");
    });
    expect(openingHelpful().getAttribute("aria-pressed")).toBe("true");
    expect(openingHelpful().getAttribute("aria-label")).toBe("Helpful 4");
    expect(react).not.toHaveBeenCalled();
  });
  it("starts replies alongside an unresolved topic and shows one topic reply count", async () => {
    mocks.viewer = null;
    let release!: (post: ForumPostView) => void;
    const postRequest = vi.spyOn(forumApi, "post").mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const repliesRequest = vi.spyOn(forumApi, "commentsPage").mockResolvedValue({ ...page, data: Array.from({ length: 6 }, (_, index) => ({ ...reply, id: `reply-${index}`, postNumber: index + 2 })), meta: { ...page.meta, total: 6 } });
    await render(detail);
    await settle(() => {
      expect(postRequest).toHaveBeenCalledWith("evaluation-design", expect.any(AbortSignal));
      expect(repliesRequest).toHaveBeenCalledWith("evaluation-design", 1, expect.any(AbortSignal));
    });
    expect(container.querySelector("#opening-post")).toBeNull();
    await act(async () => release(topic));
    await settle(() => expect(container.querySelectorAll('[aria-label="Discussion statistics"] .forum-topic-stats-metrics a').length).toBe(1));
    expect(container.querySelector('[aria-label="Discussion actions"]')?.textContent).not.toContain("6 replies");
    expect(container.querySelector('[aria-label="Discussion statistics"]')?.textContent).toContain("6 replies");
    expect(forumApi.discovery).not.toHaveBeenCalled();
    expect(postRequest).toHaveBeenCalledTimes(1);
    expect(repliesRequest).toHaveBeenCalledTimes(1);
  });

  it("mounts the editor and fetches private citation context on first Reply, retaining a minimized draft", async () => {
    vi.spyOn(forumApi, "post").mockResolvedValue(topic);
    vi.spyOn(forumApi, "commentsPage").mockResolvedValue(page);
    const contextRequest = vi.spyOn(forumApi, "context").mockResolvedValue({ papers: [], savedPapers: [], gaps: [], projects: [] });
    await render(detail);
    await settle(() => expect(container.querySelector("#opening-post")).not.toBeNull());
    expect(mocks.composerMounts).toBe(0);
    expect(contextRequest).not.toHaveBeenCalled();
    const replyButton = container.querySelector<HTMLButtonElement>('#opening-post button[title="Reply"]') ?? [...container.querySelectorAll<HTMLButtonElement>("#opening-post button")].find((button) => button.textContent === "Reply")!;
    await act(async () => replyButton.click());
    await settle(() => expect(container.querySelector('[aria-label="Reply draft"]')).not.toBeNull());
    expect(mocks.composerMounts).toBe(1);
    const field = container.querySelector<HTMLTextAreaElement>('[aria-label="Reply draft"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "A draft to retain"); field.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Minimize reply composer"]')!.click());
    expect(container.querySelector(".forum-reply-dock")?.hasAttribute("hidden")).toBe(true);
    await act(async () => container.querySelector<HTMLButtonElement>(".forum-reply-resume")!.click());
    expect(container.querySelector<HTMLTextAreaElement>('[aria-label="Reply draft"]')?.value).toBe("A draft to retain");
    expect(mocks.composerMounts).toBe(1);
    expect(contextRequest).toHaveBeenCalledTimes(1);
  });

  it("aborts an obsolete list request when filters change", async () => {
    const signals: AbortSignal[] = [];
    vi.spyOn(forumApi, "posts").mockImplementation((_params, signal) => new Promise((_resolve, reject) => {
      signals.push(signal!); signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    function ListHarness({ query }: { query: string }) { useForumPosts({ query }); return null; }
    await render(<ListHarness query="first" />);
    await settle(() => expect(signals).toHaveLength(1));
    await render(<ListHarness query="second" />);
    await settle(() => expect(signals).toHaveLength(2));
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
  });

  it("retains rows while another filter loads and clears them on an account change", async () => {
    client.setQueryData(["forum", "posts", { query: "first" }, "reader"], list);
    vi.spyOn(forumApi, "posts").mockImplementation((_params, signal) => new Promise((_resolve, reject) => {
      signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    function ListHarness({ query }: { query: string }) {
      const result = useForumPosts({ query });
      return <p data-placeholder={result.isPlaceholderData}>{result.data?.data[0]?.title ?? "Loading"}</p>;
    }
    await render(<ListHarness query="first" />);
    expect(container.textContent).toBe(topic.title);
    await render(<ListHarness query="second" />);
    expect(container.textContent).toBe(topic.title);
    expect(container.querySelector("p")?.dataset.placeholder).toBe("true");
    mocks.viewer = "next-reader";
    await render(<ListHarness query="second" />);
    expect(container.textContent).toBe("Loading");
    expect(container.querySelector("p")?.dataset.placeholder).toBe("false");
  });
});

describe("Forum reaction request and cache behavior", () => {
  it("switches one reaction immediately, reconciles the response and issues no full-thread GETs", async () => {
    prime(); prime("another-viewer");
    const postRequest = vi.spyOn(forumApi, "post").mockResolvedValue(topic);
    const repliesRequest = vi.spyOn(forumApi, "commentsPage").mockResolvedValue(page);
    const listRequest = vi.spyOn(forumApi, "posts").mockResolvedValue(list);
    let release!: (summary: Awaited<ReturnType<typeof forumApi.react>>) => void;
    const request = vi.spyOn(forumApi, "react").mockReturnValue(new Promise((resolve) => { release = resolve; }));
    await render(<MutationHarness reads />);
    await act(async () => mutation.mutate({ kind: "comment", id: reply.id, postId: topic.id, reaction: "LOVE", active: true }));
    await settle(() => expect(client.getQueryData<InfiniteData<ForumCommentsPage>>(["forum", "comments", topic.publicSlug, "reader"])!.pages[0]!.data[0]!.viewerReactions).toEqual(["LOVE"]));
    const optimistic = client.getQueryData<InfiniteData<ForumCommentsPage>>(["forum", "comments", topic.publicSlug, "reader"])!.pages[0]!.data[0]!;
    expect(optimistic.reactionCounts).toMatchObject({ LIKE: 0, LOVE: 1 });
    expect(client.getQueryData<ForumPostView>(["forum", "post", topic.id, "reader"])).toMatchObject({ reactionCount: 4, likeCount: 3, viewCount: 1063, replyCount: 6 });
    const summary: ForumReactionSummary = { reactionCounts: counts({ LOVE: 2 }), viewerReactions: ["LOVE"], reactionUsers: { LOVE: [{ id: "reader", fullName: "Current reader" }] } };
    await act(async () => release({ ...summary, subjectKind: "comment", subjectId: reply.id, reaction: "LOVE", active: true }));
    await settle(() => expect(mutation.isSuccess).toBe(true));
    for (const alias of [topic.id, topic.publicSlug]) expect(client.getQueryData<ForumPostView>(["forum", "post", alias, "reader"])).toMatchObject({ reactionCount: 5, likeCount: 3 });
    expect(client.getQueryData<InfiniteData<ForumCommentsPage>>(["forum", "comments", topic.publicSlug, "reader"])!.pageParams).toEqual([1]);
    expect(client.getQueryData(["forum", "post", topic.id, "another-viewer"])).toEqual(topic);
    expect(client.getQueryData(["forum", "comments", topic.publicSlug, "another-viewer"])).toEqual(replyPages);
    expect(client.getQueryState(["forum", "posts", listParams, "reader"])?.isInvalidated).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(postRequest).not.toHaveBeenCalled(); expect(repliesRequest).not.toHaveBeenCalled(); expect(listRequest).not.toHaveBeenCalled();
  });

  it("restores reaction counts and selections on failure", async () => {
    prime();
    vi.spyOn(forumApi, "react").mockRejectedValue(new Error("Network unavailable"));
    await render(<MutationHarness />);
    await act(async () => mutation.mutate({ kind: "post", id: topic.id, reaction: "LOVE", active: true }));
    await settle(() => expect(mutation.isError).toBe(true));
    expect(client.getQueryData(["forum", "post", topic.id, "reader"])).toEqual(topic);
    expect(client.getQueryData(["forum", "post", topic.publicSlug, "reader"])).toEqual(topic);
    expect(client.getQueryData(["forum", "posts", listParams, "reader"])).toEqual(list);
  });

  it("does not apply a pending viewer's response to the next account", async () => {
    prime(); prime("next-reader");
    let release!: (summary: Awaited<ReturnType<typeof forumApi.react>>) => void;
    vi.spyOn(forumApi, "react").mockReturnValue(new Promise((resolve) => { release = resolve; }));
    await render(<MutationHarness />);
    await act(async () => mutation.mutate({ kind: "post", id: topic.id, reaction: "LOVE", active: true }));
    await settle(() => expect(client.getQueryData<ForumPostView>(["forum", "post", topic.id, "reader"])!.viewerReactions).toEqual(["LOVE"]));
    mocks.viewer = "next-reader";
    await render(<MutationHarness />);
    await act(async () => release({ reactionCounts: counts({ LIKE: 3, LOVE: 1 }), viewerReactions: ["LOVE"], reactionUsers: {}, subjectKind: "post", subjectId: topic.id, reaction: "LOVE", active: true }));
    await settle(() => expect(mutation.isSuccess).toBe(true));
    expect(client.getQueryData(["forum", "post", topic.id, "reader"])).toEqual(topic);
    expect(client.getQueryData(["forum", "post", topic.id, "next-reader"])).toEqual(topic);
    expect(client.getQueryData(["forum", "posts", listParams, "next-reader"])).toEqual(list);
  });
});
