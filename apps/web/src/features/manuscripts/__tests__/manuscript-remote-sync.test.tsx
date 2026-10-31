// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import type { SyncChange } from "../remote-sync-plan";
const mocks = vi.hoisted(() => ({ remote: vi.fn(), detail: vi.fn(), syncSource: vi.fn(), bindRemote: vi.fn(), head: vi.fn(), pull: vi.fn(), push: vi.fn(), changes: vi.fn(), plan: vi.fn(), prepare: vi.fn(), changed: vi.fn(), remoteHistory: vi.fn(), createConflictBranch: vi.fn(), commonBase: vi.fn(), recentCommits: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (value: string) => value }) }));
vi.mock("../manuscripts.api", () => ({ manuscriptsApi: mocks }));
const initializeRepository = vi.hoisted(() => vi.fn());
vi.mock("../github-connection.api", () => ({ githubConnectionApi: { initializeRepository } }));
vi.mock("../github-connection", () => ({
  useGithubConnection: () => ({ userId: "member", connectedUser: "member", status: { connected: true } }),
  GithubConnectionFields: ({ repository, onRepository, disabled, showRepositories = true }: { repository: string; onRepository: (value: string) => void; disabled: boolean; showRepositories?: boolean }) => showRepositories ? <input aria-label="Repository" value={repository} disabled={disabled} onChange={event => onRepository(event.target.value)} /> : null,
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
    commonBase = mocks.commonBase;
    recentCommits = mocks.recentCommits;
  },
}));
vi.mock("../remote-sync-plan", async original => ({ ...await original<typeof import("../remote-sync-plan")>(), planSync: mocks.plan, fingerprints: async () => [] }));
import { ManuscriptRemoteSync } from "../manuscript-remote-sync";
import { ManuscriptIntegrationTabs } from "../manuscript-integration-tabs";
import { GithubRecentCommits } from "../github-recent-commits";
import { GithubSourceDiff } from "../github-source-diff";
const sha = "a".repeat(40), file = { path: "main.tex", content: "dGV4" };
const binding = { repository: "team/paper", branch: "main", head: sha, baseline: [], revision: 1 };
let clean: (() => Promise<void>) | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.remote.mockResolvedValue(binding); mocks.detail.mockResolvedValue({ canWrite: true, canManageGithub: true, version: 4 });
  mocks.head.mockResolvedValue({ sha, tree: sha, private: true, writable: true, entries: [] }); mocks.pull.mockResolvedValue({ files: [file] });
  mocks.prepare.mockResolvedValue({ files: [file], sourceVersion: 4, mainFile: "main.tex" });
  mocks.plan.mockResolvedValue([{ path: file.path, kind: "REMOTE", local: file, remote: file }] satisfies SyncChange[]);
  mocks.syncSource.mockResolvedValue({ version: 5 }); mocks.bindRemote.mockResolvedValue({}); mocks.changes.mockResolvedValue([]);
  mocks.remoteHistory.mockResolvedValue([]);
  mocks.commonBase.mockResolvedValue({ sha, tree: sha, private: true, writable: true, entries: [] });
  mocks.recentCommits.mockResolvedValue([]);
  mocks.createConflictBranch.mockResolvedValue({ branch: "lumigap/conflict-12345", commitUrl: "https://github.com/team/paper/commit/12345", compareUrl: "https://github.com/team/paper/compare/main...lumigap%2Fconflict-12345?expand=1", repository: "team/paper", target: "main" });
});
afterEach(async () => { await clean?.(); clean = undefined; vi.resetAllMocks(); vi.unstubAllGlobals(); });
async function render(canWrite = true, canManageGithub = true) {
  const host = document.createElement("div"), root = createRoot(host); document.body.append(host);
  const show = (active = true, writable = canWrite) => root.render(<ManuscriptRemoteSync project="project" manuscript="draft" active={active} canWrite={writable} canManageGithub={canManageGithub} prepare={mocks.prepare} onChanged={mocks.changed} />);
  await act(async () => show()); clean = async () => { await act(async () => root.unmount()); host.remove(); };
  return { host, show, button: (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label)! };
}
it.each(["pull", "push"])("checks and performs direct %s without requiring the compare button", async direction => {
  mocks.remote.mockResolvedValue({ ...binding, baseline: [{ path: file.path, sha }] });
  mocks.changes.mockResolvedValue([file]); mocks.push.mockResolvedValue(`https://github.com/team/paper/commit/${sha}`);
  const { button } = await render();
  expect(mocks.prepare).not.toHaveBeenCalled();
  await act(async () => { const action = button(direction === "pull" ? "Receive changes from GitHub" : "Send changes to GitHub"); action.click(); action.click(); });
  expect(mocks.prepare).toHaveBeenCalledOnce(); expect(mocks.plan).toHaveBeenCalledOnce();
  expect(mocks.syncSource).toHaveBeenCalledOnce();
  expect(mocks.push).toHaveBeenCalledTimes(direction === "push" ? 1 : 0);
  expect(mocks.bindRemote).toHaveBeenCalledOnce();
});
it.each(["conflict", "independent"])("pauses direct sending for %s review without writing either source", async reason => {
  if (reason === "conflict") {
    mocks.remote.mockResolvedValue({ ...binding, baseline: [{ path: file.path, sha }] });
    mocks.plan.mockResolvedValue([{ path: file.path, kind: "CONFLICT", local: file, remote: file }]);
  }
  const { host, button } = await render();
  await act(async () => button("Send changes to GitHub").click());
  expect(host.textContent).toContain("Review the differences below");
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.bindRemote).not.toHaveBeenCalled();
});
it("rejects direct pushing with GitHub read-only access before applying source", async () => {
  mocks.remote.mockResolvedValue({ ...binding, baseline: [{ path: file.path, sha }] });
  mocks.head.mockResolvedValue({ sha, tree: sha, private: true, writable: false, entries: [] });
  const { host, button } = await render();
  await act(async () => button("Send changes to GitHub").click());
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
});
it("flushes new editor changes and rejects a comparison made before those edits", async () => {
  const { button } = await render();
  await act(async () => button("Inspect synchronization").click());
  mocks.prepare.mockResolvedValue({ sourceVersion: 4, mainFile: "main.tex", files: [{ ...file, content: "bmV3IGVkaXQ=" }] });
  await act(async () => button("Send changes to GitHub").click());
  expect(mocks.prepare).toHaveBeenCalledTimes(2);
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
});
it.each(["SAME", "LOCAL"])("does not create snapshots or commits when receiving %s-only source", async kind => {
  mocks.remote.mockResolvedValue({ ...binding, baseline: [{ path: file.path, sha }] });
  mocks.plan.mockResolvedValue([{ path: file.path, kind, local: file, remote: file }]);
  const { host, button } = await render();
  await act(async () => button("Receive changes from GitHub").click());
  expect(host.textContent).toContain(kind === "SAME" ? "Both sides are identical" : "No new changes on GitHub");
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.bindRemote).not.toHaveBeenCalled();
});
it("establishes the first baseline for identical source without applying files or creating a GitHub commit", async () => {
  mocks.plan.mockResolvedValue([{ path: file.path, kind: "SAME", local: file, remote: file }]);
  const { button } = await render();
  await act(async () => button("Send changes to GitHub").click());
  expect(mocks.bindRemote).not.toHaveBeenCalled();
  await act(async () => button("Send changes to GitHub").click());
  expect(mocks.bindRemote).toHaveBeenCalledOnce();
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
});
it("focuses diff on a change after a long unchanged prefix and escapes source markup", async () => {
  const prefix = "unchanged line\n".repeat(100), encode = (value: string) => Buffer.from(value).toString("base64");
  const host = document.createElement("div"), root = createRoot(host); document.body.append(host);
  clean = async () => { await act(async () => root.unmount()); host.remove(); };
  await act(async () => root.render(<GithubSourceDiff change={{ path: "page.tex", kind: "LOCAL", local: { path: "page.tex", content: encode(prefix + "<script>new title</script>\n") }, remote: { path: "page.tex", content: encode(prefix + "old title\n") } }} />));
  expect(host.querySelector(".writing-source-added")?.textContent).toContain("<script>new title</script>");
  expect(host.querySelector(".writing-source-removed")?.textContent).toContain("old title");
  expect(host.querySelectorAll(".writing-source-version")).toHaveLength(2);
  expect(host.querySelectorAll(".writing-source-lines > div").length).toBeLessThan(15);
  expect(host.querySelector("script")).toBeNull();
});
it("lets readers see the shared repository without requesting a GitHub connection or permitting a transfer", async () => {
  const { host } = await render(false);
  expect(host.textContent).toContain("team/paper"); expect(host.textContent).toContain("Only the project owner");
  expect(host.querySelector("input")).toBeNull(); expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.head).not.toHaveBeenCalled();
});
it("lets writing members view the repository and history without repository management or transfers", async () => {
  const { host, button } = await render(true, false);
  expect(host.textContent).toContain("team/paper");
  expect(host.textContent).toContain("Only the project owner");
  expect(button("Connection settings")).toBeUndefined();
  expect(button("Inspect synchronization")).toBeUndefined();
  expect(button("GitHub history")).toBeDefined();
  expect(mocks.prepare).not.toHaveBeenCalled();
});
it("rechecks ownership before applying a prepared merge", async () => {
  const { button } = await render();
  await act(async () => button("Inspect synchronization").click());
  mocks.detail.mockResolvedValue({ canWrite: true, canManageGithub: false, version: 4 });
  await act(async () => button("Receive changes from GitHub").click());
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
});
it("compares without changing either side and rejects a stale local revision before applying", async () => {
  const { button, host } = await render();
  await act(async () => button("Inspect synchronization").click());
  expect(mocks.prepare).toHaveBeenCalledOnce(); expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
  mocks.detail.mockResolvedValue({ canWrite: true, canManageGithub: true, version: 6 });
  await act(async () => button("Receive changes from GitHub").click());
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.bindRemote).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Inspect again"); expect(button("Receive changes from GitHub")).toBeDefined();
});
it("requires confirmation before replacing the team's repository without transferring source", async () => {
  const { button, host } = await render();
  await act(async () => button("Connection settings").click());
  expect(host.querySelector("input")).toBeNull();
  await act(async () => button("Change repository").click());
  await act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "other/paper"); input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(button("Inspect synchronization")).toBeUndefined();
  expect(button("Change connected repository").disabled).toBe(true);
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async () => button("Change connected repository").click());
  expect(mocks.bindRemote).toHaveBeenCalledWith("project", "draft", expect.objectContaining({ repository: "other/paper", baseline: [], expectedRevision: 1, expectedVersion: 4 }));
  expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
  expect(button("Inspect synchronization")).toBeDefined(); expect(host.textContent).toContain("other/paper");
});
it("blocks unresolved conflicts and disallows push for a read-only GitHub account", async () => {
  mocks.plan.mockResolvedValue([{ path: file.path, kind: "CONFLICT", local: file, remote: file }] satisfies SyncChange[]);
  mocks.head.mockResolvedValue({ sha, tree: sha, private: true, writable: false });
  const { host, button } = await render(); await act(async () => button("Inspect synchronization").click());
  expect(button("Receive changes from GitHub").disabled).toBe(true);
  await act(async () => { const select = host.querySelector("select")!; select.value = "LOCAL"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(button("Receive changes from GitHub").disabled).toBe(false); expect(button("Send changes to GitHub").disabled).toBe(true);
  expect(host.textContent).toContain("read-only access"); expect(mocks.syncSource).not.toHaveBeenCalled();
});
it("rejects a teammate's newer shared binding before applying any source", async () => {
  const { button } = await render(); await act(async () => button("Inspect synchronization").click());
  mocks.remote.mockResolvedValue({ ...binding, revision: 2 });
  await act(async () => button("Receive changes from GitHub").click());
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
});
it.each(["remote", "permission"])("rejects changed %s state before applying any source", async state => {
  const { button } = await render(); await act(async () => button("Inspect synchronization").click());
  if (state === "remote") mocks.head.mockResolvedValue({ sha: "b".repeat(40), writable: true });
  else mocks.detail.mockResolvedValue({ canWrite: false, version: 4 });
  await act(async () => button("Send changes to GitHub").click());
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.bindRemote).not.toHaveBeenCalled();
});
it("keeps a transfer alive when switching editor panels", async () => {
  const { show, button } = await render(); await act(async () => button("Inspect synchronization").click());
  let complete!: (value: { version: number }) => void;
  mocks.syncSource.mockReturnValue(new Promise(resolve => { complete = resolve; }));
  await act(async () => button("Receive changes from GitHub").click());
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
  mocks.remote.mockResolvedValue({ ...binding, baseline: [{ path: file.path, sha }] });
  mocks.plan.mockResolvedValue([{ path: file.path, kind: "CONFLICT", local: file, remote: file }] satisfies SyncChange[]);
  const { host, button } = await render();
  await act(async () => button("Inspect synchronization").click());
  
  const conflictBtn = button("Create conflict branch");
  expect(conflictBtn).toBeDefined();
  await act(async () => conflictBtn.click());
  expect(mocks.createConflictBranch).not.toHaveBeenCalled();
  await act(async () => button("Confirm and create branch").click());
  expect(mocks.createConflictBranch).toHaveBeenCalledOnce();
  expect(mocks.createConflictBranch).toHaveBeenCalledWith(expect.objectContaining({ sha }), [file], "main");
  expect(host.textContent).toContain("lumigap/conflict-12345");
  expect(host.querySelector('.writing-conflict-result a')?.getAttribute("href")).toContain("compare/main...");
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.bindRemote).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
  await act(async () => button("GitHub history").click());
  await act(async () => button("Synchronization").click());
  expect(host.textContent).toContain("lumigap/conflict-12345");
});

