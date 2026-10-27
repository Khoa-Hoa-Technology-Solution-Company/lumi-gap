// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkContributionsPanel } from "../components/work-contributions";
import { ContributionAllocationPanel } from "../components/contribution-allocation";
import { WorkspaceComposer } from "../components/workspace-common";

const mocks = vi.hoisted(() => ({ work: vi.fn(), detail: vi.fn(), save: vi.fn(), periods: vi.fn(), history: vi.fn(), createPeriod: vi.fn(), draft: vi.fn(), people: vi.fn(), tasks: vi.fn(), confirm: vi.fn() }));
vi.mock("../api/contributions.api", () => ({ contributionsApi: mocks }));
vi.mock("../api/workspace.api", () => ({ workspaceApi: mocks }));
vi.mock("@/services/confirmation", () => ({ confirmUnsavedChanges: mocks.confirm }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "me" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, client: QueryClient;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks();
  const empty = { items: [], total: 0, page: 1, pageSize: 20, hasNext: false };
  mocks.work.mockResolvedValue({ ...empty, currentActorId: "me" }); mocks.people.mockResolvedValue({ ...empty, items: [{ id: "me", name: "Writer" }] }); mocks.tasks.mockResolvedValue(empty); mocks.periods.mockResolvedValue([]); mocks.history.mockResolvedValue([]); mocks.confirm.mockResolvedValue(false);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); }
