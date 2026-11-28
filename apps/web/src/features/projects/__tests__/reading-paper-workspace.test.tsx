// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ProjectPaperAnalysis,
  ScreeningBoard,
  ScreeningPaperRow,
  ScreeningRoundView,
  ScreeningSettings,
} from "@trend/shared-types";
import { ReadingPaperModal } from "../components/reading-paper-modal";

const screeningMocks = vi.hoisted(() => ({
  board: vi.fn(),
  detail: vi.fn(),
  rounds: vi.fn(),
  history: vi.fn(),
  action: vi.fn(),
  claim: vi.fn(),
  proposal: vi.fn(),
  ai: vi.fn(),
  requestAi: vi.fn(),
  begin: vi.fn(),
  advanceConservatively: vi.fn(),
  resumeFullText: vi.fn(),
}));

const researchMocks = vi.hoisted(() => ({
  paperAnalysis: vi.fn(),
  requestPaperAnalysis: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
}));

const papersMocks = vi.hoisted(() => ({
  translate: vi.fn(),
}));

vi.mock("../api/screening.api", () => ({ screeningApi: screeningMocks }));
vi.mock("../api/project-research.api", () => ({ researchApi: researchMocks }));
vi.mock("@/features/papers/api/papers.api", () => ({ papersApi: papersMocks }));
vi.mock("@/services/confirmation", () => ({ confirmUnsavedChanges: vi.fn().mockResolvedValue(true) }));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (select: (state: { user: { id: string } }) => unknown) =>
    select({ user: { id: "user-me" } }),
}));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "vi", t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const baseSettings: ScreeningSettings = {
  reviewMode: "INDEPENDENT",
  workflowKind: "TEAM_SCREENING",
  workflowVersion: 11,
  screeningMode: "TWO_STAGE",
  stages: ["TITLE_ABSTRACT", "FULL_TEXT"],
  blindReview: true,
  resolutionPolicy: "CONSENSUS",
  consensusPolicy: "UNANIMOUS",
  requiredReviewers: 2,
  aiAssisted: false,
  version: 2,
  researchQuestions: ["RQ1: Công cụ hỗ trợ đọc ảnh hưởng thế nào đến độ chính xác sàng lọc?"],
  questionOptions: [{ id: "rq-1", text: "Công cụ hỗ trợ đọc ảnh hưởng thế nào đến độ chính xác sàng lọc?" }],
  inclusionCriteria: ["Nghiên cứu thực nghiệm có đối chứng về sàng lọc tài liệu"],
  exclusionCriteria: ["Bài ý kiến không có dữ liệu thực nghiệm"],
};

const baseRound: ScreeningRoundView = {
  id: "round-1",
  paperId: "paper-1",
  number: 1,
  phase: "TITLE_ABSTRACT",
  version: 1,
  status: "IN_REVIEW",
  active: true,
  settings: baseSettings,
  unblindedAt: null,
  independenceCompromised: false,
  assigned: 1,
  completed: 0,
  assignments: [
    { id: "asg-peer", reviewerId: "user-peer", name: "Lê Thu Hà", revision: 1, completed: false, active: true, dueAt: null, overdue: false },
  ],
  myAssignmentId: null,
  reviews: [],
  myReview: null,
  hiddenReviews: true,
  finalDecision: null,
  finalizer: { id: "user-owner", name: "Chủ dự án" },
  canFinalize: false,
  canReview: false,
  canClaim: true,
  canManage: false,
  proposerExcluded: false,
  isProposer: false,
  aiVisible: false,
  extractionReady: false,
};

const basePaper: ScreeningPaperRow = {
  paperId: "paper-1",
  title: "Controlled Evaluation of Reading Aids in Dual-Reviewer Literature Screening",
  abstractText:
    "Background: Literature screening requires blind reliability. Methods: Controlled crossover study with 64 graduate researchers evaluating 420 papers. Results: Structured reading support improved speed by 28% with kappa = 0.84.",
  doi: "10.1007/s10639-024-12580-1",
  publicationYear: 2024,
  journalName: "Education and Information Technologies",
  authors: ["Minh-Anh Nguyen", "Daniele Agostini", "Federica Picasso", "Thanh-Binh Tran"],
  paperLink: "https://link.springer.com/article/10.1007/s10639-024-12580-1",
  fullTextAvailable: false,
  fullTextStatus: "LANDING_PAGE_ONLY",
  paperKind: "article",
  openAccessStatus: "hybrid",
  citationCount: 42,
  keywords: ["literature screening", "inter-rater reliability"],
  importSource: "OpenAlex",
  proposer: { id: "user-proposer", name: "Trần Minh Khoa" },
  proposedAt: "2026-11-20T08:00:00.000Z",
  proposalReason: "Cung cấp thực nghiệm đối chứng phù hợp RQ1.",
  updatedAt: "2026-11-20T08:00:00.000Z",
  canEditProposal: false,
  legacyStatus: "NOT_REVIEWED",
  legacyProvenance: false,
  round: baseRound,
};

