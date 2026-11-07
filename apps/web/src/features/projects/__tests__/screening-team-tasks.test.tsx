// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScreeningAutomaticTask, ScreeningWorkspaceSummary, WorkspaceTask, WorkspaceTaskStatus } from "@trend/shared-types";
import { WorkspaceTasksPanel } from "../components/workspace-tasks";
const mocks = vi.hoisted(() => ({ workspaceSummary: vi.fn(), taskBoard: vi.fn(), tasks: vi.fn(), milestones: vi.fn(), people: vi.fn(), moveTask: vi.fn(), saveTask: vi.fn() }));
vi.mock("../api/screening.api", () => ({ screeningApi: mocks }));
vi.mock("../api/workspace.api", () => ({ workspaceApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "reviewer" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "vi", t: (key: string, values?: Record<string, unknown>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }) }));
vi.mock("@dnd-kit/react", () => ({ KeyboardSensor: class {}, PointerSensor: { configure: () => ({}), defaults: {} }, DragDropProvider: ({ children }: { children: ReactNode }) => children, useDroppable: () => ({ ref: () => undefined, isDropTarget: false }) }));
vi.mock("@dnd-kit/react/sortable", () => ({ useSortable: () => ({ ref: () => undefined, handleRef: () => undefined, isDragSource: false }), isSortable: () => false }));
vi.mock("../components/screening-adjudication", () => ({ ScreeningAdjudicationDialog: ({ roundId, focusSection }: { roundId: string; focusSection: string }) => <div role="dialog">{roundId}/{focusSection}</div> }));
const empty = { items: [], total: 0, page: 1, pageSize: 20, hasNext: false };
const manual: WorkspaceTask = { id: "manual", title: "Write literature review", description: "", status: "TODO", blockedReason: "", priority: "MEDIUM", assignee: null, creator: { id: "owner", name: "Owner" }, milestoneId: null, dueAt: null, completedAt: null, completedBy: null, deletedAt: null, version: 1, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", parentTaskId: null, checklist: [], sortOrder: 1, subtaskCount: 0, completedSubtaskCount: 0, link: null };
const summary: ScreeningWorkspaceSummary = {
  myActiveClaims: [{ paperId: "claimed", roundId: "claimed-round", title: "Unfinished research paper", assignmentId: "claim", phase: "TITLE_ABSTRACT", publicationYear: 2024, dueAt: null, expiresInSeconds: null, canExtend: true, canRelease: true }],
  pendingConsensus: [], pendingAdjudications: [{ paperId: "third", roundId: "third-round", title: "Assigned adjudication", status: "ADJUDICATING", caseStatus: "ASSIGNED" }],
  myTrackedDisputes: [{ paperId: "dispute", roundId: "dispute-round", title: "Needs my opinion", phase: "TITLE_ABSTRACT", status: "ADJUDICATING", caseStatus: "COLLECTING", myDecision: "INCLUDE", needsMyStatement: true }],
  myProposalsCount: 0, recentProposals: [], eligibleQueueCount: 0, nextEligiblePaperId: null, discoveryGoal: { enabled: false, target: 2, period: "WEEK", paused: false, currentCount: 0, remaining: 2 }, capacityAdvice: { queueStatus: "NORMAL", message: "" },
};
let root: Root, container: HTMLDivElement, client: QueryClient;
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); }); }
async function render(url = "/projects/project?tab=tasks&view=screening&screeningTab=pending", readOnly = false) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><WorkspaceTasksPanel projectId="project" readOnly={readOnly} /></MemoryRouter></QueryClientProvider>));
  for (let attempt = 0; attempt < 30; attempt++) {
    await settle();
    if (container.querySelector('.task-board, .task-list')) break;
  }
  await settle();
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks();
  mocks.workspaceSummary.mockResolvedValue(summary); mocks.milestones.mockResolvedValue(empty); mocks.people.mockResolvedValue(empty); mocks.moveTask.mockResolvedValue({});
  mocks.taskBoard.mockImplementation(async (_id, query) => ({ boardVersion: 4, columns: Object.fromEntries((["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as WorkspaceTaskStatus[]).map(status => [status, { ...empty, items: status === 'TODO' && (!query.q || manual.title.includes(query.q)) ? [manual] : [], total: status === 'TODO' && (!query.q || manual.title.includes(query.q)) ? 1 : 0 }])) }));
  mocks.tasks.mockResolvedValue({ ...empty, items: [manual], total: 1 });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });

it("places real screening work alongside manual tasks inside To do without another workspace or duplicate task records", async () => {
  await render();
  const todo = container.querySelector('.task-column[data-status="TODO"]')!;
  expect(todo.querySelector('.task-column-count')?.textContent).toBe('4');
  expect(todo.querySelectorAll('.task-card')).toHaveLength(4);
  expect(container.querySelectorAll('.task-section-nav button')).toHaveLength(2);
  expect(container.querySelector('[role="tablist"]')).toBeNull();
  expect(container.textContent).not.toContain('Đánh giá tài liệu');
  expect(container.textContent).not.toContain('Đã đánh giá');
  expect(container.textContent).not.toContain('Cần giải quyết0');
  expect(todo.textContent).toContain(manual.title);
  expect(todo.querySelectorAll('.task-screening-card select, .task-screening-card .task-drag-handle')).toHaveLength(0);
  expect(mocks.saveTask).not.toHaveBeenCalled(); expect(mocks.moveTask).not.toHaveBeenCalled();
  expect(todo.querySelector('[data-screening-round="claimed-round"] a')?.getAttribute('href')).toContain('round=claimed-round&paper=claimed&section=review');
});
it("opens the right case from the To do column", async () => {
  await render();
  const link = container.querySelector<HTMLAnchorElement>('[data-screening-round="dispute-round"] a')!;
  await act(async () => link.click()); await settle();
  expect(container.querySelector('[role="dialog"]')?.textContent).toBe('dispute-round/statement');
  expect(container.querySelector('.task-board')).not.toBeNull();
});
it("updates the To do count after an opinion is sent without manufacturing Done tasks", async () => {
  await render();
  await act(async () => { client.setQueriesData({ queryKey: ["project-research", "reviewer", "project"] }, { ...summary, myTrackedDisputes: summary.myTrackedDisputes!.map(t => ({ ...t, needsMyStatement: false })) }); });
  await settle();
  expect(container.querySelector('[data-screening-round="dispute-round"]')).toBeNull();
  expect(container.querySelector('.task-column[data-status="TODO"] .task-column-count')?.textContent).toBe('3');
  expect(container.querySelector('.task-column[data-status="DONE"] .task-column-count')?.textContent).toBe('0');
});
it("includes screening work in task search and excludes it from the Unassigned filter", async () => {
  await render();
  const unassigned = [...container.querySelectorAll('button')].find(b => b.textContent === 'Unassigned')!;
  await act(async () => unassigned.click()); await settle();
  expect(container.querySelectorAll('.task-screening-card')).toHaveLength(0);
  await act(async () => unassigned.click()); await settle();
  const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'Unfinished'); search.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => search.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await settle();
  expect(container.querySelectorAll('.task-card')).toHaveLength(1);
  expect(container.querySelector('.task-card')?.textContent).toContain('Unfinished research paper');
});
it("keeps manual task movement working and never sends screening IDs to the task API", async () => {
  await render();
  const select = container.querySelector<HTMLSelectElement>('[data-task-id="manual"] select')!;
  await act(async () => { select.value = 'DONE'; select.dispatchEvent(new Event('change', { bubbles: true })); }); await settle();
  expect(mocks.moveTask).toHaveBeenCalledWith('project', 'manual', expect.objectContaining({ status: 'DONE', expectedBoardVersion: 4 }));
});
it("integrates the same work in list mode and respects its status filter", async () => {
  await render('/projects/project?tab=tasks&view=list');
  expect(container.querySelectorAll('tbody tr')).toHaveLength(4);
  expect(container.querySelectorAll('tbody tr[data-screening-round]')).toHaveLength(3);
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Task status"]')!;
  await act(async () => { select.value = 'DONE'; select.dispatchEvent(new Event('change', { bubbles: true })); }); await settle();
  expect(container.querySelectorAll('tbody tr[data-screening-round]')).toHaveLength(0);
});
it("does not present actions for read-only projects", async () => {
  await render('/projects/project?tab=tasks', true);
  expect(container.querySelectorAll('.task-screening-card')).toHaveLength(0);
});

function obligation(id: string, status: ScreeningAutomaticTask["status"], actionType: ScreeningAutomaticTask["actionType"] = "REVIEW"): ScreeningAutomaticTask {
  return { id, paperId: id, roundId: `${id}-round`, assigneeId: "reviewer", actionType, status, reason: `Backend reason for ${id}`, title: `Paper ${id}`, phase: "TITLE_ABSTRACT", roundNumber: 1, roundStatus: "IN_REVIEW", roundActive: true, dueAt: null, endedAt: ["TODO", "IN_PROGRESS", "BLOCKED"].includes(status) ? null : "2026-11-03T00:00:00Z", updatedAt: "2026-11-03T00:00:00Z" };
}
it("places backend obligations in their real columns and keeps expired/replaced work in history", async () => {
  mocks.workspaceSummary.mockResolvedValue({ ...summary, automaticTasks: [obligation("todo", "TODO"), obligation("progress", "IN_PROGRESS", "ADJUDICATION"), obligation("blocked", "BLOCKED", "ADJUDICATION"), obligation("done", "DONE"), obligation("expired", "EXPIRED"), obligation("replaced", "REPLACED", "DISCUSSION")] });
  await render();
  for (const [status, id] of [["TODO", "todo"], ["IN_PROGRESS", "progress"], ["BLOCKED", "blocked"], ["DONE", "done"]]) {
    expect(container.querySelector(`.task-column[data-status="${status}"] [data-screening-round="${id}-round"]`)).not.toBeNull();
  }
  expect(container.querySelectorAll('.task-board [data-screening-round="expired-round"], .task-board [data-screening-round="replaced-round"]')).toHaveLength(0);
  const history = container.querySelector('.coord-history-panel')!;
  expect(history.textContent).toContain("Hết hạn"); expect(history.textContent).toContain("Đã chuyển bước");
  expect(container.querySelector('.task-screening-card a')?.getAttribute('href')).toContain('automaticTask=todo');
  expect(container.querySelector('.task-screening-card a')?.getAttribute('href')).toContain('taskReturn=');
  expect(container.querySelectorAll('.task-screening-card select, .task-screening-card .task-drag-handle')).toHaveLength(0);
  expect(mocks.moveTask).not.toHaveBeenCalled(); expect(mocks.saveTask).not.toHaveBeenCalled();
});
it("filters manual/automatic sources in the existing menu and restores the source from the URL", async () => {
  mocks.workspaceSummary.mockResolvedValue({ ...summary, automaticTasks: [obligation("done", "DONE"), obligation("todo", "TODO")] });
  await render('/projects/project?tab=tasks&taskSource=SCREENING');
  expect(container.querySelector('[data-task-id="manual"]')).toBeNull();
  expect(container.querySelectorAll('.task-screening-card')).toHaveLength(2);
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Nguồn công việc"]')!;
  await act(async () => { select.value = 'MANUAL'; select.dispatchEvent(new Event('change', { bubbles: true })); }); await settle();
  expect(container.querySelector('[data-task-id="manual"]')).not.toBeNull();
  expect(container.querySelectorAll('.task-screening-card')).toHaveLength(0);
});
it("filters by the backend assignee when the authenticated public ID is a legacy alias", async () => {
  mocks.workspaceSummary.mockResolvedValue({ ...summary, automaticTasks: [{ ...obligation("own", "TODO"), assigneeId: "database-user" }] });
  await render('/projects/project?tab=tasks&taskAssignee=database-user');
  expect(container.querySelector('[data-screening-round="own-round"]')).not.toBeNull();
});
