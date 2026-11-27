// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResearchLiterature } from "../components/research-literature";
import { buildLiteratureViewParams, resolvePrimaryLiteratureTab } from "../utils/literature-navigation";

const navMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  matrix: vi.fn(),
  limitations: vi.fn(),
  evidenceWorkspace: vi.fn(),
  library: vi.fn(),
  evidence: vi.fn(),
  questions: vi.fn(),
}));

vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "vi", t: (key: string) => key }) }));
vi.mock("@/services/confirmation", () => ({ confirmUnsavedChanges: navMocks.confirm }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: "actor" } }) }));

vi.mock("../components/my-work-view", () => ({ MyWorkView: () => <div>MY_WORK_VIEW</div> }));
vi.mock("../components/screening-queue-view", () => ({ ScreeningQueueView: () => <div>SCREENING_QUEUE_VIEW</div> }));
vi.mock("../components/my-proposals-view", () => ({ MyProposalsView: () => <div>MY_PROPOSALS_VIEW</div> }));
vi.mock("../components/collaborative-library", () => ({ CollaborativeLibrary: () => <div>COLLABORATIVE_LIBRARY_VIEW</div> }));
vi.mock("../components/screening-workspace", () => ({ ScreeningWorkspace: () => <div>SCREENING_WORKSPACE_VIEW</div> }));
vi.mock("../components/research-evidence", () => ({ ResearchEvidence: () => <div>RESEARCH_EVIDENCE_VIEW</div> }));
vi.mock("../components/reading-paper-modal", () => ({
  ReadingPaperModal: ({ paperId }: { paperId: string }) => <div>READING_MODAL:{paperId}</div>,
}));

vi.mock("../api/project-research.api", () => ({
  researchApi: {
    matrix: navMocks.matrix,
    limitations: navMocks.limitations,
    evidenceWorkspace: navMocks.evidenceWorkspace,
    library: navMocks.library,
    evidence: navMocks.evidence,
    questions: navMocks.questions,
  },
}));

let root: Root, container: HTMLDivElement, client: QueryClient;

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="loc">{location.search}</output>;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function renderPath(path: string, children: ReactNode = <div>ORGANIZE_FALLBACK</div>) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ResearchLiterature projectId="proj-1" readOnly={false}>
            {children}
          </ResearchLiterature>
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await settle();
}

function primaryTabs() {
  return [...document.querySelectorAll<HTMLButtonElement>('.papers-primary-tabs [role="tab"]')];
}

function selectedTabLabels(selector: string) {
  return [...document.querySelectorAll<HTMLButtonElement>(`${selector} [role="tab"][aria-selected="true"]`)]
    .map((el) => el.textContent?.trim());
}

