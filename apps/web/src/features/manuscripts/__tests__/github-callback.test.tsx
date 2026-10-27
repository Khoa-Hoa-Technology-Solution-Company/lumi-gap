// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ complete: vi.fn(), userId: "original-user" }));
vi.mock("../github-connection.api", () => ({ githubConnectionApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (value: unknown) => unknown) => select({ user: { id: mocks.userId } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import { GithubCallbackPage } from "@/pages/github-callback";
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });
function Destination() { return <p>{useLocation().pathname}</p>; }
it("completes only once under StrictMode, removes URL credentials and returns to the manuscript", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const host = document.createElement("div"), root = createRoot(host), destination = "/projects/6ab33f1537802fe30d38753b?tab=manuscripts";
  window.history.replaceState(null, "", "/integrations/github/callback?code=synthetic-code&state=synthetic-state"); mocks.complete.mockResolvedValue({ returnTo: destination });
  try {
    await act(async () => root.render(<StrictMode><MemoryRouter initialEntries={["/integrations/github/callback"]}><Routes><Route path="/integrations/github/callback" element={<GithubCallbackPage />} /><Route path="/projects/:id" element={<Destination />} /></Routes></MemoryRouter></StrictMode>));
    expect(mocks.complete).toHaveBeenCalledOnce(); expect(mocks.complete).toHaveBeenCalledWith("original-user", "synthetic-code", "synthetic-state"); expect(window.location.search).toBe(""); expect(host.textContent).toContain("/projects/6ab33f1537802fe30d38753b");
  } finally { await act(async () => root.unmount()); }
});
it("handles denied authorization without exchanging a code or echoing provider details", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const host = document.createElement("div"), root = createRoot(host);
  window.history.replaceState(null, "", "/integrations/github/callback?error=access_denied&error_description=do-not-echo");
  try {
    await act(async () => root.render(<MemoryRouter><GithubCallbackPage /></MemoryRouter>)); expect(mocks.complete).not.toHaveBeenCalled(); expect(host.textContent).toContain("authorization was cancelled"); expect(host.textContent).not.toContain("do-not-echo");
  } finally { await act(async () => root.unmount()); }
});
