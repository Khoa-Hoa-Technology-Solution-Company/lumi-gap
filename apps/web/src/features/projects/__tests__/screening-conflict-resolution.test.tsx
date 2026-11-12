// @vitest-environment jsdom
import { act } from "react";
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
    mocks.action.mockResolvedValue({}); mocks.ai.mockResolvedValue(null);
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
    status: "CONSENSUS_REQUIRED",
    consensus: { startedAt: new Date().toISOString(), deadline: new Date(Date.now() + 48 * 3600000).toISOString(), status: "CONSENSUS_REQUIRED", canConfirm: false, canUpdate: true, confirmations: [] },
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
    canRequestAdjudication: false,
    classification: "CONFLICT",
    finalDecision: null,
  };

  const people: WorkspacePerson[] = [
    { id: "user-1", name: "Thanh Đình" },
    { id: "user-2", name: "Nguyễn Đình Thanh" },
    { id: "user-3", name: "TS. Phạm Bảo Ngọc" },
  ];

  async function renderRound(round: ScreeningRoundView, readOnly = false, onBack?: () => void, initialEntry = "/") {
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]}><ScreeningConflictResolution projectId="proj-1" round={round} people={people} readOnly={readOnly} onBack={onBack} /></MemoryRouter></QueryClientProvider>));
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

  it("shows current reviewer decisions, justification, revision time and the existing discussion", async () => {
    await renderRound(mockRound);
    expect(container.textContent).toContain("Hai Reviewer chưa thống nhất");
    expect(container.textContent).toContain("Reviewer 1 · Thanh Đình (Bạn)"); expect(container.textContent).toContain("Reviewer 2 · Nguyễn Đình Thanh");
    expect(container.querySelectorAll("article")).toHaveLength(2);
    expect(container.textContent).toContain("Nghiên cứu có mô hình deep learning phù hợp");
    expect(container.querySelector<HTMLTimeElement>('article time')?.dateTime).toBe(mockRound.reviews[0]!.submittedAt);
    expect(mocks.history).toHaveBeenCalledWith("proj-1", "round-1", 1, "DISCUSSION");
    expect(container.textContent).not.toContain("Nhờ người phân xử"); expect(button("Xác nhận đánh giá cuối cùng")).toBeUndefined();
    expect(button("Gửi bình luận")).toBeDefined();
  });
  it("opens discussion first and keeps the shared deadline outside both tab panels", async () => {
    await renderRound(mockRound);
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map(tab => tab.textContent)).toEqual(["Trao đổi", "Hai phiếu đánh giá"]);
    for (const tab of tabs) {
      const panel = document.getElementById(tab.getAttribute("aria-controls")!)!;
      expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
      expect(panel.hidden).toBe(tab.getAttribute("aria-selected") !== "true");
    }
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('time[aria-label="Thời gian thảo luận còn lại"]')!.closest('[role="tabpanel"]')).toBeNull();
  });
  it("preserves both drafts when switching between discussion and evaluation", async () => {
    await renderRound(mockRound);
    const composer = container.querySelector<HTMLTextAreaElement>('.screening-discussion textarea')!;
    await inputText(composer, "Trao đổi đang soạn");
    await act(async () => button("Hai phiếu đánh giá")!.click());
    const reason = container.querySelector<HTMLTextAreaElement>('form[aria-label="Cập nhật đánh giá của tôi"] textarea')!;
    await inputText(reason, "Lý do cập nhật đang soạn");
    await act(async () => container.querySelector<HTMLInputElement>('input[value="EXCLUDE"]')!.click());
    await act(async () => button("Trao đổi")!.click());
    expect(composer.value).toBe("Trao đổi đang soạn");
    expect(reason.closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(true);
    await act(async () => button("Hai phiếu đánh giá")!.click());
    expect(reason.value).toBe("Lý do cập nhật đang soạn");
    expect(container.querySelector<HTMLInputElement>('input[value="EXCLUDE"]')!.checked).toBe(true);
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it("supports arrow, Home and End keys with one tab stop and the matching visible panel", async () => {
    await renderRound(mockRound);
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const press = async (index: number, key: string) => {
      await act(async () => tabs[index]!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
    };
    await press(0, "ArrowRight");
    expect(document.activeElement).toBe(tabs[1]); expect(tabs[1]!.tabIndex).toBe(0); expect(tabs[0]!.tabIndex).toBe(-1);
    expect(document.getElementById(tabs[1]!.getAttribute("aria-controls")!)!.hidden).toBe(false);
    await press(1, "Home"); expect(document.activeElement).toBe(tabs[0]);
    await press(0, "End"); expect(document.activeElement).toBe(tabs[1]);
    await press(1, "ArrowLeft"); expect(document.activeElement).toBe(tabs[0]);
  });
  it("opens a review action in the evaluation tab without loading the hidden discussion", async () => {
    await renderRound(mockRound, false, undefined, "/projects/proj-1?section=review");
    expect(button("Hai phiếu đánh giá")!.getAttribute("aria-selected")).toBe("true");
    expect(mocks.history).not.toHaveBeenCalled();
    await act(async () => button("Trao đổi")!.click()); await settle();
    expect(mocks.history).toHaveBeenCalledWith("proj-1", "round-1", 1, "DISCUSSION");
  });
  it("keeps the original reviewer identity when the session has a migrated public ID", async () => {
    mocks.actorId = "legacy-public-id"; await renderRound(mockRound);
    expect(container.textContent).toContain("Thanh Đình (Bạn)"); expect(container.textContent).not.toContain("Nguyễn Đình Thanh (Bạn)");
  });
  it("offers only binary choices with the personal current decision selected", async () => {
    await renderRound(mockRound);
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    expect(container.querySelector<HTMLInputElement>('input[value="INCLUDE"]')?.checked).toBe(true);
    expect(container.querySelector('input[value="UNSURE"]')).toBeNull();
    expect(container.querySelector('time[aria-label="Thời gian thảo luận còn lại"]')).not.toBeNull();
  });
  it("updates the own ballot through reassess without a separate confirmation or peer identifier", async () => {
    await renderRound(mockRound);
    await act(async () => container.querySelector<HTMLInputElement>('input[value="EXCLUDE"]')!.click());
    await inputText(container.querySelector<HTMLTextAreaElement>('form[aria-label="Cập nhật đánh giá của tôi"] textarea')!, "Căn cứ mới sau khi trao đổi");
    expect(mocks.action).not.toHaveBeenCalled();
    await act(async () => container.querySelector('form[aria-label="Cập nhật đánh giá của tôi"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await settle();
    expect(mocks.action).toHaveBeenCalledWith("proj-1", "round-1", "reassess", expect.objectContaining({ decision: "EXCLUDE", reason: "Căn cứ mới sau khi trao đổi", expectedRevision: 1, clientKey: expect.any(String) }));
    expect(mocks.action.mock.calls[0]![3]).not.toHaveProperty("reviewerId");
    expect(mocks.action.mock.calls[0]![3]).not.toHaveProperty("confirmed");
  });
  it("requires a written justification before updating", async () => {
    await renderRound(mockRound);
    expect(button("Cập nhật đánh giá")!.disabled).toBe(true);
    await inputText(container.querySelector<HTMLTextAreaElement>('form[aria-label="Cập nhật đánh giá của tôi"] textarea')!, "abcd");
    expect(button("Cập nhật đánh giá")!.disabled).toBe(true);
  });
  it("does not lock editing because a historical separate confirmation exists", async () => {
    await renderRound({ ...mockRound, consensus: { ...mockRound.consensus!, canUpdate: true, confirmations: [{ reviewerId: "user-1", decision: "INCLUDE", reason: "Historical confirmation", confirmedAt: new Date().toISOString() }] } });
    expect(container.querySelector('input[type="radio"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Quyết định đã khóa");
  });
  it.each([true, false])("prevents updating without backend permission (readOnly=%s)", async readOnly => {
    await renderRound({ ...mockRound, consensus: { ...mockRound.consensus!, canUpdate: false } }, readOnly);
    expect(container.querySelector('input[type="radio"]')).toBeNull(); expect(button("Cập nhật đánh giá")).toBeUndefined();
  });
  it("blocks further evaluation changes at the deadline", async () => {
    await renderRound({ ...mockRound, consensus: { ...mockRound.consensus!, deadline: new Date(Date.now() - 1000).toISOString() } });
    expect(button("Cập nhật đánh giá")).toBeUndefined(); expect(container.textContent).toContain("Đã hết hạn");
    expect(button("Gửi bình luận")).toBeUndefined();
  });
  it("preserves a draft and shows errors when an update fails", async () => {
    mocks.action.mockRejectedValue(new Error("Offline")); await renderRound(mockRound);
    const selector = 'form[aria-label="Cập nhật đánh giá của tôi"]';
    await inputText(container.querySelector<HTMLTextAreaElement>(selector + ' textarea')!, "Lý do đang soạn không bị mất");
    await act(async () => container.querySelector(selector)!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await settle(); expect(container.querySelector<HTMLTextAreaElement>(selector + ' textarea')!.value).toBe("Lý do đang soạn không bị mất");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
  it("refreshes the peer card without discarding a locally composed reason", async () => {
    await renderRound(mockRound);
    const selector = 'form[aria-label="Cập nhật đánh giá của tôi"] textarea';
    await inputText(container.querySelector<HTMLTextAreaElement>(selector)!, "Căn cứ đang soạn");
    await renderRound({ ...mockRound, reviews: mockRound.reviews.map((r, i) => i ? { ...r, revision: 2, comment: "Căn cứ mới của reviewer còn lại" } : r) });
    expect(container.textContent).toContain("Căn cứ mới của reviewer còn lại"); expect(container.querySelector<HTMLTextAreaElement>(selector)!.value).toBe("Căn cứ đang soạn");
  });
  it("prevents stale own versions from being submitted while retaining the draft", async () => {
    await renderRound(mockRound);
    await inputText(container.querySelector<HTMLTextAreaElement>('form[aria-label="Cập nhật đánh giá của tôi"] textarea')!, "Căn cứ đang soạn");
    await renderRound({ ...mockRound, myReview: { ...mockRound.myReview!, revision: 2 } });
    expect(button("Cập nhật đánh giá")!.disabled).toBe(true); expect(container.textContent).toContain("Phiếu của bạn đã đổi ở nơi khác");
  });
  it("shows prior revisions separately instead of using an old confirmation as the current evaluation", async () => {
    const old = mockRound.reviews[0]!;
    await renderRound({ ...mockRound, reviews: [{ ...old, revision: 2, decision: "EXCLUDE", comment: "Kết luận mới của tôi" }, mockRound.reviews[1]!], reviewHistory: [{ ...old, reviewerName: "Thanh Đình", phaseMarker: "INDEPENDENT_INITIAL" }] });
    expect(container.textContent).toContain("Kết luận mới của tôi"); expect(container.textContent).toContain("Lịch sử đánh giá (1)");
  });
  it("renders existing AI evidence and long review reasons as safe wrapping text", async () => {
    mocks.ai.mockResolvedValue({ result: { explanation: "Đề xuất tham khảo đã có", evidence: [{ quote: "Exact abstract excerpt" }] } });
    const reason = "<script>unsafe()</script>" + "lý do ".repeat(500);
    await renderRound({ ...mockRound, aiVisible: true, reviews: [{ ...mockRound.reviews[0]!, comment: reason }, mockRound.reviews[1]!] });
    expect(container.querySelector('script')).toBeNull(); expect(container.textContent).toContain(reason);
    expect(container.textContent).toContain("Gợi ý AI đã có (chỉ tham khảo)");
    expect(container.textContent).toContain("Xem đầy đủ căn cứ");
  });
  it("returns through the real close action without introducing an approval override", async () => {
    const back = vi.fn(); await renderRound(mockRound, false, back);
    await act(async () => button("Quay lại")!.click()); await settle();
    expect(back).toHaveBeenCalledOnce(); expect(container.textContent).not.toContain("Tạo yêu cầu phân xử");
  });
  it("opens direct discussion from the actual paper detail route", async () => {
    mocks.detail.mockResolvedValue(mockRound);
    mocks.rounds.mockResolvedValue({ items: [mockRound], total: 1, page: 1, pageSize: 10, hasNext: false, legacy: null });
    mocks.board.mockResolvedValue({ items: [{ paperId: "paper-1", title: "Study for review", abstractText: "Source abstract", round: mockRound }], settings: mockRound.settings, people });
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/projects/proj-1?tab=papers&round=round-1&paper=paper-1&section=discussion"]}><ReadingPaperModal projectId="proj-1" paperId="paper-1" readOnly={false} onClose={vi.fn()} /></MemoryRouter></QueryClientProvider>));
    await settle(); await settle(); expect(document.body.textContent).toContain("Hai Reviewer chưa thống nhất");
    expect(button("Quay lại")).toBeDefined(); expect(button("Cập nhật đánh giá")).toBeDefined();
  });
});