async function render(node: ReactNode) { await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>)); await settle(); }
async function click(text: string) { const button = [...host.querySelectorAll("button")].find(button => button.textContent === text)!; expect(button).toBeDefined(); await act(async () => button.click()); await settle(); }
async function fill(label: string, value: string) { const input = [...host.querySelectorAll("label")].find(node => node.textContent?.startsWith(label))?.querySelector("input,textarea") as HTMLInputElement | HTMLTextAreaElement; expect(input).toBeDefined(); await act(async () => { Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit() { await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); await settle(); }

it("retries unchanged workspace comments with one receipt, then creates a new receipt after editing", async () => {
  const send = vi.fn().mockRejectedValue(new Error("Lost reply"));
  await render(<WorkspaceComposer projectId="p" pending={false} error={null} onSubmit={send} />);
  await fill("Add a comment", "First note"); await submit(); await submit();
  expect(send.mock.calls[1]?.[0].clientKey).toBe(send.mock.calls[0]?.[0].clientKey);
  await fill("Add a comment", "Changed note"); await submit();
  expect(send.mock.calls[2]?.[0].clientKey).not.toBe(send.mock.calls[0]?.[0].clientKey);
  expect(host.querySelector("textarea")?.value).toBe("Changed note");
});
it("locks mention choices along with the body while a workspace comment is pending", async () => {
  await render(<WorkspaceComposer projectId="p" pending error={null} onSubmit={vi.fn()} />);
  expect(host.querySelector("textarea")?.disabled).toBe(true);
  expect(host.querySelector("fieldset")?.disabled).toBe(true);
});
it("keeps an edited work draft after uncertain save and refuses cancellation without confirmation", async () => {
  mocks.save.mockRejectedValue(new Error("Response lost"));
  await render(<WorkContributionsPanel projectId="p" currentUserId="me" readOnly={false} />);
  await click("Record work contribution"); await fill("Title", "Original work"); await submit(); await submit();
  expect(mocks.save.mock.calls[1]?.[1].clientKey).toBe(mocks.save.mock.calls[0]?.[1].clientKey);
  await fill("Title", "Revised work"); await submit();
  expect(mocks.save.mock.calls[2]?.[1].clientKey).not.toBe(mocks.save.mock.calls[0]?.[1].clientKey);
  await click("Cancel"); expect(mocks.confirm).toHaveBeenCalledTimes(1); expect(host.querySelector("form")).not.toBeNull();
  mocks.confirm.mockResolvedValue(true); await click("Cancel"); expect(host.querySelector("form")).toBeNull();
});
it("serializes work saves and locks input until a failed save returns", async () => {
  let fail!: (error: Error) => void;
  mocks.save.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
  await render(<WorkContributionsPanel projectId="p" currentUserId="me" readOnly={false} />); await click("Record work contribution"); await fill("Title", "Pending work");
  await act(async () => { const form = host.querySelector("form")!; form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); await settle();
  expect(mocks.save).toHaveBeenCalledTimes(1); expect(host.querySelector<HTMLFieldSetElement>(".contribution-editor-fields")?.disabled).toBe(true);
  await act(async () => fail(new Error("Offline"))); await settle();
  expect(host.querySelector<HTMLInputElement>('input')?.value).toBe("Pending work"); expect(host.querySelector<HTMLFieldSetElement>(".contribution-editor-fields")?.disabled).toBe(false);
});
it("keeps allocation period retries stable until content changes and protects Cancel", async () => {
  mocks.createPeriod.mockRejectedValue(new Error("Response lost"));
  await render(<ContributionAllocationPanel projectId="p" isOwner readOnly={false} />); await click("Create allocation period"); await fill("Title", "Writing phase"); await submit(); await submit();
  expect(mocks.createPeriod.mock.calls[1]?.[1].clientKey).toBe(mocks.createPeriod.mock.calls[0]?.[1].clientKey);
  await fill("Title", "Analysis phase"); await submit(); expect(mocks.createPeriod.mock.calls[2]?.[1].clientKey).not.toBe(mocks.createPeriod.mock.calls[0]?.[1].clientKey);
  await click("Cancel"); expect(host.querySelector("form")).not.toBeNull(); expect(mocks.confirm).toHaveBeenCalled();
});
it("binds allocation proposal receipts to the exact shares and rationale", async () => {
  mocks.periods.mockResolvedValue([{ id: "period", title: "Writing", scope: "Writing work", roster: [{ id: "me", name: "Writer", reasons: [] }], historyIncomplete: false }]); mocks.draft.mockRejectedValue(new Error("Response lost"));
  await render(<ContributionAllocationPanel projectId="p" isOwner readOnly={false} />); await settle(); await click("Create allocation draft"); await fill("Proposed percentage", "100"); await fill("Proposal rationale", "A proposal for all documented work"); await submit(); await submit();
  expect(mocks.draft.mock.calls[1]?.[2].clientKey).toBe(mocks.draft.mock.calls[0]?.[2].clientKey);
  await fill("Proposal rationale", "An updated proposal for all documented work"); await submit(); expect(mocks.draft.mock.calls[2]?.[2].clientKey).not.toBe(mocks.draft.mock.calls[0]?.[2].clientKey);
});

it("retains an open work draft and prevents saving when the project becomes read-only", async () => {
  await render(<WorkContributionsPanel projectId="p" currentUserId="me" readOnly={false} />);
  await click("Record work contribution"); await fill("Title", "Retained work draft");
  await render(<WorkContributionsPanel projectId="p" currentUserId="me" readOnly />);
  expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("Retained work draft");
  expect(host.querySelector<HTMLFieldSetElement>(".contribution-editor-fields")?.disabled).toBe(true);
  await submit(); expect(mocks.save).not.toHaveBeenCalled();
  await click("Cancel"); expect(mocks.confirm).toHaveBeenCalled(); expect(host.querySelector("form")).not.toBeNull();
});

it("retains a period draft and prevents saving after ownership is lost", async () => {
  await render(<ContributionAllocationPanel projectId="p" isOwner readOnly={false} />);
  await click("Create allocation period"); await fill("Title", "Retained period draft");
  await render(<ContributionAllocationPanel projectId="p" isOwner={false} readOnly={false} />);
  expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("Retained period draft");
  expect(host.querySelector<HTMLFieldSetElement>(".contribution-editor-fields")?.disabled).toBe(true);
  await submit(); expect(mocks.createPeriod).not.toHaveBeenCalled();
  await click("Cancel"); expect(mocks.confirm).toHaveBeenCalled();
});

it("retains a proposal draft and prevents saving when the project is archived", async () => {
  mocks.periods.mockResolvedValue([{ id: "period", title: "Writing", scope: "Writing work", roster: [{ id: "me", name: "Writer", reasons: [] }], historyIncomplete: false }]);
  await render(<ContributionAllocationPanel projectId="p" isOwner readOnly={false} />); await settle();
  await click("Create allocation draft"); await fill("Proposed percentage", "100"); await fill("Proposal rationale", "Retained proposal for documented work");
  await render(<ContributionAllocationPanel projectId="p" isOwner readOnly />);
  expect(host.querySelector<HTMLTextAreaElement>('textarea[rows="4"]')?.value).toBe("Retained proposal for documented work");
  expect(host.querySelector<HTMLFieldSetElement>(".contribution-editor-fields")?.disabled).toBe(true);
  await submit(); expect(mocks.draft).not.toHaveBeenCalled();
  await click("Cancel"); expect(mocks.confirm).toHaveBeenCalled();
});
