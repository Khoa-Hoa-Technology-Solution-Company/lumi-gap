// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticalReport, ProjectEvidence, ScreeningWorkspaceSummary, WorkspaceTask } from "@trend/shared-types";
import { TaskBoardView } from "../components/workspace-task-board";
import { WorkspaceTasksPanel } from "../components/workspace-tasks";

const mocks = vi.hoisted(() => ({
  workspaceSummary: vi.fn(),
  automaticTasksPage: vi.fn(),
  taskBoard: vi.fn(),
  task: vi.fn(),
  tasks: vi.fn(),
  milestones: vi.fn(),
  people: vi.fn(),
  taskHistory: vi.fn(),
  comments: vi.fn(),
  artifactOptions: vi.fn(),
  evidence: vi.fn(),
  evidenceHistory: vi.fn(),
  useReport: vi.fn(),
}));

vi.mock("../api/screening.api", () => ({ screeningApi: mocks }));
vi.mock("../api/workspace.api", () => ({ workspaceApi: mocks }));
vi.mock("../api/project-research.api", () => ({
  researchApi: {
    evidence: mocks.evidence,
    evidenceHistory: mocks.evidenceHistory,
  },
}));
vi.mock("@/features/reports/hooks/use-reports", () => ({ useReport: mocks.useReport }));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "user-1" } }),
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

const empty = { items: [], total: 0, page: 1, pageSize: 20, hasNext: false };

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

function makeTask(id: string, title: string, link: WorkspaceTask["link"]): WorkspaceTask {
  return {
    id,
    title,
    description: "",
    status: "TODO",
    blockedReason: "",
    priority: "MEDIUM",
    assignee: { id: "user-1", name: "Thanh Đinh" },
    creator: { id: "owner", name: "Owner" },
    milestoneId: null,
    dueAt: null,
    completedAt: null,
    completedBy: null,
    deletedAt: null,
    version: 1,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    parentTaskId: null,
    checklist: [],
    sortOrder: 1,
    subtaskCount: 0,
    completedSubtaskCount: 0,
    link,
  };
}

function makeEvidenceItem(): ProjectEvidence {
  return {
    id: "ev-1",
    projectId: "proj-1",
    paperId: "paper-1",
    version: 1,
    origin: "HUMAN",
    reviewState: "ACCEPTED",
    reviewRationale: "",
    extractedById: "user-1",
    extractedByName: "Thanh Đinh",
    reviewedById: "user-1",
    reviewedByName: "Thanh Đinh",
    reviewedAt: "2026-11-10T10:00:00Z",
    createdAt: "2026-11-10T09:00:00Z",
    updatedAt: "2026-11-10T10:00:00Z",
    sourceSnapshot: {},
    sourceTitle: "Industrial LLM Survey",
    verificationStatus: "VERIFIED",
    sourceScope: "FULL_TEXT",
    claim: "Domain-tuned SLMs improve precision.",
    quotation: "Fine-tuned domain SLMs cut false positives by 31%.",
    locator: "Section 3.2",
    context: "",
    methodology: "Benchmark comparison",
    population: "",
    results: "",
    limitations: "",
    themes: ["SLM", "IIoT"],
  };
}

function makeReport(): Pick<AnalyticalReport, "id" | "topic" | "query" | "status" | "markdown" | "errorMessage" | "createdAt"> {
  return {
    id: "rep-1",
    topic: "Báo cáo tổng quan IIoT",
    query: "IIoT LLM",
    status: "ready",
    markdown: "# Tóm tắt nghiên cứu\n\nKết quả thử nghiệm trên dữ liệu IIoT.",
    createdAt: "2026-11-10T09:00:00Z",
  };
}

let container: HTMLDivElement;
let root: Root;

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 40));
  });
}

function render(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>{node}</MemoryRouter>
      </QueryClientProvider>,
    );
  });
}

