// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SyncChange } from "../remote-sync-plan";
const mocks = vi.hoisted(() => ({ remote: vi.fn(), detail: vi.fn(), syncSource: vi.fn(), bindRemote: vi.fn(), head: vi.fn(), pull: vi.fn(), push: vi.fn(), changes: vi.fn(), plan: vi.fn(), prepare: vi.fn(), changed: vi.fn(), remoteHistory: vi.fn(), createConflictBranch: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (value: string) => value }) }));
vi.mock("../manuscripts.api", () => ({ manuscriptsApi: mocks }));
vi.mock("../github-connection", () => ({
  useGithubConnection: () => ({ userId: "member", connectedUser: "member", status: { connected: true } }),
  GithubConnectionFields: ({ repository, onRepository, disabled }: { repository: string; onRepository: (value: string) => void; disabled: boolean }) => <input aria-label="Repository" value={repository} disabled={disabled} onChange={event => onRepository(event.target.value)} />,
}));
vi.mock("../manuscript-github-client", () => ({
  validateRepository: vi.fn(),
  decodeRepositoryContent: (val: string) => Buffer.from(val, "base64"),
  ManuscriptGithubClient: class {
    authenticated = true;
    head = mocks.head;
    pull = mocks.pull;
    push = mocks.push;
    changes = mocks.changes;
    createConflictBranch = mocks.createConflictBranch;
  },
}));
vi.mock("../remote-sync-plan", async original => ({ ...await original<typeof import("../remote-sync-plan")>(), planSync: mocks.plan, fingerprints: async () => [] }));
import { ManuscriptRemoteSync } from "../manuscript-remote-sync";
import { ManuscriptIntegrationTabs } from "../manuscript-integration-tabs";
const sha = "a".repeat(40), file = { path: "main.tex", content: "dGV4" };
const binding = { repository: "team/paper", branch: "main", head: sha, baseline: [], revision: 1 };
let clean: (() => Promise<void>) | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.remote.mockResolvedValue(binding); mocks.detail.mockResolvedValue({ canWrite: true, version: 4 });
  mocks.head.mockResolvedValue({ sha, tree: sha, private: true, writable: true }); mocks.pull.mockResolvedValue({ files: [file] });
  mocks.prepare.mockResolvedValue({ files: [file], sourceVersion: 4, mainFile: "main.tex" });
  mocks.plan.mockResolvedValue([{ path: file.path, kind: "LOCAL", local: file, remote: file }] satisfies SyncChange[]);
  mocks.syncSource.mockResolvedValue({ version: 5 }); mocks.bindRemote.mockResolvedValue({}); mocks.changes.mockResolvedValue([]);
  mocks.remoteHistory.mockResolvedValue([]);
  mocks.createConflictBranch.mockResolvedValue({ branch: "lumigap/conflict-12345", commitUrl: "https://github.com/team/paper/commit/12345" });
});
afterEach(async () => { await clean?.(); clean = undefined; vi.resetAllMocks(); vi.unstubAllGlobals(); });
async function render(canWrite = true) {
  const host = document.createElement("div"), root = createRoot(host); document.body.append(host);
  const show = (active = true, writable = canWrite) => root.render(<ManuscriptRemoteSync project="project" manuscript="draft" active={active} canWrite={writable} prepare={mocks.prepare} onChanged={mocks.changed} />);
  await act(async () => show()); clean = async () => { await act(async () => root.unmount()); host.remove(); };
  return { host, show, button: (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label)! };
}
it("lets readers see the shared repository without requesting a GitHub connection or permitting a transfer", async () => {
  const { host } = await render(false);
  expect(host.textContent).toContain("team/paper"); expect(host.textContent).toContain("Editing permission is required");
  expect(host.querySelector("input")).toBeNull(); expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.head).not.toHaveBeenCalled();
});
it("compares without changing either side and rejects a stale local revision before applying", async () => {
  const { button, host } = await render();
  await act(async () => button("Inspect synchronization").click());
  expect(mocks.prepare).toHaveBeenCalledOnce(); expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
  mocks.detail.mockResolvedValue({ canWrite: true, version: 6 });
  await act(async () => button("Pull merged source").click());
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.bindRemote).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Inspect again"); expect(button("Pull merged source")).toBeUndefined();
});
it("requires confirmation before replacing the team's repository and then saves the new binding", async () => {
  const { button, host } = await render();
  await act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "other/paper"); input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Inspect synchronization").click());
  expect(button("Pull merged source").disabled).toBe(true); expect(button("Push merged source").disabled).toBe(true);
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async () => button("Push merged source").click());
  expect(mocks.syncSource).toHaveBeenCalledOnce(); expect(mocks.bindRemote).toHaveBeenCalledWith("project", "draft", expect.objectContaining({ repository: "other/paper", expectedRevision: 1, expectedVersion: 5 }));
  expect(mocks.changed).toHaveBeenCalledOnce(); expect(host.textContent).toContain("other/paper");
});
it("blocks unresolved conflicts and disallows push for a read-only GitHub account", async () => {
  mocks.plan.mockResolvedValue([{ path: file.path, kind: "CONFLICT", local: file, remote: file }] satisfies SyncChange[]);
  mocks.head.mockResolvedValue({ sha, tree: sha, private: true, writable: false });
  const { host, button } = await render(); await act(async () => button("Inspect synchronization").click());
  expect(button("Pull merged source").disabled).toBe(true);
  await act(async () => { const select = host.querySelector("select")!; select.value = "LOCAL"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(button("Pull merged source").disabled).toBe(false); expect(button("Push merged source").disabled).toBe(true);
  expect(host.textContent).toContain("read-only access"); expect(mocks.syncSource).not.toHaveBeenCalled();
});
it("rejects a teammate's newer shared binding before applying any source", async () => {
  const { button } = await render(); await act(async () => button("Inspect synchronization").click());
  mocks.remote.mockResolvedValue({ ...binding, revision: 2 });
  await act(async () => button("Pull merged source").click());
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
});
it.each(["remote", "permission"])("rejects changed %s state before applying any source", async state => {
  const { button } = await render(); await act(async () => button("Inspect synchronization").click());
  if (state === "remote") mocks.head.mockResolvedValue({ sha: "b".repeat(40), writable: true });
  else mocks.detail.mockResolvedValue({ canWrite: false, version: 4 });
  await act(async () => button("Push merged source").click());
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.bindRemote).not.toHaveBeenCalled();
});
it("keeps a transfer alive when switching editor panels", async () => {
  const { show, button } = await render(); await act(async () => button("Inspect synchronization").click());
  let complete!: (value: { version: number }) => void;
  mocks.syncSource.mockReturnValue(new Promise(resolve => { complete = resolve; }));
  await act(async () => button("Pull merged source").click());
  await act(async () => show(false)); expect(mocks.bindRemote).not.toHaveBeenCalled();
  await act(async () => complete({ version: 5 })); expect(mocks.bindRemote).toHaveBeenCalledOnce();
});
it("moves keyboard focus between GitHub and PDF tabs without activating a tab automatically", async () => {
  const host = document.createElement("div"), root = createRoot(host), select = vi.fn(); document.body.append(host);
  clean = async () => { await act(async () => root.unmount()); host.remove(); };
  await act(async () => root.render(<ManuscriptIntegrationTabs selected="preview" onSelect={select} />));
  const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]'); tabs[0]!.focus();
  await act(async () => tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  expect(document.activeElement).toBe(tabs[1]); expect(select).not.toHaveBeenCalled();
  await act(async () => tabs[1]!.click()); expect(select).toHaveBeenCalledWith("github");
});

it("offers conflict branch creation when conflicts exist and creates branch safely", async () => {
  mocks.plan.mockResolvedValue([{ path: file.path, kind: "CONFLICT", local: file, remote: file }] satisfies SyncChange[]);
  mocks.head.mockResolvedValue({ sha, tree: sha, private: true, writable: true });
  const { host, button } = await render();
  await act(async () => button("Inspect synchronization").click());
  
  const conflictBtn = button("Create conflict branch");
  expect(conflictBtn).toBeDefined();
  await act(async () => conflictBtn.click());
  expect(mocks.createConflictBranch).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Created conflict branch on GitHub: lumigap/conflict-12345");
});

it("shows synchronization history entries and handles diff preview toggle", async () => {
  mocks.remoteHistory.mockResolvedValue([
    {
      id: "ev-1",
      eventType: "MANUSCRIPT_REMOTE_BOUND",
      currentVersionRef: "abc1234567890",
      createdAt: new Date().toISOString(),
      actor: { id: "user-1", name: "Alice" },
      metadata: {},
    },
  ]);
  const { host, button } = await render();
  expect(host.textContent).toContain("Repository linked");
  expect(host.textContent).toContain("Alice");

  await act(async () => button("Inspect synchronization").click());
  const diffBtn = button("View diff");
  expect(diffBtn).toBeDefined();
  await act(async () => diffBtn.click());
  expect(host.querySelector(".writing-diff-preview")).not.toBeNull();
  expect(button("Hide diff")).toBeDefined();
  await act(async () => button("Hide diff").click());
  expect(host.querySelector(".writing-diff-preview")).toBeNull();
});

it("guides user to choose repository before revealing comparison action when no binding exists", async () => {
  mocks.remote.mockResolvedValue(null);
  const { host, button } = await render();
  expect(host.textContent).toContain("Choose or enter a GitHub repository above to begin comparing source files.");
  expect(button("Inspect synchronization")).toBeUndefined();

  // Enter repository and branch
  await act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "my-team/my-paper");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  expect(button("Inspect synchronization")).toBeDefined();
  expect(host.textContent).toContain("Inspect both sides, resolve conflicts");
});