it.each(["source", "binding", "head", "permission"])("rejects changed %s before creating any conflict branch", async state => {
  mocks.remote.mockResolvedValue({ ...binding, baseline: [{ path: file.path, sha }] });
  mocks.plan.mockResolvedValue([{ path: file.path, kind: "CONFLICT", local: file, remote: file }] satisfies SyncChange[]);
  const { button } = await render();
  await act(async () => button("Inspect synchronization").click());
  await act(async () => button("Create conflict branch").click());
  if (state === "source") mocks.detail.mockResolvedValue({ canWrite: true, canManageGithub: true, version: 5 });
  if (state === "binding") mocks.remote.mockResolvedValue({ ...binding, revision: 2 });
  if (state === "head") mocks.head.mockResolvedValue({ sha: "b".repeat(40) });
  if (state === "permission") mocks.detail.mockResolvedValue({ canWrite: true, canManageGithub: false, version: 4 });
  await act(async () => button("Confirm and create branch").click());
  expect(mocks.createConflictBranch).not.toHaveBeenCalled(); expect(mocks.syncSource).not.toHaveBeenCalled();
});
it("requires manual resolution when no common baseline can be verified", async () => {
  mocks.plan.mockResolvedValue([{ path: file.path, kind: "CONFLICT", local: file, remote: file }] satisfies SyncChange[]);
  const { host, button } = await render();
  await act(async () => button("Inspect synchronization").click());
  expect(button("Create conflict branch")).toBeUndefined();
  expect(host.textContent).toContain("The common commit could not be verified");
  expect(mocks.createConflictBranch).not.toHaveBeenCalled();
});

