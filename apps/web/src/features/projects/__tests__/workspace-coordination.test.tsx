// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ResearchPlanView } from "@trend/shared-types";
import { WorkspacePlanPanel } from "../components/workspace-plan";
import { WorkspaceTasksPanel } from "../components/workspace-tasks";
import { WorkspaceDiscussionsPanel } from "../components/workspace-discussions";
import { WorkspaceDecisions } from "../components/workspace-decisions";
import { canLeaveWorkspace, useUnsavedWorkspace } from "../components/workspace-common";

const mocks = vi.hoisted(() => Object.fromEntries(["gapEvidence", "plan", "savePlan", "planHistory", "shares", "overview", "comments", "comment", "people", "artifacts", "tasks", "task", "saveTask", "milestones", "discussions", "discussion", "saveDiscussion", "reply", "resolve", "decisions", "saveDecision", "history"].map(key => [key, vi.fn()])));
vi.mock("../api/workspace.api", () => ({ workspaceApi: mocks }));
vi.mock("@/features/gaps/api/gaps.api", () => ({ gapsApi: { evidence: mocks.gapEvidence } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "actor" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, unknown>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }) }));
const empty = { items: [], total: 0, page: 1, pageSize: 20, hasNext: false };
const plan: ResearchPlanView = { projectId: "p", projectTitle: "Research", version: 1, currentRevisionId: "r1", canEdit: true, canShare: false, archived: false, access: "TEAM", content: { approach: "UNDECIDED", problem: "Initial question", objectives: [], questions: [], scope: "", methodology: "Interviews", searchStrategy: "Retained search", deliverables: [], inclusionCriteria: [], exclusionCriteria: [] } };
let root: Root, container: HTMLDivElement, client: QueryClient;
async function render(node: ReactNode, path = "/projects/p?tab=plan") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}
async function click(text: string) { const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text); expect(button, text).toBeDefined(); await act(async () => button!.click()); await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); }
async function fill(label: string, value: string) {
  const parent = [...container.querySelectorAll("label")].find(item => item.textContent?.startsWith(label));
  const input = parent?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"); expect(input, label).toBeDefined();
  await act(async () => { const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value); input!.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks();
  Object.values(mocks).forEach(mock => mock.mockResolvedValue(empty));
  mocks.plan!.mockResolvedValue(plan); mocks.shares!.mockResolvedValue([]); mocks.artifacts!.mockResolvedValue([]);
  mocks.gapEvidence!.mockResolvedValue([{ id: "e1", evidenceKind: "COUNTER", explanation: "A conflicting finding", paperId: { id: "paper", title: "Replication study" } }]);
  mocks.savePlan!.mockResolvedValue({ version: 2, revisionId: "r2" });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("saves incomplete research plans without destroying hidden approach fields", async () => {
  await render(<WorkspacePlanPanel projectId="p" />);
  await fill("Research approach", "EMPIRICAL"); await click("Save research plan");
  expect(mocks.savePlan).toHaveBeenCalledWith("p", expect.objectContaining({ approach: "EMPIRICAL", methodology: "Interviews", searchStrategy: "Retained search", objectives: [], expectedVersion: 1 }));
});
it("refreshes connected research queries after a plan command without invalidating another project", async () => {
  client.setQueryDefaults(["project-research"], { gcTime: Infinity });
  client.setQueryData(["project-research", "actor", "p", "evidence"], empty);
  client.setQueryData(["project-research", "actor", "other", "evidence"], empty);
  await render(<WorkspacePlanPanel projectId="p" />); await fill("Research problem", "A revised question"); await click("Save research plan");
  expect(client.getQueryState(["project-research", "actor", "p", "evidence"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["project-research", "actor", "other", "evidence"])?.isInvalidated).toBe(false);
});
it("keeps the local plan draft when saving fails", async () => {
  mocks.savePlan!.mockRejectedValue(new Error("Conflict")); await render(<WorkspacePlanPanel projectId="p" />);
  await fill("Research problem", "Local unsaved research problem"); await click("Save research plan");
  expect(container.querySelector("textarea")?.value).toBe("Local unsaved research problem"); expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).not.toContain("Research plan saved");
});
it("keeps question provenance in plan saves and shows contradictory source evidence", async () => {
  const question = { id: "q1", text: "Does it replicate?", sourceGapId: "g1", evidenceIds: ["e1"] };
  mocks.plan!.mockResolvedValue({ ...plan, content: { ...plan.content, questions: [question] } });
  await render(<WorkspacePlanPanel projectId="p" />);
  const sources = [...container.querySelectorAll("details")].find(item => item.querySelector("summary")?.textContent?.startsWith("Question sources")); expect(sources).toBeDefined();
  await act(async () => { sources!.open = true; sources!.dispatchEvent(new Event("toggle")); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(container.textContent).toContain("Counterevidence"); expect(container.textContent).toContain("A conflicting finding");
  expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  await fill("Research approach", "EMPIRICAL"); await click("Save research plan");
  expect(mocks.savePlan).toHaveBeenCalledWith("p", expect.objectContaining({ questions: [question] }));
});
it("retains the original edit version and draft across a collaborator's background update", async () => {
  await render(<WorkspacePlanPanel projectId="p" />); await fill("Research problem", "My local draft");
  mocks.plan!.mockResolvedValue({ ...plan, version: 2, currentRevisionId: "r2", content: { ...plan.content, problem: "Teammate's version" } });
  await act(async () => { await client.invalidateQueries({ queryKey: ["project-workspace", "actor", "p", "plan"] }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(container.querySelector("textarea")?.value).toBe("My local draft"); expect(container.textContent).toContain("Your draft has been kept");
  await click("Save research plan"); expect(mocks.savePlan).toHaveBeenCalledWith("p", expect.objectContaining({ expectedVersion: 1, problem: "My local draft" }));
});
it("shows mentors only a shared plan reader and comments", async () => {
  mocks.plan!.mockResolvedValue({ ...plan, canEdit: false, access: "MENTOR" });
  await render(<WorkspacePlanPanel projectId="p" mentor />);
  expect(container.textContent).toContain("Initial question"); expect(container.textContent).toContain("Shared for feedback");
  expect(container.textContent).not.toContain("Save research plan"); expect(container.textContent).not.toContain("Version history");
  expect(container.textContent).not.toContain("Notify a teammate");
});
it("keeps a new task and its retry key after an API failure", async () => {
  mocks.saveTask!.mockRejectedValue(new Error("Network interrupted"));
  await render(<WorkspaceTasksPanel projectId="p" readOnly={false} />, "/projects/p?tab=tasks&task=new");
  await fill("Task title", "Read the conflicting study"); await click("Save task"); await click("Save task");
  expect(container.querySelector<HTMLInputElement>("input:not([type])")?.value).toBe("Read the conflicting study");
  const first = mocks.saveTask!.mock.calls[0]![1]; const second = mocks.saveTask!.mock.calls[1]![1]; expect(first.clientKey).toBe(second.clientKey); expect(mocks.saveTask).toHaveBeenCalledTimes(2);
});
it("hides archive write actions even on a direct new-task URL", async () => {
  await render(<WorkspaceTasksPanel projectId="p" readOnly />, "/projects/p?tab=tasks&task=new");
  expect(container.querySelector<HTMLFieldSetElement>("fieldset")?.disabled).toBe(true); expect(container.textContent).not.toContain("Save task");
});
it("renders discussion content as text and denies mentor editing or team decisions", async () => {
  mocks.discussion!.mockResolvedValue({ thread: { id: "thread", title: "Source question", body: '<img src=x onerror="alert(1)">', category: "MENTOR_QUESTION", status: "OPEN", conclusion: "", author: { id: "owner", name: "Owner" }, link: null, mentorRelationshipId: "relationship", version: 1, replyCount: 0, createdAt: "2026-10-14T10:00:00Z", updatedAt: "2026-10-14T10:00:00Z" }, messages: empty, canResolve: false, canReply: true, canEdit: false });
  await render(<WorkspaceDiscussionsPanel projectId="p" readOnly={false} owner={false} mentor />, "/projects/p/plan-review?discussion=thread");
  expect(container.textContent).toContain('<img src=x onerror="alert(1)">'); expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).not.toContain("Edit discussion"); expect(container.textContent).not.toContain("Record a decision from this discussion");
});
it("keeps the original discussion version after a collaborator refreshes the source", async () => {
  const thread = { id: "thread", title: "Method choice", body: "Original scope", category: "GENERAL", status: "OPEN", conclusion: "", author: { id: "owner", name: "Owner" }, link: null, mentorRelationshipId: null, version: 1, replyCount: 0, createdAt: "2026-10-14T10:00:00Z", updatedAt: "2026-10-14T10:00:00Z" };
  mocks.discussion!.mockResolvedValue({ thread, messages: empty, canResolve: true, canReply: true, canEdit: true });
  mocks.saveDiscussion!.mockRejectedValue(new Error("Conflict"));
  await render(<WorkspaceDiscussionsPanel projectId="p" readOnly={false} owner />, "/projects/p?tab=chat&discussion=thread");
  await click("Edit discussion"); await fill("Discussion content", "My local interpretation");
  mocks.discussion!.mockResolvedValue({ thread: { ...thread, version: 2, body: "Teammate's revision" }, messages: empty, canResolve: true, canReply: true, canEdit: true });
  await act(async () => { await client.invalidateQueries({ queryKey: ["project-workspace", "actor", "p", "discussion"] }); });
  expect(container.querySelector("textarea")?.value).toBe("My local interpretation");
  await click("Save discussion");
  expect(mocks.saveDiscussion).toHaveBeenCalledWith("p", expect.objectContaining({ expectedVersion: 1, body: "My local interpretation" }), "thread");
});
it("preserves an unsaved conclusion when a discussion is updated in the background", async () => {
  const thread = { id: "thread", title: "Evidence limitations", body: "Compare methods", category: "GENERAL", status: "OPEN", conclusion: "", author: { id: "owner", name: "Owner" }, link: null, mentorRelationshipId: null, version: 1, replyCount: 0, createdAt: "2026-10-14T10:00:00Z", updatedAt: "2026-10-14T10:00:00Z" };
  mocks.discussion!.mockResolvedValue({ thread, messages: empty, canResolve: true, canReply: false, canEdit: false });
  mocks.resolve!.mockRejectedValue(new Error("Conflict"));
  await render(<WorkspaceDiscussionsPanel projectId="p" readOnly={false} owner />, "/projects/p?tab=chat&discussion=thread");
  await fill("Conclusion", "Keep the conflicting evidence visible");
  mocks.discussion!.mockResolvedValue({ thread: { ...thread, version: 2 }, messages: empty, canResolve: true, canReply: false, canEdit: false });
  await act(async () => { await client.invalidateQueries({ queryKey: ["project-workspace", "actor", "p", "discussion"] }); });
  expect(container.querySelector("textarea")?.value).toBe("Keep the conflicting evidence visible");
  await click("Save conclusion and resolve");
  expect(mocks.resolve).toHaveBeenCalledWith("p", "thread", expect.objectContaining({ expectedVersion: 1, conclusion: "Keep the conflicting evidence visible" }));
});
it("preserves the team's decision rationale on a failed save", async () => {
  mocks.saveDecision!.mockRejectedValue(new Error("Conflict"));
  await render(<WorkspaceDecisions projectId="p" readOnly={false} fromThread="thread" />);
  await fill("Decision", "Keep the candidate open"); await fill("Rationale", "Conflicting evidence remains unresolved"); await click("Save decision");
  expect(container.textContent).toContain("Record decision"); expect([...container.querySelectorAll("textarea")].some(input => input.value === "Conflicting evidence remains unresolved")).toBe(true);
});
it("asks once when more than one workspace form has unsaved input", async () => {
  function DirtyForm() { useUnsavedWorkspace(true); return null; }
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false); await render(<><DirtyForm /><DirtyForm /></>);
  expect(canLeaveWorkspace()).toBe(false); expect(confirm).toHaveBeenCalledTimes(1);
  confirm.mockReturnValue(true); expect(canLeaveWorkspace()).toBe(true); expect(confirm).toHaveBeenCalledTimes(2);
});
