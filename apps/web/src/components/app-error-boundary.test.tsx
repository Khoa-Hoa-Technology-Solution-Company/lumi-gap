// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./app-error-boundary";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.documentElement.lang = "en"; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function BrokenPage(): never { throw new Error("Internal diagnostic detail"); }

it("preserves the normal application when rendering succeeds", async () => {
  await act(async () => root.render(<AppErrorBoundary><h1>Home workspace</h1></AppErrorBoundary>));
  expect(container.textContent).toBe("Home workspace"); expect(container.querySelector('[role="alert"]')).toBeNull();
});
it("offers a retry without exposing an internal error or replacing the session", async () => {
  const retry = vi.fn(); document.documentElement.lang = "vi";
  await act(async () => root.render(<AppErrorBoundary onRetry={retry}><BrokenPage /></AppErrorBoundary>));
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).toContain("Chưa thể hiển thị trang này");
  expect(container.textContent).not.toContain("Internal diagnostic detail");
  await act(async () => container.querySelector('button')!.click()); expect(retry).toHaveBeenCalledOnce();
});
it("uses English recovery copy for an English session", async () => {
  document.documentElement.lang = "en";
  await act(async () => root.render(<AppErrorBoundary><BrokenPage /></AppErrorBoundary>));
  expect(container.querySelector('button')!.textContent).toBe("Reload page");
});
