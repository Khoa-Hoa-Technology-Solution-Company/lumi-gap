// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectSectionContent } from "../components/project-section-content";
import type { ProjectTab } from "../components/project-section-nav";

let container: HTMLDivElement;
let root: Root;
const animate = vi.fn(() => ({ cancel: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  animate.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  vi.unstubAllGlobals();
});
async function render(tab: ProjectTab, children: ReactNode = <p>{tab}</p>) {
  await act(async () => root.render(<><header>Project title</header><ProjectSectionContent activeTab={tab}>{children}</ProjectSectionContent></>));
}

it("keeps initial content and same-section draft updates stationary", async () => {
  await render("reports", <input defaultValue="Draft proposal" />);
  const input = container.querySelector("input")!;
  input.value = "My unsaved edits";
  await render("reports", <><input defaultValue="Draft proposal" /><p>Background data refreshed</p></>);
  expect(container.querySelector("input")).toBe(input);
  expect(input.value).toBe("My unsaved edits");
  expect(animate).not.toHaveBeenCalled();
  await render("gaps");
  expect(animate).toHaveBeenCalledOnce();
  expect(animate.mock.instances[0]).toBe(container.querySelector(".project-workspace-content"));
});

it("cancels in-progress motion on rapid switches without delaying the next section", async () => {
  await render("papers");
  await render("members");
  const first = animate.mock.results[0]!.value;
  await render("chat");
  expect(first.cancel).toHaveBeenCalledOnce();
  expect(container.querySelector(".project-workspace-content")?.textContent).toBe("chat");
  expect(animate).toHaveBeenCalledTimes(2);
});

it("changes sections immediately when reduced motion is requested", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  await render("papers");
  await render("submissions");
  expect(container.textContent).toContain("submissions");
  expect(animate).not.toHaveBeenCalled();
});

it("still switches sections when the animation API is unavailable", async () => {
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  await render("papers");
  await render("support");
  expect(container.textContent).toContain("support");
});
