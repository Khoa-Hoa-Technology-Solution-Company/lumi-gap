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

  it.each(["NEEDS_CLARIFICATION", "NEEDS_MORE_INFORMATION", "EXCLUSION_REASON_MISMATCH"] as const)("explains %s from the backend without claiming a binary disagreement", async classification => {
    await renderRound({ ...mockRound, classification, status: classification === "EXCLUSION_REASON_MISMATCH" ? "NEEDS_RESOLUTION" : "NEEDS_MORE_INFO" });
    expect(container.querySelector(`section[aria-label="${classification === "EXCLUSION_REASON_MISMATCH" ? "Thống nhất lý do loại" : "Làm rõ thông tin"}"]`)).not.toBeNull();
    expect(container.textContent).not.toContain("Có bất đồng kết luận giữa 2 reviewer");
    expect(button("Nhờ người phân xử")).toBeDefined();
  });

  it("revises a fulltext ballot with its source and linked RQs, requiring a usable source", async () => {
    const own = { ...mockRound.myReview!, scope: "FULL_TEXT" as const, fullTextReference: "PDF p. 4, study population", researchQuestions: [{ id: "rq-1", text: "Study population?" }] };
    await renderRound({ ...mockRound, phase: "FULL_TEXT", myReview: own, settings: { ...mockRound.settings, screeningMode: "TWO_STAGE", workflowVersion: 11 } });
    await act(async () => button("Cập nhật phiếu của tôi")!.click());
    await settle();
    const source = document.querySelector('[aria-label="Nguồn toàn văn và vị trí đã đối chiếu"]') as HTMLTextAreaElement;
    expect(source.value).toBe(own.fullTextReference);
    expect(source.maxLength).toBe(1000);
    await act(async () => document.querySelector<HTMLInputElement>('[role="dialog"] input[type="radio"][value="INCLUDE"]')!.click());
    const reason = document.querySelector('textarea[placeholder="Ghi rõ lý do bạn thay đổi hoặc cập nhật đánh giá..."]') as HTMLTextAreaElement;
    await inputText(reason, "Updated evidence after comparing participant criteria");
    await inputText(source, "");
    expect(button("Lưu đánh giá mới")!.disabled).toBe(true);
    await inputText(source, "PDF p. 5, participant inclusion criteria");
    expect(button("Lưu đánh giá mới")!.disabled).toBe(false);
    await act(async () => button("Lưu đánh giá mới")!.click());
    await settle();
    expect(mocks.reassess).toHaveBeenCalledWith("proj-1", "round-1", expect.objectContaining({ decision: "INCLUDE", scope: "FULL_TEXT", fullTextReference: "PDF p. 5, participant inclusion criteria", researchQuestionIds: ["rq-1"] }));
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
    expect(document.body.querySelector('[aria-label="Giải quyết bất đồng"]')).not.toBeNull();
    expect(document.body.querySelector('.screening-discussion [role="log"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Hai phiếu đánh giá");
    expect(document.body.querySelectorAll(".screening-resolution-round .screening-state")).toHaveLength(1);
    expect(document.body.querySelector(".screening-conflict-header")).toBeNull();
    expect(Boolean(button("Nhờ người phân xử"))).toBe(!observer);
  });

  it("explains the three-member minimum and blocks the request while preserving discussion and ballot changes", async () => {
    await renderRound({ ...mockRound, canRequestAdjudication: false, adjudicationBlockedReason: "Phân xử yêu cầu ít nhất 3 thành viên đang hoạt động trong nhóm." });
    expect(button("Nhờ người phân xử")).toBeUndefined();
    expect(container.textContent).toContain("ít nhất 3 thành viên");
    expect(button("Đổi kết luận của tôi")).toBeDefined();
    expect(button("Trao đổi")).toBeDefined();
    expect(mocks.requestAdjudication).not.toHaveBeenCalled();
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
    const discussion = [...document.querySelectorAll("h4")].find(b => b.textContent?.startsWith("Trao đổi ("))!;
    expect(button("Nhờ người phân xử")!.compareDocumentPosition(discussion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(button("Đổi kết luận của tôi")).toBeUndefined();
    expect(document.body.textContent).not.toContain("Bạn muốn xử lý thế nào?");
    expect(document.body.textContent).toContain("Đang thu thập ý kiến");
    expect(document.body.textContent).not.toContain("Chờ người phân xử nhận nhiệm vụ");
    expect(button("Hồ sơ phân xử")).toBeDefined();
    await act(async () => button("Hồ sơ phân xử")!.click()); await settle();
    expect([...document.querySelectorAll('[role="dialog"] h2')].some(heading => heading.textContent === "Hồ sơ phân xử")).toBe(true);
    expect(document.body.textContent).not.toContain("Mở toàn trang");
    expect(document.querySelector('a[title="Mở hồ sơ ở tab mới"]')).toBeNull();
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
    const adjudicator = container.querySelector('[aria-label="Người phân xử"]');
    expect(adjudicator).not.toBeNull();
    if (status !== "WAITING_ASSIGNMENT") expect(adjudicator?.textContent).toContain("TS. Linh · Mentor chính");
    else expect(adjudicator?.textContent).toContain("Chờ phân công");
    if (status === "COMPLETED") expect(document.body.textContent).toContain("Đã phân xử");
  });

  it("shows the pending adjudicator while collecting statements without inventing an assignment", async () => {
    await renderRound({ ...mockRound, canRequestAdjudication: false, adjudicationCase: { id: "case-1", status: "COLLECTING", requestedByIds: ["user-1"], disputePoints: [], ready: false, createdAt: new Date().toISOString(), assignedAdjudicator: null } });
    const adjudicator = container.querySelector('[aria-label="Người phân xử"]');
    expect(adjudicator?.textContent).toContain("Người phân xửChờ phân công");
    expect(adjudicator?.textContent).toContain("Chưa có người độc lập đủ điều kiện");
    expect(button("Nhờ người phân xử")).toBeUndefined();
  });

  it.each([false, true])("offers team and mentor invitations only to an owner when there is no eligible adjudicator (%s)", async canManage => {
    await renderRound({ ...mockRound, canManage, canRequestAdjudication: false, adjudicationCase: { id: "case-1", status: "WAITING_ASSIGNMENT", requestedByIds: ["user-1"], disputePoints: [], ready: true, createdAt: new Date().toISOString(), assignedAdjudicator: null } });
    const adjudicator = container.querySelector('[aria-label="Người phân xử"]')!;
    const links = [...adjudicator.querySelectorAll("a")];
    expect(links.map(link => link.getAttribute("href"))).toEqual(canManage ? ["/projects/proj-1?tab=members", "/projects/proj-1?tab=support"] : []);
  });

  it("renders compact review rows, a single explanation, and action buttons", async () => {
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

    expect(container.querySelector('[aria-label="Giải quyết bất đồng"]')).not.toBeNull();
    expect(container.textContent).toContain("Hai phiếu đang khác kết luận");
    expect(container.textContent).toContain("Hai phiếu đánh giá");
    expect(container.querySelectorAll(".screening-review-row")).toHaveLength(2);
    expect(container.textContent).toContain("Thanh Đình");
    expect(container.textContent).toContain("Nguyễn Đình Thanh");
    expect(container.textContent).toContain("Phù hợp");
    expect(container.textContent).toContain("Không phù hợp");
    const viewReasonBtns = Array.from(container.querySelectorAll("button")).filter(b => b.textContent?.includes("Xem lý do"));
    expect(viewReasonBtns).toHaveLength(1);
    await act(async () => {
      viewReasonBtns[0]?.click();
    });
    await settle();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Không đúng đối tượng nghiên cứu");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Nghiên cứu chỉ tập trung vào sinh viên nghệ thuật");
    expect(container.textContent).toContain("Đổi kết luận của tôi");
    expect(container.textContent).toContain("Nhờ người phân xử");
  });

  it("opens Reassessment dialog when clicking 'Đổi kết luận của tôi'", async () => {
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

    const reassessBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("Đổi kết luận của tôi"));
    expect(reassessBtn).toBeDefined();

    await act(async () => {
      reassessBtn?.click();
    });
    await settle();

    expect(document.body.textContent).toContain("Hai reviewer đã gửi phiếu. Chọn kết luận khác");
    expect(document.body.textContent).toContain("Lý do xem xét lại đánh giá");
    expect(document.body.textContent).toContain("Lưu đánh giá mới");
  });

  it.each(["INCLUDE", "EXCLUDE", "UNSURE"] as const)("disables the current %s conclusion and requires a different choice after both ballots", async decision => {
    await renderRound({ ...mockRound, myReview: { ...mockRound.myReview!, decision } });
    await act(async () => button("Đổi kết luận của tôi")!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    const current = dialog.querySelector<HTMLInputElement>(`input[type="radio"][value="${decision}"]`)!;
    expect(current.disabled).toBe(true);
    await inputText(dialog.querySelector('textarea')!, "Đã đối chiếu lại với tiêu chí nghiên cứu");
    expect(button("Lưu đánh giá mới")!.disabled).toBe(true);
    await act(async () => dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mocks.reassess).not.toHaveBeenCalled();
    const alternative = [...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(input => !input.disabled && input.value === 'UNSURE') ?? [...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(input => !input.disabled)!;
    await act(async () => alternative.click());
    expect(button("Lưu đánh giá mới")!.disabled).toBe(false);
    await act(async () => button("Lưu đánh giá mới")!.click());
    expect(mocks.reassess).toHaveBeenCalledWith("proj-1", "round-1", expect.objectContaining({ decision: decision === 'UNSURE' ? 'INCLUDE' : 'UNSURE', expectedRevision: 1 }));
  });

  it("requires a real exclusion criterion when changing an include ballot to exclude", async () => {
    await renderRound(mockRound);
    await act(async () => button("Đổi kết luận của tôi")!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    await act(async () => dialog.querySelector<HTMLInputElement>('input[type="radio"][value="EXCLUDE"]')!.click());
    await inputText(dialog.querySelector('textarea')!, "Đối tượng nghiên cứu không đáp ứng tiêu chí");
    expect(button("Lưu đánh giá mới")!.disabled).toBe(true);
    const criterion = dialog.querySelector<HTMLSelectElement>('select')!;
    await act(async () => { criterion.value = mockRound.settings.exclusionCriteria[0]!; criterion.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => button("Lưu đánh giá mới")!.click());
    expect(mocks.reassess).toHaveBeenCalledWith("proj-1", "round-1", expect.objectContaining({ decision: 'EXCLUDE', exclusionReason: mockRound.settings.exclusionCriteria[0] }));
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

  it("hides 'Bạn muốn xử lý thế nào?' and 'Đổi kết luận của tôi' when adjudicationCase exists", async () => {
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
    expect(document.body.textContent).not.toContain("Đổi kết luận của tôi");
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
  it("separates ballots and discussion into accessible tabs with shared actions", async () => {
    await renderRound({ ...mockRound, reviews: mockRound.reviews.map(r => ({ ...r, exclusionReason: "", comment: "Cần đối chiếu đối tượng nghiên cứu.", fullTextReference: undefined })) });
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map(t => t.textContent)).toEqual(["Trao đổi", "Hai phiếu đánh giá"]);
    const panel = (tab: HTMLElement) => document.getElementById(tab.getAttribute('aria-controls')!)!;
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true');
    expect(panel(tabs[1]!).hidden).toBe(false);
    expect(panel(tabs[0]!).hidden).toBe(true);
    expect(container.querySelectorAll('.screening-review-row')).toHaveLength(2);
    expect(container.querySelector('.screening-review-detail-link')).toBeNull();
    expect(panel(tabs[1]!).textContent).toContain('Cần đối chiếu đối tượng nghiên cứu.');
    expect(button('Xem căn cứ')).toBeUndefined();
    await act(async () => tabs[0]!.click());
    expect(panel(tabs[1]!).hidden).toBe(true);
    expect(panel(tabs[0]!).hidden).toBe(false);
    expect(button('Đổi kết luận của tôi')!.closest('[role="tabpanel"]')).toBeNull();
    expect(button('Nhờ người phân xử')!.closest('[role="tabpanel"]')).toBeNull();
    expect(container.querySelector('.screening-conflict-container')?.getAttribute('data-focus-chat')).toBe('true');
    await act(async () => tabs[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    expect(document.activeElement).toBe(tabs[0]);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    await act(async () => tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]!.tabIndex).toBe(-1);
  });

  it("keeps a long reason bounded in the row and fully available as safe text in the dialog", async () => {
    const long = '<img src=x onerror=alert(1)> ' + 'Đối chiếu thông tin trong bài báo. '.repeat(500);
    await renderRound({ ...mockRound, reviews: [{ ...mockRound.reviews[0]!, comment: long }] });
    expect(container.querySelector('.screening-resolution-reason')?.textContent === long.trim()).toBe(true);
    expect(container.querySelector('.screening-resolution-reason')?.getAttribute('data-truncated')).toBe('true');
    expect(container.querySelector('.screening-resolution-reason img')).toBeNull();
    await act(async () => button('Xem lý do')!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.classList.contains('screening-ballot-dialog')).toBe(true);
    expect(dialog.querySelector('.screening-ballot-content')?.textContent).toContain(long);
    expect(dialog.querySelector('.screening-ballot-content img')).toBeNull();
    await renderRound({ ...mockRound, hiddenReviews: true });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('.screening-review-row')).toBeNull();
    expect(container.textContent).not.toContain(long);
  });

  it("preserves the chat draft and editor while switching between tabs", async () => {
    await renderRound(mockRound);
    await act(async () => button("Trao đổi")!.click());
    const editor = container.querySelector<HTMLTextAreaElement>('[aria-label="Tin nhắn trao đổi về bài báo"]')!;
    await inputText(editor, "Mình cần đối chiếu nguồn trước khi đổi phiếu.");
    await act(async () => button("Hai phiếu đánh giá")!.click());
    expect(editor.isConnected).toBe(true);
    expect(editor.value).toBe("Mình cần đối chiếu nguồn trước khi đổi phiếu.");
    await act(async () => button("Trao đổi")!.click());
    expect(editor.isConnected).toBe(true);
    expect(editor.value).toBe("Mình cần đối chiếu nguồn trước khi đổi phiếu.");
    expect(mocks.action).not.toHaveBeenCalled();
  });

  it("opens a discussion deep link in the discussion tab of the actual paper modal", async () => {
    const current = { ...mockRound, canManage: false };
    mocks.detail.mockResolvedValue(current);
    mocks.rounds.mockResolvedValue({ items: [current], total: 1, page: 1, hasNext: false });
    mocks.board.mockResolvedValue({ items: [{ paperId: "paper-1", title: "Deep-linked paper", authors: [], proposalReason: "", proposedAt: current.myReview!.submittedAt, updatedAt: current.myReview!.submittedAt, canEditProposal: false, round: current }], settings: current.settings, people });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/?section=discussion&round=round-1"]}><ReadingPaperModal projectId="proj-1" paperId="paper-1" readOnly={false} onClose={vi.fn()} /></MemoryRouter></QueryClientProvider>));
    await settle(); await settle();
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.find(t => t.textContent === "Trao đổi")?.getAttribute('aria-selected')).toBe('true');
    const editor = document.querySelector<HTMLTextAreaElement>('[aria-label="Tin nhắn trao đổi về bài báo"]')!;
    expect(editor.closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(false);
  });

  it("loads discussion only when selected and stops polling while its tab is hidden", async () => {
    await renderRound(mockRound);
    expect(mocks.history).not.toHaveBeenCalled();
    await act(async () => button("Trao đổi")!.click()); await settle();
    expect(mocks.history).toHaveBeenCalledWith("proj-1", "round-1", 1, "DISCUSSION");
    const key = ["project-research", "user-1", "proj-1", "screening-discussion", "round-1", false];
    const query = client.getQueryCache().find({ queryKey: key })!;
    expect(query.isActive()).toBe(true);
    await act(async () => button("Hai phiếu đánh giá")!.click());
    expect(query.isActive()).toBe(false);
  });

});
