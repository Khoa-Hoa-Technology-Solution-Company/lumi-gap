// @vitest-environment jsdom
import { act, lazy, Suspense, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteTransition } from "../route-transition";

let container: HTMLDivElement;
let root: Root;
const animate = vi.fn(() => ({ cancel: vi.fn() }));
const scroll = vi.fn();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("scrollTo", scroll);
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  animate.mockClear();
  scroll.mockClear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  vi.unstubAllGlobals();
});

function ReadingPage() {
  const [draft, setDraft] = useState("Original draft");
  return <RouteTransition><aside>Forum navigation</aside><div className="forum-content"><input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} /><Link to="/second">Next page</Link><Link to="?feed=popular#replies">Filter and anchor</Link><Link to="/third#replies">Deep link</Link><Link to="/forum/example/2">Reply permalink</Link></div></RouteTransition>;
}

describe("Route transitions", () => {
  it("animates only the reading surface without remounting drafts or replaying on query/hash changes", async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={["/first"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ReadingPage /></MemoryRouter>));
    const input = container.querySelector("input")!;
    expect(animate.mock.instances[0]).toBe(container.querySelector(".forum-content"));
    expect(scroll).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/second"]')!.click());
    expect(animate).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("Original draft");
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href*="feed=popular"]')!.click());
    expect(animate).toHaveBeenCalledTimes(2);
    expect(container.querySelector("input")).toBe(input);
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/third#replies"]')!.click());
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/forum/example/2"]')!.click());
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("keeps the current page visible while the destination's lazy module loads", async () => {
    let finish!: (module: { default: () => JSX.Element }) => void;
    const Destination = lazy(() => new Promise<{ default: () => JSX.Element }>((resolve) => { finish = resolve; }));
    await act(async () => root.render(<MemoryRouter initialEntries={["/first"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Suspense fallback={<p>Blank loading replacement</p>}><RouteTransition><Routes><Route path="/first" element={<Link to="/second">Current page</Link>} /><Route path="/second" element={<Destination />} /></Routes></RouteTransition></Suspense></MemoryRouter>));
    await act(async () => container.querySelector<HTMLAnchorElement>("a")!.click());
    expect(container.textContent).toBe("Current page");
    await act(async () => finish({ default: () => <p>Destination ready</p> }));
    expect(container.textContent).toBe("Destination ready");
  });

  it("honors reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ReadingPage /></MemoryRouter>));
    expect(animate).not.toHaveBeenCalled();
  });

  it("keeps the project navigator stationary while switching projects and does not replay for sections", async () => {
    function Workspace() { return <><aside>Project navigator</aside><div className="project-browser-panel"><Outlet /></div></>; }
    function Project() { return <><Link to="/projects/second">Second project</Link><Link to="?tab=members">Members</Link></>; }
    await act(async () => root.render(<MemoryRouter initialEntries={["/projects/first"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><RouteTransition><Routes><Route path="/projects" element={<Workspace />}><Route path=":id" element={<Project />} /></Route></Routes></RouteTransition></MemoryRouter>));
    const sidebar = container.querySelector("aside");
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/projects/second"]')!.click());
    expect(animate.mock.instances.at(-1)).toBe(container.querySelector(".project-browser-panel"));
    expect(container.querySelector("aside")).toBe(sidebar);
    const count = animate.mock.calls.length;
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href$="?tab=members"]')!.click());
    expect(animate).toHaveBeenCalledTimes(count);
  });

  it("enters a project and returns in opposite directions without replaying on project tab changes", async () => {
    function Project() { const navigate = useNavigate(); return <div className="project-detail-page"><Link to="?tab=members">Members</Link><button onClick={() => navigate(-1)}>Back</button></div>; }
    await act(async () => root.render(<MemoryRouter initialEntries={["/projects"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><RouteTransition><Routes><Route path="/projects" element={<div className="project-directory-page"><Link to="/projects/example">Project</Link></div>} /><Route path="/projects/:id" element={<Project />} /></Routes></RouteTransition></MemoryRouter>));
    await act(async () => container.querySelector<HTMLAnchorElement>("a")!.click());
    expect(animate).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ transform: "translateX(14px)" })]), expect.anything());
    expect(animate.mock.instances.at(-1)).toBe(container.querySelector(".project-detail-page"));
    expect(scroll).toHaveBeenCalledOnce();
    const count = animate.mock.calls.length;
    await act(async () => container.querySelector<HTMLAnchorElement>("a")!.click());
    expect(animate).toHaveBeenCalledTimes(count);
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(animate).toHaveBeenCalledTimes(count);
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(animate).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ transform: "translateX(-14px)" })]), expect.anything());
    expect(animate.mock.instances.at(-1)).toBe(container.querySelector(".project-directory-page"));
    expect(scroll).toHaveBeenCalledOnce();
  });
});
