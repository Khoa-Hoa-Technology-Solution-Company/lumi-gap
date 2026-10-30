// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ repositories: vi.fn(), disconnect: vi.fn(), start: vi.fn() }));
vi.mock("../github-connection.api", () => ({ githubConnectionApi: mocks }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import { GithubConnectionFields, type GithubConnection } from "../github-connection";
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
const connection: GithubConnection = { userId: "original-user", connectedUser: "original-user", status: { connected: true, configured: true, login: "researcher", expiresAt: null, installUrl: "https://github.com/apps/lumigap/installations/new" }, error: false, refresh: vi.fn() };
it("selects an authorized repo/default branch and requires confirmation before disconnecting", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.repositories.mockResolvedValue({ repositories: [{ fullName: "team/paper", defaultBranch: "research", private: true, writable: true }], page: 1, hasMore: false });
  mocks.disconnect.mockResolvedValue({ disconnected: true, revoked: true });
  const host = document.createElement("div"), root = createRoot(host), repo = vi.fn(), branch = vi.fn(), changed = vi.fn(); document.body.append(host);
  const button = (text: string) => [...host.querySelectorAll("button")].find(node => node.textContent === text)!;
  try {
    await act(async () => root.render(<MemoryRouter><GithubConnectionFields connection={connection} repository="" branch="main" disabled={false} onRepository={repo} onBranch={branch} onCredentialChange={changed} /></MemoryRouter>));
    expect(host.textContent).toContain("@researcher");
    const select = host.querySelector("select")!;
    expect(select).not.toBeNull();
    await act(async () => { select.value = "team/paper"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(repo).toHaveBeenCalledWith("team/paper"); expect(branch).toHaveBeenCalledWith("research"); expect(mocks.repositories).toHaveBeenCalledWith("original-user", 1, expect.any(AbortSignal));
    await act(async () => button("Disconnect GitHub").click()); expect(mocks.disconnect).not.toHaveBeenCalled();
    await act(async () => button("Confirm disconnect").click()); expect(mocks.disconnect).toHaveBeenCalledWith("original-user"); expect(changed).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
it("shows honest unavailable configuration when GitHub is not configured", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(<MemoryRouter><GithubConnectionFields connection={{ ...connection, connectedUser: undefined, status: { ...connection.status!, configured: false, connected: false } }} repository="" branch="main" disabled={false} onRepository={vi.fn()} onBranch={vi.fn()} onCredentialChange={vi.fn()} /></MemoryRouter>));
    expect([...host.querySelectorAll("button")].find(node => node.textContent === "Connect GitHub")?.disabled).toBe(true);
    expect(host.textContent).toContain("GitHub connection is not configured"); expect(host.querySelector('input[type="password"]')).toBeNull(); expect(mocks.start).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});
