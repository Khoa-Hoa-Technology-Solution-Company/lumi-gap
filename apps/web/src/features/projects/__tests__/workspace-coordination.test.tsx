// @vitest-environment jsdom
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ResearchPlanContent, ResearchPlanView } from "@trend/shared-types";
import { WorkspacePlanPanel } from "../components/workspace-plan";
import { PlanDocument } from "../components/plan-document";
import { usePlanDraft } from "../hooks/use-plan-draft";
import { WorkspaceTasksPanel } from "../components/workspace-tasks";
import { WorkspaceDiscussionsPanel } from "../components/workspace-discussions";
import { WorkspaceDecisions } from "../components/workspace-decisions";
import { canLeaveWorkspace, useUnsavedWorkspace } from "../components/workspace-common";

vi.mock("@dnd-kit/react", () => ({ KeyboardSensor: class {}, PointerSensor: { configure: () => ({}), defaults: {} }, DragDropProvider: ({ children }: { children: ReactNode }) => children, useDroppable: () => ({ ref: () => undefined, isDropTarget: false }) }));
vi.mock("@dnd-kit/react/sortable", () => ({ useSortable: () => ({ ref: () => undefined, handleRef: () => undefined, isDragSource: false }), isSortable: () => false }));
const mocks = vi.hoisted(() => Object.fromEntries(["gapEvidence", "plan", "savePlan", "updatePlanDraft", "snapshotPlan", "restorePlan", "planThreads", "createPlanThread", "planHistory", "shares", "overview", "comments", "comment", "people", "artifacts", "tasks", "taskBoard", "moveTask", "task", "saveTask", "milestones", "saveMilestone", "discussions", "discussion", "saveDiscussion", "reply", "resolve", "decisions", "saveDecision", "history"].map(key => [key, vi.fn()])));
vi.mock("../api/workspace.api", () => ({ workspaceApi: mocks }));
vi.mock("@/features/gaps/api/gaps.api", () => ({ gapsApi: { evidence: mocks.gapEvidence } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "actor" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, unknown>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }) }));
const empty = { items: [], total: 0, page: 1, pageSize: 20, hasNext: false };
const plan: ResearchPlanView = { projectId: "p", projectTitle: "Research", version: 1, currentRevisionId: "r1", canEdit: true, canShare: false, archived: false, access: "TEAM", content: { approach: "UNDECIDED", problem: "Initial question", objectives: [], questions: [], scope: "", methodology: "Interviews", searchStrategy: "Retained search", deliverables: [], inclusionCriteria: [], exclusionCriteria: [] } };
function StructuredDraft({ content }: { content: ResearchPlanContent }) {
  const state = usePlanDraft("p", { ...plan, content });
  return <PlanDocument projectId="p" content={state.draft} editable version={state.version} archived={false} mentor={false} field={state.field} />;
}
let root: Root, container: HTMLDivElement, client: QueryClient;
async function render(node: ReactNode, path = "/projects/p?tab=plan") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}<ConfirmationDialog /></MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}
async function click(text: string) { const button = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text); expect(button, text).toBeDefined(); await act(async () => button!.click()); await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); }
async function autosave() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 1050)); }); }
async function fill(label: string, value: string) {
  if (container.querySelector(".project-about") && [...container.querySelectorAll("button")].some(button => button.textContent === "Edit")) await click("Edit");
  const parent = [...document.body.querySelectorAll("label")].find(item => item.textContent?.startsWith(label));
  const input = document.body.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`input[aria-label="${label}"], textarea[aria-label="${label}"], select[aria-label="${label}"]`) ?? parent?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"); expect(input, label).toBeDefined();
  for (let parent = input?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
  await act(async () => { const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value); input!.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks();
  Object.values(mocks).forEach(mock => mock.mockResolvedValue(empty));
  mocks.taskBoard!.mockResolvedValue({ boardVersion: 1, columns: { TODO: empty, IN_PROGRESS: empty, BLOCKED: empty, DONE: empty } });
  mocks.plan!.mockResolvedValue(plan); mocks.shares!.mockResolvedValue([]); mocks.artifacts!.mockResolvedValue([]);
  mocks.gapEvidence!.mockResolvedValue([{ id: "e1", evidenceKind: "COUNTER", explanation: "A conflicting finding", paperId: { id: "paper", title: "Replication study" } }]);
  mocks.savePlan!.mockResolvedValue({ version: 2, revisionId: "r2" });
  mocks.updatePlanDraft!.mockImplementation(async (_id, input) => ({ version: 2, content: { ...plan.content, ...input.changes } }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });


it("opens the about document for reading and saves only the introduction when editing finishes", async () => {
  await render(<WorkspacePlanPanel projectId="p" />);
  expect(container.querySelector(".project-readme-filename")?.textContent).toBe("README.md");
  expect(container.querySelector(".about-project-story")?.textContent).toBe("Initial question");
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.querySelector("details, .about-project-footer")).toBeNull();
  await fill("Project introduction", "We explore how research teams evaluate conflicting evidence.");
  expect(container.querySelectorAll("textarea")).toHaveLength(1);
  await click("Done editing");
  expect(mocks.updatePlanDraft).toHaveBeenCalledWith("p", expect.objectContaining({ changes: { problem: "We explore how research teams evaluate conflicting evidence." }, base: { problem: "Initial question" } }));
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.querySelector(".about-project-story")?.textContent).toContain("conflicting evidence");
});
it("starts an empty project with a single README editor", async () => {
  mocks.plan!.mockResolvedValue({ ...plan, content: { ...plan.content, problem: "", methodology: "", searchStrategy: "" } });
  await render(<WorkspacePlanPanel projectId="p" />);
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.querySelector(".about-project-direction")).toBeNull();
  await click("Edit");
  expect(container.querySelector<HTMLTextAreaElement>("#plan-problem")?.value).toBe("");
  expect(container.querySelectorAll("textarea")).toHaveLength(1);
  expect(container.querySelector("details, select")).toBeNull();
  expect(mocks.updatePlanDraft).not.toHaveBeenCalled();
});
it("keeps the editor and introduction open when finishing cannot save", async () => {
  mocks.updatePlanDraft!.mockRejectedValue(new Error("Network interrupted"));
  await render(<WorkspacePlanPanel projectId="p" />);
  await fill("Project introduction", "Keep this description until it is saved.");
  await click("Done editing");
  expect(container.querySelector<HTMLTextAreaElement>("#plan-problem")?.value).toBe("Keep this description until it is saved.");
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});
it("renders archived introductions safely without edit controls", async () => {
  const problem = '<img src=x onerror="alert(1)">';
  mocks.plan!.mockResolvedValue({ ...plan, canEdit: false, archived: true, content: { ...plan.content, problem } });
  await render(<WorkspacePlanPanel projectId="p" />);
  expect(container.querySelector(".about-project-story")?.textContent).toBe(problem);
  expect(container.querySelector("img, textarea")).toBeNull();
  expect([...container.querySelectorAll("button")].some(button => button.textContent === "Edit")).toBe(false);
});
it("opens existing research questions when following a direct question link", async () => {
  mocks.plan!.mockResolvedValue({ ...plan, content: { ...plan.content, questions: [{ id: "q1", text: "Which evidence is reproducible?" }] } });
  await render(<WorkspacePlanPanel projectId="p" />, "/projects/p?tab=plan&question=q1#question-q1");
  expect(container.querySelector<HTMLDetailsElement>(".about-project-direction")?.open).toBe(true);
  expect(container.querySelector("#question-q1")?.textContent).toContain("Which evidence is reproducible?");
  expect(container.querySelector("textarea")).toBeNull();
});