it("shows recent commits separately, keeps comparison available on load failure and allows retry", async () => {
  mocks.recentCommits.mockRejectedValueOnce(new Error("GitHub temporarily unavailable"));
  const { host, button } = await render();
  expect(host.textContent).toContain("Could not load GitHub commits");
  expect(button("Inspect synchronization").disabled).toBe(false);
  mocks.recentCommits.mockResolvedValue([{ sha, message: "Revise methods", author: "Researcher", date: "2026-10-31T10:00:00Z" }]);
  await act(async () => button("Try again").click());
  expect(host.textContent).toContain("Revise methods");
  expect(host.querySelector('.writing-github-commits li a')?.getAttribute("href")).toBe(`https://github.com/team/paper/commit/${sha}`);
  expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.createConflictBranch).not.toHaveBeenCalled();
});
it("ignores commit responses from a previous account or repository", async () => {
  let previous!: (value: unknown) => void;
  mocks.recentCommits.mockReturnValueOnce(new Promise(resolve => { previous = resolve; })).mockResolvedValue([{ sha, message: "Current repository", author: "Researcher", date: "2026-10-31T10:00:00Z" }]);
  const host = document.createElement("div"), root = createRoot(host); document.body.append(host);
  clean = async () => { await act(async () => root.unmount()); host.remove(); };
  const show = (repository: string, userId: string) => root.render(<GithubRecentCommits repository={repository} branch="main" userId={userId} project="project" active revision={0} disabled={false} />);
  await act(async () => show("old/paper", "previous-user"));
  await act(async () => show("new/paper", "current-user"));
  await act(async () => previous([{ sha, message: "Private previous repository", author: "Other", date: "" }]));
  expect(host.textContent).toContain("Current repository");
  expect(host.textContent).not.toContain("Private previous repository");
  expect(host.querySelector("li a")?.getAttribute("href")).toContain("github.com/new/paper/");
});
it("keeps manual resolution available when the baseline commit has been removed or rewritten", async () => {
  mocks.remote.mockResolvedValue({ ...binding, baseline: [{ path: file.path, sha }] });
  mocks.commonBase.mockRejectedValue(new Error("Old Git object unavailable"));
  mocks.plan.mockResolvedValue([{ path: file.path, kind: "CONFLICT", local: file, remote: file }] satisfies SyncChange[]);
  const { host, button } = await render();
  await act(async () => button("Inspect synchronization").click());
  expect(host.querySelector("select")).not.toBeNull(); expect(button("Create conflict branch")).toBeUndefined();
  expect(host.textContent).toContain("The common commit could not be verified");
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
  await act(async () => button("GitHub history").click());
  expect(host.textContent).toContain("Repository linked");
  expect(host.textContent).toContain("Alice");

  await act(async () => button("Synchronization").click());
  await act(async () => button("Inspect synchronization").click());
  const diffBtn = button("View diff");
  expect(diffBtn).toBeDefined();
  await act(async () => diffBtn.click());
  expect(host.querySelector(".writing-diff-preview")).not.toBeNull();
  expect(button("Hide diff")).toBeDefined();
  await act(async () => button("Hide diff").click());
  expect(host.querySelector(".writing-diff-preview")).toBeNull();
});

