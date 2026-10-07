// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forumApi, type ForumReactionName, type ForumReactionPeople } from "../api/forum.api";
import { FORUM_REACTIONS } from "../utils/forum-reactions";
import { ForumPostLink } from "../components/forum-post-link";
import { ForumStatPopover } from "../components/forum-stat-popover";
import { ForumViewsPopoverContent } from "../components/forum-views-popover";
import { ForumReactorsPopover } from "../components/forum-reactors-popover";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
const counts = Object.fromEntries(FORUM_REACTIONS.map(({ value }) => [value, value === "LIKE" ? 21 : value === "AGREE" ? 1 : 0])) as Record<ForumReactionName, number>;
const people: ForumReactionPeople["data"] = Array.from({ length: 22 }, (_, index) => ({ id: `reaction-${index}`, reaction: index === 21 ? "AGREE" : "LIKE", user: { id: `reader-${index}`, fullName: `Reader ${index}` } }));
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  window.history.replaceState({}, "", "/forum/view-test");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); client.clear(); document.querySelectorAll("[data-test-post]").forEach((node) => node.remove()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const waitForUI = async (assertion: () => void) => vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); assertion(); });
const render = async (children: React.ReactNode) => act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter></QueryClientProvider>));

describe("Forum replies and floating statistics", () => {
  it("prevents full navigation when jumping to a loaded reply and preserves the address", async () => {
    const node = document.createElement("article"); node.id = "reply-2"; node.dataset.testPost = "true"; node.tabIndex = -1; node.scrollIntoView = vi.fn(); document.body.append(node);
    await render(<ForumPostLink post={{ id: "topic", publicSlug: "view-test" }} postNumber={2} targetId={node.id}>2 replies</ForumPostLink>);
    const link = container.querySelector("a")!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    await act(async () => link.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(node.scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
    expect(document.activeElement).toBe(node);
    expect(window.location.pathname).toBe("/forum/view-test");
    expect(link.getAttribute("href")).toBe("/forum/view-test/2");
  });
  it("delegates an unloaded reply to pagination without navigating the page", async () => {
    const jump = vi.fn();
    await render(<ForumPostLink post={{ id: "view-test" }} postNumber={27} targetId="reply-27" onJump={jump}>Read reply</ForumPostLink>);
    await act(async () => container.querySelector("a")!.click());
    expect(jump).toHaveBeenCalledWith(27);
    expect(window.location.pathname).toBe("/forum/view-test");
  });
  it("fetches real recent views on demand, presents accessible daily values and restores focus on Escape", async () => {
    const request = vi.spyOn(forumApi, "recentViews").mockResolvedValue({ daily: [{ date: "2026-09-30", count: 30 }, { date: "2026-10-01", count: 23 }, { date: "2026-10-02", count: 5 }], trackingStartedAt: "2026-09-30T00:00:00Z", cooldownHours: 8, timeZone: "UTC" });
    await render(<ForumStatPopover trigger="59 Views" label="Recent views"><ForumViewsPopoverContent postId="topic" /></ForumStatPopover>);
    expect(request).not.toHaveBeenCalled();
    const trigger = container.querySelector("button")!;
    await act(async () => trigger.click());
    await waitForUI(() => expect(document.querySelectorAll('[role="dialog"] tbody td')).toHaveLength(3));
    expect([...document.querySelectorAll('[role="dialog"] tbody td')].map((node) => node.textContent)).toEqual(["30", "23", "5"]);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("8 hours");
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(window.location.pathname).toBe("/forum/view-test");
  });
  it("paginates the full people list and switches reaction filters without leaving the popover", async () => {
    const request = vi.spyOn(forumApi, "reactionPeople").mockImplementation(async (_target, reaction, page = 1) => {
      const rows = reaction ? people.filter((person) => person.reaction === reaction) : people;
      return { data: rows.slice((page - 1) * 20, page * 20), counts, meta: { page, pageSize: 20, total: rows.length, totalPages: Math.ceil(rows.length / 20) } };
    });
    await render(<ForumReactorsPopover target={{ scope: "topic", id: "topic" }} counts={counts} trigger="22 Reactions" />);
    await act(async () => container.querySelector("button")!.click());
    await waitForUI(() => expect(document.querySelectorAll('.forum-reactor-row')).toHaveLength(20));
    expect(request).toHaveBeenCalledWith({ scope: "topic", id: "topic" }, undefined, 1);
    await act(async () => document.querySelector<HTMLButtonElement>('.forum-reactor-more')!.click());
    await waitForUI(() => expect(document.querySelectorAll('.forum-reactor-row')).toHaveLength(22));
    const agree = document.querySelector<HTMLButtonElement>('[role="tab"][aria-label="Agree 1"]')!;
    await act(async () => agree.click());
    await waitForUI(() => expect(document.querySelectorAll('.forum-reactor-row')).toHaveLength(1));
    expect(document.querySelector('.forum-reactor-row')?.textContent).toContain("Reader 21");
    expect(agree.getAttribute("aria-selected")).toBe("true");
    expect(window.location.pathname).toBe("/forum/view-test");
  });
  it("keeps a failed views request inside the popover and retries without a reload", async () => {
    const request = vi.spyOn(forumApi, "recentViews").mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ daily: [{ date: "2026-10-02", count: 1 }], trackingStartedAt: "2026-10-02T00:00:00Z", cooldownHours: 8, timeZone: "UTC" });
    await render(<ForumStatPopover trigger="Views" label="Recent views"><ForumViewsPopoverContent postId="topic" /></ForumStatPopover>);
    await act(async () => container.querySelector("button")!.click());
    await waitForUI(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain("Could not load recent views."));
    await act(async () => document.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    await waitForUI(() => expect(document.querySelectorAll('[role="dialog"] tbody td')).toHaveLength(1));
    expect(request).toHaveBeenCalledTimes(2);
    expect(window.location.pathname).toBe("/forum/view-test");
  });
});
