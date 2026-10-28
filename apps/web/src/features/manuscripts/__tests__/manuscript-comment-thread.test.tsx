// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ManuscriptComment, WorkspaceDiscussionDetail } from "@trend/shared-types";
import { ManuscriptCommentThread } from "../manuscript-comment-thread";

const mocks = vi.hoisted(() => ({ discussion: vi.fn(), unsaved: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/features/projects/api/workspace.api", () => ({ workspaceApi: { discussion: mocks.discussion } }));
vi.mock("@/features/projects/components/workspace-common", () => ({ useUnsavedWorkspace: mocks.unsaved }));

type Props = ComponentProps<typeof ManuscriptCommentThread>;
const author = { id: "writer", name: "Writer" };
const thread = (changes: Partial<ManuscriptComment> = {}): ManuscriptComment => ({
  id: "thread", title: "Review", body: "Clarify this argument", author,
  status: "OPEN", version: 1, context: {}, mentorRelationshipId: null,
  hasMoreMessages: true, messages: [{ id: "latest", body: "Latest reply", author, createdAt: "2026-10-23" }], ...changes,
});
const conversation = (page = 1, changes: Partial<WorkspaceDiscussionDetail> = {}): WorkspaceDiscussionDetail => ({
  thread: { id: "thread", title: "Review", body: "Clarify this argument", author, status: "OPEN", version: 1, conclusion: "", category: "GENERAL", link: null, mentorRelationshipId: null, replyCount: 21, createdAt: "2026-10-23", updatedAt: "2026-10-23" },
  messages: { items: [{ id: `reply-${page}`, body: `Conversation page ${page}`, author, createdAt: "2026-10-23", replyToId: null }], page, pageSize: 20, total: 21, hasNext: page === 1 },
  canReply: true, canResolve: true, canEdit: false, ...changes,
});

let cleanup: (() => Promise<void>) | undefined;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); mocks.discussion.mockImplementation(async (_project, _thread, page) => conversation(page)); });
afterEach(async () => { await cleanup?.(); cleanup = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function settle() {
  await act(async () => {
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(1);
    else await new Promise(resolve => setTimeout(resolve, 5));
  });
}
async function render(changes: Partial<Props> = {}) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let props: Props = { projectId: "project", userId: "writer", thread: thread(), canReply: true, canResolve: true, onNavigate: vi.fn(), onReply: vi.fn().mockResolvedValue(true), onResolve: vi.fn().mockResolvedValue(true), ...changes };
  const update = async (next: Partial<Props> = {}) => {
    props = { ...props, ...next };
    await act(async () => { root.render(<QueryClientProvider client={client}><ManuscriptCommentThread {...props} /></QueryClientProvider>); });
    await settle();
  };
  await update();
  cleanup = async () => { await act(async () => root.unmount()); client.clear(); host.remove(); };
  return { host, update, client };
}
const button = (host: HTMLElement, label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label)!;
async function click(host: HTMLElement, label: string) { await act(async () => button(host, label).click()); await settle(); }
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("keeps one receipt for an unchanged reply retry and creates one after editing a failed reply", async () => {
  const onReply = vi.fn().mockRejectedValueOnce(new Error("Connection interrupted")).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const { host } = await render({ onReply });
  const input = host.querySelector<HTMLInputElement>("form input")!;
  await type(input, " First reply ");
  await click(host, "Send reply");
  expect(input.value).toBe(" First reply ");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Your changes are retained");
  await click(host, "Send reply");
  expect(onReply.mock.calls[1]).toEqual(onReply.mock.calls[0]);
  await type(input, "Revised reply");
  await click(host, "Send reply");
  expect(onReply.mock.calls[2]?.[0]).toBe("Revised reply");
  expect(onReply.mock.calls[2]?.[1]).not.toBe(onReply.mock.calls[0]?.[1]);
  expect(input.value).toBe("");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("serializes reply and resolve submissions before React renders the pending state", async () => {
  let finish!: (saved: boolean) => void;
  const onReply = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; })), onResolve = vi.fn().mockResolvedValue(true);
  const { host } = await render({ onReply, onResolve });
  await type(host.querySelector<HTMLInputElement>("form input")!, "Pending reply");
  await type(host.querySelector<HTMLInputElement>('[aria-label="Resolution summary"]')!, "Pending conclusion");
  await act(async () => {
    const form = host.querySelector("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    button(host, "Resolve").click();
  });
  expect(onReply).toHaveBeenCalledTimes(1);
  expect(onResolve).not.toHaveBeenCalled();
  expect(button(host, "Resolve").disabled).toBe(true);
  await act(async () => finish(true));
  expect(button(host, "Resolve").disabled).toBe(false);
});

it("retains a rejected resolution, clears a saved summary, and reopens with an empty conclusion", async () => {
  const onResolve = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(true);
  const { host, update } = await render({ onResolve });
  await type(host.querySelector<HTMLInputElement>('[aria-label="Resolution summary"]')!, "  Evidence clarified  ");
  await click(host, "Resolve");
  expect(host.querySelector<HTMLInputElement>('[aria-label="Resolution summary"]')?.value).toBe("  Evidence clarified  ");
  expect(onResolve).toHaveBeenLastCalledWith("Evidence clarified", "RESOLVED", 1);
  await click(host, "Resolve");
  await update({ thread: thread({ status: "RESOLVED", version: 2, conclusion: "Evidence clarified" }) });
  expect(host.textContent).toContain("Evidence clarified");
  await click(host, "Reopen");
  expect(onResolve).toHaveBeenLastCalledWith("", "OPEN", 2);
  await update({ thread: thread({ version: 3 }) });
  expect(host.querySelector<HTMLInputElement>('[aria-label="Resolution summary"]')?.value).toBe("");
  expect(button(host, "Resolve").disabled).toBe(true);
});

it("uses the newest conversation status, permissions and version for actions", async () => {
  const detail = conversation();
  mocks.discussion.mockResolvedValue({ ...detail, thread: { ...detail.thread, status: "RESOLVED", version: 4, conclusion: "Reviewed in the full conversation" }, canReply: false });
  const onResolve = vi.fn().mockResolvedValue(true);
  const { host } = await render({ onResolve });
  await click(host, "View all replies");
  expect(host.querySelector("form")).toBeNull();
  expect(host.textContent).toContain("Reviewed in the full conversation");
  await click(host, "Reopen");
  expect(onResolve).toHaveBeenLastCalledWith("", "OPEN", 4);
});

it("keeps drafts and the navigation guard when hidden, resolved remotely or permissions change", async () => {
  const { host, update } = await render();
  await type(host.querySelector<HTMLInputElement>("form input")!, "Draft response");
  await type(host.querySelector<HTMLInputElement>('[aria-label="Resolution summary"]')!, "Draft resolution");
  await update({ hidden: true, canReply: false, canResolve: false, thread: thread({ status: "RESOLVED", version: 2 }) });
  expect(host.querySelector("article")?.hidden).toBe(true);
  expect(host.querySelector("form")).toBeNull();
  expect(mocks.unsaved).toHaveBeenLastCalledWith(true);
  await update({ hidden: false, canReply: true, canResolve: true, thread: thread({ version: 3 }) });
  expect(host.querySelector<HTMLInputElement>("form input")?.value).toBe("Draft response");
  expect(host.querySelector<HTMLInputElement>('[aria-label="Resolution summary"]')?.value).toBe("Draft resolution");
});

it("keeps the summary navigation guard after remote resolution even without a reply draft", async () => {
  const { host, update } = await render();
  await type(host.querySelector<HTMLInputElement>('[aria-label="Resolution summary"]')!, "Unsent resolution");
  await update({ thread: thread({ status: "RESOLVED", version: 2 }) });
  expect(mocks.unsaved).toHaveBeenLastCalledWith(true);
});

it("loads complete reply pages and honors a refreshed denial of reply and resolution permissions", async () => {
  const { host, client } = await render();
  expect(mocks.discussion).not.toHaveBeenCalled();
  await click(host, "View all replies");
  expect(host.textContent).toContain("Conversation page 1");
  await click(host, "Next page");
  expect(mocks.discussion).toHaveBeenLastCalledWith("project", "thread", 2);
  expect(host.textContent).toContain("Conversation page 2");
  expect(button(host, "Next page").disabled).toBe(true);
  mocks.discussion.mockResolvedValue(conversation(2, { canReply: false, canResolve: false }));
  await act(async () => { await client.invalidateQueries({ queryKey: ["manuscript-conversation"] }); });
  await settle();
  expect(host.querySelector("form")).toBeNull();
  expect(host.querySelector('[aria-label="Resolution summary"]')).toBeNull();
  expect(button(host, "Resolve")).toBeUndefined();
});

it("pauses full-conversation reads while hidden and refreshes when revealed", async () => {
  vi.useFakeTimers();
  const { host, update } = await render();
  await click(host, "View all replies");
  expect(mocks.discussion).toHaveBeenCalledTimes(1);
  await update({ hidden: true });
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(mocks.discussion).toHaveBeenCalledTimes(1);
  await update({ hidden: false });
  expect(mocks.discussion).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(mocks.discussion).toHaveBeenCalledTimes(3);
});
