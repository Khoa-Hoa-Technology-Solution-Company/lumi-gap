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
    expect(container.textContent).toContain("Tiến độ sàng lọc đang duy trì đều đặn.");

    // Verify active claim card & countdown
    expect(container.textContent).toContain("Generative AI in Education");
    expect(container.textContent).toContain("Tiếp tục đánh giá");
    expect(container.textContent).toContain("+24h Gia hạn");
    expect(container.textContent).toContain("Trả lại hàng đợi");

    // Verify discovery goal
    expect(container.textContent).toContain("Mục tiêu tìm tài liệu");
    expect(container.textContent).toContain("1 / 2 bài");

    // Verify claim next button
    expect(container.textContent).toContain("Có 4 bài báo đang chờ người đánh giá");
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
    expect(container.textContent).toContain("Còn 1 suất (1/2)");
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
    expect(container.textContent).toContain("Không chọn cho phân tích");
    expect(container.textContent).toContain("Tài liệu không nằm trong phạm vi giáo dục đại học.");
    // Proposer attribution and respectful scientific exclusion note
    expect(container.textContent).toContain("đóng góp quan trọng để làm rõ ranh giới nghiên cứu");
    expect(container.textContent).toContain("Khảo sát bối cảnh ban đầu");
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