const baseAnalysis: ProjectPaperAnalysis = {
  paperId: "paper-1",
  screeningStatus: "UNDECIDED",
  title: basePaper.title,
  abstractText: basePaper.abstractText,
  doi: basePaper.doi,
  publicationYear: 2024,
  journalName: basePaper.journalName,
  authors: basePaper.authors ?? [],
  fullTextAvailable: false,
  fullTextStatus: "LANDING_PAGE_ONLY",
  sources: [
    {
      id: "ext-oa",
      kind: "EXTERNAL_LANDING_PAGE",
      label: "Trang xuất bản bên ngoài (Landing page)",
      url: "https://link.springer.com/article/10.1007/s10639-024-12580-1",
      availability: "EXTERNAL_LANDING_PAGE",
      accessState: "EXTERNAL_OPEN",
      verificationState: "UNVERIFIED_EXTERNAL",
      readableInWorkspace: false,
      usableForFullTextScreening: false,
    },
    {
      id: "doi-link",
      kind: "DOI_RESOLVER",
      label: "Liên kết DOI (10.1007/s10639-024-12580-1)",
      url: "https://doi.org/10.1007/s10639-024-12580-1",
      availability: "EXTERNAL_LANDING_PAGE",
      accessState: "EXTERNAL_OPEN",
      verificationState: "UNVERIFIED_EXTERNAL",
      readableInWorkspace: false,
      usableForFullTextScreening: false,
    },
  ],
  projectFiles: [],
  corpusPdf: { available: false, paperStatus: "UNAVAILABLE", requiresEntitlement: false },
  bibliographic: {
    openalexId: "W4390123456",
    arxivId: null,
    pubmedId: null,
    language: "en",
    paperKind: "article",
    primaryProvider: "openalex",
    openAccessStatus: "hybrid",
    licenseName: "CC-BY-4.0",
    citationCount: 42,
    fwci: 1.85,
    referencedWorksCount: 48,
    keywords: ["literature screening", "inter-rater reliability"],
    topics: [{ topicName: "Systematic Review Methodology" }],
    dataQualityScore: 0.92,
  },
  cachedTranslations: [],
  analysis: {
    extractedBy: "llm", analysisPromptVersion: "fixture-v1", extractedAt: "2026-11-26T00:00:00Z",
    summary: "Nghiên cứu thực nghiệm đối chứng với 64 học viên cao học trên 420 bài báo khoa học máy tính.",
    researchQuestions: ["Hỗ trợ đọc hiểu có cải thiện tốc độ sàng lọc mà vẫn giữ độ đồng thuận mù không?"],
    methods: "Thử nghiệm chéo ngẫu nhiên có đối chứng (randomized crossover evaluation).",
    dataset: "420 bài báo khoa học máy tính được bình duyệt, 64 học viên cao học.",
    findings: ["Giảm 28% thời gian đọc (p < 0.01) trong khi giữ nguyên Cohen's kappa = 0.84."],
    contributions: ["Chứng minh công cụ hỗ trợ đọc trung lập không làm giảm độ đồng thuận độc lập."],
    limitations: ["Chỉ đánh giá trên lĩnh vực khoa học máy tính."],
    futureWork: [],
    keyTerms: ["systematic screening", "Cohen's kappa"],
  },
  knowledge: {
    paperId: "paper-1",
    warnings: [],
    nodes: [],
    passages: [],
    status: "ready",
    sourceKind: "abstract",
    pageCount: undefined,
    edges: [
      {
        id: "edge-1",
        targetId: "claim-1",
        kind: "SUPPORTS",
        chunkId: "chunk-1",
        quote: "Structured reading support improved speed by 28% with kappa = 0.84.",
        pageNumber: null,
      },
    ],
  },
};

