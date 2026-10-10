// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { User } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuthStore } from "@/stores/auth-store";

const mocks = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock("@/features/auth/api/auth.api", () => ({ authApi: { me: mocks.me } }));
vi.mock("@/features/auth", async () => {
  const { useCurrentUser } = await import("../hooks/use-auth");
  const { requiresAcademicProfile } = await import("./academic-profile");
  return { useCurrentUser, requiresAcademicProfile };
});
const member: User = {
  id: "member", email: "member@example.test", fullName: "Member",
  role: "user", systemRole: "USER", accountStatus: "ACTIVE",
  emailVerifiedAt: "2026-10-09T00:00:00.000Z", onboarding: { completed: false },
  createdAt: "2026-10-09T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z",
};
const tokens = { accessToken: "access", refreshToken: "refresh", accessTokenExpiresAt: "2026-10-09T01:00:00.000Z" };
let client: QueryClient, container: HTMLDivElement, root: Root;
function OnboardingDestination() {
  const location = useLocation();
  return <p>Onboarding before {location.state?.from}</p>;
}
async function renderProfile() {
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/profile?edit=intro"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route element={<ProtectedRoute />}><Route path="/profile" element={<p>Profile reached</p>} /></Route>
          <Route path="/onboarding/academic-profile" element={<OnboardingDestination />} />
          <Route path="/login" element={<p>Login required</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  ));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  useAuthStore.getState().clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); useAuthStore.getState().clear(); container.remove(); vi.unstubAllGlobals();
});
describe("profile access before onboarding", () => {
  it("waits for the API instead of trusting a completed profile stored in the browser", async () => {
    let resolveMe!: (data: { user: User }) => void;
    mocks.me.mockReturnValue(new Promise(resolve => { resolveMe = resolve; }));
    useAuthStore.getState().setAuth({ user: { ...member, onboarding: { completed: true } }, tokens });
    await renderProfile();
    expect(container.textContent).toBe("Loading page...");
    expect(container.textContent).not.toContain("Profile reached");
    await act(async () => {
      resolveMe({ user: member });
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(container.textContent).toBe("Onboarding before /profile?edit=intro");
  });
  it("shows onboarding again in a new login session when it was left unfinished", async () => {
    mocks.me.mockResolvedValue({ user: member });
    useAuthStore.getState().setAuth({ user: member, tokens });
    client.setQueryData(["current-user"], { user: member });
    await renderProfile();
    expect(container.textContent).toContain("Onboarding before /profile");
    await act(async () => root.unmount());
    client.clear(); useAuthStore.getState().clear();
    useAuthStore.getState().setAuth({ user: member, tokens: { ...tokens, accessToken: "next-login-access" } });
    client.setQueryData(["current-user"], { user: member });
    root = createRoot(container);
    await renderProfile();
    expect(container.textContent).toContain("Onboarding before /profile");
  });
  it("allows profile access after the API confirms onboarding is complete", async () => {
    const completed = { ...member, onboarding: { completed: true } };
    mocks.me.mockResolvedValue({ user: completed });
    useAuthStore.getState().setAuth({ user: completed, tokens });
    client.setQueryData(["current-user"], { user: completed });
    await renderProfile();
    expect(container.textContent).toBe("Profile reached");
  });
});
