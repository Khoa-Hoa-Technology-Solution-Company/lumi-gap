// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PageLoading } from "./page-loading";
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("shows visible loading feedback immediately instead of a screen-reader-only placeholder", async () => {
  await act(async () => root.render(<PageLoading />));
  expect(container.querySelector('[role="status"]')!.getAttribute("aria-busy")).toBe("true");
  const label = container.querySelector('p')!;
  expect(label.textContent).toBe("Loading page..."); expect(label.closest('.sr-only')).toBeNull();
  expect(container.querySelector('button')).toBeNull();
});
it("offers recovery when the page takes too long and clears its timer on leaving", async () => {
  await act(async () => root.render(<PageLoading />));
  await act(async () => { await vi.advanceTimersByTimeAsync(12000); });
  expect(container.querySelector('button')!.textContent).toBe("Retry");
  await act(async () => root.render(<div>Loaded route</div>));
  expect(vi.getTimerCount()).toBe(0); expect(container.textContent).toBe("Loaded route");
});