function makeBoard(paper: ScreeningPaperRow = basePaper): ScreeningBoard {
  return {
    items: [paper],
    total: 1,
    page: 1,
    pageSize: 1,
    hasNext: false,
    filters: { proposers: [], reviewers: [] },
    progress: { total: 1, reviewed: 0, finalized: 0, legacy: 0 },
    myProgress: { assigned: 0, completed: 0, pending: 0, overdue: 0 },
    canManage: false,
    people: [
      { id: "user-me", name: "Tôi" },
      { id: "user-peer", name: "Lê Thu Hà" },
    ],
    settings: baseSettings,
  };
}

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 25));
  });
}

async function renderModal(node: ReactNode, path = "/projects/p1?tab=papers&view=queue&round=round-1&section=source&paper=paper-1") {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {node}
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await settle();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  screeningMocks.board.mockResolvedValue(makeBoard());
  screeningMocks.detail.mockResolvedValue(baseRound);
  screeningMocks.rounds.mockResolvedValue({ items: [baseRound], total: 1, page: 1, pageSize: 10, hasNext: false, legacy: null });
  screeningMocks.history.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, hasNext: false });
  screeningMocks.claim.mockResolvedValue({ roundId: "round-1", assignmentId: "asg-me" });
  researchMocks.paperAnalysis.mockResolvedValue(baseAnalysis);
  papersMocks.translate.mockResolvedValue({
    paperId: "paper-1",
    targetLanguage: "vi",
    translatedTitle: "Đánh giá có đối chứng công cụ hỗ trợ đọc trong sàng lọc tài liệu hai người đọc",
    translatedAbstract: "Bối cảnh: Sàng lọc tài liệu hệ thống đòi hỏi độ tin cậy mù cao. Phương pháp: Nghiên cứu chéo có đối chứng với 64 học viên cao học.",
    provider: "Gemini",
    cached: false,
  });

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

