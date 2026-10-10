// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { User } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthCallbackPage } from "@/pages/oauth-callback";
import { storeAuthReturnTo } from "./auth-return";

const mocks = vi.hoisted(() => ({ exchange: vi.fn(), setAuth: vi.fn(), toastError: vi.fn() }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ setAuth: mocks.setAuth }) }));
vi.mock("@/features/auth/api/auth.api", () => ({ authApi: { exchangeOAuthCode: mocks.exchange } }));
vi.mock("@/features/auth", async () => {
  const { resolvePostAuthPath } = await import("./post-auth-redirect");
  return { resolvePostAuthPath };
});
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

const member: User = {
  id: "recreated-member", email: "member@example.test", fullName: "Member",
  role: "user", systemRole: "USER", accountStatus: "ACTIVE",
  emailVerifiedAt: "2026-10-09T00:00:00.000Z", onboarding: { completed: true },
  createdAt: "2026-10-09T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z",
};
const tokens = { accessToken: "new-access-token", refreshToken: "new-refresh-token", accessTokenExpiresAt: "2026-10-09T01:00:00.000Z" };
let client: QueryClient, container: HTMLDivElement, root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  sessionStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); container.remove(); sessionStorage.clear(); vi.unstubAllGlobals();
});
async function renderCallback() {
  await act(async () => root.render(
    <StrictMode><QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/auth/oauth-callback?code=exchange-code"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/auth/oauth-callback" element={<OAuthCallbackPage />} />
          <Route path="/home" element={<p>Member home</p>} />
          <Route path="/admin" element={<p>Admin workspace</p>} />
          <Route path="/onboarding/academic-profile" element={<p>Academic onboarding</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider></StrictMode>,
  ));
}

describe("Google OAuth callback after an account reset", () => {
  it("replaces the previous user's cached data and rejects a stale admin return URL", async () => {
    client.setQueryData(["current-user"], { user: { ...member, id: "previous-admin", systemRole: "ADMIN" } });
    client.setQueryData(["projects"], [{ id: "previous-user-private-project" }]);
    storeAuthReturnTo("/admin");
    mocks.exchange.mockResolvedValue({ user: member, tokens });

    await renderCallback();

    expect(mocks.exchange).toHaveBeenCalledTimes(1);
    expect(mocks.exchange).toHaveBeenCalledWith("exchange-code");
    expect(mocks.setAuth).toHaveBeenCalledWith({ user: member, tokens });
    expect(client.getQueryData(["current-user"])).toEqual({ user: member });
    expect(client.getQueryData(["projects"])).toBeUndefined();
    expect(container.textContent).toBe("Member home");
    expect(sessionStorage.getItem("lumigap.auth.returnTo")).toBeNull();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("takes a recreated account without an academic profile to onboarding", async () => {
    storeAuthReturnTo("/admin");
    mocks.exchange.mockResolvedValue({ user: { ...member, onboarding: { completed: false } }, tokens });
    await renderCallback();
    expect(container.textContent).toBe("Academic onboarding");
  });
});
