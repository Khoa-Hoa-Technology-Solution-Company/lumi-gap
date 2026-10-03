// @vitest-environment jsdom
import { act, Profiler } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForumThreadDiscoveryView } from "../components/forum-thread-discovery";
import { ForumThreadTimeline } from "../components/forum-thread-timeline";
import type { ForumDiscovery, ForumDiscoveryTopic } from "../api/forum.api";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
const date = "2026-09-20T00:00:00Z";
const topic: ForumDiscoveryTopic = { id: "suggested", publicSlug: "ocean-currents", title: "Ocean currents", type: "DISCUSSION", replyCount: 2, viewCount: 31, createdAt: date, lastActivityAt: date, community: { id: "community", slug: "data-science", name: "Data Science" }, reason: "SAME_COMMUNITY" };
const data: ForumDiscovery = { suggested: [topic], related: [{ ...topic, id: "related", publicSlug: "redshift", title: "Redshift measurement", reason: "SHARED_TAGS" }] };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { fn(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); document.querySelectorAll("[data-test-post]").forEach((node) => node.remove()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Forum Suggested / Related navigation", () => {
  it("renders actual topic routes and counts, switches tabs with click and keyboard", async () => {
    await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ForumThreadDiscoveryView data={data} onRetry={vi.fn()} /></MemoryRouter>));
    expect(container.querySelector('a[href="/forum/ocean-currents"]')).not.toBeNull();
    expect(container.querySelector("tbody")?.textContent).toContain("31");
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    await act(async () => tabs[1]!.click());
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('a[href="/forum/redshift"]')).not.toBeNull();
    expect(container.textContent).toContain("Shared research tags");
    await act(async () => tabs[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[0]);
    await act(async () => tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(tabs[1]);
    expect(container.textContent).toContain("not scientific evidence");
  });
  it("has honest loading, error/retry and empty states without invented topics", async () => {
    const retry = vi.fn();
    await act(async () => root.render(<ForumThreadDiscoveryView loading onRetry={retry} />));
    expect(container.querySelector('[aria-label="Loading discussions"]')).not.toBeNull();
    expect(container.querySelector("table")).toBeNull();
    await act(async () => root.render(<ForumThreadDiscoveryView error onRetry={retry} />));
    await act(async () => container.querySelector<HTMLButtonElement>('button:not([role="tab"])')!.click());
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<ForumThreadDiscoveryView data={{ suggested: [], related: [] }} onRetry={retry} />));
    expect(container.textContent).toContain("No other discussions in this community yet.");
  });
});

