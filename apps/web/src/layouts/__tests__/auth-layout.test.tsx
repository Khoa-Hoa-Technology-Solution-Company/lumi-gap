// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AuthLayout } from "../AuthLayout";

it("keeps the login route visible when WebGL2 is unavailable", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const container = document.createElement("div");
  const root = createRoot(container);

  try {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/login"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<form aria-label="Sign in" />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
    });

    // Auth forms are immediate while the decorative background loads independently.
    expect(container.querySelector('form[aria-label="Sign in"]')).not.toBeNull();
    await act(async () => { await import("@/components/ui/three-background-particle"); });
    await vi.waitFor(async () => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
      expect(getContext).toHaveBeenCalledWith("webgl2", expect.any(Object));
    }, { timeout: 10_000 });
    expect(container.querySelector('form[aria-label="Sign in"]')).not.toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
  } finally {
    act(() => root.unmount());
    getContext.mockRestore();
    vi.unstubAllGlobals();
  }
});