it("renders README Markdown and previews edits without exposing research forms", async () => {
  const problem = "# LumiGap\n\nA **collaborative** research workspace.\n\n- Find evidence\n- Discuss findings\n\n[Docs](https://example.org/docs)";
  mocks.plan!.mockResolvedValue({ ...plan, content: { ...plan.content, problem } });
  await render(<WorkspacePlanPanel projectId="p" />);
  expect(container.querySelector(".project-readme-content h1")?.textContent).toBe("LumiGap");
  expect(container.querySelector(".project-readme-content strong")?.textContent).toBe("collaborative");
  expect(container.querySelectorAll(".project-readme-content li")).toHaveLength(2);
  expect(container.querySelector<HTMLAnchorElement>(".project-readme-content a")?.rel).toContain("noopener");
  expect(container.textContent).not.toContain("Methods & supporting details");
  expect(container.textContent).not.toContain("Versions & mentor feedback");
  expect(container.textContent).not.toContain("Draft saved");
  await fill("Project introduction", "## Research focus\n\nA simpler introduction.");
  await click("Preview");
  expect(container.querySelector(".project-readme-content h2")?.textContent).toBe("Research focus");
  expect(container.querySelector("textarea")).toBeNull();
  await click("Write");
  expect(container.querySelector("textarea")?.value).toContain("## Research focus");
  await click("Done editing");
  expect(mocks.updatePlanDraft).toHaveBeenCalledWith("p", expect.objectContaining({ changes: { problem: "## Research focus\n\nA simpler introduction." } }));
});
it("blocks executable Markdown links and raw HTML", async () => {
  mocks.plan!.mockResolvedValue({ ...plan, content: { ...plan.content, problem: '[Unsafe](javascript:alert%281%29)\n\n<script>alert(1)</script>' } });
  await render(<WorkspacePlanPanel projectId="p" />);
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector(".project-readme-content a")?.getAttribute("href")).not.toMatch(/^javascript:/);
});

