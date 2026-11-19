// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OrcidCallbackPage } from "@/pages/orcid-callback";
import { rememberOrcidAuthorization, orcidPendingKey } from "../orcid-authorization";
const mocks = vi.hoisted(() => ({ complete: vi.fn(), user: "viewer" as string | undefined }));
vi.mock("../api/academic-profile.api", () => ({ academicProfileApi: { completeOrcid: mocks.complete } }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (value: unknown) => unknown) => select({ user: mocks.user ? { id: mocks.user } : null }) }));
let root: Root, host: HTMLDivElement, cache: QueryClient;
const state = "a".repeat(43);
beforeEach(() => { vi.clearAllMocks(); mocks.user = "viewer"; mocks.complete.mockResolvedValue({ cancelled: false }); sessionStorage.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); cache = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); cache.clear(); vi.unstubAllGlobals(); });
function pending(user = "viewer", createdAt = Date.now()) { sessionStorage.setItem(orcidPendingKey, JSON.stringify({ state, userId: user, createdAt })); }
async function mount(query = `code=temporary-code&state=${state}`) {
  window.history.replaceState({}, "", `/integrations/orcid/callback?${query}`);
  await act(async () => root.render(<StrictMode><QueryClientProvider client={cache}><MemoryRouter><OrcidCallbackPage /></MemoryRouter></QueryClientProvider></StrictMode>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
it("completes once under StrictMode, strips secrets from the URL and refreshes the existing profile queries", async () => {
  pending(); const invalidate = vi.spyOn(cache, "invalidateQueries"); await mount();
  expect(mocks.complete).toHaveBeenCalledTimes(1); expect(mocks.complete).toHaveBeenCalledWith({ state, code: "temporary-code" });
  expect(window.location.search).toBe(""); expect(sessionStorage.getItem(orcidPendingKey)).toBeNull(); expect(invalidate).toHaveBeenCalledWith({ queryKey: ["academic-profile"] });
  expect(host.textContent).toContain("ORCID connected."); expect(host.textContent).not.toContain("temporary-code"); expect(host.querySelector('a')?.getAttribute('href')).toBe('/profile');
});
it.each(["other-user", "expired", "missing", "logged-out"])("rejects %s browser state before calling the server", async condition => {
  if (condition !== "missing") pending(condition === "other-user" ? "another" : "viewer", condition === "expired" ? Date.now() - 600001 : Date.now());
  if (condition === "logged-out") mocks.user = undefined;
  await mount(); expect(mocks.complete).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it("consumes a provider denial through the authenticated backend without rendering its error description", async () => {
  pending(); mocks.complete.mockResolvedValue({ cancelled: true }); await mount(`state=${state}&error=access_denied&error_description=private-provider-description`);
  expect(mocks.complete).toHaveBeenCalledWith({ state, error: "access_denied" }); expect(host.textContent).toContain("authorization was cancelled"); expect(host.textContent).not.toContain("private-provider-description");
});
it("explains duplicate or concurrent identity conflicts without showing server internals", async () => {
  pending(); mocks.complete.mockRejectedValue({ response: { status: 409, data: { error: { message: "private" } } } }); await mount(); expect(host.textContent).toContain("already linked or your profile changed"); expect(host.textContent).not.toContain("private");
});
it("rejects arbitrary provider destinations and retains a tab-bound authorization only for official ORCID", () => {
  expect(() => rememberOrcidAuthorization({ state, authorizationUrl: `https://evil.invalid/oauth/authorize?state=${state}` }, "viewer")).toThrow();
  rememberOrcidAuthorization({ state, authorizationUrl: `https://sandbox.orcid.org/oauth/authorize?state=${state}` }, "viewer"); expect(JSON.parse(sessionStorage.getItem(orcidPendingKey)!)).toMatchObject({ state, userId: "viewer" });
});
