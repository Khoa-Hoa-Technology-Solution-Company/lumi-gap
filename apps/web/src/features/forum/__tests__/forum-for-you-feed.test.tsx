// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ForumListPage } from "@/pages/forum/forum-list";
import { personalizationApi } from "@/features/personalization";
import { forumApi } from "../api/forum.api";
import { forumCategoryApi } from "../api/forum-category.api";

const mocks = vi.hoisted(() => ({ authed: true }));
vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string, values?: Record<string, string | number>) => Object.entries(values ?? {}).reduce((text, [name, value]) => text.replace(`{{${name}}}`, String(value)), key), language: "en" }),
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: mocks.authed ? { id: "reader", fullName: "Reader" } : null, tokens: mocks.authed ? { accessToken: "test-only" } : null }),
}));

const emptyList = { data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } };
const feedData = { postsBasis: "none" as const, papersBasis: "none" as const, posts: [], papers: [] };

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let posts: MockInstance<typeof forumApi.posts>;
let forYou: MockInstance<typeof personalizationApi.forYou>;

function Where() {
  const location = useLocation();
  return <p data-testid="where" data-nav={useNavigationType()}>{location.pathname}{location.search}</p>;
}

let renders = 0;
/** Every call mounts a fresh router, so `path` is the real starting URL. */
async function renderAt(path: string) {
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter key={++renders} initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Where />
        <Routes>
          <Route path="/forum" element={<ForumListPage />} />
          <Route path="/forum/category/:categorySlug" element={<ForumListPage />} />
          <Route path="/login" element={<p>login page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  ));
  await flush();
}
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const where = () => container.querySelector("[data-testid='where']")!.textContent;
const tabs = () => Array.from(container.querySelectorAll<HTMLAnchorElement>(".forum-topic-feeds a"));
const sidebar = () => container.querySelector("nav[aria-label='Forum navigation']")!;
const current = () => tabs().filter((tab) => tab.getAttribute("aria-current") === "page").map((tab) => tab.textContent);

beforeEach(() => {
  mocks.authed = true;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(forumCategoryApi, "list").mockResolvedValue([{ id: "se", slug: "software-engineering", name: "Software Engineering", description: "", status: "ACTIVE", sortOrder: 0 }]);
  posts = vi.spyOn(forumApi, "posts").mockResolvedValue(emptyList as never);
  forYou = vi.spyOn(personalizationApi, "forYou").mockResolvedValue(feedData);
  vi.spyOn(personalizationApi, "communities").mockResolvedValue([]);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
});