it("saves incomplete research plans without destroying hidden approach fields", async () => {
  await render(<StructuredDraft content={plan.content} />);
  await fill("Research approach", "EMPIRICAL"); await autosave();
  expect(mocks.updatePlanDraft).toHaveBeenCalledWith("p", expect.objectContaining({ changes: { approach: "EMPIRICAL" }, base: { approach: "UNDECIDED" }, expectedVersion: 1 }));
  expect(container.querySelector<HTMLTextAreaElement>('#plan-methodology')?.value).toBe("Interviews");
});
it("refreshes connected research queries after a plan command without invalidating another project", async () => {
  client.setQueryDefaults(["project-research"], { gcTime: Infinity });
  client.setQueryData(["project-research", "actor", "p", "evidence"], empty);
  client.setQueryData(["project-research", "actor", "other", "evidence"], empty);
  await render(<WorkspacePlanPanel projectId="p" />); await fill("Project introduction", "A revised question"); await autosave();
  expect(client.getQueryState(["project-research", "actor", "p", "evidence"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["project-research", "actor", "other", "evidence"])?.isInvalidated).toBe(false);
});
it("keeps the local plan draft when saving fails", async () => {
  mocks.updatePlanDraft!.mockRejectedValue(new Error("Network interrupted")); await render(<WorkspacePlanPanel projectId="p" />);
  await fill("Project introduction", "Local unsaved research problem"); await autosave();
  expect(container.querySelector("textarea")?.value).toBe("Local unsaved research problem"); expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).not.toContain("Research plan saved");
});
it("keeps question provenance in plan saves and shows contradictory source evidence", async () => {
  const question = { id: "q1", text: "Does it replicate?", sourceGapId: "g1", evidenceIds: ["e1"] };
  mocks.plan!.mockResolvedValue({ ...plan, content: { ...plan.content, questions: [question] } });
  await render(<StructuredDraft content={{ ...plan.content, questions: [question] }} />);
  const sources = [...container.querySelectorAll("details")].find(item => item.querySelector("summary")?.textContent?.startsWith("Question sources")); expect(sources).toBeDefined();
  await act(async () => { sources!.open = true; sources!.dispatchEvent(new Event("toggle")); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(container.textContent).toContain("Counterevidence"); expect(container.textContent).toContain("A conflicting finding");
  expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  mocks.updatePlanDraft!.mockResolvedValue({ version: 2, content: { ...plan.content, approach: "EMPIRICAL", questions: [question] } });
  await fill("Research approach", "EMPIRICAL"); await autosave();
  expect(mocks.updatePlanDraft).toHaveBeenCalledWith("p", expect.objectContaining({ changes: { approach: "EMPIRICAL" } }));
  expect(container.querySelector<HTMLTextAreaElement>('[aria-label="Question 1"]')?.value).toBe(question.text);
});
it("retains the original edit version and draft across a collaborator's background update", async () => {
  await render(<WorkspacePlanPanel projectId="p" />); await fill("Project introduction", "My local draft");
  mocks.plan!.mockResolvedValue({ ...plan, version: 2, currentRevisionId: "r2", content: { ...plan.content, problem: "Teammate's version" } });
  await act(async () => { await client.invalidateQueries({ queryKey: ["project-workspace", "actor", "p", "plan"] }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(container.querySelector("textarea")?.value).toBe("My local draft");
  await autosave(); expect(mocks.updatePlanDraft).toHaveBeenCalledWith("p", expect.objectContaining({ expectedVersion: 1, base: { problem: "Initial question" }, changes: { problem: "My local draft" } }));
});
it("shows mentors only a shared plan reader and comments", async () => {
  mocks.plan!.mockResolvedValue({ ...plan, canEdit: false, access: "MENTOR" });
  await render(<WorkspacePlanPanel projectId="p" mentor />);
  expect(container.textContent).toContain("Initial question"); expect(container.textContent).toContain("Immutable version 1");
  expect(container.textContent).not.toContain("Save research plan"); expect(container.textContent).not.toContain("Version history");
  expect(container.textContent).not.toContain("Notify a teammate");
});
it("preserves typing during a pending autosave and sends it after acknowledgment", async () => {
  let acknowledge!: (value: unknown) => void;
  mocks.updatePlanDraft!.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
  await render(<WorkspacePlanPanel projectId="p" />); await fill("Project introduction", "First edit"); await autosave();
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Saving…");
  await fill("Project introduction", "New typing during save");
  await act(async () => acknowledge({ version: 2, content: { ...plan.content, problem: "First edit" } }));
  expect(container.querySelector("textarea")?.value).toBe("New typing during save");
  await autosave();
  expect(mocks.updatePlanDraft!.mock.calls[1]![1]).toMatchObject({ expectedVersion: 2, base: { problem: "First edit" }, changes: { problem: "New typing during save" } });
});
it("retries the exact uncertain request before saving newer edits", async () => {
  mocks.updatePlanDraft!.mockRejectedValueOnce(new Error("Response lost"));
  await render(<WorkspacePlanPanel projectId="p" />); await fill("Project introduction", "Possibly persisted"); await autosave();
  const input = mocks.updatePlanDraft!.mock.calls[0]![1];
  await fill("Project introduction", "Later local edit");
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Could not sync changes");
  await click("Retry sync"); expect(mocks.updatePlanDraft!.mock.calls[1]![1]).toEqual(input);
  expect(container.querySelector("textarea")?.value).toBe("Later local edit");
  await autosave(); expect(mocks.updatePlanDraft!.mock.calls[2]![1].changes).toEqual({ problem: "Later local edit" });
});
it("requires an explicit choice for conflicting README content", async () => {
  mocks.updatePlanDraft!.mockRejectedValueOnce({ response: { status: 409, data: { error: { message: "Conflict", details: { fields: ["problem"] } } } } });
  await render(<WorkspacePlanPanel projectId="p" />);
  mocks.plan!.mockResolvedValue({ ...plan, version: 2, content: { ...plan.content, problem: "Saved by teammate" } });
  await fill("Project introduction", "My interpretation"); await autosave();
  expect(container.textContent).toContain("Resolve overlapping changes");
  const merge = [...container.querySelectorAll("button")].find(button => button.textContent === "Merge and continue")!;
  expect(merge.disabled).toBe(true);
  await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  await click("Merge and continue"); await autosave();
  expect(mocks.updatePlanDraft!.mock.calls[1]![1]).toMatchObject({ expectedVersion: 2, base: { problem: "Saved by teammate" }, changes: { problem: "My interpretation" } });
});
it("preserves imported whitespace without saving an untouched plan", async () => {
  mocks.plan!.mockResolvedValue({ ...plan, content: { ...plan.content, problem: "  Imported wording  ", objectives: [" Original goal "] } });
  await render(<WorkspacePlanPanel projectId="p" />); await autosave();
  expect(mocks.updatePlanDraft).not.toHaveBeenCalled();
  expect(container.querySelector(".about-project-story")?.textContent).toBe("Imported wording");
  expect(container.querySelector("textarea")).toBeNull();
  await click("Edit");
  expect(container.querySelector("textarea")?.value).toBe("  Imported wording  ");
});
it("recovers an expired-session edit after the original account signs in again in the same tab", async () => {
  mocks.updatePlanDraft!.mockRejectedValueOnce({ response: { status: 401 } });
  await render(<WorkspacePlanPanel projectId="p" />); await fill("Project introduction", "Kept through sign-in"); await autosave();
  await act(async () => root.unmount()); client.clear(); root = createRoot(container);
  await render(<WorkspacePlanPanel projectId="p" />);
  expect(container.querySelector("textarea")?.value).toBe("Kept through sign-in");
  expect(container.textContent).toContain("Recovered your unsynced draft");
  await autosave(); expect(mocks.updatePlanDraft!.mock.calls[1]![1]).toMatchObject({ base: { problem: "Initial question" }, changes: { problem: "Kept through sign-in" } });
});
it("reorders objectives and enforces the list limit", async () => {
  const objectives = Array.from({ length: 20 }, (_, index) => `Goal ${index + 1}`);
  mocks.plan!.mockResolvedValue({ ...plan, content: { ...plan.content, objectives } });
  await render(<StructuredDraft content={{ ...plan.content, objectives }} />);
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "Add objective")?.disabled).toBe(true);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Move Research objectives 1 down"]')!.click());
  await autosave(); expect(mocks.updatePlanDraft!.mock.calls[0]![1].changes.objectives.slice(0, 2)).toEqual(["Goal 2", "Goal 1"]);
});
it("keeps a new task and its retry key after an API failure", async () => {
  mocks.saveTask!.mockRejectedValue(new Error("Network interrupted"));
  await render(<WorkspaceTasksPanel projectId="p" readOnly={false} />, "/projects/p?tab=tasks&task=new");
  await fill("Task title", "Read the conflicting study"); await click("Save task"); await click("Save task");
  expect(document.body.querySelector<HTMLInputElement>(".task-title-field textarea")?.value).toBe("Read the conflicting study");
  const first = mocks.saveTask!.mock.calls[0]![1]; const second = mocks.saveTask!.mock.calls[1]![1]; expect(first.clientKey).toBe(second.clientKey); expect(mocks.saveTask).toHaveBeenCalledTimes(2);
  await fill("Task title", "Read a revised study"); await click("Save task");
  expect(mocks.saveTask!.mock.calls[2]![1].clientKey).not.toBe(first.clientKey);
});
it("hides archive write actions even on a direct new-task URL", async () => {
  await render(<WorkspaceTasksPanel projectId="p" readOnly />, "/projects/p?tab=tasks&task=new");
  expect(document.body.querySelector<HTMLFieldSetElement>("fieldset")?.disabled).toBe(true); expect(document.body.textContent).not.toContain("Save task");
});
it("opens milestones in a dialog and keeps the draft on save failure and canceled dismissal", async () => {
  mocks.saveMilestone!.mockRejectedValueOnce(new Error("Network interrupted"));
  await render(<WorkspaceTasksPanel projectId="p" readOnly={false} />, "/projects/p?tab=tasks&view=milestones");
  await click("New milestone");
  expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  await fill("Milestone title", "Finish evidence screening"); await click("Save milestone");
  expect(document.body.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe("Finish evidence screening");
  await click("Cancel"); await click("Keep editing");
  expect(document.body.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe("Finish evidence screening");
  await click("Save milestone");
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.saveMilestone).toHaveBeenLastCalledWith("p", expect.objectContaining({ title: "Finish evidence screening" }), undefined);
});
it("retries a new milestone with the same receipt and rotates it after editing", async () => {
  mocks.saveMilestone!.mockRejectedValue(new Error("Uncertain send"));
  await render(<WorkspaceTasksPanel projectId="p" readOnly={false} />, "/projects/p?tab=tasks&view=milestones");
  await click("New milestone"); await fill("Milestone title", "First target");
  await click("Save milestone"); await click("Save milestone");
  const key = mocks.saveMilestone!.mock.calls[0]![1].clientKey;
  expect(key).toEqual(expect.any(String)); expect(mocks.saveMilestone!.mock.calls[1]![1].clientKey).toBe(key);
  await fill("Milestone title", "Revised target"); await click("Save milestone");
  expect(mocks.saveMilestone!.mock.calls[2]![1].clientKey).not.toBe(key);
});
it("retains a milestone draft on version conflict and explicitly reloads the latest version", async () => {
  const milestone = { id: "m1", title: "Original target", description: "", dueAt: null, status: "PLANNED", version: 1 };
  mocks.milestones!.mockResolvedValue({ ...empty, items: [milestone], total: 1 });
  mocks.saveMilestone!.mockImplementationOnce(async () => {
    mocks.milestones!.mockResolvedValue({ ...empty, items: [{ ...milestone, title: "Team updated target", version: 2 }], total: 1 });
    throw { response: { status: 409 } };
  });
  await render(<WorkspaceTasksPanel projectId="p" readOnly={false} />, "/projects/p?tab=tasks&view=milestones");
  await act(async () => document.body.querySelector<HTMLButtonElement>(".coord-action-list button")!.click());
  await fill("Milestone title", "My unsaved target"); await click("Save milestone");
  expect(document.body.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe("My unsaved target");
  expect(document.body.textContent).toContain("A newer version is available");
  await click("Load latest version"); await click("Leave without saving");
  expect(document.body.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe("Team updated target");
  await click("Save milestone");
  expect(mocks.saveMilestone).toHaveBeenLastCalledWith("p", expect.objectContaining({ title: "Team updated target", expectedVersion: 2 }), "m1");
});
it("disables an open milestone editor when project write access changes", async () => {
  await render(<WorkspaceTasksPanel projectId="p" readOnly={false} />, "/projects/p?tab=tasks&view=milestones");
  await click("New milestone"); await fill("Milestone title", "Retained target");
  await render(<WorkspaceTasksPanel projectId="p" readOnly />, "/projects/p?tab=tasks&view=milestones");
  expect(document.body.querySelector<HTMLFieldSetElement>('[role="dialog"] fieldset')?.disabled).toBe(true);
  expect(document.body.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe("Retained target");
  await act(async () => document.body.querySelector(".milestone-dialog-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(mocks.saveMilestone).not.toHaveBeenCalled();
});
it("renders discussion content as text and denies mentor editing or team decisions", async () => {
  mocks.discussion!.mockResolvedValue({ thread: { id: "thread", title: "Source question", body: '<img src=x onerror="alert(1)">', category: "MENTOR_QUESTION", status: "OPEN", conclusion: "", author: { id: "owner", name: "Owner" }, link: null, mentorRelationshipId: "relationship", version: 1, replyCount: 0, createdAt: "2026-10-14T10:00:00Z", updatedAt: "2026-10-14T10:00:00Z" }, messages: empty, canResolve: false, canReply: true, canEdit: false });
  await render(<WorkspaceDiscussionsPanel projectId="p" readOnly={false} owner={false} mentor />, "/projects/p/plan-review?discussion=thread");
  expect(container.textContent).toContain('<img src=x onerror="alert(1)">'); expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).not.toContain("Edit discussion"); expect(container.textContent).not.toContain("Record a decision from this discussion");
});
it("opens team chat by default and keeps threads and decisions as tools inside it", async () => {
  await render(<WorkspaceDiscussionsPanel projectId="p" readOnly={false} legacyChat={<p>Chat interface</p>} />, "/projects/p?tab=chat");
  expect(container.querySelector("h2")?.textContent).toBe("Team chat & AI");
  expect(container.textContent).toContain("Chat interface");
  expect(container.querySelector(".coord-subnav")).toBeNull();
  expect(mocks.discussions).not.toHaveBeenCalled(); expect(mocks.decisions).not.toHaveBeenCalled();
  await click("Threads"); expect(container.textContent).toContain("Make room for a research conversation");
  await click("Decision log"); expect(container.textContent).toContain("Keep the reason behind each decision");
  await click("Back to chat"); expect(container.textContent).toContain("Chat interface");
});
it("keeps a decision draft when returning to chat is canceled", async () => {
  await render(<WorkspaceDiscussionsPanel projectId="p" readOnly={false} legacyChat={<p>Chat interface</p>} />, "/projects/p?tab=chat&discussionView=decisions&fromThread=source");
  await fill("Decision", "Use the broader evidence base");
  await click("Back to chat"); await click("Keep editing");
  expect([...container.querySelectorAll("textarea")].some(input => input.value === "Use the broader evidence base")).toBe(true);
  await click("Back to chat"); await click("Leave without saving");
  expect(container.textContent).toContain("Chat interface");
  await click("Decision log"); expect(container.querySelector("textarea")).toBeNull();
});
it("keeps the original discussion version after a collaborator refreshes the source", async () => {
  const thread = { id: "thread", title: "Method choice", body: "Original scope", category: "GENERAL", status: "OPEN", conclusion: "", author: { id: "owner", name: "Owner" }, link: null, mentorRelationshipId: null, version: 1, replyCount: 0, createdAt: "2026-10-14T10:00:00Z", updatedAt: "2026-10-14T10:00:00Z" };
  mocks.discussion!.mockResolvedValue({ thread, messages: empty, canResolve: true, canReply: true, canEdit: true });
  mocks.saveDiscussion!.mockRejectedValue(new Error("Conflict"));
  await render(<WorkspaceDiscussionsPanel projectId="p" readOnly={false} owner legacyChat={<p>Chat interface</p>} />, "/projects/p?tab=chat&discussionView=chat&discussion=thread");
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
  const native = vi.spyOn(window, "confirm"); await render(<><DirtyForm /><DirtyForm /></>);
  let pending!: Promise<boolean>;
  await act(async () => { pending = canLeaveWorkspace(); });
  expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
  expect(document.activeElement?.textContent).toBe("Keep editing");
  await click("Keep editing"); expect(await pending).toBe(false);
  await act(async () => { pending = canLeaveWorkspace(); });
  await click("Leave without saving"); expect(await pending).toBe(true);
  expect(native).not.toHaveBeenCalled();
});

it("guards router links once, preserves input on cancel and navigates only after confirmation", async () => {
  function Editor() {
    useUnsavedWorkspace(true); useUnsavedWorkspace(true);
    const location = useLocation();
    return <><input defaultValue="Draft kept" /><Link to="/projects/next">Next project</Link><output>{location.pathname}</output></>;
  }
  await render(<Editor />);
  const anchor = container.querySelector("a")!;
  await act(async () => anchor.click());
  expect(container.querySelector("output")?.textContent).toBe("/projects/p");
  expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
  await click("Keep editing");
  expect(container.querySelector("input")?.value).toBe("Draft kept");
  await act(async () => anchor.click()); await click("Leave without saving");
  expect(container.querySelector("output")?.textContent).toBe("/projects/next");
});
it("cancels with Escape, ignores duplicate requests and retains the reload warning", async () => {
  function Editor() { useUnsavedWorkspace(true); return <input defaultValue="Retained" />; }
  await render(<Editor />);
  const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
  let pending!: Promise<boolean>;
  await act(async () => { pending = canLeaveWorkspace(); });
  expect(await canLeaveWorkspace()).toBe(false);
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(await pending).toBe(false); expect(container.querySelector("input")?.value).toBe("Retained");
});
