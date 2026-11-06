// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyWorkView } from "../components/my-work-view";
import { ScreeningQueueView } from "../components/screening-queue-view";
import { MyProposalsView } from "../components/my-proposals-view";
import type { ScreeningWorkspaceSummary, ScreeningBoard } from "@trend/shared-types";

const mocks = vi.hoisted(() => ({
  workspaceSummary: vi.fn(),
  claimNext: vi.fn(),
  claim: vi.fn(),
  extend: vi.fn(),
  release: vi.fn(),
  updateDiscoveryGoal: vi.fn(),
  board: vi.fn(),
  proposal: vi.fn(),
}));

vi.mock("../api/screening.api", () => ({
  screeningApi: mocks,
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "user-123" } }),
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({ language: "vi", t: (key: string) => key }),
}));

describe("Task-First Papers Workspace Views", () => {
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;

  async function settle() {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.resetAllMocks();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
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

  it("prioritizes confirmations, distinct clarification tasks and assigned adjudications without completed claim timers", async () => {
    mocks.workspaceSummary.mockResolvedValue({
      myActiveClaims: [], pendingConsensus: [{ paperId: "confirm", roundId: "r1", agreementId: "a1", title: "Confirmation paper", reason: "Check population", proposedByName: "Reviewer B" }],
      pendingDiscussions: [{ paperId: "confirm", roundId: "r1", title: "Duplicate confirmation", classification: "CONFLICT", phase: "TITLE_ABSTRACT" }, { paperId: "clarify", roundId: "r2", title: "Clarification paper", classification: "NEEDS_CLARIFICATION", phase: "FULL_TEXT" }],
      pendingAdjudications: [{ paperId: "adjudicate", roundId: "r3", title: "Adjudication paper" }],
      myProposalsCount: 0, recentProposals: [], eligibleQueueCount: 0, nextEligiblePaperId: null,
      discoveryGoal: { enabled: false, target: 2, period: "WEEK", paused: false, currentCount: 0, remaining: 2 }, capacityAdvice: { queueStatus: "NORMAL", message: "Theo dõi tiến độ" },
    });
    const open = vi.fn();
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><MyWorkView projectId="p" readOnly={false} onOpenPaper={open} onSwitchView={vi.fn()} /></MemoryRouter></QueryClientProvider>));
    await settle();
    const section = container.querySelector('[aria-label="Cần tôi giải quyết"]')!;
    expect([...section.querySelectorAll("h4")].map(e => e.textContent)).toEqual(["Confirmation paper", "Clarification paper", "Adjudication paper"]);
    expect(section.textContent).toContain("Cần làm rõ"); expect(section.textContent).toContain("Đối chiếu nguồn, bổ sung căn cứ hoặc cập nhật đánh giá của bạn.");
    expect(container.textContent).not.toContain("Gia hạn +24h"); expect(container.textContent).not.toContain("Trả lại hàng đợi");
    const clarificationCard = [...section.querySelectorAll("article")].find(card => card.textContent?.includes("Clarification paper"))!;
    await act(async () => clarificationCard.querySelector("button")!.click());
    expect(open).toHaveBeenCalledWith("clarify", { roundId: "r2", section: "discussion" });
  });

  it("renders MyWorkView with active claims, countdown timer, capacity advice and discovery goals", async () => {
    const summaryData: ScreeningWorkspaceSummary = {
      myActiveClaims: [
        {
          paperId: "paper-1",
          roundId: "round-1",
          assignmentId: "assign-1",
          title: "Generative AI in Education",
          authors: ["Nguyen Van A"],
          publicationYear: 2024,
          journalName: "Computers & Education",
          phase: "TITLE_ABSTRACT",
          dueAt: new Date(Date.now() + 86400000).toISOString(),
          expiresInSeconds: 86400,
          canExtend: true,
          canRelease: true,
        },
      ],
      pendingConsensus: [],
      pendingAdjudications: [],
      myProposalsCount: 3,
      recentProposals: [
        {
          paperId: "paper-prop-1",
          title: "My Proposed Paper",
          proposedAt: new Date().toISOString(),
          screeningStatus: "IN_REVIEW",
          finalDecision: null,
          reviewProgress: { completed: 1, required: 2, held: 1 },
        },
      ],
      eligibleQueueCount: 4,
      nextEligiblePaperId: "paper-next",
      discoveryGoal: {
        enabled: true,
        target: 2,
        period: "WEEK",
        paused: false,
        currentCount: 1,
        remaining: 1,
      },
      capacityAdvice: {
        queueStatus: "NORMAL",
        message: "Tiến độ sàng lọc đang duy trì đều đặn.",
        suggestedAction: "REVIEW_QUEUE",
      },
    };

    mocks.workspaceSummary.mockResolvedValue(summaryData);
    const onOpen = vi.fn();
    const onSwitch = vi.fn();

    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <MyWorkView
              projectId="proj-1"
              readOnly={false}
              canManage={true}
              onOpenPaper={onOpen}
              onSwitchView={onSwitch}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await settle();

    // Verify advice banner
    expect(container.textContent).not.toContain("Tiến độ sàng lọc đang duy trì đều đặn.");

    // Verify active claim card & countdown
    expect(container.textContent).toContain("Generative AI in Education");
    expect(container.textContent).toContain("Tiếp tục đánh giá");
    expect(container.textContent).toContain("Gia hạn +24h");
    expect(container.textContent).toContain("Trả lại hàng đợi");

    // Verify discovery goal and sidebar widgets removed to stretch workspace full width
    expect(container.textContent).not.toContain("Mục tiêu tìm tài liệu");

    // Verify claim next button
    expect(container.textContent).toContain("Có 4 bài báo đang chờ người đánh giá");

    // A full queue does not mean the team needs to import more papers.
    await act(async () => {
      client.setQueriesData({ queryKey: ["project-research", "user-123", "proj-1"] }, {
        ...summaryData,
        eligibleQueueCount: 0,
        capacityAdvice: { queueStatus: "EMPTY_QUEUE", message: "Chưa có suất phù hợp.", suggestedAction: "DISCOVER_MORE" },
      });
    });
    await settle();
    const openLibrary = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("Mở Thư viện"));
    expect(openLibrary).toBeDefined();
    expect(container.textContent).not.toContain("Tìm tài liệu mới");
    await act(async () => openLibrary!.click());
    expect(onSwitch).toHaveBeenCalledWith("library");
  });

  it("renders ScreeningQueueView with slot statuses and claimable paper cards", async () => {
    const queueBoard: ScreeningBoard = {
      items: [
        {
          paperId: "paper-q1",
          doi: null,
          title: "Deep Learning for Systematic Reviews",
          abstractText: "This paper reviews deep learning models...",
          publicationYear: 2025,
          journalName: "Information Sciences",
          authors: ["Tran B"],
          proposedAt: new Date().toISOString(),
          proposalReason: "Relevant methodology",
          updatedAt: new Date().toISOString(),
          canEditProposal: false,
          legacyStatus: "NOT_REVIEWED",
          legacyProvenance: false,
          proposer: { id: "proposer-1", name: "Le Van C" },
          round: {
            id: "round-q1",
            paperId: "paper-q1",
            number: 1,
            phase: "TITLE_ABSTRACT",
            version: 1,
            status: "IN_REVIEW",
            active: true,
            settings: {
              reviewMode: "INDEPENDENT",
              blindReview: true,
              resolutionPolicy: "ADJUDICATION",
              version: 1,
              requiredReviewers: 2,
              consensusPolicy: "UNANIMOUS",
              aiAssisted: false,
              inclusionCriteria: [],
              exclusionCriteria: [],
              researchQuestions: [],
            },
            unblindedAt: null,
            independenceCompromised: false,
            assigned: 1,
            completed: 1,
            assignments: [],
            reviews: [],
            myReview: null,
            myAssignmentId: null,
            hiddenReviews: true,
            finalDecision: null,
            finalizer: { id: "owner", name: "Chủ dự án" },
            canFinalize: false,
            canReview: true,
            canManage: false,
            aiVisible: false,
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 12,
      hasNext: false,
      filters: { proposers: [], reviewers: [] },
      progress: { total: 1, reviewed: 1, finalized: 0, legacy: 0 },
      people: [],
      canManage: false,
      myProgress: { assigned: 0, completed: 0, pending: 0, overdue: 0 },
      settings: {
        reviewMode: "INDEPENDENT",
        blindReview: true,
        resolutionPolicy: "ADJUDICATION",
        version: 1,
        requiredReviewers: 2,
        consensusPolicy: "UNANIMOUS",
        aiAssisted: false,
        inclusionCriteria: [],
        exclusionCriteria: [],
        researchQuestions: [],
      },
    };

    mocks.board.mockResolvedValue(queueBoard);
    const onOpen = vi.fn();

    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <ScreeningQueueView
              projectId="proj-1"
              readOnly={false}
              onOpenPaper={onOpen}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await settle();

    expect(container.textContent).toContain("Hàng đợi đánh giá");
    expect(container.textContent).toContain("1 bài cần người đánh giá");
    expect(container.textContent).toContain("Deep Learning for Systematic Reviews");
    expect(container.textContent).toContain("1 người đã nhận · 1/2 phiếu đã gửi · Còn 1 suất");
    expect(container.textContent).toContain("Nhận đánh giá");
    expect(container.textContent).toContain("Xem trước");
  });

  it("renders MyProposalsView without losing excluded papers and preserving attribution", async () => {
    const proposalsBoard: ScreeningBoard = {
      items: [
        {
          paperId: "paper-excluded",
          doi: null,
          title: "Excluded Literature Study",
          abstractText: "Study outside target scope.",
          publicationYear: 2023,
          journalName: "Generic Journal",
          authors: ["Author X"],
          proposedAt: "2026-10-31T08:30:00.000Z",
          proposalReason: "Khảo sát bối cảnh ban đầu",
          updatedAt: "2026-10-31T08:30:00.000Z",
          canEditProposal: true,
          legacyStatus: "EXCLUDED",
          legacyProvenance: false,
          proposer: { id: "user-123", name: "Nguyễn Đình Thanh" },
          round: {
            id: "round-exc",
            paperId: "paper-excluded",
            number: 1,
            phase: "TITLE_ABSTRACT",
            version: 2,
            status: "EXCLUDED",
            active: false,
            settings: {
              reviewMode: "INDEPENDENT",
              blindReview: true,
              resolutionPolicy: "ADJUDICATION",
              version: 1,
              requiredReviewers: 2,
              consensusPolicy: "UNANIMOUS",
              aiAssisted: false,
              inclusionCriteria: [],
              exclusionCriteria: ["Không liên quan"],
              researchQuestions: [],
            },
            unblindedAt: "2026-10-31T09:00:00.000Z",
            independenceCompromised: false,
            assigned: 2,
            completed: 2,
            assignments: [],
            reviews: [],
            myReview: null,
            myAssignmentId: null,
            hiddenReviews: false,
            finalDecision: {
              id: "fd-1",
              version: 2,
              decision: "EXCLUDED",
              source: "CONSENSUS",
              reason: "Tài liệu không nằm trong phạm vi giáo dục đại học.",
              resolverId: null,
              createdAt: "2026-10-31T09:00:00.000Z",
            },
            finalizer: { id: "owner", name: "Chủ dự án" },
            canFinalize: false,
            canReview: false,
            canManage: false,
            aiVisible: false,
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 12,
      hasNext: false,
      filters: { proposers: [], reviewers: [] },
      progress: { total: 1, reviewed: 1, finalized: 1, legacy: 0 },
      people: [],
      canManage: false,
      myProgress: { assigned: 0, completed: 0, pending: 0, overdue: 0 },
      settings: {
        reviewMode: "INDEPENDENT",
        blindReview: true,
        resolutionPolicy: "ADJUDICATION",
        version: 1,
        requiredReviewers: 2,
        consensusPolicy: "UNANIMOUS",
        aiAssisted: false,
        inclusionCriteria: [],
        exclusionCriteria: [],
        researchQuestions: [],
      },
    };

    mocks.board.mockResolvedValue(proposalsBoard);
    const onOpen = vi.fn();

    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <MyProposalsView
              projectId="proj-1"
              readOnly={false}
              onOpenPaper={onOpen}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await settle();

    expect(container.textContent).toContain("Tôi đã đề xuất");
    expect(container.textContent).toContain("Excluded Literature Study");
    expect(container.textContent).toContain("Đã loại");
    expect(container.textContent).toContain("Tài liệu không nằm trong phạm vi giáo dục đại học.");
    // Proposer attribution and respectful scientific exclusion note
    expect(container.textContent).toContain("đóng góp quan trọng để làm rõ ranh giới nghiên cứu");
    expect(container.textContent).toContain("Khảo sát bối cảnh ban đầu");
  });

  async function proposalEditor(canEditProposal = true) {
    const item = {
      paperId: "proposal", title: "Proposal requiring review", abstractText: "", doi: null,
      publicationYear: null, journalName: null, authors: [], proposedAt: "2026-11-04T01:00:00.000Z",
      updatedAt: "2026-11-04T01:00:00.000Z", proposalReason: "Original proposal reason", canEditProposal,
      proposer: { id: "user-123", name: "Proposer" }, round: null, legacyStatus: "UNDECIDED", legacyProvenance: false,
    };
    const data = { items: [item], total: 1, page: 1, pageSize: 12, hasNext: false, canManage: false };
    mocks.board.mockResolvedValue(data);
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><MyProposalsView projectId="p" readOnly={false} onOpenPaper={vi.fn()} /></MemoryRouter></QueryClientProvider>));
    await settle();
    return data;
  }
  const proposalButton = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === text);

  it("hides proposal reason editing when backend locks a reviewed proposal", async () => {
    await proposalEditor(false);
    expect(proposalButton("Sửa lý do")).toBeUndefined();
    expect(container.textContent).toContain("Original proposal reason");
  });
  it("disables a stale proposal editor after the first review without losing the draft", async () => {
    const data = await proposalEditor();
    await act(async () => proposalButton("Sửa lý do")!.click());
    const textarea = document.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Unsaved proposal draft");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => client.setQueryData(["project-research", "user-123", "p", "my-proposals", 1, "ALL", ""], { ...data, items: [{ ...data.items[0], canEditProposal: false }] }));
    await settle();
    expect(proposalButton("Lưu lý do đề xuất")!.disabled).toBe(true);
    expect(textarea.value).toBe("Unsaved proposal draft");
    expect(document.body.textContent).toContain("Bản nháp vẫn được giữ");
    expect(mocks.proposal).not.toHaveBeenCalled();
  });
  it("shows backend rejection if a reviewer submits while proposal editing is open", async () => {
    const data = await proposalEditor();
    await act(async () => proposalButton("Sửa lý do")!.click());
    mocks.proposal.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { error: { message: "Bài đã có phiếu đánh giá. Lý do đề xuất đã khóa" } } } });
    mocks.board.mockResolvedValue({ ...data, items: [{ ...data.items[0], canEditProposal: false }] });
    await act(async () => proposalButton("Lưu lý do đề xuất")!.click());
    await settle();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Lý do đề xuất đã khóa");
    expect(document.querySelector("textarea")!.value).toBe("Original proposal reason");
    expect(proposalButton("Lưu lý do đề xuất")!.disabled).toBe(true);
    expect(mocks.proposal).toHaveBeenCalledTimes(1);
  });
  it("renders ReadingPaperModal by querying source: paperId without showing not found error", async () => {
    const singlePaperBoard: ScreeningBoard = {
      items: [
        {
          paperId: "fa27a44c-c115-44ba-88e6-deaafc5f3ade",
          doi: "10.1007/s10639-023-12345-6",
          title: "Large language models for sustainable assessment and feedback in higher education",
          abstractText: "This paper investigates sustainable assessment approaches...",
          publicationYear: 2024,
          journalName: "Intelligenza Artificiale",
          authors: ["Daniele Agostini", "Federica Picasso"],
          proposedAt: "2026-10-19T08:54:12.000Z",
          proposalReason: "Phù hợp chủ đề LLM giáo dục",
          updatedAt: "2026-10-19T08:54:12.000Z",
          canEditProposal: true,
          legacyStatus: "NOT_REVIEWED",
          legacyProvenance: false,
          proposer: { id: "user-123", name: "Nguyễn Đình Thanh" },
          round: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 1,
      hasNext: false,
      filters: { proposers: [], reviewers: [] },
      progress: { total: 1, reviewed: 0, finalized: 0, legacy: 0 },
      myProgress: { assigned: 0, completed: 0, pending: 0, overdue: 0 },
      canManage: true,
      people: [{ id: "user-123", name: "Nguyễn Đình Thanh" }],
      settings: {
        reviewMode: "COLLABORATIVE",
        blindReview: false,
        resolutionPolicy: "ADJUDICATION",
        version: 1,
        requiredReviewers: 1,
        consensusPolicy: "UNANIMOUS",
        aiAssisted: false,
        inclusionCriteria: [],
        exclusionCriteria: [],
        researchQuestions: [],
      },
    };

    mocks.board.mockResolvedValue(singlePaperBoard);
    const onClose = vi.fn();

    const { ReadingPaperModal } = await import("../components/reading-paper-modal");

    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <ReadingPaperModal
              projectId="proj-1"
              paperId="fa27a44c-c115-44ba-88e6-deaafc5f3ade"
              readOnly={false}
              onClose={onClose}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await settle();

    // Verify screeningApi.board was called with source: paperId
    expect(mocks.board).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({
        source: "fa27a44c-c115-44ba-88e6-deaafc5f3ade",
        filter: "ALL",
        pageSize: 1,
      })
    );

    // Verify paper content is displayed, not "Không tìm thấy"
    expect(document.body.textContent).not.toContain("Không tìm thấy thông tin bài báo trong dự án này.");
    expect(document.body.textContent).toContain("Large language models for sustainable assessment");
    expect(document.body.textContent).toContain("Intelligenza Artificiale");
    expect(document.body.textContent).toContain("Daniele Agostini");
  });
});