describe("Paper Reading & Assessment Workspace", () => {
  it("shows honest landing-page status (never fake 'Có toàn văn'), visible frozen criteria, and Reviewer Claim CTA", async () => {
    await renderModal(<ReadingPaperModal projectId="p1" paperId="paper-1" readOnly={false} onClose={vi.fn()} />);

    const text = document.body.textContent ?? "";
    expect(text).toContain("Trang nguồn ngoài (chưa có PDF)");
    expect(text).not.toContain("Có toàn văn");

    // Frozen criteria are prominently visible (never sr-only)
    const criteria = document.querySelector('[data-screening-section="criteria"]') as HTMLDetailsElement | null;
    expect(criteria).not.toBeNull();
    expect(criteria?.open).toBe(true);
    expect(criteria?.textContent).toContain("RQ1: Công cụ hỗ trợ đọc ảnh hưởng thế nào");
    expect(criteria?.textContent).toContain("Nghiên cứu thực nghiệm có đối chứng");
    expect(criteria?.textContent).toContain("Bài ý kiến không có dữ liệu thực nghiệm");

    // Unassigned eligible reviewer sees explicit claim card & CTA
    const claimBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b =>
      b.textContent?.includes("Nhận lượt đánh giá"),
    );
    expect(claimBtn).toBeDefined();
    await act(async () => claimBtn!.click());
    await settle();
    expect(screeningMocks.claim).toHaveBeenCalledWith("p1", "round-1", expect.objectContaining({ clientKey: expect.any(String) }));

    // Extraction CTA stays disabled prior to final inclusion
    const extractBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b =>
      b.textContent?.includes("Trích xuất vào ma trận minh chứng"),
    );
    expect(extractBtn?.disabled).toBe(true);
  });

  it("supports explicit on-demand Vietnamese translation with provenance notice and never auto-translates on mount", async () => {
    await renderModal(<ReadingPaperModal projectId="p1" paperId="paper-1" readOnly={false} onClose={vi.fn()} />);

    expect(papersMocks.translate).not.toHaveBeenCalled();

    const translateBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b =>
      b.textContent?.includes("Dịch tiếng Việt"),
    );
    expect(translateBtn).toBeDefined();

    await act(async () => translateBtn!.click());
    await settle();

    expect(papersMocks.translate).toHaveBeenCalledWith("paper-1", "vi");
    const text = document.body.textContent ?? "";
    expect(text).toContain("Bản dịch hỗ trợ đọc hiểu");
    expect(text).toContain("đối chiếu nguyên văn khi sử dụng làm minh chứng.");
    expect(text).toContain("Sàng lọc tài liệu hệ thống đòi hỏi độ tin cậy mù cao");
    // Original abstract remains visible
    expect(text).toContain("Background: Literature screening requires blind reliability.");
  });

  it("renders neutral AI understanding with source coverage, Research Paper Snapshot, and ZERO include/exclude recommendation", async () => {
    await renderModal(<ReadingPaperModal projectId="p1" paperId="paper-1" readOnly={false} onClose={vi.fn()} />);

    const understandingTab = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(t =>
      t.textContent?.includes("Hỗ trợ đọc hiểu"),
    );
    expect(understandingTab).toBeDefined();
    await act(async () => understandingTab!.click());
    await settle();

    const text = document.body.textContent ?? "";
    expect(text).toContain("Phân tích từ tiêu đề và tóm tắt — chưa bao gồm toàn văn bài báo.");
    expect(text).toContain("Tổng quan trực quan");
    expect(text).toContain("Thử nghiệm chéo ngẫu nhiên có đối chứng");
    expect(text).toContain("Chưa đủ căn cứ từ nguồn hiện có.");
    // Must NEVER recommend include/exclude
    expect(text).not.toContain("Khuyến nghị chọn");
    expect(text).not.toContain("Khuyến nghị loại");
    expect(text).not.toContain("Đề xuất AI");

    // Clicking "Xem căn cứ" jumps back to Abstract tab with quote highlighted
    const jumpBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b =>
      b.textContent?.includes("Xem căn cứ"),
    );
    expect(jumpBtn).toBeDefined();
    await act(async () => jumpBtn!.click());
    await settle();
    const abstractTab = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(t =>
      t.textContent?.includes("Tóm tắt"),
    );
    expect(abstractTab?.getAttribute("aria-selected")).toBe("true");
  });

  it("explains proposer exclusion cleanly and keeps blind proposer context collapsed", async () => {
    const proposerRound: ScreeningRoundView = {
      ...baseRound,
      canClaim: false,
      proposerExcluded: true,
      isProposer: true,
    };
    screeningMocks.detail.mockResolvedValue(proposerRound);
    screeningMocks.board.mockResolvedValue(makeBoard({ ...basePaper, round: proposerRound }));

    await renderModal(<ReadingPaperModal projectId="p1" paperId="paper-1" readOnly={false} onClose={vi.fn()} />);

    const text = document.body.textContent ?? "";
    expect(text).toContain("Quy tắc độc lập với người đề xuất");
    expect(text).not.toContain("Nhận lượt đánh giá");
    expect(text).toContain("Ngữ cảnh đề xuất (thu gọn trong vòng đánh giá mù để giảm thiên lệch)");
  });

  it("preserves unsaved ballot drafts when switching mobile panes and enables extraction after final inclusion", async () => {
    const assignedRound: ScreeningRoundView = {
      ...baseRound,
      assigned: 2,
      myAssignmentId: "asg-me",
      canClaim: false,
      canReview: true,
      assignments: [
        ...baseRound.assignments,
        { id: "asg-me", reviewerId: "user-me", name: "Tôi", revision: 1, completed: false, active: true, dueAt: null, overdue: false },
      ],
    };
    screeningMocks.detail.mockResolvedValue(assignedRound);
    screeningMocks.board.mockResolvedValue(makeBoard({ ...basePaper, round: assignedRound }));

    await renderModal(<ReadingPaperModal projectId="p1" paperId="paper-1" readOnly={false} onClose={vi.fn()} />);

    // Select INCLUDE and enter draft rationale
    const includeRadio = document.querySelector<HTMLInputElement>('input[type="radio"][value="INCLUDE"]')!;
    await act(async () => includeRadio.click());
    await settle();
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-screening-section="review"] textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        textarea,
        "Bản nháp đánh giá độc lập cần được bảo toàn",
      );
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();

    // Switch mobile pane back and forth — textarea remains mounted with draft intact
    const assessmentPaneBtn = [...document.querySelectorAll<HTMLButtonElement>(".paper-mobile-pane-btn")].find(b =>
      b.textContent?.includes("Đánh giá"),
    )!;
    const readingPaneBtn = [...document.querySelectorAll<HTMLButtonElement>(".paper-mobile-pane-btn")].find(b =>
      b.textContent?.includes("Đọc tài liệu"),
    )!;
    await act(async () => assessmentPaneBtn.click());
    await act(async () => readingPaneBtn.click());
    await act(async () => assessmentPaneBtn.click());
    expect(
      document.querySelector<HTMLTextAreaElement>('[data-screening-section="review"] textarea')?.value,
    ).toBe("Bản nháp đánh giá độc lập cần được bảo toàn");
  });

  it("handles missing abstract honestly without fabricating text", async () => {
    const noAbstractPaper: ScreeningPaperRow = { ...basePaper, abstractText: null, fullTextStatus: "UNAVAILABLE" };
    screeningMocks.board.mockResolvedValue(makeBoard(noAbstractPaper));
    researchMocks.paperAnalysis.mockResolvedValue({ ...baseAnalysis, abstractText: null, fullTextStatus: "UNAVAILABLE", sources: [] });

    await renderModal(<ReadingPaperModal projectId="p1" paperId="paper-1" readOnly={false} onClose={vi.fn()} />);

    const text = document.body.textContent ?? "";
    expect(text).toContain("Bài báo chưa có tóm tắt trong kho dữ liệu.");
    expect(text).toContain("Chỉ có metadata");
  });

  it("renders stage-aware labels, non-blocking overdue warning, adjacent footer notice, and submit-and-next continuous navigation", async () => {
    const assignedOverdueRound: ScreeningRoundView = {
      ...baseRound,
      assigned: 2,
      myAssignmentId: "asg-me",
      canClaim: false,
      canReview: true,
      assignments: [
        ...baseRound.assignments,
        {
          id: "asg-me",
          reviewerId: "user-me",
          name: "Tôi",
          revision: 1,
          completed: false,
          active: true,
          dueAt: "2026-11-20T00:00:00.000Z",
          overdue: true,
        },
      ],
    };
    screeningMocks.detail.mockResolvedValue(assignedOverdueRound);
    screeningMocks.board.mockResolvedValue(makeBoard({ ...basePaper, round: assignedOverdueRound }));
    screeningMocks.action.mockResolvedValue({ id: "rev-1" });
    const onSelectPaper = vi.fn();

    await renderModal(
      <ReadingPaperModal
        projectId="p1"
        paperId="paper-1"
        readOnly={false}
        onClose={vi.fn()}
        paperIds={["paper-1", "paper-2"]}
        onSelectPaper={onSelectPaper}
      />,
    );

    const text = document.body.textContent ?? "";
    // Simplified header omits duplicated progress count
    const headerText = document.querySelector(".library-dialog-header")?.textContent ?? "";
    expect(headerText).not.toContain("0/2 phiếu");
    expect(headerText).toContain("1 / 2");

    // Stage-aware two-stage Title & Abstract labels
    expect(text).toContain("Đánh giá của bạn");
    expect(text).toContain("Tiếp tục xem xét");
    expect(text).toContain("Không phù hợp");
    expect(text).toContain("Đã quá hạn đánh giá");
    expect(text).toContain("Phiếu sẽ được khóa sau khi gửi.");
    expect(text).toContain("Khả dụng sau khi tài liệu được lựa chọn chính thức.");

    // Submit and advance to next paper only after confirmed backend success
    const includeRadio = document.querySelector<HTMLInputElement>('input[type="radio"][value="INCLUDE"]')!;
    await act(async () => includeRadio.click());
    await settle();
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-screening-section="review"] textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        textarea,
        "Đáp ứng tiêu chí nghiên cứu thực nghiệm",
      );
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();

    const submitNextBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b =>
      b.textContent?.includes("Gửi phiếu và đọc bài tiếp theo"),
    );
    expect(submitNextBtn).toBeDefined();
    expect(submitNextBtn?.disabled).toBe(false);

    await act(async () => submitNextBtn!.click());
    await settle();
    expect(screeningMocks.action).toHaveBeenCalledWith(
      "p1",
      "round-1",
      "reviews",
      expect.objectContaining({ decision: "INCLUDE", comment: "Đáp ứng tiêu chí nghiên cứu thực nghiệm" }),
    );
    expect(onSelectPaper).toHaveBeenCalledWith("paper-2");
  });
});
