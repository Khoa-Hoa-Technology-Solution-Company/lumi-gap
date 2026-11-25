// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScreeningAutomaticTask, ScreeningWorkspaceSummary, WorkspaceTask, WorkspaceTaskStatus } from "@trend/shared-types";
import { WorkspaceTasksPanel } from "../components/workspace-tasks";

const mocks = vi.hoisted(() => ({
  workspaceSummary: vi.fn(),
  automaticTasksPage: vi.fn(),
  taskBoard: vi.fn(),
  tasks: vi.fn(),
  milestones: vi.fn(),
  people: vi.fn(),
  moveTask: vi.fn(),
  saveTask: vi.fn(),
}));

vi.mock("../api/screening.api", () => ({ screeningApi: mocks }));
vi.mock("../api/workspace.api", () => ({ workspaceApi: mocks }));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "reviewer" } }),
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "vi",
    t: (key: string, values?: Record<string, unknown>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")),
  }),
}));
vi.mock("@dnd-kit/react", () => ({
  KeyboardSensor: class {},
  PointerSensor: { configure: () => ({}), defaults: {} },
  DragDropProvider: ({ children }: { children: ReactNode }) => children,
  useDroppable: () => ({ ref: () => undefined, isDropTarget: false }),
}));
vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({ ref: () => undefined, handleRef: () => undefined, isDragSource: false }),
  isSortable: () => false,
}));
vi.mock("../components/screening-adjudication", () => ({
  ScreeningAdjudicationDialog: ({ roundId, focusSection }: { roundId: string; focusSection: string }) => (
    <div role="dialog">{roundId}/{focusSection}</div>
  ),
}));

const empty = { items: [], total: 0, page: 1, pageSize: 20, hasNext: false };

function makeManualTask(id: string, title: string, status: WorkspaceTaskStatus = "DONE", completedAt: string | null = null): WorkspaceTask {
  return {
    id,
    title,
    description: "",
    status,
    blockedReason: "",
    priority: "MEDIUM",
    assignee: { id: "user-1", name: "Thanh Đinh" },
    creator: { id: "owner", name: "Owner" },
    milestoneId: null,
    dueAt: null,
    completedAt: completedAt ?? (status === "DONE" ? new Date().toISOString() : null),
    completedBy: status === "DONE" ? { id: "user-1", name: "Thanh Đinh" } : null,
    deletedAt: null,
    version: 1,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    parentTaskId: null,
    checklist: [],
    sortOrder: 1,
    subtaskCount: 0,
    completedSubtaskCount: 0,
    link: null,
  };
}

function makeObligation(id: string, status: ScreeningAutomaticTask["status"], endedAt: string | null = null): ScreeningAutomaticTask {
  return {
    id,
    paperId: `paper-${id}`,
    roundId: `${id}-round`,
    assigneeId: "reviewer",
    actionType: "REVIEW",
    status,
    reason: `Screening duty for ${id}`,
    title: `Screening Paper ${id}`,
    phase: "TITLE_ABSTRACT",
    roundNumber: 1,
    roundStatus: "IN_REVIEW",
    roundActive: true,
    dueAt: null,
    endedAt: endedAt ?? (status === "DONE" ? new Date().toISOString() : null),
    updatedAt: "2026-11-10T00:00:00Z",
  };
}

const baseSummary: ScreeningWorkspaceSummary = {
  myActiveClaims: [],
  pendingConsensus: [],
  pendingAdjudications: [],
  myTrackedDisputes: [],
  myProposalsCount: 0,
  recentProposals: [],
  eligibleQueueCount: 0,
  nextEligiblePaperId: null,
  discoveryGoal: { enabled: false, target: 2, period: "WEEK", paused: false, currentCount: 0, remaining: 2 },
  capacityAdvice: { queueStatus: "NORMAL", message: "" },
};

let root: Root, container: HTMLDivElement, client: QueryClient;

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
  });
}

async function render(url = "/projects/project?tab=tasks&view=board") {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <WorkspaceTasksPanel projectId="project" readOnly={false} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  });
  for (let attempt = 0; attempt < 30; attempt++) {
    await settle();
    if (container.querySelector(".task-board, .task-list")) break;
  }
  await settle();
}