describe("forum For you feed (6)", () => {
  it("the default feed is Latest and the personalised feed is not requested", async () => {
    await renderAt("/forum");
    expect(current()).toEqual(["Latest"]);
    expect(posts).toHaveBeenCalledWith(expect.objectContaining({ sort: "latest" }), expect.anything());
    expect(forYou).not.toHaveBeenCalled();
    // For you sits right after Latest
    expect(tabs().map((tab) => tab.textContent).slice(0, 3)).toEqual(["Latest", "For you", "Unanswered"]);
  });

  it("a guest sees no For you entry, and ?feed=for-you redirects to sign-in coming back to the feed", async () => {
    mocks.authed = false;
    await renderAt("/forum");
    expect(tabs().map((tab) => tab.textContent)).not.toContain("For you");
    expect(Array.from(sidebar().querySelectorAll("a")).map((link) => link.textContent)).not.toContain("For you");
    await renderAt("/forum?feed=for-you");
    expect(where()).toBe("/login?returnTo=%2Fforum%3Ffeed%3Dfor-you");
    expect(forYou).not.toHaveBeenCalled();
    expect(posts).not.toHaveBeenCalledWith(expect.objectContaining({ sort: "for-you" }), expect.anything());
  });

  it("selecting For you strips type, search and paging; the list API is not called and the filters disappear", async () => {
    await renderAt("/forum?type=QUESTION&q=gnn&page=2&pageSize=30&feed=popular");
    const tab = tabs().find((item) => item.textContent === "For you")!;
    expect(tab.getAttribute("href")).toBe("/forum?feed=for-you");
    posts.mockClear();
    await act(async () => tab.click());
    await flush();
    expect(where()).toBe("/forum?feed=for-you");
    expect(forYou).toHaveBeenCalledWith(20, expect.anything());
    expect(posts).not.toHaveBeenCalled();
    expect(current()).toEqual(["For you"]);
    expect(container.querySelector("select[aria-label='Category']")).toBeNull();
    expect(container.querySelector("select[aria-label='Thread type']")).toBeNull();
    expect(container.querySelector("#forum-list-search")).toBeNull();
    expect(container.querySelector(".forum-topic-head")).toBeNull();
    expect(container.querySelector("nav[aria-label='Pagination'], .forum-pagination")).toBeNull();
    // the feed itself is there, never blank
    expect(container.querySelector("[data-testid='for-you-empty']")).not.toBeNull();
  });

  it("the sidebar For you link drops a category too", async () => {
    await renderAt("/forum?category=software-engineering&type=QUESTION&q=gnn&page=2");
    const entry = Array.from(sidebar().querySelectorAll<HTMLAnchorElement>("a")).find((link) => link.textContent === "For you")!;
    expect(entry.getAttribute("href")).toBe("/forum?feed=for-you");
    await act(async () => entry.click());
    await flush();
    expect(where()).toBe("/forum?feed=for-you");
    expect(forYou).toHaveBeenCalledWith(20, expect.anything());
  });

  it("the category route has no For you tab, while the sidebar entry exists with the stripped link", async () => {
    await renderAt("/forum/category/software-engineering");
    expect(tabs().map((tab) => tab.textContent)).not.toContain("For you");
    const entry = Array.from(sidebar().querySelectorAll<HTMLAnchorElement>("a")).find((link) => link.textContent === "For you")!;
    expect(entry.getAttribute("href")).toBe("/forum?feed=for-you");
    // a category in the query string scopes the tab bar the same way
    await renderAt("/forum?category=software-engineering");
    expect(tabs().map((tab) => tab.textContent)).not.toContain("For you");
  });

  it("a URL that mixes For you with a category or filter is normalised with replace, and the feed survives the normalising effect", async () => {
    for (const path of ["/forum?feed=for-you&category=software-engineering", "/forum/category/software-engineering?feed=for-you", "/forum?feed=for-you&type=QUESTION&page=2&q=x"]) {
      await renderAt(path);
      await flush();
      expect(where(), path).toBe("/forum?feed=for-you");
      expect(container.querySelector("[data-testid='where']")!.getAttribute("data-nav"), path).toBe("REPLACE");
      expect(current(), path).toEqual(["For you"]);
    }
    // landing directly on the clean URL keeps the feed too
    await renderAt("/forum?feed=for-you");
    await flush();
    expect(where()).toBe("/forum?feed=for-you");
    expect(current()).toEqual(["For you"]);
  });

  it("choosing a category on For you from the sidebar switches to Latest", async () => {
    await renderAt("/forum?feed=for-you");
    const category = Array.from(sidebar().querySelectorAll<HTMLAnchorElement>("a")).find((link) => link.textContent === "Software Engineering")!;
    expect(category.getAttribute("href")).toBe("/forum?category=software-engineering");
    await act(async () => category.click());
    await flush();
    expect(where()).toBe("/forum?category=software-engineering");
    expect(current()).toEqual(["Latest"]);
    expect(posts).toHaveBeenLastCalledWith(expect.objectContaining({ category: "software-engineering" }), expect.anything());
    // and a thread type does the same
    await renderAt("/forum?feed=for-you");
    const type = Array.from(sidebar().querySelectorAll<HTMLAnchorElement>("a")).find((link) => link.textContent === "Questions")!;
    expect(type.getAttribute("href")).toBe("/forum?type=QUESTION");
  });

  it("the For you feed does not refetch on window focus or visibility change, and refreshes when the tab is entered again", async () => {
    await renderAt("/forum?feed=for-you");
    expect(forYou).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    await flush();
    expect(forYou).toHaveBeenCalledTimes(1);
    // leave for Latest and come back: the remount refetches although the data is younger than five minutes
    await act(async () => tabs().find((tab) => tab.textContent === "Latest")!.click());
    await flush();
    await act(async () => tabs().find((tab) => tab.textContent === "For you")!.click());
    await flush();
    expect(forYou).toHaveBeenCalledTimes(2);
  });
});
