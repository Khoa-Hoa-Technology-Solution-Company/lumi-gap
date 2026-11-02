// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScreeningRoundView, WorkspacePerson } from "@trend/shared-types";
import { ScreeningConflictResolution } from "../components/screening-conflict-resolution";
import { ReadingPaperModal } from "../components/reading-paper-modal";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  actorId: "user-1",
  history: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  action: vi.fn().mockResolvedValue({}),
  reassess: vi.fn().mockResolvedValue({}),
  requestAdjudication: vi.fn().mockResolvedValue({}),
  board: vi.fn(), detail: vi.fn(), rounds: vi.fn(), ai: vi.fn().mockResolvedValue(null),
}));

vi.mock("../api/screening.api", () => ({ screeningApi: mocks }));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: any) => selector({ user: { id: mocks.actorId, fullName: "Reviewer" } }),
}));
vi.mock("../components/library-related-papers", () => ({ LibraryRelatedPapers: () => null }));
vi.mock("../components/paper-notes-dialog", () => ({ PaperNotesDialog: () => null }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "vi", t: (key: string) => key }) }));

describe("ScreeningConflictResolution Component", () => {
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actorId = "user-1";
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    client.clear();
    container.remove();
  });

  async function settle() {
    await act(async () => {
      await new Promise(r => setTimeout(r, 30));
    });
  }

  const mockRound: ScreeningRoundView = {
    id: "round-1",
    paperId: "paper-1",
    number: 1,
    phase: "TITLE_ABSTRACT",
    version: 1,
    status: "NEEDS_RESOLUTION",
    active: true,
    unblindedAt: new Date().toISOString(),
    independenceCompromised: false,
    assigned: 2,
    completed: 2,
    hiddenReviews: false,
    canReview: false,
    canManage: true,
    aiVisible: false,
    canFinalize: false,
    myAssignmentId: "assign-1",
    myReview: {
      id: "rev-1",
      assignmentId: "assign-1",
      reviewerId: "user-1",
      revision: 1,
      decision: "INCLUDE",
      exclusionReason: "",
      comment: "Nghiên cứu có mô hình deep learning phù hợp",
      submittedAt: new Date().toISOString(),
    },
    reviews: [
      {
        id: "rev-1",
        assignmentId: "assign-1",
        reviewerId: "user-1",
        revision: 1,
        decision: "INCLUDE",
        exclusionReason: "",
        comment: "Nghiên cứu có mô hình deep learning phù hợp",
        submittedAt: new Date().toISOString(),
      },
      {
        id: "rev-2",
        assignmentId: "assign-2",
        reviewerId: "user-2",
        revision: 1,
        decision: "EXCLUDE",
        exclusionReason: "Không đúng đối tượng nghiên cứu",
        comment: "Nghiên cứu chỉ tập trung vào sinh viên nghệ thuật",
        submittedAt: new Date().toISOString(),
      },
    ],
    assignments: [
      { id: "assign-1", reviewerId: "user-1", name: "Thanh Đình", revision: 1, completed: true, active: true, dueAt: null, overdue: false },
      { id: "assign-2", reviewerId: "user-2", name: "Nguyễn Đình Thanh", revision: 1, completed: true, active: true, dueAt: null, overdue: false },
    ],
    settings: {
      version: 1,
      requiredReviewers: 2,
      reviewMode: "INDEPENDENT",
      blindReview: true,
      resolutionPolicy: "ADJUDICATION",
      consensusPolicy: "UNANIMOUS",
      aiAssisted: false,
      inclusionCriteria: ["Mô hình Deep Learning", "Môi trường giáo dục trực tuyến"],
      exclusionCriteria: ["Không đúng đối tượng nghiên cứu", "Chưa có thực nghiệm đối chứng"],
      researchQuestions: ["Mô hình LLM cải thiện phản hồi học tập thế nào?"],
      stages: ["TITLE_ABSTRACT", "FULL_TEXT"],
      authorizedAdjudicatorIds: [],
      allowConservativeFullText: false,
      discoveryGoalEnabled: false,
      discoveryGoalTarget: 2,
      discoveryGoalPeriod: "WEEK",
      discoveryGoalPaused: false,
    },
    finalizer: { id: "user-3", name: "TS. Phạm Bảo Ngọc" },
    canReassess: true,
    canRequestAdjudication: true,
    classification: "CONFLICT",
    finalDecision: null,
  };

  const people: WorkspacePerson[] = [
    { id: "user-1", name: "Thanh Đình" },
    { id: "user-2", name: "Nguyễn Đình Thanh" },
    { id: "user-3", name: "TS. Phạm Bảo Ngọc" },
  ];

  async function renderRound(round: ScreeningRoundView, readOnly = false) {
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><ScreeningConflictResolution projectId="proj-1" round={round} people={people} readOnly={readOnly} /></MemoryRouter></QueryClientProvider>));
    await settle();
  }
  const button = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent === label);

  async function inputText(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    await act(async () => {
      const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
  }

  it("recognizes my ballot when the session has a migrated public ID", async () => {
    mocks.actorId = "legacy-public-id";
    await renderRound(mockRound);
    expect(container.textContent).toContain("Thanh Đình (Bạn)");
    expect(container.textContent).not.toContain("Nguyễn Đình Thanh (Bạn)");
  });

  it.each([false, true])("uses the shared conflict discussion regardless of personal action capabilities: %s", async observer => {
    const current = { ...mockRound, settings: { ...mockRound.settings, reviewMode: "COLLABORATIVE" as const },
      canManage: false, canReassess: !observer, canRequestAdjudication: !observer,
      myAssignmentId: observer ? null : mockRound.myAssignmentId, myReview: observer ? null : mockRound.myReview };
    mocks.detail.mockResolvedValue(current);
    mocks.rounds.mockResolvedValue({ items: [current], total: 1, page: 1, pageSize: 10, hasNext: false, legacy: null });
    mocks.board.mockResolvedValue({ items: [{ paperId: "paper-1", title: "Shared review layout", abstractText: "Abstract", round: current }], settings: current.settings, people });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><ReadingPaperModal projectId="proj-1" paperId="paper-1" readOnly={observer} onClose={() => {}} /></MemoryRouter></QueryClientProvider>));
    await settle(); await settle();
    expect(document.body.textContent).toContain("Giải quyết bất đồng");
    expect(document.body.querySelector('.screening-discussion [role="log"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Đánh giá độc lập của 2 reviewer");
    expect(Boolean(button("Nhờ người phân xử"))).toBe(!observer);
  });

  it.each(["INDEPENDENT", "COLLABORATIVE"] as const)("opens a working request confirmation inside the actual %s paper modal and refreshes its status", async mode => {
    let current = { ...mockRound, settings: { ...mockRound.settings, reviewMode: mode }, canManage: false, discussionReady: false };
    mocks.detail.mockImplementation(async () => current);
    mocks.rounds.mockImplementation(async () => ({ items: [current], total: 1, page: 1, pageSize: 10, hasNext: false, legacy: null }));
    mocks.board.mockImplementation(async () => ({ items: [{ paperId: "paper-1", title: "Study for review", abstractText: "Source abstract", round: current }], settings: current.settings, people }));
    mocks.requestAdjudication.mockImplementation(async () => {
      current = { ...current, canRequestAdjudication: false, status: "ADJUDICATING", adjudicationCase: { id: "case-1", status: "COLLECTING", requestedByIds: [mocks.actorId], disputePoints: [], ready: false, createdAt: new Date().toISOString(), assignedAdjudicator: null } };
      return { caseId: "case-1" };
    });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><ReadingPaperModal projectId="proj-1" paperId="paper-1" readOnly={false} onClose={() => {}} /></MemoryRouter></QueryClientProvider>));
    await settle(); await settle();
    expect(document.body.textContent).toContain("Đọc và đánh giá tài liệu");
    expect(button("Nhờ người phân xử")).toBeDefined();
    const discussion = [...document.querySelectorAll("button")].find(b => b.textContent?.startsWith("Trao đổi ("))!;
    expect(discussion.compareDocumentPosition(button("Nhờ người phân xử")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => button("Nhờ người phân xử")!.click()); await settle();
    expect(document.body.textContent).toContain("Chuyển bất đồng sang phân xử");
    expect(mocks.requestAdjudication).not.toHaveBeenCalled();
    const opinionInput = document.querySelector("#adjudicate-opinion") as HTMLTextAreaElement;
    if (opinionInput) {
      await inputText(opinionInput, "Tôi đề nghị phân xử độc lập vì bất đồng quan điểm về tiêu chí.");
    }
    await act(async () => button("Tạo yêu cầu phân xử")!.click()); await settle();
    expect(mocks.requestAdjudication).toHaveBeenCalledWith("proj-1", "round-1", expect.objectContaining({ expectedVersion: 1, confirmed: true, clientKey: expect.any(String) }));
    expect(button("Nhờ người phân xử")).toBeUndefined();
    expect(button("Sửa đánh giá của tôi")).toBeUndefined();
    expect(document.body.textContent).not.toContain("Bạn muốn xử lý thế nào?");
    expect(document.body.textContent).toContain("Đang thu thập ý kiến");
    expect(document.body.textContent).not.toContain("Chờ người phân xử nhận nhiệm vụ");
    expect(button("Hồ sơ phân xử")).toBeDefined();
    await act(async () => button("Hồ sơ phân xử")!.click()); await settle();
    expect(document.body.textContent).toContain("Mở toàn trang");
    expect(mocks.action).not.toHaveBeenCalled();
  });

  it.each(["user-1", "user-2"])("%s can confirm a neutral request without any discussion messages", async actor => {
    mocks.actorId = actor;
    const own = mockRound.reviews.find(r => r.reviewerId === actor)!;
    mocks.requestAdjudication.mockResolvedValue({ caseId: "case-1" });
    await renderRound({ ...mockRound, myReview: own, myAssignmentId: own.assignmentId, discussionReady: false });
    await act(async () => button("Nhờ người phân xử")!.click()); await settle();
    expect(document.body.textContent).toContain("LumiGap sẽ tổng hợp hai phiếu đánh giá");
    const opinionInput = document.querySelector("#adjudicate-opinion") as HTMLTextAreaElement;
    if (opinionInput) {
      await inputText(opinionInput, "Tôi đề nghị phân xử độc lập vì bất đồng quan điểm về tiêu chí.");
    }
    await act(async () => button("Tạo yêu cầu phân xử")!.click()); await settle();
    expect(mocks.requestAdjudication).toHaveBeenCalledTimes(1);
  });

  it("revoked permission or a final decision blocks an already-open confirmation", async () => {
    await renderRound(mockRound);
    await act(async () => button("Nhờ người phân xử")!.click()); await settle();
    await renderRound({ ...mockRound, canRequestAdjudication: false, finalDecision: { id: "final-1", decision: "INCLUDED", version: 2, source: "MANUAL", resolverId: "resolver", reason: "Already decided", createdAt: new Date().toISOString() } });
    expect(button("Nhờ người phân xử")).toBeUndefined();
    expect(button("Tạo yêu cầu phân xử")!.disabled).toBe(true);
    await act(async () => button("Tạo yêu cầu phân xử")!.click());
    expect(mocks.requestAdjudication).not.toHaveBeenCalled();
  });

  it.each(["COLLECTING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "NEEDS_MORE_INFO", "WAITING_ASSIGNMENT"] as const)("shows the existing %s case instead of another request", async status => {
    await renderRound({ ...mockRound, canRequestAdjudication: false, adjudicationCase: { id: "case-1", status, requestedByIds: ["user-1"], disputePoints: [], ready: status === "IN_PROGRESS" || status === "COMPLETED", createdAt: new Date().toISOString(), assignedAdjudicator: status === "WAITING_ASSIGNMENT" ? null : { id: "mentor", name: "TS. Linh", mentor: true, role: "PRIMARY_MENTOR" } } });
    expect(button("Nhờ người phân xử")).toBeUndefined();
    expect(document.body.textContent).toContain("Hồ sơ phân xử");
    if (status !== "WAITING_ASSIGNMENT") expect(document.body.textContent).toContain("TS. Linh · Mentor chính");
    if (status === "COMPLETED") expect(document.body.textContent).toContain("Đã phân xử");
  });

  it("renders conflict header, side-by-side reviews, and action buttons", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ScreeningConflictResolution
            projectId="proj-1"
            round={mockRound}
            people={people}
            readOnly={false}
          />
        </QueryClientProvider>
      );
    });
    await settle();

    expect(container.textContent).toContain("Giải quyết bất đồng");
    expect(container.textContent).toContain("Có bất đồng");
    expect(container.textContent).toContain("Đánh giá độc lập của 2 reviewer");
    expect(container.textContent).toContain("Thanh Đình");
    expect(container.textContent).toContain("Nguyễn Đình Thanh");
    expect(container.textContent).toContain("Phù hợp");
    expect(container.textContent).toContain("Không phù hợp");
    const viewReasonBtns = Array.from(container.querySelectorAll("button")).filter(b => b.textContent?.includes("Xem lý do"));
    expect(viewReasonBtns.length).toBeGreaterThanOrEqual(2);
    await act(async () => {
      viewReasonBtns[1]?.click();
    });
    await settle();
    expect(document.body.textContent).toContain("Không đúng đối tượng nghiên cứu");
    expect(container.textContent).toContain("Sửa đánh giá của tôi");
    expect(container.textContent).toContain("Nhờ người phân xử");
  });

  it("opens Reassessment dialog when clicking 'Sửa đánh giá của tôi'", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ScreeningConflictResolution
            projectId="proj-1"
            round={mockRound}
            people={people}
            readOnly={false}
          />
        </QueryClientProvider>
      );
    });
    await settle();

    const reassessBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("Sửa đánh giá của tôi"));
    expect(reassessBtn).toBeDefined();

    await act(async () => {
      reassessBtn?.click();
    });
    await settle();

    expect(document.body.textContent).toContain("Cập nhật lại kết luận sau khi thảo luận");
    expect(document.body.textContent).toContain("Lý do xem xét lại đánh giá");
    expect(document.body.textContent).toContain("Lưu đánh giá mới");
  });

  it("opens Adjudication dialog when clicking 'Nhờ người phân xử'", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ScreeningConflictResolution
            projectId="proj-1"
            round={mockRound}
            people={people}
            readOnly={false}
          />
        </QueryClientProvider>
      );
    });
    await settle();

    const adjudicateBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("Nhờ người phân xử"));
    expect(adjudicateBtn).toBeDefined();

    await act(async () => {
      adjudicateBtn?.click();
    });
    await settle();

    expect(document.body.textContent).toContain("Chuyển bất đồng sang phân xử");
    expect(document.body.textContent).toContain("Tạo yêu cầu phân xử");
    expect(document.body.textContent).toContain("Tiếp tục trao đổi");

    // The submit button must be disabled until at least 5 characters of opinion are entered
    const submitBtn = button("Tạo yêu cầu phân xử") as HTMLButtonElement;
    expect(submitBtn).toBeDefined();
    expect(submitBtn.disabled).toBe(true);

    const opinionInput = document.querySelector("#adjudicate-opinion") as HTMLTextAreaElement;
    expect(opinionInput).toBeDefined();

    // Type 4 characters -> still disabled
    await inputText(opinionInput, "1234");
    expect(submitBtn.disabled).toBe(true);

    // Type >= 5 characters -> enabled
    await inputText(opinionInput, "Bất đồng quan điểm về tiêu chí RQ1");
    expect(submitBtn.disabled).toBe(false);
  });

  it("hides 'Bạn muốn xử lý thế nào?' and 'Sửa đánh giá của tôi' when adjudicationCase exists", async () => {
    await renderRound({
      ...mockRound,
      adjudicationCase: {
        id: "case-1",
        status: "COLLECTING",
        requestedByIds: ["user-1"],
        disputePoints: [],
        ready: false,
        createdAt: new Date().toISOString(),
        assignedAdjudicator: null,
      },
    });

    expect(document.body.textContent).not.toContain("Bạn muốn xử lý thế nào?");
    expect(document.body.textContent).not.toContain("Sửa đánh giá của tôi");
    expect(document.body.textContent).not.toContain("Khi bạn sửa đánh giá cùng quyết định với đồng reviewer");
  });
  it("opens review detail dialog when clicking 'Xem lý do' and shows empty indicator for reviews without notes", async () => {
    const customRound: ScreeningRoundView = {
      ...mockRound,
      reviews: [
        {
          id: "rev-empty",
          assignmentId: "assign-1",
          reviewerId: "user-1",
          revision: 1,
          decision: "INCLUDE",
          exclusionReason: "",
          comment: "",
          submittedAt: new Date().toISOString(),
        },
        {
          id: "rev-long",
          assignmentId: "assign-2",
          reviewerId: "user-2",
          revision: 1,
          decision: "EXCLUDE",
          exclusionReason: "Bài báo này là một nghiên cứu tổng quan tài liệu về LLM trong giáo dục, không có dữ liệu thực nghiệm kiểm chứng hay phương pháp đo lường định lượng tương thích với câu hỏi nghiên cứu RQ1 và tiêu chí E2 của đề tài.",
          comment: "Cần tham khảo thêm",
          submittedAt: new Date().toISOString(),
        },
      ],
    };

    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ScreeningConflictResolution
            projectId="proj-1"
            round={customRound}
            people={people}
            readOnly={false}
          />
        </QueryClientProvider>
      );
    });
    await settle();

    // Empty note review should render styled placeholder
    expect(container.textContent).toContain("Không kèm ghi chú");

    // Review with reason should have 'Xem lý do' button
    const viewReasonBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("Xem lý do"));
    expect(viewReasonBtn).toBeDefined();

    // Clicking 'Xem lý do' opens Dialog showing the reason and comment
    await act(async () => {
      viewReasonBtn?.click();
    });
    await settle();

    expect(document.body.textContent).toContain("Phiếu đánh giá: Nguyễn Đình Thanh");
    expect(document.body.textContent).toContain("Bài báo này là một nghiên cứu tổng quan tài liệu");
    expect(document.body.textContent).toContain("Cần tham khảo thêm");
  });
});
