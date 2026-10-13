// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeFeaturedPapers } from "../components/home-featured-papers";

const mocks = vi.hoisted(() => ({ reduced: false, overflow: true, refetch: vi.fn() }));
vi.mock("../hooks/use-home-featured-papers", () => ({ useHomeFeaturedPapers: () => ({
  data: { papers: [1, 2, 3, 4].map((id) => ({ id: `paper/${id}`, title: `Research ${id}`, authors: [], topics: [], publicationYear: 2026, citationCount: id * 10, primaryProvider: "openalex" })) },
  isLoading: false, isError: false, refetch: mocks.refetch,
}) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, unknown>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }) }));

let root: Root;
let container: HTMLDivElement;
let rail: HTMLUListElement;
const scrollTo = vi.fn();
const scrollBy = vi.fn();
async function render() {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><HomeFeaturedPapers /></MemoryRouter>));
  rail = container.querySelector("ul")!;
}
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
async function advance() { await act(async () => vi.advanceTimersByTime(4500)); }
beforeEach(() => {
  vi.useFakeTimers(); mocks.reduced = false; mocks.overflow = true;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", undefined); vi.stubGlobal("IntersectionObserver", undefined);
  vi.stubGlobal("matchMedia", () => ({ matches: mocks.reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(() => mocks.overflow ? 1800 : 600);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(360);
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
  Object.defineProperty(HTMLElement.prototype, "scrollBy", { configurable: true, value: scrollBy });
});
afterEach(async () => {
  await act(async () => root?.unmount()); container?.remove();
  vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollBy;
});

describe("Featured paper scrolling", () => {
  it("advances automatically, wraps at the end and honors the pause control", async () => {
    await render(); await advance();
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 380, behavior: "smooth" });
    rail.scrollLeft = 1200; await advance();
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" });
    await act(async () => button("Pause automatic scrolling").click());
    scrollTo.mockClear(); await advance(); expect(scrollTo).not.toHaveBeenCalled();
    expect(button("Resume automatic scrolling")).not.toBeNull();
  });
  it("pauses on keyboard focus and manual navigation", async () => {
    await render();
    await act(async () => container.querySelector<HTMLAnchorElement>('.home-featured-paper')!.focus());
    await advance(); expect(scrollTo).not.toHaveBeenCalled();
    await act(async () => button("Next papers").click());
    expect(scrollBy).toHaveBeenCalledWith({ left: 380, behavior: "smooth" });
    expect(button("Resume automatic scrolling")).not.toBeNull();
    expect(container.querySelector('.home-featured-paper')?.getAttribute('href')).toBe('/papers/paper%2F1');
  });
  it("pauses while the pointer is over the papers", async () => {
    await render();
    const event = new MouseEvent("pointerover", { bubbles: true }); Object.defineProperty(event, "pointerType", { value: "mouse" });
    await act(async () => container.querySelector('.home-featured-content')!.dispatchEvent(event));
    await advance(); expect(scrollTo).not.toHaveBeenCalled();
  });
  it("respects reduced motion while keeping manual scrolling available", async () => {
    mocks.reduced = true; await render(); await advance(); expect(scrollTo).not.toHaveBeenCalled();
    expect(button("Resume automatic scrolling").disabled).toBe(true);
    await act(async () => button("Next papers").click());
    expect(scrollBy).toHaveBeenCalledWith({ left: 380, behavior: "instant" });
  });
  it("does not scroll or offer active controls when the papers fit", async () => {
    mocks.overflow = false; await render(); await advance(); expect(scrollTo).not.toHaveBeenCalled();
    expect(button("Next papers").disabled).toBe(true);
    expect(button("Pause automatic scrolling").disabled).toBe(true);
  });
});
