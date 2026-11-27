// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IProject, WorkspaceOverview } from "@trend/shared-types";
import { WorkspaceOverviewPanel } from "../components/workspace-overview";
import { workspaceCoordinationVi } from "@/i18n/locales/workspace-coordination";

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  stage: vi.fn(),
  trendSnapshots: vi.fn(),
}));

vi.mock("../api/workspace.api", () => ({
  workspaceApi: {
    overview: mocks.overview,
    stage: mocks.stage,
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
      const base = ({ ...workspaceCoordinationVi, Report: "Báo cáo", Review: "Xem lại" } as Record<string, string>)[key] ?? key;
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
  project: { id: "proj-1", title: "LumiGap", status: "PLANNING", researchStage: "EXTRACTION", version: 3 },
  capabilities: { editResearch: true, manageProject: true, collaborate: true },
  members: [{ id: "u1", name: "Nguyen Dinh Thanh" }],
  memberCount: 5,
  mentors: [],
  plan: {
    approach: "EXPLORATORY",
    problem: "",
    objectives: [],
    questions: [],
    scope: "",
    methodology: "",
    searchStrategy: "",
    deliverables: [],
    inclusionCriteria: [],
    exclusionCriteria: [],
  },
  progress: { papers: 39, pendingScreening: 23, included: 7, evidence: 10, gaps: 7, questions: 0 },
  attention: { overdueTasks: 0, blockedTasks: 0, mentorQuestions: 0, mentorFeedback: 0, reviewResponses: 0 },
  myTasks: [],
  recentArtifacts: [
    { id: "m1", title: "ĐÌNH THANH", kind: "MANUSCRIPT", updatedAt: "2026-10-31T00:00:00.000Z" },
    { id: "r1", title: "LumiGap Report", kind: "REPORT", updatedAt: "2026-10-21T00:00:00.000Z" },
  ],
  nextMilestone: null,
  activity: [
    { id: "a1", type: "PAPER_ADDED", actor: { id: "u1", name: "Nguyen Dinh Thanh" }, createdAt: "2026-11-11T00:00:00.000Z", entityKind: null, entityId: null },
  ],
  topContributors: [
    { person: { id: "u1", name: "Nguyen Dinh Thanh" }, count: 251, percentage: 70, rank: 1 },
  ],
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
  mocks.stage.mockResolvedValue({ ...baseOverview.project, researchStage: "WRITING", version: 4 });
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

async function renderPanel() {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <WorkspaceOverviewPanel project={baseProject} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 25));
  });
}

describe("WorkspaceOverviewPanel", () => {
  it("renders the research stage pipeline, Vietnamese KPI sublabels, and screening funnel", async () => {
    await renderPanel();

    expect(container.textContent).toContain("Bước 3/7");
    expect(container.textContent).toContain("Phễu sàng lọc tài liệu");
    expect(container.textContent).toContain("Đã xử lý 16/39 bài (41%)");
    expect(container.textContent).toContain("Sàng lọc ngay");

    // Verify Vietnamese translations replaced raw English KPI sublabels and avoided duplicate badge wording
    expect(container.textContent).toContain("Tài liệu trong thư viện");
    expect(container.textContent).toContain("Cần sàng lọc ngay");
    expect(container.textContent).not.toContain("Articles in library");
    expect(container.textContent).not.toContain("Chờ sàng lọcChờ sàng lọc");

    // Artifact labels remain clear without presenting activity counts as contribution credit.
    expect(container.textContent).toContain("Bản thảo");
    expect(container.textContent).toContain("Báo cáo");
    expect(container.textContent).toContain("Nguyen Dinh Thanh");
    expect(container.textContent).not.toContain("70%");
  });

  it("allows managers to switch research stages from the interactive pipeline", async () => {
    await renderPanel();
    const writingButton = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Viết nghiên cứu"));
    expect(writingButton).toBeDefined();

    await act(async () => {
      writingButton!.click();
    });
    expect(mocks.stage).toHaveBeenCalledWith("proj-1", { stage: "WRITING", expectedVersion: 3 });
  });
});