describe("Forum timeline truthfulness and interaction", () => {
  it("moves fractional reading progress without committing React renders on every scroll frame", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return 1; });
    const positions = [100, 700];
    const nodes = ["opening-post", "reply-1"].map((id, index) => {
      const node = document.createElement("article"); node.id = id; node.dataset.testPost = "true"; document.body.append(node);
      vi.spyOn(node, "getBoundingClientRect").mockImplementation(() => ({ top: positions[index] } as DOMRect));
      return node;
    });
    const committed = vi.fn();
    await act(async () => root.render(<Profiler id="timeline" onRender={committed}><ForumThreadTimeline postIds={nodes.map((node) => node.id)} total={2} createdAt={date} lastActivityAt={date} /></Profiler>));
    const commitsBefore = committed.mock.calls.length;
    const marker = container.querySelector<HTMLElement>(".forum-timeline-position")!;
    const start = marker.style.transform;
    const range = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    const startValue = Number(range.value);
    for (let frame = 0; frame < 20; frame += 1) await act(async () => {
      positions[0]! -= 2; positions[1]! -= 2;
      window.dispatchEvent(new Event("scroll")); frames.shift()!(frame);
    });
    expect(marker.style.transform).not.toBe(start);
    expect(Number(range.value)).toBeGreaterThan(startValue);
    expect(range.getAttribute("aria-valuetext")).toBe("Post 1 / 2");
    expect(committed).toHaveBeenCalledTimes(commitsBefore);
  });
  it.each(["/forum/continuous-reading", "/forum/continuous-reading/1?from=following", "/forum/continuous-reading/7"])("updates reading progress without changing the URL %s", async (url) => {
    window.history.replaceState({ key: "reading-session" }, "", url);
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");
    const nodes = ["opening-post", "reply-3", "reply-7"].map((id) => { const node = document.createElement("article"); node.id = id; node.dataset.testPost = "true"; document.body.append(node); return node; });
    const positions = [10, 500, 900];
    nodes.forEach((node, index) => vi.spyOn(node, "getBoundingClientRect").mockImplementation(() => ({ top: positions[index] } as DOMRect)));
    await act(async () => root.render(<ForumThreadTimeline postIds={nodes.map((node) => node.id)} total={3} createdAt={date} lastActivityAt={date} />));
    expect(container.querySelector('input[type="range"]')?.getAttribute("aria-valuetext")).toBe("Post 1 / 3");
    positions[1] = 20;
    positions[2] = Math.max(120, window.innerHeight * 0.2) + 0.5;
    await act(async () => window.dispatchEvent(new Event("scroll")));
    expect(`${window.location.pathname}${window.location.search}`).toBe(url);
    expect(window.history.state).toEqual({ key: "reading-session" });
    expect(replaceState).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="range"]')?.getAttribute("aria-valuetext")).toBe("Post 3 / 3");
  });
  it("collapses a single opening post without a fake scroll rail or repeated dates", () => {
    const markup = renderToStaticMarkup(<ForumThreadTimeline postIds={["opening-post"]} total={1} createdAt={date} lastActivityAt={date} />);
    expect(markup).toContain("Opening post");
    expect(markup).not.toContain('type="range"');
    expect(markup).not.toContain("1 / 1");
    expect(markup).toContain("2026");
    expect(markup).not.toContain("Last activity");
  });
  it("does not offer a fake latest jump while the initial replies are loading", () => {
    const markup = renderToStaticMarkup(<ForumThreadTimeline postIds={["opening-post"]} total={2} createdAt={date} lastActivityAt={date} loadingMore />);
    expect(markup).toContain("Loading…");
    expect(markup).toContain("loaded");
    expect(markup).not.toContain("Jump to latest post");
  });
  it("reads fresh scroll positions, clamps removed posts and scrubs only loaded posts without stealing focus", async () => {
    const nodes = ["opening-post", "reply-1", "reply-2"].map((id) => { const node = document.createElement("article"); node.id = id; node.dataset.testPost = "true"; node.tabIndex = -1; document.body.append(node); return node; });
    const positions = [100, 500, 900];
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    nodes.forEach((node, index) => { vi.spyOn(node, "getBoundingClientRect").mockImplementation(() => ({ top: positions[index] } as DOMRect)); node.scrollIntoView = vi.fn(); });
    await act(async () => root.render(<ForumThreadTimeline postIds={nodes.map((node) => node.id)} total={30} createdAt={date} lastActivityAt={date} hasMore onLoadMore={vi.fn()} />));
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(slider.max).toBe("3");
    expect(container.textContent).toContain("3 / 30 loaded");
    positions[1] = 100; positions[2] = 500;
    await act(async () => window.dispatchEvent(new Event("scroll")));
    expect(Math.floor(Number(slider.value))).toBe(2);
    expect(slider.getAttribute("aria-valuetext")).toBe("Post 2 / 30");
    slider.focus();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "3");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(scrollTo).toHaveBeenCalledWith({ behavior: "instant", top: positions[2]! - Math.max(120, window.innerHeight * 0.2) });
    expect(document.activeElement).toBe(slider);
    await act(async () => root.render(<ForumThreadTimeline postIds={["opening-post", "reply-1"]} total={2} createdAt={date} lastActivityAt={date} />));
    expect(slider.max).toBe("2"); expect(slider.value).toBe("2");
    expect(container.textContent).toContain("2 / 2");
  });
});
