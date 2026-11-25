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
  proposeAgreement: vi.fn().mockResolvedValue({}),
  confirmAgreement: vi.fn().mockResolvedValue({}), declineAgreement: vi.fn().mockResolvedValue({}),
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

  const pendingClosure = { id: "proposal-1", decision: "CLOSED_UNRESOLVED" as const, reason: "Khác cách diễn giải tiêu chí dù đã đối chiếu nguồn", proposedById: "user-2", reviewIds: ["r1", "r2"], confirmedByIds: ["user-2"], requiredReviewerIds: ["user-1", "user-2"], canConfirm: true, canDecline: true, createdAt: new Date().toISOString() };
  it("sends a reasoned closure proposal without finalizing or asking for a third reviewer", async () => {
    await renderRound(mockRound);
    await act(async () => button("Đề nghị kết thúc do không đạt đồng thuận")!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    await inputText(dialog.querySelector('textarea')!, "Chưa thống nhất được phạm vi sau khi đối chiếu nguồn");
    await act(async () => dialog.querySelector('form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await settle();
    expect(mocks.proposeAgreement).toHaveBeenCalledWith("proj-1", "round-1", expect.objectContaining({ decision: "CLOSED_UNRESOLVED", expectedVersion: mockRound.version, reason: "Chưa thống nhất được phạm vi sau khi đối chiếu nguồn" }));
    expect(mocks.confirmAgreement).not.toHaveBeenCalled();
  });
  it.each([true, false])("recipient can respond to a pending closure (accept=%s)", async accept => {
    await renderRound({ ...mockRound, agreement: pendingClosure });
    expect(container.textContent).toContain("Chờ xác nhận kết thúc");
    await act(async () => button(accept ? "Đồng ý kết thúc" : "Tiếp tục thảo luận")!.click()); await settle();
    expect(accept ? mocks.confirmAgreement : mocks.declineAgreement).toHaveBeenCalledWith("proj-1", "round-1", expect.objectContaining({ proposalId: "proposal-1", expectedVersion: mockRound.version }));
  });
  it("sender cannot confirm their own closure proposal in the UI", async () => {
    await renderRound({ ...mockRound, agreement: { ...pendingClosure, proposedById: "user-1", canConfirm: false, canDecline: false } });
    expect(button("Đồng ý kết thúc")).toBeUndefined(); expect(button("Tiếp tục thảo luận")).toBeUndefined();
    expect(button("Cập nhật đánh giá")).toBeDefined();
  });
  it("retains the closure reason in the dialog after an API error", async () => {
    mocks.proposeAgreement.mockRejectedValueOnce(new Error("Offline")); await renderRound(mockRound);
    await act(async () => button("Đề nghị kết thúc do không đạt đồng thuận")!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    await inputText(dialog.querySelector('textarea')!, "Lý do đang soạn vẫn cần giữ nguyên");
    await act(async () => dialog.querySelector('form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); await settle();
    expect(dialog.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe("Lý do đang soạn vẫn cần giữ nguyên");
    expect(dialog.querySelector('[role="alert"]')).not.toBeNull();
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
  it("keeps discussion and evaluation available after the deadline", async () => {
    await renderRound({ ...mockRound, consensus: { ...mockRound.consensus!, deadline: new Date(Date.now() - 1000).toISOString() } });
    expect(button("Cập nhật đánh giá")).toBeDefined(); expect(container.textContent).toContain("Quá hạn");
    expect(button("Gửi bình luận")).toBeDefined();
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
  it("separates ballots and discussion into accessible tabs with shared actions", async () => {
    await renderRound({ ...mockRound, reviews: mockRound.reviews.map(r => ({ ...r, exclusionReason: "", comment: "Cần đối chiếu đối tượng nghiên cứu.", fullTextReference: undefined })) });
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map(t => t.textContent)).toEqual(["Trao đổi", "Hai phiếu đánh giá"]);
    const panel = (tab: HTMLElement) => document.getElementById(tab.getAttribute('aria-controls')!)!;
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(panel(tabs[0]!).hidden).toBe(false);
    expect(panel(tabs[1]!).hidden).toBe(true);
    expect(panel(tabs[1]!).querySelectorAll('article')).toHaveLength(2);
    expect(container.querySelector('.screening-review-detail-link')).toBeNull();
    expect(panel(tabs[1]!).textContent).toContain('Cần đối chiếu đối tượng nghiên cứu.');
    expect(button('Xem căn cứ')).toBeUndefined();
    await act(async () => tabs[0]!.click());
    expect(panel(tabs[1]!).hidden).toBe(true);
    expect(panel(tabs[0]!).hidden).toBe(false);
    expect(button('Cập nhật đánh giá')!.closest('[role="tabpanel"]')).toBe(panel(tabs[1]!));
    expect(button('Nhờ người phân xử')).toBeUndefined();
    expect(container.querySelector('.screening-conflict-container')?.getAttribute('data-focus-chat')).toBe('true');
    await act(async () => tabs[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    expect(document.activeElement).toBe(tabs[0]);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    await act(async () => tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]!.tabIndex).toBe(-1);
  });

  it("keeps long reasons bounded and available as safe text in an expandable disclosure", async () => {
    const long = '<img src=x onerror=alert(1)> ' + 'Đối chiếu thông tin trong bài báo. '.repeat(500);
    await renderRound({ ...mockRound, reviews: [{ ...mockRound.reviews[0]!, comment: long }] });
    const preview = container.querySelector('article p.line-clamp-3')!;
    expect(preview.textContent).toBe(long);
    expect(preview.querySelector('img')).toBeNull();
    const disclosure = container.querySelector('article details')!;
    expect(disclosure.querySelector('summary')?.textContent).toBe('Xem đầy đủ căn cứ');
    await act(async () => disclosure.setAttribute('open', ''));
    expect(disclosure.textContent).toContain(long);
    expect(disclosure.querySelector('img')).toBeNull();
    await renderRound({ ...mockRound, hiddenReviews: true, reviews: [] });
    expect(container.querySelector('article')).toBeNull();
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

  it("loads discussion by default and stops polling while its tab is hidden", async () => {
    await renderRound(mockRound);
    await settle();
    expect(mocks.history).toHaveBeenCalledWith("proj-1", "round-1", 1, "DISCUSSION");
    const key = ["project-research", "user-1", "proj-1", "screening-discussion", "round-1", false];
    const query = client.getQueryCache().find({ queryKey: key })!;
    expect(query.isActive()).toBe(true);
    await act(async () => button("Hai phiếu đánh giá")!.click());
    expect(query.isActive()).toBe(false);
    await act(async () => button("Trao đổi")!.click());
    expect(query.isActive()).toBe(true);
  });

  describe("TEAM_SCREENING Workflow", () => {
    const teamRound: ScreeningRoundView = {
      ...mockRound,
      consensus: null,
      canProposeAgreement: true,
      settings: {
        ...mockRound.settings,
        workflowKind: "TEAM_SCREENING",
        resolutionPolicy: "CONSENSUS",
      },
    };

    it("places Two Initial Ballots inside 'Kết luận chung' tab and removes duplicate individual reassessment UI", async () => {
      await renderRound(teamRound);

      // Section for original ballots is inside agreement tabpanel (hidden when discussion tab is active so chat has room)
      const ballotsSection = container.querySelector('[aria-label="Hai phiếu đánh giá ban đầu"]');
      expect(ballotsSection).not.toBeNull();
      expect(container.textContent).toContain("Phiếu ban đầu được lưu bất biến");
      expect(container.querySelectorAll(".screening-review-row")).toHaveLength(2);
      const discussionTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(t => t.textContent?.includes("Trao đổi & làm rõ"))!;
      const agreementTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(t => t.textContent?.includes("Kết luận chung"))!;
      const agreementPanel = document.getElementById(agreementTab.getAttribute("aria-controls")!)!;
      expect(discussionTab.getAttribute("aria-selected")).toBe("true");
      expect(agreementPanel.hidden).toBe(true);
      expect(agreementPanel.contains(ballotsSection)).toBe(true);

      // Duplicate individual reassessment UI must NOT exist in TEAM_SCREENING
      expect(container.querySelector(".screening-inline-reassess-card")).toBeNull();
      expect(container.textContent).not.toContain("Mọi phiên bản được lưu. Hệ thống chốt khi hai đánh giá hiện hành trùng nhau.");
      expect(button("Cập nhật phiếu của tôi")).toBeUndefined();
      expect(button("Đổi kết luận của tôi")).toBeUndefined();
      expect(button("Nhờ người phân xử")).toBeUndefined();

      // Render 2 canonical tabs
      const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      expect(tabs.map(t => t.textContent?.trim())).toEqual(["Trao đổi & làm rõ", "Kết luận chung"]);
    });

    it("switches to 'Kết luận chung' tab and shows Phù hợp/Loại bỏ without 'Đề xuất quyết định chung' or 'Gửi yêu cầu bổ sung thông tin' and requires a reason", async () => {
      await renderRound({
        ...teamRound,
        myReview: { ...teamRound.myReview!, decision: "UNSURE" },
      });

      const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      const agreementTab = tabs.find(t => t.textContent?.includes("Kết luận chung"))!;
      expect(agreementTab).toBeDefined();

      await act(async () => agreementTab.click());
      await settle();

      const agreementPanel = document.getElementById(agreementTab.getAttribute("aria-controls")!)!;
      expect(agreementPanel.hidden).toBe(false);
      expect(agreementPanel.querySelector('[aria-label="Hai phiếu đánh giá ban đầu"]')).not.toBeNull();
      expect(agreementPanel.textContent).toContain("Quyết định chung sau thảo luận");
      expect(agreementPanel.textContent).toContain("Chọn kết luận chung cuối cùng:");
      expect(agreementPanel.textContent).toContain("Phù hợp");
      expect(agreementPanel.textContent).toContain("Loại bỏ");
      expect(agreementPanel.textContent).not.toContain("Đề xuất quyết định chung");
      expect(agreementPanel.textContent).not.toContain("Khi tóm tắt chưa đủ căn cứ để kết luận");
      expect(agreementPanel.textContent).not.toContain("Gửi yêu cầu bổ sung thông tin");
      expect(agreementPanel.textContent).not.toContain("Tôi đồng ý với kết luận và lý do đề xuất này.");
      expect(agreementPanel.textContent).not.toContain("Nguồn tài liệu đã xem xét");

      const reasonBox = agreementPanel.querySelector<HTMLTextAreaElement>("form textarea")!;
      expect(reasonBox).not.toBeNull();
      const send = [...agreementPanel.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Gửi đề xuất cho reviewer xác nhận")!;
      expect(send.disabled).toBe(true);

      await inputText(reasonBox, "Hai reviewer đã đối chiếu tiêu chí và thống nhất bài báo phù hợp.");
      expect(send.disabled).toBe(false);
      await act(async () => send.click()); await settle();
      expect(mocks.proposeAgreement).toHaveBeenCalledWith("proj-1", "round-1", expect.objectContaining({
        decision: "INCLUDED",
        expectedVersion: 1,
        confirmed: true,
        reason: "Hai reviewer đã đối chiếu tiêu chí và thống nhất bài báo phù hợp.",
        sourceMaterial: expect.stringContaining("rev-1"),
      }));
      expect(mocks.reassess).not.toHaveBeenCalled();
    });

    it("keeps both 'Phù hợp' and 'Loại bỏ' visible when reviewer voted 'INCLUDE' and requires reason + exclusion criterion when choosing 'Loại bỏ'", async () => {
      await renderRound({ ...teamRound, settings: { ...teamRound.settings, exclusionCriteria: ["Wrong population"] } });
      const agreementTab = button("Kết luận chung")!;
      await act(async () => agreementTab.click());
      await settle();

      const panel = document.getElementById(agreementTab.getAttribute("aria-controls")!)!;
      const jointForm = panel.querySelector("form")!;
      expect(jointForm.querySelector('input[value="INCLUDED"]')).not.toBeNull();
      expect(jointForm.querySelector('input[value="EXCLUDED"]')).not.toBeNull();
      expect(jointForm.textContent).toContain("Bài báo phù hợp và đáp ứng các tiêu chí đưa vào của đề tài.");
      expect(jointForm.textContent).toContain("Loại bỏ");
      expect(jointForm.textContent).toContain("Bài báo không đáp ứng tiêu chí. Bắt buộc chọn tiêu chí loại.");

      const exclude = jointForm.querySelector<HTMLInputElement>('input[value="EXCLUDED"]')!;
      await act(async () => exclude.click());
      await settle();

      const send = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Gửi đề xuất cho reviewer xác nhận")!;
      expect(send.disabled).toBe(true);
      const select = panel.querySelector("select")!;
      await act(async () => { select.value = "Wrong population"; select.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(send.disabled).toBe(true);

      const reasonBox = jointForm.querySelector<HTMLTextAreaElement>("textarea")!;
      await inputText(reasonBox, "Đã kiểm tra mẫu nghiên cứu không thuộc đối tượng mục tiêu.");
      expect(send.disabled).toBe(false);
      await act(async () => send.click()); await settle();
      expect(mocks.proposeAgreement).toHaveBeenCalledWith("proj-1", "round-1", expect.objectContaining({
        decision: "EXCLUDED",
        exclusionReason: "Wrong population",
        reason: "Đã kiểm tra mẫu nghiên cứu không thuộc đối tượng mục tiêu.",
      }));
    });

    it("keeps the chat separate and requires a real exclusion criterion and reason before proposing exclusion", async () => {
      await renderRound({...teamRound, settings:{...teamRound.settings, exclusionCriteria:["Wrong population"]}});
      const agreementTab = button("Kết luận chung")!;
      const discussionTab = button("Trao đổi & làm rõ")!;
      const discussionPanel = document.getElementById(discussionTab.getAttribute("aria-controls")!)!;
      expect(discussionPanel.querySelector('[aria-label="Hai phiếu đánh giá ban đầu"]')).toBeNull();
      expect(discussionPanel.querySelector('[aria-label="Quyết định chung sau thảo luận"]')).toBeNull();
      await act(async()=>agreementTab.click()); await settle();
      const panel=document.getElementById(agreementTab.getAttribute("aria-controls")!)!;
      const exclude=panel.querySelector<HTMLInputElement>('input[value="EXCLUDED"]')!;
      await act(async()=>exclude.click()); await settle();
      const send=[...panel.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Gửi đề xuất cho reviewer xác nhận')!;
      expect(send.disabled).toBe(true);
      const select=panel.querySelector('select')!;
      await act(async()=>{select.value='Wrong population';select.dispatchEvent(new Event('change',{bubbles:true}));});
      expect(send.disabled).toBe(true);
      await inputText(panel.querySelector<HTMLTextAreaElement>('form textarea')!, 'Đối tượng nghiên cứu không phù hợp với tiêu chí đề tài.');
      expect(send.disabled).toBe(false);
      await act(async()=>send.click()); await settle();
      expect(mocks.proposeAgreement).toHaveBeenCalledWith('proj-1','round-1',expect.objectContaining({decision:'EXCLUDED',exclusionReason:'Wrong population'}));
      expect(teamRound.myReview?.decision).toBe('INCLUDE');
    });

    it("requires only a single rationale input when choosing 'Loại bỏ' without saved exclusion criteria", async () => {
      await renderRound({ ...teamRound, settings: { ...teamRound.settings, exclusionCriteria: [] } });
      const agreementTab = button("Kết luận chung")!;
      await act(async () => agreementTab.click());
      await settle();

      const panel = document.getElementById(agreementTab.getAttribute("aria-controls")!)!;
      const exclude = panel.querySelector<HTMLInputElement>('input[value="EXCLUDED"]')!;
      await act(async () => exclude.click());
      await settle();

      expect(panel.querySelector('input[placeholder="Nhập tiêu chí loại phù hợp..."]')).toBeNull();
      expect(panel.querySelector("select")).toBeNull();
      expect(panel.textContent).toContain("Lý do chung và căn cứ đánh giá");

      const send = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Gửi đề xuất cho reviewer xác nhận")!;
      expect(send.disabled).toBe(true);

      await inputText(panel.querySelector<HTMLTextAreaElement>("form textarea")!, "Bài báo không nằm trong phạm vi dữ liệu công nghiệp mục tiêu.");
      expect(send.disabled).toBe(false);
      await act(async () => send.click());
      await settle();

      expect(mocks.proposeAgreement).toHaveBeenCalledWith("proj-1", "round-1", expect.objectContaining({
        decision: "EXCLUDED",
        exclusionReason: undefined,
        reason: "Bài báo không nằm trong phạm vi dữ liệu công nghiệp mục tiêu.",
      }));
    });

    it("places countdown pill above status badge in heading and removes redundant clarification banner and AI Paper Insight in TEAM_SCREENING", async () => {
      const proposalRound: ScreeningRoundView = {
        ...teamRound,
        status: "NEEDS_MORE_INFO",
        classification: "NEEDS_CLARIFICATION",
        canManage: false,
        discussionTiming: {
          discussionStartedAt: new Date().toISOString(),
          initialDeadlineAt: new Date(Date.now() + 86400000).toISOString(),
          effectiveDeadlineAt: new Date(Date.now() + 86400000).toISOString(),
          hardDeadlineAt: new Date(Date.now() + 172800000).toISOString(),
          extensionCount: 0,
          maxExtensions: 1,
          isOverdue: false,
          canExtend: true,
        },
      };
      mocks.detail.mockResolvedValue(proposalRound);
      mocks.rounds.mockResolvedValue({ items: [proposalRound], total: 1, page: 1, hasNext: false });
      mocks.board.mockResolvedValue({
        items: [{ paperId: "paper-1", title: "Clarification paper", authors: [], proposalReason: "", proposedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), canEditProposal: false, round: proposalRound }],
        settings: proposalRound.settings,
        people,
      });

      await act(async () => root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <ReadingPaperModal projectId="proj-1" paperId="paper-1" readOnly={false} onClose={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>
      ));
      await settle(); await settle();

      expect(document.body.textContent).not.toContain("Hai reviewer đối chiếu tiêu chí và thông tin còn thiếu. Khi đủ căn cứ, cùng xác nhận một kết luận cuối.");
      expect(document.body.textContent).not.toContain("AI Paper Insight");
      const statusStack = document.body.querySelector(".screening-resolution-round-status")!;
      expect(statusStack).not.toBeNull();
      const countdownPill = statusStack.querySelector(".screening-consensus-countdown-pill")!;
      const statusBadge = statusStack.querySelector(".screening-state")!;
      expect(countdownPill).not.toBeNull();
      expect(countdownPill.textContent).toContain("Còn ");
      expect(countdownPill.textContent).not.toContain("Cần làm rõ");
      expect(statusBadge.textContent).toBe("Cần làm rõ");
      expect(countdownPill.compareDocumentPosition(statusBadge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("displays 'Chờ xác nhận' badge in tab when pending agreement proposal exists", async () => {
      const proposalRound: ScreeningRoundView = {
        ...teamRound,
        discussionTiming: {
          discussionStartedAt: new Date().toISOString(),
          initialDeadlineAt: new Date(Date.now() + 86400000).toISOString(),
          effectiveDeadlineAt: new Date(Date.now() + 86400000).toISOString(),
          hardDeadlineAt: new Date(Date.now() + 172800000).toISOString(),
          extensionCount: 0,
          maxExtensions: 1,
          isOverdue: false,
          canExtend: true,
        },
        agreement: {
          id: "proposal-1",
          decision: "INCLUDED",
          reason: "Cả hai reviewer cùng thống nhất rằng bài báo có thực nghiệm phù hợp với RQ1.",
          proposedById: "user-2",
          reviewIds: ["rev-1", "rev-2"],
          confirmedByIds: ["user-2"],
          requiredReviewerIds: ["user-1", "user-2"],
          canConfirm: true,
          canDecline: true,
          createdAt: new Date().toISOString(),
        },
      };

      await renderRound(proposalRound);

      // Agreement tab shows 'Chờ xác nhận'
      const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      const agreementTab = tabs.find(t => t.textContent?.includes("Kết luận chung"))!;
      expect(agreementTab.textContent).toContain("Chờ xác nhận");
    });
  });
});