describe("Smart Completed-Task Management (Jira/Linear inspired)", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.resetAllMocks();
    mocks.workspaceSummary.mockResolvedValue(baseSummary);
    mocks.automaticTasksPage.mockResolvedValue(empty);
    mocks.milestones.mockResolvedValue(empty);
    mocks.people.mockResolvedValue(empty);
    mocks.moveTask.mockResolvedValue({});
    mocks.saveTask.mockResolvedValue({});
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
  });

  it("handles 0 completed tasks with standard helpful empty state", async () => {
    mocks.taskBoard.mockResolvedValue({
      boardVersion: 1,
      columns: {
        TODO: empty,
        IN_PROGRESS: empty,
        BLOCKED: empty,
        DONE: { ...empty, items: [], total: 0 },
      },
    });

    await render();
    const doneColumn = container.querySelector('.task-column[data-status="DONE"]')!;
    expect(doneColumn).not.toBeNull();
    expect(doneColumn.querySelector(".task-column-count")?.textContent).toBe("0");
    expect(doneColumn.querySelectorAll(".task-card")).toHaveLength(0);
    expect(doneColumn.textContent).toContain("Progress starts here");
  });

  it("displays up to 5 completed tasks with exact total and visible counts", async () => {
    const tasks = [
      makeManualTask("m1", "Task 1"),
      makeManualTask("m2", "Task 2"),
      makeManualTask("m3", "Task 3"),
    ];
    mocks.taskBoard.mockResolvedValue({
      boardVersion: 1,
      columns: {
        TODO: empty,
        IN_PROGRESS: empty,
        BLOCKED: empty,
        DONE: { ...empty, items: tasks, total: 3 },
      },
    });

    await render();
    const doneColumn = container.querySelector('.task-column[data-status="DONE"]')!;
    expect(doneColumn.querySelector(".task-column-count")?.textContent).toBe("3");
    expect(doneColumn.querySelectorAll(".task-card")).toHaveLength(3);
    expect(doneColumn.querySelector(".task-done-column-footer")?.textContent).toContain("Showing 3 of 3 completed tasks");
    expect(doneColumn.querySelector(".task-view-all-completed-btn")).not.toBeNull();
  });

  it("caps visible DONE cards at 5 when there are 6 completed tasks", async () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      makeManualTask(`task-${i + 1}`, `Completed Task ${i + 1}`, "DONE", new Date(Date.now() - i * 3600000).toISOString())
    );
    mocks.taskBoard.mockResolvedValue({
      boardVersion: 1,
      columns: {
        TODO: empty,
        IN_PROGRESS: empty,
        BLOCKED: empty,
        DONE: { ...empty, items: tasks, total: 6 },
      },
    });

    await render();
    const doneColumn = container.querySelector('.task-column[data-status="DONE"]')!;
    // Total header is 6
    expect(doneColumn.querySelector(".task-column-count")?.textContent).toBe("6");
    // Visible cards is capped at 5
    expect(doneColumn.querySelectorAll(".task-card")).toHaveLength(5);
    // Task 6 is hidden
    expect(doneColumn.textContent).toContain("Completed Task 1");
    expect(doneColumn.textContent).toContain("Completed Task 5");
    expect(doneColumn.textContent).not.toContain("Completed Task 6");
    expect(doneColumn.querySelector(".task-done-column-footer")?.textContent).toContain("Showing 5 of 6 completed tasks");
  });

  it("handles 27 completed tasks without expanding the board, showing 5 of 27 and link to all", async () => {
    // 27 tasks: 20 returned on page 1 of board
    const preview = Array.from({ length: 20 }, (_, i) =>
      makeManualTask(`task-${i + 1}`, `Paper Analysis ${i + 1}`, "DONE", new Date(Date.now() - i * 7200000).toISOString())
    );
    mocks.taskBoard.mockResolvedValue({
      boardVersion: 1,
      columns: {
        TODO: empty,
        IN_PROGRESS: empty,
        BLOCKED: empty,
        DONE: { items: preview, total: 27, page: 1, pageSize: 20, hasNext: true },
      },
    });

    await render();
    const doneColumn = container.querySelector('.task-column[data-status="DONE"]')!;
    expect(doneColumn.querySelector(".task-column-count")?.textContent).toBe("27");
    expect(doneColumn.querySelectorAll(".task-card")).toHaveLength(5);
    expect(doneColumn.querySelector(".task-done-column-footer")?.textContent).toContain("Showing 5 of 27 completed tasks");

    const viewAllBtn = doneColumn.querySelector<HTMLButtonElement>(".task-view-all-completed-btn")!;
    expect(viewAllBtn).not.toBeNull();
    expect(viewAllBtn.textContent).toContain("View all completed tasks");
  });

  it("hides tasks completed older than 14 days from the default board preview while retaining total count", async () => {
    const twentyDaysAgo = new Date(Date.now() - 20 * 86400000).toISOString();
    const oldTask = makeManualTask("old-1", "Old Finished Task", "DONE", twentyDaysAgo);

    mocks.taskBoard.mockResolvedValue({
      boardVersion: 1,
      columns: {
        TODO: empty,
        IN_PROGRESS: empty,
        BLOCKED: empty,
        DONE: { ...empty, items: [oldTask], total: 1 },
      },
    });

    await render();
    const doneColumn = container.querySelector('.task-column[data-status="DONE"]')!;
    expect(doneColumn.querySelector(".task-column-count")?.textContent).toBe("1");
    // Visible cards should be 0 because it's > 14 days old
    expect(doneColumn.querySelectorAll(".task-card")).toHaveLength(0);
    expect(doneColumn.textContent).toContain("No recently completed tasks");
    expect(doneColumn.textContent).toContain("1 previously completed tasks are retained in history.");
    expect(doneColumn.querySelector(".task-view-all-completed-btn")).not.toBeNull();
  });

  it("combines manual and screening DONE tasks into a shared 5-card preview sorted newest first", async () => {
    const manualNewer = makeManualTask("m-new", "Manual Newer", "DONE", new Date(Date.now() - 1000).toISOString());
    const manualOlder = makeManualTask("m-old", "Manual Older", "DONE", new Date(Date.now() - 50000).toISOString());
    const screeningNewest = makeObligation("s-newest", "DONE", new Date().toISOString());
    const screeningOldest = makeObligation("s-oldest", "DONE", new Date(Date.now() - 100000).toISOString());

    mocks.workspaceSummary.mockResolvedValue({
      ...baseSummary,
      automaticTasks: [screeningNewest, screeningOldest],
    });

    mocks.taskBoard.mockResolvedValue({
      boardVersion: 1,
      columns: {
        TODO: empty,
        IN_PROGRESS: empty,
        BLOCKED: empty,
        DONE: { ...empty, items: [manualNewer, manualOlder], total: 2 },
      },
    });

    await render();
    const doneColumn = container.querySelector('.task-column[data-status="DONE"]')!;
    // Total is 2 manual + 2 screening = 4
    expect(doneColumn.querySelector(".task-column-count")?.textContent).toBe("4");
    const cards = doneColumn.querySelectorAll(".task-card");
    expect(cards).toHaveLength(4);

    // Order should be newest first: screeningNewest, manualNewer, manualOlder, screeningOldest
    const titles = [...cards].map(c => c.querySelector(".task-card-title")?.textContent);
    expect(titles[0]).toBe("Screening Paper s-newest");
    expect(titles[1]).toBe("Manual Newer");
    expect(titles[2]).toBe("Manual Older");
    expect(titles[3]).toBe("Screening Paper s-oldest");
  });

  it("never counts EXPIRED, CANCELLED or REPLACED screening obligations as completed", async () => {
    const doneObligation = makeObligation("s-done", "DONE");
    const expiredObligation = makeObligation("s-expired", "EXPIRED");
    const cancelledObligation = makeObligation("s-cancelled", "CANCELLED");
    const replacedObligation = makeObligation("s-replaced", "REPLACED");

    mocks.workspaceSummary.mockResolvedValue({
      ...baseSummary,
      automaticTasks: [doneObligation, expiredObligation, cancelledObligation, replacedObligation],
    });

    mocks.taskBoard.mockResolvedValue({
      boardVersion: 1,
      columns: {
        TODO: empty,
        IN_PROGRESS: empty,
        BLOCKED: empty,
        DONE: empty,
      },
    });

    await render();
    const doneColumn = container.querySelector('.task-column[data-status="DONE"]')!;
    // Only the DONE obligation is counted in DONE column
    expect(doneColumn.querySelector(".task-column-count")?.textContent).toBe("1");
    expect(doneColumn.querySelectorAll(".task-card")).toHaveLength(1);
    expect(doneColumn.textContent).toContain("Screening Paper s-done");
    expect(doneColumn.textContent).not.toContain("Screening Paper s-expired");
  });

  it("switches to full searchable Completed Tasks view on clicking 'View all completed tasks'", async () => {
    const tasks = [makeManualTask("m1", "Completed Dataset Extraction", "DONE", "2026-11-10T09:00:00.000Z")];
    mocks.taskBoard.mockResolvedValue({
      boardVersion: 1,
      columns: {
        TODO: empty,
        IN_PROGRESS: empty,
        BLOCKED: empty,
        DONE: { ...empty, items: tasks, total: 1 },
      },
    });
    mocks.tasks.mockResolvedValue({
      items: tasks,
      total: 1,
      page: 1,
      pageSize: 20,
      hasNext: false,
    });

    await render();
    const doneColumn = container.querySelector('.task-column[data-status="DONE"]')!;
    const viewAllBtn = doneColumn.querySelector<HTMLButtonElement>(".task-view-all-completed-btn")!;

    await act(async () => {
      viewAllBtn.click();
    });
    await settle();

    // Now in List View
    expect(container.querySelector(".task-list")).not.toBeNull();
    expect(container.querySelector(".task-completed-history-banner")).not.toBeNull();
    expect(container.textContent).toContain("Completed history");
    expect(container.textContent).toContain("Completed Dataset Extraction");

    // Table header includes Completed At
    const headers = [...container.querySelectorAll(".task-list th")].map(th => th.textContent);
    expect(headers).toContain("Completed At");

    // Return to Kanban board button works
    const backBtn = container.querySelector<HTMLButtonElement>(".task-completed-history-banner button")!;
    expect(backBtn).not.toBeNull();
    await act(async () => {
      backBtn.click();
    });
    await settle();

    expect(container.querySelector(".task-board")).not.toBeNull();
  });

  it("handles 3 manual DONE and 25 screening DONE: total 28, capped at 5 newest, with breakdown", async () => {
    // 3 manual tasks completed today
    const manualTasks = [
      makeManualTask("m-1", "Manual Analysis 1", "DONE", new Date(Date.now() - 1000).toISOString()),
      makeManualTask("m-2", "Manual Analysis 2", "DONE", new Date(Date.now() - 3000).toISOString()),
      makeManualTask("m-3", "Manual Analysis 3", "DONE", new Date(Date.now() - 5000).toISOString()),
    ];

    // 25 screening obligations completed today
    const screeningObligations = Array.from({ length: 25 }, (_, i) =>
      makeObligation(`s-${i + 1}`, "DONE", new Date(Date.now() - (i + 1) * 2000).toISOString())
    );

    mocks.workspaceSummary.mockResolvedValue({
      ...baseSummary,
      // Bounded preview query sends top 5 items and total count from server
      automaticTasks: screeningObligations.slice(0, 5),
      automaticDoneTotal: 25,
    });

    mocks.taskBoard.mockResolvedValue({
      boardVersion: 1,
      columns: {
        TODO: empty,
        IN_PROGRESS: empty,
        BLOCKED: empty,
        DONE: { items: manualTasks, total: 3, page: 1, pageSize: 5, hasNext: false },
      },
    });

    await render();
    const doneColumn = container.querySelector('.task-column[data-status="DONE"]')!;
    expect(doneColumn).not.toBeNull();

    // Total header is exactly 28 (3 manual + 25 screening)
    expect(doneColumn.querySelector(".task-column-count")?.textContent).toBe("28");

    // Renders exactly 5 cards (capped)
    const cards = doneColumn.querySelectorAll(".task-card");
    expect(cards).toHaveLength(5);

    // Footer shows "Showing 5 of 28 completed tasks"
    expect(doneColumn.querySelector(".task-done-column-footer")?.textContent).toContain("Showing 5 of 28 completed tasks");

    // Footer shows breakdown distinguishing project tasks vs screening tasks
    const breakdown = doneColumn.querySelector(".task-done-breakdown");
    expect(breakdown).not.toBeNull();
    expect(breakdown?.textContent).toContain("3 project tasks");
    expect(breakdown?.textContent).toContain("25 my screening tasks");
  });

  it("sorts deterministically by unique ID when completion timestamps are identical", async () => {
    const identicalTime = "2026-11-12T01:00:00.000Z";
    const taskA = makeManualTask("task-aaa", "Task AAA", "DONE", identicalTime);
    const taskZ = makeManualTask("task-zzz", "Task ZZZ", "DONE", identicalTime);

    mocks.taskBoard.mockResolvedValue({
      boardVersion: 1,
      columns: {
        TODO: empty,
        IN_PROGRESS: empty,
        BLOCKED: empty,
        DONE: { items: [taskA, taskZ], total: 2, page: 1, pageSize: 5, hasNext: false },
      },
    });

    await render();
    const doneColumn = container.querySelector('.task-column[data-status="DONE"]')!;
    const titles = [...doneColumn.querySelectorAll(".task-card-title")].map(t => t.textContent);
    // Stable secondary sort orders zzz before aaa (descending by unique ID)
    expect(titles).toEqual(["Task ZZZ", "Task AAA"]);
  });

  it("uses real server-side pagination for screening obligations and manual tasks in List View", async () => {
    const manualTasksPage1 = [makeManualTask("m-1", "Manual Task Page 1", "DONE")];
    const screeningPage1Items = Array.from({ length: 20 }, (_, i) =>
      makeObligation(`s-${i + 1}`, "DONE", new Date(Date.now() - (i + 1) * 1000).toISOString())
    );
    const screeningPage2Items = Array.from({ length: 5 }, (_, i) =>
      makeObligation(`s-${i + 21}`, "DONE", new Date(Date.now() - (i + 21) * 1000).toISOString())
    );

    mocks.workspaceSummary.mockResolvedValue({
      ...baseSummary,
      automaticTasks: screeningPage1Items.slice(0, 5),
      automaticDoneTotal: 25,
    });

    mocks.tasks.mockImplementation((_projectId, query) => {
      if (query.page === 2) {
        return Promise.resolve({ items: [], total: 1, page: 2, pageSize: 20, hasNext: false });
      }
      return Promise.resolve({ items: manualTasksPage1, total: 1, page: 1, pageSize: 20, hasNext: false });
    });

    mocks.automaticTasksPage.mockImplementation((_projectId, query) => {
      if (query.page === 2) {
        return Promise.resolve({ items: screeningPage2Items, total: 25, page: 2, pageSize: 20, hasNext: false });
      }
      return Promise.resolve({ items: screeningPage1Items, total: 25, page: 1, pageSize: 20, hasNext: true });
    });

    await render("/projects/project?tab=tasks&view=list&taskStatus=DONE");

    // Verify initial call to automaticTasksPage with page 1
    expect(mocks.automaticTasksPage).toHaveBeenCalledWith("project", expect.objectContaining({ page: 1, pageSize: 20, status: "DONE" }));

    // Page 1 contains items from screeningPage1Items
    expect(container.textContent).toContain("Screening Paper s-1");
    expect(container.textContent).toContain("Screening Paper s-20");
    expect(container.textContent).not.toContain("Screening Paper s-21");

    // Pagination button for Next page should be present and enabled
    const nextBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!;
    expect(nextBtn).not.toBeNull();
    expect(nextBtn.disabled).toBe(false);

    // Click Next page
    await act(async () => {
      nextBtn.click();
    });
    await settle();

    // Verify call to automaticTasksPage and tasks with page 2
    expect(mocks.automaticTasksPage).toHaveBeenCalledWith("project", expect.objectContaining({ page: 2, pageSize: 20, status: "DONE" }));
    expect(mocks.tasks).toHaveBeenCalledWith("project", expect.objectContaining({ page: 2, status: "DONE" }));

    // Page 2 displays s-21 and not s-1
    expect(container.textContent).toContain("Screening Paper s-21");
    expect(container.textContent).not.toContain("Screening Paper s-1");
  });

  it("handles legacy manual tasks missing completedAt without falsely showing them in 14-day preview", async () => {
    const legacyTask = makeManualTask("m-legacy", "Legacy Task without completedAt", "DONE", null);
    // Explicitly nullify completedAt to simulate old unverified record
    legacyTask.completedAt = null;

    mocks.taskBoard.mockResolvedValue({
      boardVersion: 1,
      columns: {
        TODO: empty,
        IN_PROGRESS: empty,
        BLOCKED: empty,
        DONE: { items: [legacyTask], total: 1, page: 1, pageSize: 5, hasNext: false },
      },
    });

    await render();
    const doneColumn = container.querySelector('.task-column[data-status="DONE"]')!;
    expect(doneColumn.querySelector(".task-column-count")?.textContent).toBe("1");

    // Falls back to epoch 0, so it is > 14 days old and NOT rendered in recent preview
    expect(doneColumn.querySelectorAll(".task-card")).toHaveLength(0);
    expect(doneColumn.textContent).toContain("No recently completed tasks");
    expect(doneColumn.textContent).toContain("1 previously completed tasks are retained in history.");
  });
});
