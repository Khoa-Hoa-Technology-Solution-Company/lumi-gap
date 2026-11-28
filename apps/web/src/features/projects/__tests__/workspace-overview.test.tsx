// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContributionSummary, IProject, WorkspaceOverview } from "@trend/shared-types";
import { WorkspaceOverviewPanel } from "../components/workspace-overview";
import { workspaceCoordinationVi } from "@/i18n/locales/workspace-coordination";

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  stage: vi.fn(),
  contributionSummary: vi.fn(),
}));

vi.mock("../api/workspace.api", () => ({
  workspaceApi: {
    overview: mocks.overview,
    stage: mocks.stage,
  },
}));
vi.mock("../api/contributions.api", () => ({
  contributionsApi: {
    summary: mocks.contributionSummary,
  },
}));
vi.mock("@/features/trends/hooks/use-trends", () => ({
  useProjectTrendSnapshots: () => ({ data: [] }),
  useRemoveProjectTrendSnapshot: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) => selector({ user: { id: "u1" } }),
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "vi",
    t: (key: string, values?: Record<string, unknown>) => {
      const base = ({ ...workspaceCoordinationVi, Report: "Báo cáo", Review: "Xem lại", "Try again": "Thử lại" } as Record<string, string>)[key] ?? key;
      return values ? base.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? "")) : base;
    },
  }),
}));

const baseProject: IProject = {
  _id: "proj-1",
  title: "LumiGap",
  status: "PLANNING",
  visibility: "PRIVATE",
  ownerId: "u1",
  accessRole: "OWNER",
  papers: [],
  members: [],
  paperCount: 39,
  memberCount: 5,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
};

const baseOverview: WorkspaceOverview = {
  project: { id: "proj-1", title: "LumiGap", status: "PLANNING", researchStage: "REVIEW", version: 3 },
  capabilities: { editResearch: true, manageProject: true, collaborate: true },
  members: [{ id: "u1", name: "Nguyen Dinh Thanh" }],
  memberCount: 5,
  mentors: [],
  plan: {
    approach: "EXPLORATORY",
    problem: "Evaluating collaborative research provenance in academic writing workflows.",
    objectives: ["Map CRediT role attribution to verifiable artifacts", "Validate peer acknowledgement workflow"],
    questions: [
      { id: "q1", text: "How does artifact-linked attribution improve transparency in student research teams?" },
      { id: "q2", text: "What friction arises during peer acknowledgement?" },
    ],
    scope: "",
    methodology: "",
    searchStrategy: "",
    deliverables: [],
    inclusionCriteria: [],
    exclusionCriteria: [],
  },
  progress: { papers: 39, pendingScreening: 23, included: 7, evidence: 10, gaps: 7, questions: 2 },
  attention: { overdueTasks: 0, blockedTasks: 0, mentorQuestions: 0, mentorFeedback: 0, reviewResponses: 0 },
  myTasks: [],
  recentArtifacts: [
    { id: "m1", title: "ĐÌNH THANH", kind: "MANUSCRIPT", updatedAt: "2026-10-31T00:00:00.000Z" },
    { id: "r1", title: "LumiGap Report", kind: "REPORT", updatedAt: "2026-10-21T00:00:00.000Z" },
  ],
  nextMilestone: {
    id: "ms-1",
    title: "Hoàn thành tổng quan tài liệu",
    description: "Tổng hợp 39 bài báo đã sàng lọc",
    dueAt: "2099-11-30T00:00:00.000Z",
    status: "PLANNED",
    version: 1,
  },
  activity: [
    { id: "a1", type: "PAPER_ADDED", actor: { id: "u1", name: "Nguyen Dinh Thanh" }, createdAt: "2026-11-11T00:00:00.000Z", entityKind: null, entityId: null },
  ],
  topContributors: [],
};

const baseSummary: ContributionSummary = {
  totalRecords: 12,
  independentlyAcknowledged: 8,
  pendingForViewer: 2,
};

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.clearAllMocks();
  mocks.overview.mockResolvedValue(baseOverview);
  mocks.contributionSummary.mockResolvedValue(baseSummary);
  mocks.stage.mockResolvedValue({ ...baseOverview.project, researchStage: "DISCOVERY", version: 4 });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 }, mutations: { retry: false } } });
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

async function renderPanel(project: IProject = baseProject) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <WorkspaceOverviewPanel project={project} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 40));
  });
}