it("connects a selected repository before exposing comparison and preserves an empty baseline", async () => {
  mocks.remote.mockResolvedValue(null);
  const { host, button } = await render();
  expect(host.textContent).toContain("Connect this repository to the manuscript first.");
  expect(button("Inspect synchronization")).toBeUndefined();
  expect(button("Connect repository").disabled).toBe(true);

  // Enter repository and branch
  await act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "my-team/my-paper");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  expect(button("Inspect synchronization")).toBeUndefined();
  expect(host.querySelector('[aria-current="step"]')?.textContent).toContain("Connect repository");
  await act(async () => button("Connect repository").click());
  expect(mocks.bindRemote).toHaveBeenCalledWith("project", "draft", expect.objectContaining({ repository: "my-team/my-paper", branch: "main", head: sha, baseline: [], isPrivate: true, expectedRevision: 0, expectedVersion: 4 }));
  expect(mocks.pull).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
  expect(host.textContent).toContain("No source synchronized yet.");
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Synchronization");
  expect(button("Inspect synchronization")).toBeDefined();
  expect(host.textContent).toContain("Choose Receive or Send. Changes are checked automatically");
});

it("keeps a failed repository connection at the selection step", async () => {
  mocks.remote.mockResolvedValue(null);
  const { host, button } = await render();
  await act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "team/new-repo");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  mocks.head.mockRejectedValue(new Error("Missing initial commit"));
  await act(async () => button("Connect repository").click());
  expect(mocks.bindRemote).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
  expect(button("Inspect synchronization")).toBeUndefined();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("initial commit");
});