describe("Task list artifact links popup and new tab behavior", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const evidenceTask = makeTask("t-ev", "Kiểm tra trích dẫn bằng chứng", { kind: "EVIDENCE", id: "ev-1" });
    const reportTask = makeTask("t-rep", "Đọc báo cáo tổng quan", { kind: "REPORT", id: "rep-1" });
    const paperTask = makeTask("t-paper", "Đọc bài báo gốc", { kind: "PAPER", id: "paper-1" });

    mocks.workspaceSummary.mockResolvedValue(baseSummary);
    mocks.automaticTasksPage.mockResolvedValue(empty);
    mocks.taskBoard.mockResolvedValue({
      counts: { TODO: 3, IN_PROGRESS: 0, IN_REVIEW: 0, BLOCKED: 0, DONE: 0 },
      columns: {
        TODO: { items: [evidenceTask, reportTask, paperTask], total: 3, hasNext: false },
        IN_PROGRESS: { items: [], total: 0, hasNext: false },
        IN_REVIEW: { items: [], total: 0, hasNext: false },
        BLOCKED: { items: [], total: 0, hasNext: false },
        DONE: { items: [], total: 0, hasNext: false },
      },
    });
    mocks.tasks.mockResolvedValue({ items: [evidenceTask, reportTask, paperTask], total: 3, page: 1, pageSize: 20, hasNext: false });
    mocks.task.mockResolvedValue({ task: evidenceTask, history: empty, canDelete: false });
    mocks.taskHistory.mockResolvedValue(empty);
    mocks.comments.mockResolvedValue(empty);
    mocks.artifactOptions.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, hasNext: false });
    mocks.milestones.mockResolvedValue(empty);
    mocks.people.mockResolvedValue({
      items: [{ id: "user-1", name: "Thanh Đinh", email: "thanh@example.com", role: "OWNER" }],
      total: 1,
      page: 1,
      pageSize: 20,
      hasNext: false,
    });
    mocks.evidence.mockResolvedValue({
      items: [makeEvidenceItem()],
      total: 1,
      page: 1,
      pageSize: 20,
      hasNext: false,
    });
    mocks.evidenceHistory.mockResolvedValue([]);
    mocks.useReport.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("opens Evidence popup dialog when clicking Evidence link in task list and opens Paper link in a new tab", async () => {
    await render(
      <TaskBoardView projectId="proj-1" readOnly={false} onSelect={vi.fn()} mode="list" onMode={vi.fn()} />,
    );
    await flush();

    const paperLink = container.querySelector('a[href="/projects/proj-1?tab=papers&paper=paper-1"]');
    expect(paperLink?.getAttribute("target")).toBe("_blank");
    expect(paperLink?.getAttribute("rel")).toBe("noopener noreferrer");

    const evidenceLink = container.querySelector('a[href="/projects/proj-1?tab=papers&view=evidence&evidence=ev-1"]');
    expect(evidenceLink).not.toBeNull();
    expect(evidenceLink?.getAttribute("data-artifact-popup")).toBe("true");
    expect(evidenceLink?.getAttribute("target")).toBeNull();

    await act(async () => {
      evidenceLink!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    await flush();

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Bằng chứng nghiên cứu");
    expect(dialog?.textContent).toContain("Domain-tuned SLMs improve precision.");

    const newTabAnchor = dialog?.querySelector('a[href="/projects/proj-1?tab=papers&view=evidence&evidence=ev-1"]');
    expect(newTabAnchor?.textContent).toContain("Mở trang mới");
    expect(newTabAnchor?.getAttribute("target")).toBe("_blank");
    expect(newTabAnchor?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("opens Report popup dialog with markdown preview when clicking Report link in task list", async () => {
    await render(
      <TaskBoardView projectId="proj-1" readOnly={false} onSelect={vi.fn()} mode="list" onMode={vi.fn()} />,
    );
    await flush();

    const reportLink = container.querySelector('a[href="/reports/rep-1"]');
    expect(reportLink).not.toBeNull();
    expect(reportLink?.getAttribute("data-artifact-popup")).toBe("true");

    await act(async () => {
      reportLink!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    await flush();

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Báo cáo tổng quan IIoT");
    expect(dialog?.textContent).toContain("Kết quả thử nghiệm trên dữ liệu IIoT.");

    const openReportTab = dialog?.querySelector('a[href="/reports/rep-1"]');
    expect(openReportTab?.textContent).toContain("Mở trang báo cáo");
    expect(openReportTab?.getAttribute("target")).toBe("_blank");
  });

  it("opens Evidence popup dialog from TaskDetail drawer inside WorkspaceTasksPanel", async () => {
    await render(<WorkspaceTasksPanel projectId="proj-1" readOnly={false} />);
    await flush();

    const listBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "List");
    expect(listBtn).toBeDefined();
    await act(async () => {
      listBtn!.click();
    });
    await flush();

    const titleBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Kiểm tra trích dẫn bằng chứng");
    expect(titleBtn).toBeDefined();
    await act(async () => {
      titleBtn!.click();
    });
    await flush();

    const drawer = document.body.querySelector(".research-task-drawer");
    expect(drawer).not.toBeNull();

    const drawerEvidenceLink = drawer!.querySelector('a[href="/projects/proj-1?tab=papers&view=evidence&evidence=ev-1"]');
    expect(drawerEvidenceLink).not.toBeNull();

    await act(async () => {
      drawerEvidenceLink!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    await flush();

    const dialog = Array.from(document.body.querySelectorAll('[role="dialog"]')).find(el =>
      el.textContent?.includes("Bằng chứng nghiên cứu"),
    );
    expect(dialog).toBeDefined();
    expect(dialog?.textContent).toContain("Domain-tuned SLMs improve precision.");
  });
});
