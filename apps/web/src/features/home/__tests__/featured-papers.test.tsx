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
let rail: HTMLDivElement;
const scrollBy = vi.fn();
type TestAnimation = {
  currentTime: number;
  effect: { getComputedTiming: () => { progress: number } };
  cancel: ReturnType<typeof vi.fn>;
};
const animations: TestAnimation[] = [];
const animate = vi.fn((_frames: Keyframe[], options: KeyframeAnimationOptions) => {
  const duration = Number(options.duration);
  let offset = 0;
  let start = Date.now();
  let cancelled = false;
  const animation: TestAnimation = {
    get currentTime() { return offset + (cancelled ? 0 : Date.now() - start); },
    set currentTime(value: number) { offset = value; start = Date.now(); },
    effect: { getComputedTiming: () => {
      const iteration = animation.currentTime / duration;
      const progress = iteration % 1;
      return { progress: Math.floor(iteration) % 2 === 0 ? progress : 1 - progress };
    } },
    cancel: vi.fn(() => { offset = animation.currentTime; cancelled = true; }),
  };
  animations.push(animation);
  return animation;
});
async function render() {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><HomeFeaturedPapers /></MemoryRouter>));
  rail = container.querySelector(".home-featured-viewport")!;
}
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
async function advance(time = 1000) { await act(async () => vi.advanceTimersByTime(time)); }
async function pointer(type: "pointerover" | "pointerout") {
  const event = new MouseEvent(type, { bubbles: true, relatedTarget: document.body });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  await act(async () => container.querySelector('.home-featured-content')!.dispatchEvent(event));
}
beforeEach(() => {
  vi.useFakeTimers(); mocks.reduced = false; mocks.overflow = true;
  animations.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", undefined); vi.stubGlobal("IntersectionObserver", undefined);
  vi.stubGlobal("matchMedia", () => ({ matches: mocks.reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(() => mocks.overflow ? 1800 : 600);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(360);
  Object.defineProperty(HTMLElement.prototype, "scrollBy", { configurable: true, value: scrollBy });
  scrollBy.mockImplementation(function (this: HTMLElement, options: ScrollToOptions) { this.scrollLeft += options.left ?? 0; });
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
});
afterEach(async () => {
  await act(async () => root?.unmount()); container?.remove();
  vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollBy;
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

describe("Featured paper scrolling", () => {
  it("uses a slow browser animation without per-frame native scrolling or an Auto scroll control", async () => {
    await render(); await advance();
    expect(animate).toHaveBeenCalledOnce();
    expect(animate.mock.calls[0]![0]).toEqual([{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(-1200px, 0, 0)" }]);
    expect(animate.mock.calls[0]![1]).toMatchObject({ easing: "linear", iterations: Infinity, direction: "alternate" });
    expect(animations[0]!.effect.getComputedTiming().progress * 1200).toBeCloseTo(18);
    expect(rail.scrollLeft).toBe(0);
    expect(button("Pause automatic scrolling")).toBeNull();
    expect(button("Resume automatic scrolling")).toBeNull();
    expect(container.textContent).not.toContain("Auto scroll");
  });
  it("retains the reverse direction and position when pausing near the end", async () => {
    await render();
    animations[0]!.currentTime = Number(animate.mock.calls[0]![1].duration) + 1000;
    await pointer("pointerover");
    expect(rail.scrollLeft).toBeGreaterThan(1175);
    expect(rail.scrollLeft).toBeLessThan(1195);
    const before = rail.scrollLeft;
    await pointer("pointerout"); await advance(); await pointer("pointerover");
    expect(rail.scrollLeft).toBeCloseTo(before - 18);
  });
  it("pauses on keyboard focus and manual navigation", async () => {
    await render();
    await act(async () => container.querySelector<HTMLAnchorElement>('.home-featured-paper')!.focus());
    await advance(); expect(rail.scrollLeft).toBe(0);
    await act(async () => button("Next papers").click());
    expect(scrollBy).toHaveBeenCalledWith({ left: 380, behavior: "smooth" });
    await advance(6000); expect(rail.scrollLeft).toBe(380);
    expect(container.querySelector('.home-featured-paper')?.getAttribute('href')).toBe('/papers/paper%2F1');
  });
  it("pauses while the pointer is over the papers and resumes when it leaves", async () => {
    await render(); await advance(500);
    await pointer("pointerover");
    expect(animations[0]!.cancel).toHaveBeenCalledOnce();
    expect(rail.scrollLeft).toBeCloseTo(9);
    await advance(); expect(rail.scrollLeft).toBeCloseTo(9);
    await pointer("pointerout"); await advance(); await pointer("pointerover");
    expect(rail.scrollLeft).toBeCloseTo(27);
  });
  it("waits until a touch finishes, then resumes after the reading delay", async () => {
    await render();
    const content = container.querySelector('.home-featured-content')!;
    await act(async () => content.dispatchEvent(new Event("touchstart", { bubbles: true })));
    await advance(6000); expect(rail.scrollLeft).toBe(0);
    await act(async () => content.dispatchEvent(new Event("touchend", { bubbles: true })));
    await advance(5000); expect(rail.scrollLeft).toBe(0);
    await advance(); await pointer("pointerover"); expect(rail.scrollLeft).toBeCloseTo(18);
  });
  it("respects reduced motion while keeping manual scrolling available", async () => {
    mocks.reduced = true; await render(); await advance(); expect(rail.scrollLeft).toBe(0);
    expect(animate).not.toHaveBeenCalled();
    await act(async () => button("Next papers").click());
    expect(scrollBy).toHaveBeenCalledWith({ left: 380, behavior: "instant" });
  });
  it("does not scroll or offer active controls when the papers fit", async () => {
    mocks.overflow = false; await render(); await advance(); expect(rail.scrollLeft).toBe(0);
    expect(animate).not.toHaveBeenCalled();
    expect(button("Next papers").disabled).toBe(true);
    expect(button("Previous papers").disabled).toBe(true);
  });
});