it("rejects a newer team binding while connecting a repository", async () => {
  mocks.remote.mockResolvedValueOnce(null);
  const { host, button } = await render();
  await act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "team/new-repo");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  mocks.remote.mockResolvedValue(binding);
  await act(async () => button("Connect repository").click());
  expect(mocks.bindRemote).not.toHaveBeenCalled(); expect(mocks.syncSource).not.toHaveBeenCalled();
  expect(button("Inspect synchronization")).toBeUndefined();
});

it("compares a linked repository with no manuscript files as a first publication", async () => {
  mocks.pull.mockResolvedValue({ files: [], skipped: ["README.md"] });
  const { host, button } = await render();
  await act(async () => button("Inspect synchronization").click());
  expect(mocks.pull).toHaveBeenCalledWith(expect.any(Object), expect.any(Function), true);
  expect(host.textContent).toContain("This repository has no manuscript source yet.");
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
});

async function selectEmptyRepository() {
  mocks.remote.mockResolvedValue(null);
  const rendered = await render();
  await act(async () => {
    const input = rendered.host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "team/empty-paper");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const empty = new AxiosError("empty");
  empty.response = { data: { error: { details: { reason: "EMPTY_REPOSITORY" } } } } as typeof empty.response;
  mocks.head.mockRejectedValueOnce(empty);
  await act(async () => rendered.button("Connect repository").click());
  return rendered;
}

it("offers explicit initialization after detecting an empty repo, without silently writing to GitHub", async () => {
  const { host, button } = await selectEmptyRepository();
  expect(host.textContent).toContain("This repository has no commits yet.");
  expect(button("Initialize README and connect")).toBeDefined();
  expect(button("Inspect synchronization")).toBeUndefined();
  expect(initializeRepository).not.toHaveBeenCalled();
  initializeRepository.mockResolvedValue({ head: sha });
  await act(async () => button("Initialize README and connect").click());
  expect(initializeRepository).toHaveBeenCalledWith("member", { repository: "team/empty-paper", branch: "main", projectId: "project" });
  expect(mocks.bindRemote).toHaveBeenCalledWith("project", "draft", expect.objectContaining({ baseline: [], head: sha }));
  expect(button("Inspect synchronization")).toBeDefined();
  expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.syncSource).not.toHaveBeenCalled();
});