async function clickTab(selector: string, label: string) {
  const target = [...document.querySelectorAll<HTMLButtonElement>(selector)]
    .find((btn) => btn.textContent?.includes(label));
  expect(target, label).toBeDefined();
  await act(async () => {
    target!.click();
  });
  await settle();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  sessionStorage.clear();
  navMocks.confirm.mockResolvedValue(true);
  navMocks.matrix.mockResolvedValue({ canEdit: true, criteria: [], rows: [], total: 0, truncated: false, questions: [], themes: [] });
  navMocks.limitations.mockResolvedValue({ canEdit: true, ungrouped: [], items: [] });
  navMocks.evidenceWorkspace.mockResolvedValue({ items: [], questions: [], total: 0 });
  navMocks.library.mockResolvedValue({ items: [], total: 0 });
  navMocks.evidence.mockResolvedValue({ items: [], total: 0 });
  navMocks.questions.mockResolvedValue([]);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("resolves primary tabs correctly across all view URL values", () => {
  expect(resolvePrimaryLiteratureTab(undefined)).toBe("my-work");
  expect(resolvePrimaryLiteratureTab("my-work")).toBe("my-work");
  expect(resolvePrimaryLiteratureTab("queue")).toBe("queue");
  expect(resolvePrimaryLiteratureTab("my-proposals")).toBe("queue");
  expect(resolvePrimaryLiteratureTab("screening")).toBe("queue");
  expect(resolvePrimaryLiteratureTab("library")).toBe("library");
  expect(resolvePrimaryLiteratureTab("organize")).toBe("library");
  expect(resolvePrimaryLiteratureTab("clusters")).toBe("analysis");
  expect(resolvePrimaryLiteratureTab("matrix")).toBe("analysis");
  expect(resolvePrimaryLiteratureTab("limitations")).toBe("analysis");

  const switched = buildLiteratureViewParams(new URLSearchParams("tab=papers&view=queue&paper=p1&round=r1&section=s1"), "matrix");
  expect(switched.get("tab")).toBe("papers");
  expect(switched.get("view")).toBe("matrix");
  expect(switched.get("paper")).toBeNull();
  expect(switched.get("round")).toBeNull();
  expect(switched.get("section")).toBeNull();
});

it("renders exactly 4 primary tabs and preserves existing views", async () => {
  await renderPath("/projects/proj-1?tab=papers");
  expect(primaryTabs().map((b) => b.textContent?.trim())).toEqual([
    "Việc của tôi",
    "Hàng đợi đánh giá",
    "Thư viện",
    "Phân tích tài liệu",
  ]);
  expect(selectedTabLabels(".papers-primary-tabs")).toEqual(["Việc của tôi"]);
  expect(container.textContent).toContain("MY_WORK_VIEW");

  await clickTab(".papers-primary-tabs button", "Hàng đợi đánh giá");
  expect(selectedTabLabels(".papers-primary-tabs")).toEqual(["Hàng đợi đánh giá"]);
  expect(selectedTabLabels(".papers-subnav-bar")).toEqual(["Hàng đợi chung"]);
  expect(container.textContent).toContain("SCREENING_QUEUE_VIEW");

  await clickTab(".papers-subnav-bar button", "Tôi đã đề xuất");
  expect(selectedTabLabels(".papers-primary-tabs")).toEqual(["Hàng đợi đánh giá"]);
  expect(selectedTabLabels(".papers-subnav-bar")).toEqual(["Tôi đã đề xuất"]);
  expect(container.textContent).toContain("MY_PROPOSALS_VIEW");
  expect(container.querySelector('[data-testid="loc"]')?.textContent).toContain("view=my-proposals");

  await clickTab(".papers-subnav-bar button", "Quy trình sàng lọc");
  expect(selectedTabLabels(".papers-primary-tabs")).toEqual(["Hàng đợi đánh giá"]);
  expect(container.textContent).toContain("SCREENING_WORKSPACE_VIEW");

  await clickTab(".papers-primary-tabs button", "Thư viện");
  expect(selectedTabLabels(".papers-primary-tabs")).toEqual(["Thư viện"]);
  expect(container.textContent).toContain("COLLABORATIVE_LIBRARY_VIEW");

  // The analysis subviews preserve existing matrix and limitations links.
  await clickTab(".papers-primary-tabs button", "Phân tích tài liệu");
  expect(selectedTabLabels(".papers-primary-tabs")).toEqual(["Phân tích tài liệu"]);
  expect(container.querySelector(".analysis-subnav-bar")).not.toBeNull();
  expect(selectedTabLabels(".analysis-subnav-bar")).toEqual(["Chủ đề & So sánh"]);
  expect(container.textContent).toContain("So sánh các công trình, tổng hợp bằng chứng và xác định hạn chế để phát triển hướng nghiên cứu.");
  expect(container.querySelector('[data-testid="loc"]')?.textContent).toContain("view=clusters");
});

it.each([
  ["?tab=papers&view=my-proposals", "Hàng đợi đánh giá", "Tôi đã đề xuất", "MY_PROPOSALS_VIEW"],
  // Legacy analysis deep links keep working and land on the literature analysis view.
  ["?tab=papers&view=matrix", "Phân tích tài liệu", "Ma trận tài liệu", "Ma trận chưa có dòng nào"],
  ["?tab=papers&view=limitations", "Phân tích tài liệu", "Hạn chế nghiên cứu", "Hạn chế đã xác định (0)"],
  ["?tab=papers&view=evidence", "Việc của tôi", null, "RESEARCH_EVIDENCE_VIEW"],
])("resolves direct deep link %s accurately on initial load", async (search, expectedPrimary, expectedSecondary, expectedContent) => {
  await renderPath(`/projects/proj-1${search}`);
  expect(selectedTabLabels(".papers-primary-tabs")).toEqual([expectedPrimary]);
  if (expectedSecondary) {
    const secondary = [...document.querySelectorAll<HTMLButtonElement>('.papers-subnav-tab[aria-selected="true"]')].map((e) => e.textContent?.trim());
    expect(secondary).toEqual([expectedSecondary]);
  }
  expect(container.textContent).toContain(expectedContent);
});

it("supports keyboard arrow navigation and respects unsaved workspace guard", async () => {
  await renderPath("/projects/proj-1?tab=papers&view=queue&paper=paper-99");
  expect(container.textContent).toContain("READING_MODAL:paper-99");

  const blockLeave = (event: Event) => {
    event.preventDefault();
  };
  window.addEventListener("project-workspace-leave", blockLeave);
  try {
    // Unsaved work blocks navigation when confirmation is declined
    navMocks.confirm.mockResolvedValueOnce(false);
    await clickTab(".papers-primary-tabs button", "Thư viện");
    expect(navMocks.confirm).toHaveBeenCalledTimes(1);
    expect(selectedTabLabels(".papers-primary-tabs")).toEqual(["Hàng đợi đánh giá"]);
    expect(container.textContent).toContain("READING_MODAL:paper-99");

    // Confirmed keyboard ArrowRight from Queue advances to Library and clears stale modal params
    navMocks.confirm.mockResolvedValueOnce(true);
    const queueTab = primaryTabs()[1]!;
    await act(async () => {
      queueTab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    await settle();
    expect(selectedTabLabels(".papers-primary-tabs")).toEqual(["Thư viện"]);
    expect(container.textContent).not.toContain("READING_MODAL:paper-99");
  } finally {
    window.removeEventListener("project-workspace-leave", blockLeave);
  }
});

it("shows contextual empty guidance in Analysis for no papers and no verified evidence, never when backend fails", async () => {
  await renderPath("/projects/proj-1?tab=papers&view=clusters");
  expect(container.textContent).toContain("Chưa có tài liệu để phân tích. Hãy thêm bài báo vào thư viện.");
  expect(container.querySelector('a[href="/projects/proj-1?tab=papers&view=library"]')).not.toBeNull();

  // Has papers, zero verified evidence
  client.clear();
  navMocks.library.mockResolvedValue({
    items: [{
      paperId: "p-1", title: "Paper 1", doi: null, publicationYear: 2025, journalName: null,
      authors: [], abstractText: "Abstract", screeningStatus: "INCLUDED", tags: [], collectionName: null, files: [],
    }],
    total: 1,
  });
  navMocks.evidenceWorkspace.mockResolvedValue({ items: [{ paperId: "p-1", title: "Paper 1", verifiedCount: 0, extractionCount: 1, screeningStatus: "INCLUDED", themes: [], questions: [] }], questions: [], total: 1 });
  await renderPath("/projects/proj-1?tab=papers&view=clusters");
  expect(container.textContent).toContain("Chưa có bằng chứng đã kiểm chứng. Hãy hoàn thành trích xuất và kiểm chứng tài liệu trước khi so sánh.");
  expect(container.querySelector('a[href="/projects/proj-1?tab=gaps&research=evidence"]')).not.toBeNull();

  // Backend failure shows WorkspaceError, never empty library message
  client.clear();
  navMocks.evidenceWorkspace.mockRejectedValue(new Error("Network error"));
  navMocks.library.mockRejectedValue(new Error("Network error"));
  await renderPath("/projects/proj-1?tab=papers&view=clusters");
  expect(container.textContent).not.toContain("Chưa có tài liệu để phân tích.");
});