describe("WorkspaceOverviewPanel — Targeted 7 Refinements", () => {
  it("Case 1 & 2: highlights only the active stage without marking prior stages completed, and allows switching back", async () => {
    await renderPanel();

    // No "Bước 7/7" or inferred green completion styling on earlier stages
    expect(container.textContent).not.toContain("Bước 7/7");
    expect(container.textContent).toContain("Giai đoạn nghiên cứu");

    const stageList = container.querySelector('ol[aria-label="Giai đoạn nghiên cứu"]');
    expect(stageList).not.toBeNull();
    const buttons = [...stageList!.querySelectorAll("button")];
    expect(buttons).toHaveLength(7);

    // Only REVIEW (index 6) is active; earlier 6 stages have neutral styling (no emerald / no check icon)
    expect(buttons[6]!.getAttribute("aria-current")).toBe("step");
    for (let i = 0; i < 6; i++) {
      expect(buttons[i]!.getAttribute("aria-current")).toBeNull();
      expect(buttons[i]!.className).not.toContain("emerald");
      expect(buttons[i]!.querySelector("svg")).toBeNull();
    }

    // Moving back to an earlier stage (DISCOVERY) calls stage mutation with expectedVersion
    await act(async () => {
      buttons[0]!.click();
    });
    expect(mocks.stage).toHaveBeenCalledWith("proj-1", { stage: "DISCOVERY", expectedVersion: 3 });
  });

  it("Case 3 & 11: renders unset stage honestly and disables stage editing for non-managers", async () => {
    mocks.overview.mockResolvedValue({
      ...baseOverview,
      project: { ...baseOverview.project, researchStage: null },
      capabilities: { editResearch: true, manageProject: false, collaborate: true },
    });
    await renderPanel();

    expect(container.textContent).toContain("Chưa xác định");
    const stageList = container.querySelector('ol[aria-label="Giai đoạn nghiên cứu"]')!;
    expect(stageList.querySelectorAll("button")).toHaveLength(0);
    expect(stageList.querySelector('[aria-current="step"]')).toBeNull();
  });

  it("Case 4, 8 & 9: shows screening funnel, real research question without claiming primary, and numbered objectives without green checks", async () => {
    await renderPanel();

    // Screening funnel (16/39 = 41% screened papers)
    expect(container.textContent).toContain("Phễu sàng lọc tài liệu");
    expect(container.textContent).toContain("Đã xử lý 16/39 bài (41%)");
    expect(container.textContent).toContain("Sàng lọc ngay");

    // Research question from real plan data + count + view all CTA
    expect(container.textContent).toContain("Câu hỏi nghiên cứu");
    expect(container.textContent).toContain("How does artifact-linked attribution improve transparency in student research teams?");
    expect(container.textContent).toContain("+1 câu hỏi khác");
    expect(container.textContent).toContain("Xem tất cả câu hỏi");

    // Objectives use neutral numbered list (no emerald checkmark icons)
    expect(container.textContent).toContain("Map CRediT role attribution to verifiable artifacts");
    const objectiveList = [...container.querySelectorAll("ol")].find(ol =>
      ol.textContent?.includes("Map CRediT role attribution"),
    );
    expect(objectiveList).toBeTruthy();
    expect(objectiveList!.querySelectorAll("svg")).toHaveLength(0);
    // Artifact labels remain clear without presenting activity counts as contribution credit.
    expect(container.textContent).toContain("Bản thảo");
    expect(container.textContent).toContain("Báo cáo");
    expect(container.textContent).toContain("Nguyen Dinh Thanh");
    expect(container.textContent).not.toContain("70%");
  });

  it("Case 5 & 6: renders shared Integrity & Contributions metrics and connects pending acknowledgements to Needs Attention", async () => {
    await renderPanel();

    expect(container.textContent).toContain("Liêm chính & Đóng góp");
    expect(container.textContent).toContain("Hồ sơ đóng góp");
    expect(container.textContent).toContain("Đã đối soát");
    expect(container.textContent).toContain("Cần bạn phản hồi");
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("8");
    expect(container.textContent).toContain("Đóng góp cần bạn xác nhận");

    // Deep links use verified contribution routes
    const pendingLinks = [...container.querySelectorAll("a")].filter(a =>
      a.getAttribute("href")?.includes("tab=contributions") && a.getAttribute("href")?.includes("contributionTab=pending"),
    );
    expect(pendingLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("Case 7: shows nextMilestone inside Continue Working above Research Progress, and flags overdue milestones honestly", async () => {
    await renderPanel();

    // Continue working appears BEFORE Research progress in document order
    const html = container.innerHTML;
    expect(html.indexOf("Tiếp tục công việc")).toBeLessThan(html.indexOf("Tiến độ nghiên cứu"));
    expect(container.textContent).toContain("Cột mốc tiếp theo");
    expect(container.textContent).toContain("Hoàn thành tổng quan tài liệu");
    expect(container.textContent).toContain("Dự kiến");
    expect(container.textContent).toContain("Xem cột mốc");

    // Overdue milestone shows Quá hạn badge
    mocks.overview.mockResolvedValue({
      ...baseOverview,
      nextMilestone: {
        ...baseOverview.nextMilestone!,
        dueAt: "2020-01-01T00:00:00.000Z",
      },
    });
    client.clear();
    await renderPanel();
    expect(container.textContent).toContain("Quá hạn");

    // No milestone omits milestone block without empty-state bloat
    mocks.overview.mockResolvedValue({ ...baseOverview, nextMilestone: null });
    client.clear();
    await renderPanel();
    expect(container.textContent).not.toContain("Cột mốc tiếp theo");
  });

  it("Case 10: isolates contribution summary API errors without breaking Overview or showing fake zeros", async () => {
    mocks.contributionSummary.mockRejectedValue(new Error("Service unavailable"));
    await renderPanel();

    // Overview remains rendered
    expect(container.textContent).toContain("Hướng nghiên cứu");
    expect(container.textContent).toContain("Tiếp tục công việc");

    // Contribution card displays error state with retry (not fake 0s)
    expect(container.textContent).toContain("Chưa thể tải tóm tắt đóng góp.");
    expect(container.textContent).not.toContain("Chưa có hồ sơ đóng góp được ghi nhận.");

    // Needs attention does not falsely claim all clear while summary failed
    expect(container.textContent).toContain("Chưa kiểm tra được các đóng góp cần bạn xác nhận.");
    expect(container.textContent).not.toContain("Hiện không có yêu cầu nào cần bạn xử lý.");
  });
});