it("allows a read-only recheck if the repository was initialized elsewhere or a response was lost", async () => {
  const { button } = await selectEmptyRepository();
  await act(async () => button("Check repository again").click());
  expect(initializeRepository).not.toHaveBeenCalled();
  expect(mocks.bindRemote).toHaveBeenCalledOnce();
  expect(button("Inspect synchronization")).toBeDefined();
});

it("returns to ordinary linking if initialization succeeds but binding fails", async () => {
  const { button } = await selectEmptyRepository();
  initializeRepository.mockResolvedValue({ head: sha });
  mocks.bindRemote.mockRejectedValueOnce(new Error("temporary failure"));
  await act(async () => button("Initialize README and connect").click());
  expect(button("Initialize README and connect")).toBeUndefined();
  expect(button("Connect repository")).toBeDefined();
  await act(async () => button("Connect repository").click());
  expect(initializeRepository).toHaveBeenCalledOnce();
  expect(button("Inspect synchronization")).toBeDefined();
});

it("rechecks manuscript permission before creating an initial README", async () => {
  const { button } = await selectEmptyRepository();
  mocks.detail.mockResolvedValue({ canWrite: false, version: 4 });
  await act(async () => button("Initialize README and connect").click());
  expect(initializeRepository).not.toHaveBeenCalled(); expect(mocks.bindRemote).not.toHaveBeenCalled();
});

it("clears empty-repository initialization when the selected target changes", async () => {
  const { host, button } = await selectEmptyRepository();
  await act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "team/different-paper");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(button("Initialize README and connect")).toBeUndefined();
  expect(button("Connect repository")).toBeDefined();
});

it("opens a linked manuscript on synchronization without setup controls, stepper or history", async () => {
  const { host, button } = await render();
  expect(button("Inspect synchronization")).toBeDefined();
  expect(host.querySelector("input")).toBeNull();
  expect(host.querySelector('[aria-label="Synchronization workflow"]')).toBeNull();
  expect(host.querySelector('[aria-label="Synchronization history"]')).toBeNull();
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Synchronization");
  await act(async () => button("Connection settings").click());
  await act(async () => button("Change repository").click());
  expect(host.querySelector("input")).not.toBeNull();
  expect(button("Inspect synchronization")).toBeUndefined();
});

it("cancels an unlinked target selection when returning to synchronization", async () => {
  const { host, button } = await render();
  await act(async () => button("Connection settings").click());
  await act(async () => button("Change repository").click());
  await act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "team/other-paper");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(button("Change connected repository").disabled).toBe(true);
  await act(async () => button("Synchronization").click());
  expect(button("Inspect synchronization")).toBeDefined();
  await act(async () => button("Connection settings").click());
  await act(async () => button("Change repository").click());
  expect(host.querySelector<HTMLInputElement>("input")?.value).toBe(binding.repository);
  expect(mocks.bindRemote).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
});

it("keeps a prepared comparison while browsing history", async () => {
  const { host, button } = await render();
  await act(async () => button("Inspect synchronization").click());
  await act(async () => button("GitHub history").click());
  expect(host.textContent).toContain("No synchronization events recorded yet.");
  expect(button("Send changes to GitHub")).toBeUndefined();
  await act(async () => button("Synchronization").click());
  expect(button("Send changes to GitHub")).toBeDefined();
  expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(mocks.syncSource).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
});

it("links historical commits to their recorded repository and shows their date", async () => {
  mocks.remoteHistory.mockResolvedValue([{ id: "old-binding", eventType: "MANUSCRIPT_REMOTE_BOUND", currentVersionRef: sha, createdAt: "2026-10-30T10:00:00Z", actor: { name: "Alice" }, metadata: { repository: "team/previous-paper" } }]);
  const { host, button } = await render();
  await act(async () => button("GitHub history").click());
  expect(host.querySelector('.writing-github-history a')?.getAttribute("href")).toBe("https://github.com/team/previous-paper/commit/" + sha);
  expect(host.querySelector("time")?.dateTime).toBe("2026-10-30T10:00:00Z");
});

it("moves focus between GitHub sections without starting an operation", async () => {
  const { host, button } = await render();
  const tab = button("Synchronization"); tab.focus();
  await act(async () => tab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  expect(document.activeElement).toBe(button("Connection settings"));
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Synchronization");
  expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.bindRemote).not.toHaveBeenCalled();
});

it("shows history failures honestly and retries without leaving history", async () => {
  mocks.remoteHistory.mockRejectedValueOnce(new Error("unavailable"));
  const { host, button } = await render();
  await act(async () => button("GitHub history").click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not load synchronization history.");
  await act(async () => button("Try again").click());
  expect(host.textContent).toContain("No synchronization events recorded yet.");
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("GitHub history");
});

it("does not expose connection settings to readers or after write access is removed", async () => {
  const { host, show, button } = await render();
  await act(async () => button("Connection settings").click());
  await act(async () => button("Change repository").click());
  expect(host.querySelector("input")).not.toBeNull();
  await act(async () => show(true, false));
  expect(host.querySelector("input")).toBeNull();
  expect(button("Connection settings")).toBeUndefined();
  expect(button("Inspect synchronization")).toBeUndefined();
  expect(button("GitHub history")).toBeDefined();
});
