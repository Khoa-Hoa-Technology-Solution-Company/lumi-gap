// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CollaborativeLibrary } from "../components/collaborative-library";
import { ScreeningWorkspace } from "../components/screening-workspace";
import { ResearchLiterature } from "../components/research-literature";
import { ScreeningSettingsForm } from "../components/screening-management";
import type { ScreeningBoard, ScreeningRoundView } from "@trend/shared-types";
const mocks = vi.hoisted(() => ({ begin: vi.fn(), advanceConservatively: vi.fn(), requestAdjudication: vi.fn(), board: vi.fn(), rounds: vi.fn(), detail: vi.fn(), history: vi.fn(), ai: vi.fn(), action: vi.fn(), start: vi.fn(), assign: vi.fn(), configure: vi.fn(), analytics: vi.fn(), requestAi: vi.fn(), proposal: vi.fn(), confirm: vi.fn(), workspaceSummary: vi.fn(), claim: vi.fn(), release: vi.fn(), extend: vi.fn(), claimNext: vi.fn(), updateDiscoveryGoal: vi.fn() }));
vi.mock("../api/screening.api", () => ({ screeningApi: mocks }));
vi.mock("@/services/confirmation", () => ({ confirmUnsavedChanges: mocks.confirm }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "actor" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "vi", t: (key: string) => key }) }));
const settings = { reviewMode: "INDEPENDENT" as const, blindReview: true, resolutionPolicy: "ADJUDICATION" as const, version: 1, requiredReviewers: 2, consensusPolicy: "UNANIMOUS" as const, aiAssisted: false, inclusionCriteria: ["Sinh viên đại học"], exclusionCriteria: [], researchQuestions: ["Câu hỏi nghiên cứu"] };
const round: ScreeningRoundView = { finalizer: { id: "owner", name: "Chủ dự án" }, canFinalize: false, id: "round", paperId: "paper", number: 1, phase: "TITLE_ABSTRACT", version: 2, status: "IN_REVIEW", active: true, settings, unblindedAt: null, independenceCompromised: false, assigned: 2, completed: 1, assignments: [{ id: "mine", reviewerId: "actor", name: "Tôi", revision: 1, completed: false, active: true, dueAt: null, overdue: false }, { id: "peer", reviewerId: "peer", name: "Thành viên B", revision: 1, completed: true, active: true, dueAt: null, overdue: false }], myAssignmentId: "mine", reviews: [], myReview: null, hiddenReviews: true, finalDecision: null, canReview: true, canManage: false, aiVisible: false };
const board: ScreeningBoard = { filters: { proposers: [{ id: "peer", name: "Thành viên B" }], reviewers: [{ id: "actor", name: "Tôi" }, { id: "peer", name: "Thành viên B" }] }, progress: { total: 1, reviewed: 1, finalized: 0, legacy: 0 }, items: [{ proposer: { id: "peer", name: "Thành viên B" }, proposedAt: "2026-10-29T00:00:00.000Z", proposalReason: "Nguồn phương pháp nghiên cứu", updatedAt: "2026-10-29T00:00:00.000Z", canEditProposal: false, paperId: "paper", title: "Nghiên cứu <script>unsafe()</script>", abstractText: "Tóm tắt nguyên gốc", doi: "10.1/example", publicationYear: 2025, legacyStatus: "MAYBE", legacyProvenance: false, round }], page: 1, pageSize: 20, total: 1, hasNext: false, settings, people: [{ id: "actor", name: "Tôi" }, { id: "peer", name: "Thành viên B" }], canManage: false, myProgress: { assigned: 1, completed: 0, pending: 1, overdue: 0 } };
let root: Root, container: HTMLDivElement, client: QueryClient;
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
async function render(node: ReactNode, path = "/projects/p?tab=papers&source=paper") { await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>)); await settle(); }
async function click(label: string) { const element = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label); expect(element, label).toBeDefined(); await act(async () => element!.click()); await settle(); }
async function fill(label: string, text: string) { const input = [...document.querySelectorAll("label")].find(l => l.textContent?.startsWith(label))?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input,textarea"); expect(input, label).toBeDefined(); await act(async () => { const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, text); input!.dispatchEvent(new Event("input", { bubbles: true })); }); await settle(); }
beforeEach(() => {
  sessionStorage.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks(); Object.values(mocks).forEach(m => m.mockResolvedValue(undefined)); mocks.confirm.mockResolvedValue(true); mocks.board.mockResolvedValue(board); mocks.detail.mockResolvedValue(round); mocks.rounds.mockResolvedValue({ items: [round], total: 1, page: 1, pageSize: 10, hasNext: false, legacy: null }); mocks.history.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, hasNext: false }); mocks.ai.mockResolvedValue(null); mocks.workspaceSummary.mockResolvedValue({ myActiveClaims: [], pendingConsensus: [], pendingAdjudications: [], myProposalsCount: 1, recentProposals: [], eligibleQueueCount: 0, nextEligiblePaperId: null, discoveryGoal: { enabled: false, target: 2, period: "WEEK", paused: false, currentCount: 0, remaining: 2 }, capacityAdvice: { queueStatus: "NORMAL", message: "Tiến độ sàng lọc đều đặn" } });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("opens the task-first workspace by default and keeps organization accessible", async () => {
  await render(<ResearchLiterature projectId="p" readOnly={false}><p>Thư viện cũ</p></ResearchLiterature>);
  expect(document.body.textContent).toContain("Việc của tôi"); expect(document.body.textContent).not.toContain("Thư viện cũ");
  await click("Notes & Sources"); expect(document.body.textContent).toContain("Thư viện cũ");
});
it("shows safe completion and permissions, hides AI requests and renders paper text safely", async () => {
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  expect(document.body.textContent).toContain("1/2 phiếu đã gửi"); expect(document.body.textContent).toContain("Phiếu và nhận xét của người khác đang được ẩn"); expect(document.querySelector("script")).toBeNull();
  expect(mocks.ai).not.toHaveBeenCalled(); expect(document.body.textContent).not.toContain("Quản lý và xử lý bất đồng"); expect(document.body.textContent).not.toContain("Bắt đầu vòng cho bài đã chọn");
});
it("distinguishes the four-person team from the two assigned reviewers and identifies my assignment", async () => {
  mocks.board.mockResolvedValue({ ...board, people: [...board.people, { id: "owner", name: "Chủ dự án" }, { id: "fourth", name: "Thành viên D" }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  expect(document.querySelector('[aria-label="Phân công đánh giá của vòng"]')?.textContent).toContain("Nhóm có 4 thành viên đủ điều kiện đánh giá.");
  expect(document.querySelector('[aria-label="Phân công đánh giá của vòng"]')?.textContent).toContain("yêu cầu 2 reviewer");
  expect(document.querySelectorAll('[aria-label="Reviewer được phân công"] li')).toHaveLength(2);
  expect(document.querySelector('[aria-label="Reviewer được phân công"]')?.textContent).toContain("Tôi (Bạn)");
  expect(document.body.textContent).toContain("Bạn là reviewer được phân công cho vòng này.");
});
it.each([false, true])("does not offer an extra independent ballot to an unassigned team member, including the owner (%s)", async canManage => {
  const unassigned = { ...round, canManage, myAssignmentId: null, canReview: false, assignments: round.assignments.map(a => ({ ...a, reviewerId: a.id === "mine" ? "another-reviewer" : a.reviewerId })) };
  mocks.detail.mockResolvedValue(unassigned);
  mocks.board.mockResolvedValue({ ...board, canManage, items: [{ ...board.items[0], round: unassigned }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  expect(document.body.textContent).toContain("Bạn chưa giữ suất đánh giá.");
  expect(document.querySelector('input[name="review-choice"]')).toBeNull();
  expect([...document.querySelectorAll("button")].some(b => b.textContent === "Gửi và khóa phiếu")).toBe(false);
  expect(mocks.action).not.toHaveBeenCalled();
});
it("explains empty frozen criteria without inventing or silently updating research rules", async () => {
  const empty = { ...round, settings: { ...settings, researchQuestions: [], inclusionCriteria: [], exclusionCriteria: [] } };
  mocks.detail.mockResolvedValue(empty); mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0], round: empty }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  expect(document.body.textContent).toContain("Vòng này chưa lưu tiêu chí đưa vào và tiêu chí loại.");
  expect([...document.querySelectorAll("p")].filter(p => p.textContent === "Chưa thiết lập trong quy trình của vòng này.")).toHaveLength(3);
  expect(mocks.configure).not.toHaveBeenCalled();
  expect(mocks.action).not.toHaveBeenCalled();
});
it("requires confirmation, keeps a failed review draft, and reuses its idempotency key", async () => {
  mocks.action.mockRejectedValue(new Error("Network unavailable"));
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  const send = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Gửi và khóa phiếu")!; expect(send.disabled).toBe(true);
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"][value="EXCLUDE"]')!.click()); await fill("Lý do loại", "Không đúng đối tượng nghiên cứu");
  const confirmed = [...document.querySelectorAll("label")].find(l => l.textContent?.startsWith("Tôi xác nhận gửi phiếu"))?.querySelector<HTMLInputElement>("input");
  if (confirmed) await act(async () => confirmed.click());
  await click("Gửi và khóa phiếu");
  expect(document.querySelector('[role="alert"]')).not.toBeNull(); expect([...document.querySelectorAll("textarea")].some(t => t.value === "Không đúng đối tượng nghiên cứu")).toBe(true);
  await click("Gửi và khóa phiếu"); expect(mocks.action).toHaveBeenCalledTimes(2); expect(mocks.action.mock.calls[0]![3].clientKey).toBe(mocks.action.mock.calls[1]![3].clientKey);
  expect(mocks.action).toHaveBeenLastCalledWith("p", "round", "reviews", expect.objectContaining({ assignmentId: "mine", expectedRevision: 1, decision: "EXCLUDE", confirmed: true }));
});
it.each([
  ["INCLUDE", "Lý do / Căn cứ phù hợp", "comment"],
  ["EXCLUDE", "Lý do loại", "exclusionReason"],
  ["UNSURE", "Điểm cần làm rõ thêm", "comment"],
])("requires a written rationale before submitting %s", async (decision, label, field) => {
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  await act(async () => document.querySelector<HTMLInputElement>(`input[name="review-choice"][value="${decision}"]`)!.click());
  const area = [...document.querySelectorAll("label")].find(l => l.textContent?.startsWith(label))!.querySelector("textarea")!;
  const send = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Gửi và khóa phiếu")!;
  expect(area.required).toBe(true);
  expect(send.disabled).toBe(true);
  for (const value of ["   ", " a "]) {
    await fill(label, value);
    expect(send.disabled).toBe(true);
    await act(async () => area.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.action).not.toHaveBeenCalled();
  }
  await fill(label, "  Căn cứ đã đối chiếu với tiêu chí nghiên cứu  ");
  expect(send.disabled).toBe(false);
  await click("Gửi và khóa phiếu");
  expect(mocks.action).toHaveBeenCalledWith("p", "round", "reviews", expect.objectContaining({ decision, [field]: "Căn cứ đã đối chiếu với tiêu chí nghiên cứu" }));
});
it("preserves the include rationale while editing and blocks clearing it", async () => {
  const reviewed = { ...round, canReview: false, myReview: { id: "r", assignmentId: "mine", reviewerId: "actor", revision: 1, decision: "INCLUDE" as const, exclusionReason: "", comment: "Bài đáp ứng tiêu chí đối tượng", submittedAt: new Date().toISOString() } };
  mocks.detail.mockResolvedValue(reviewed);
  mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0]!, round: reviewed }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  await click("Sửa lựa chọn");
  const area = [...document.querySelectorAll("label")].find(l => l.textContent?.startsWith("Lý do / Căn cứ phù hợp"))!.querySelector("textarea")!;
  expect(area.value).toBe(reviewed.myReview.comment);
  await fill("Lý do / Căn cứ phù hợp", "   ");
  const update = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Cập nhật phiếu")!;
  expect(update.disabled).toBe(true);
  await act(async () => area.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(mocks.action).not.toHaveBeenCalled();
  await fill("Lý do / Căn cứ phù hợp", "Căn cứ mới sau khi đối chiếu");
  await click("Cập nhật phiếu");
  expect(mocks.action).toHaveBeenCalledWith("p", "round", "reviews", expect.objectContaining({ decision: "INCLUDE", comment: "Căn cứ mới sau khi đối chiếu" }));
});
it("protects an unfinished review when changing filters or closing its details", async () => {
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />); await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"][value="EXCLUDE"]')!.click()); await fill("Lý do loại", "Đang đọc và chưa hoàn thành"); mocks.confirm.mockResolvedValue(false);
  const select = document.querySelector<HTMLSelectElement>('select[aria-label="Trạng thái chi tiết"]')!;
  await act(async () => { select.value = "INCLUDED"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
  expect(mocks.confirm).toHaveBeenCalledOnce(); expect(mocks.board).toHaveBeenCalledTimes(1); expect(select.value).toBe("");
  await click("Đóng"); expect(mocks.confirm).toHaveBeenCalledTimes(2); expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Đang đọc và chưa hoàn thành");
});
it("keeps submitted decisions locked and renders independent human provenance", async () => {
  const locked = { ...round, canReview: false, myReview: { id: "r", assignmentId: "mine", reviewerId: "actor", revision: 1, decision: "INCLUDE" as const, exclusionReason: "", comment: "Phiếu đã gửi", submittedAt: new Date().toISOString() } }; mocks.detail.mockResolvedValue(locked);
  mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0], round: locked }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />); expect(document.body.textContent).toContain("Phù hợp · đã khóa"); expect(document.body.textContent).not.toContain("Gửi và khóa phiếu"); expect(mocks.action).not.toHaveBeenCalled();
});
it("keeps oversight separate and requires deliberate legacy reopening", async () => {
  mocks.board.mockResolvedValue({ ...board, canManage: true, items: [{ ...board.items[0], round: { ...round, legacyNeedsAudit: true } }] });
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  expect(document.querySelector('input[name="review-choice"]')).toBeNull();
  const start = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Mở vòng mới đã xác nhận")!;
  expect(start.disabled).toBe(true);
  const check = [...document.querySelectorAll("label")].find(l => l.textContent?.startsWith("Tạo vòng mới"))!.querySelector<HTMLInputElement>("input")!;
  await act(async () => check.click()); await click("Mở vòng mới đã xác nhận");
  expect(mocks.start).toHaveBeenCalledWith("p", expect.objectContaining({ paperIds: ["paper"], confirmRescreen: true }));
});
it("retains a review draft when a refreshed assignment removes submission access", async () => {
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"][value="EXCLUDE"]')!.click());
  await fill("Lý do loại", "Nhận xét chưa gửi của tôi");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "screening-round", "round"], { ...round, canReview: false, myAssignmentId: null, assignments: round.assignments.filter(a => a.id !== "mine") })); await settle();
  expect(document.body.textContent).toContain("Quyền gửi phiếu đã thay đổi");
  expect([...document.querySelectorAll("textarea")].some(t => t.value === "Nhận xét chưa gửi của tôi")).toBe(true);
  expect([...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Gửi và khóa phiếu")!.disabled).toBe(true);
  expect(mocks.action).not.toHaveBeenCalled();
});
it("keeps the cached workspace and review draft when a background board refresh fails", async () => {
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"][value="EXCLUDE"]')!.click());
  await fill("Lý do loại", "Bản nháp trong lúc mất mạng");
  mocks.board.mockRejectedValue(new Error("Offline"));
  await act(async () => { await client.refetchQueries({ queryKey: ["project-research", "actor", "p", "library"] }); }); await settle();
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  expect([...document.querySelectorAll("textarea")].some(t => t.value === "Bản nháp trong lúc mất mạng")).toBe(true);
  expect(document.body.textContent).toContain("Phiếu của tôi");
});
it("preserves settings drafts across collaborator changes until explicitly reloaded", async () => {
  await render(<ScreeningSettingsForm projectId="p" settings={settings} />);
  await fill("Ghi chú câu hỏi cho quy trình (tùy chọn)", "Câu hỏi tôi đang soạn");
  const updated = { ...settings, version: 2, researchQuestions: ["Câu hỏi mới của nhóm"] };
  await render(<ScreeningSettingsForm projectId="p" settings={updated} />);
  expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Câu hỏi tôi đang soạn");
  expect([...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Lưu cấu hình cho vòng mới")!.disabled).toBe(true);
  mocks.confirm.mockResolvedValue(false); await click("Tải cấu hình hiện tại");
  expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Câu hỏi tôi đang soạn");
  mocks.confirm.mockResolvedValue(true); await click("Tải cấu hình hiện tại");
  expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Câu hỏi mới của nhóm");
});
it("locks settings inputs while saving so later edits cannot be discarded by the response", async () => {
  let finish!: (value: { version: number }) => void;
  mocks.configure.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(<ScreeningSettingsForm projectId="p" settings={settings} />);
  await fill("Ghi chú câu hỏi cho quy trình (tùy chọn)", "Câu hỏi đã sửa");
  await click("Lưu cấu hình cho vòng mới");
  expect(document.querySelector("fieldset")?.disabled).toBe(true);
  await act(async () => finish({ version: 2 })); await settle();
  expect(document.querySelector("fieldset")?.disabled).toBe(false);
});

it("explains submitted versus occupied slots and omits personal review forms from oversight", async () => {
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  expect(document.body.textContent).toContain("Có ít nhất một phiếu đã gửi: 1/1");
  expect(document.body.textContent).toContain("Đã có kết quả giai đoạn hiện tại: 0/1");
  expect(document.body.textContent).toContain("1/2 phiếu đã gửi · 2 chỗ có người");
  expect(document.body.textContent).not.toContain("Người chốt:");
  expect(document.querySelector('input[name="review-choice"]')).toBeNull();
});
it("configures one reviewer without needing a third teammate", async () => {
  mocks.configure.mockResolvedValue({ version: 2 });
  await render(<ScreeningSettingsForm projectId="p" settings={settings} />);
  const select = [...document.querySelectorAll("label")].find(l => l.textContent?.startsWith("Phương thức đánh giá"))!.querySelector("select")!;
  await act(async () => { select.value = "SIMPLE"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
  const number = document.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect(number.value).toBe("1"); expect(number.min).toBe("1"); expect(number.max).toBe("1");
  await click("Lưu cấu hình cho vòng mới");
  expect(mocks.configure).toHaveBeenCalledWith("p", expect.objectContaining({ reviewMode: "SIMPLE", requiredReviewers: 1, blindReview: false, resolutionPolicy: "ADJUDICATION" }));
});
it("requires the assigned finalizer to confirm and explain a final decision", async () => {
  const review = { id: "review", assignmentId: "mine", reviewerId: "actor", revision: 1, decision: "INCLUDE" as const, exclusionReason: "", comment: "Matches criteria", submittedAt: "2026-10-29T01:00:00Z" };
  const ready = { ...round, status: "AWAITING_FINALIZATION" as const, canReview: false, canFinalize: true, hiddenReviews: false, unblindedAt: "2026-10-29T01:00:00Z", completed: 2, reviews: [review, { ...review, id: "other", assignmentId: "peer", reviewerId: "peer" }], myReview: review, finalizer: { id: "actor", name: "Tôi" } };
  mocks.detail.mockResolvedValue(ready); mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0], round: ready }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  expect(document.body.textContent).toContain("Chờ quyết định");
  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Xác nhận và lưu lịch sử")!;
  expect(save.disabled).toBe(true); expect(document.querySelector('option[value="finalizer"]')).toBeNull();
  await fill("Lý do (ít nhất 10 ký tự)", "Đã đối chiếu phạm vi và đối tượng theo tiêu chí");
  await act(async () => [...document.querySelectorAll("label")].find(l => l.textContent?.startsWith("Tôi hiểu tác động"))!.querySelector<HTMLInputElement>("input")!.click());
  await click("Xác nhận và lưu lịch sử");
  expect(mocks.action).toHaveBeenCalledWith("p", "round", "finalize", expect.objectContaining({ decision: "INCLUDED", expectedVersion: 2, confirmed: true }));
  await act(async () => client.setQueryData(["project-research", "actor", "p", "screening-round", "round"], { ...ready, status: "INCLUDED", canFinalize: false, finalDecision: { id: "final", version: 3, decision: "INCLUDED", source: "MANUAL", reason: "Đã đối chiếu phạm vi và đối tượng theo tiêu chí", resolverId: "actor", createdAt: "2026-10-29T02:00:00Z" } })); await settle();
  expect(document.body.textContent).toContain("Kết quả của vòng: Phù hợp");
  expect(document.body.textContent).not.toContain("Quyền thao tác đã thay đổi");
  expect(document.body.textContent).not.toContain("Xác nhận và lưu lịch sử");
});
it("blocks uncertain reviews from finalization in the UI", async () => {
  const uncertain = { ...round, status: "NEEDS_RESOLUTION" as const, canReview: false, canFinalize: true, hiddenReviews: false, completed: 2, unblindedAt: "2026-10-29T01:00:00Z", reviews: [{ id: "unsure", assignmentId: "peer", reviewerId: "peer", revision: 1, decision: "UNSURE" as const, exclusionReason: "", comment: "Need full text", submittedAt: "2026-10-29T01:00:00Z" }] };
  mocks.detail.mockResolvedValue(uncertain); mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0], round: uncertain }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  expect(document.body.textContent).toContain("Còn phiếu chưa đủ thông tin");
  await fill("Lý do (ít nhất 10 ký tự)", "Thử chốt khi vẫn thiếu thông tin");
  await act(async () => [...document.querySelectorAll("label")].find(l => l.textContent?.startsWith("Tôi hiểu tác động"))!.querySelector<HTMLInputElement>("input")!.click());
  expect([...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Xác nhận và lưu lịch sử")!.disabled).toBe(true);
  expect(mocks.action).not.toHaveBeenCalled();
});

it("keeps a final decision draft visible when another person receives finalizer rights", async () => {
  const ready = { ...round, status: "AWAITING_FINALIZATION" as const, canReview: false, canFinalize: true, hiddenReviews: false, completed: 2, unblindedAt: "2026-10-29T01:00:00Z", reviews: [{ id: "v", assignmentId: "peer", reviewerId: "peer", revision: 1, decision: "INCLUDE" as const, exclusionReason: "", comment: "Matches", submittedAt: "2026-10-29T01:00:00Z" }] };
  mocks.detail.mockResolvedValue(ready); mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0], round: ready }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  await fill("Lý do (ít nhất 10 ký tự)", "Bản nháp kết luận cần được giữ để sao chép");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "screening-round", "round"], { ...ready, version: 3, canFinalize: false, finalizer: { id: "peer", name: "Thành viên B" } })); await settle();
  expect([...document.querySelectorAll("textarea")].some(t => t.value === "Bản nháp kết luận cần được giữ để sao chép")).toBe(true);
  expect([...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Xác nhận và lưu lịch sử")!.disabled).toBe(true);
  expect(mocks.action).not.toHaveBeenCalled();
});
it("keeps proposal drafts accessible after edit access is revoked", async () => {
  const own = { ...board.items[0]!, canEditProposal: true };
  const ownBoard = { ...board, items: [own] }; mocks.board.mockResolvedValue(ownBoard);
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  await fill("Bài này liên quan câu hỏi nghiên cứu nào?", "Bản nháp lý do của tôi chưa được gửi");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "library", "", "", "", "", "", "newest", 1], { ...ownBoard, items: [{ ...own, canEditProposal: false }] })); await settle();
  expect([...document.querySelectorAll("textarea")].some(t => t.value === "Bản nháp lý do của tôi chưa được gửi")).toBe(true);
  expect([...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Lưu lý do đề xuất")!.disabled).toBe(true);
  expect(mocks.proposal).not.toHaveBeenCalled();
});
it("uses the saved proposal timestamp for the next edit without reporting a false conflict", async () => {
  const own = { ...board.items[0]!, canEditProposal: true };
  mocks.board.mockResolvedValue({ ...board, items: [own] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  const reason = "Bài cung cấp minh chứng cho câu hỏi nghiên cứu thứ hai";
  const savedAt = "2026-10-29T02:00:00.000Z";
  await fill("Bài này liên quan câu hỏi nghiên cứu nào?", reason);
  mocks.proposal.mockResolvedValue({ id: "link", updatedAt: savedAt });
  mocks.board.mockResolvedValue({ ...board, items: [{ ...own, proposalReason: reason, updatedAt: savedAt }] });
  await click("Lưu lý do đề xuất");
  expect(document.body.textContent).not.toContain("Tôi đã kiểm tra thay đổi, dùng phiên bản hiện tại");
  await fill("Bài này liên quan câu hỏi nghiên cứu nào?", `${reason}, đã đọc toàn văn`);
  await click("Lưu lý do đề xuất");
  expect(mocks.proposal).toHaveBeenLastCalledWith("p", "paper", expect.objectContaining({ expectedUpdatedAt: savedAt }));
});
it("retains a review draft when access was granted after the detail first opened", async () => {
  const unassigned = { ...round, canReview: false, myAssignmentId: null };
  mocks.detail.mockResolvedValue(unassigned); mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0], round: unassigned }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  const key = ["project-research", "actor", "p", "screening-round", "round"];
  await act(async () => client.setQueryData(key, round)); await settle();
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"][value="EXCLUDE"]')!.click());
  await fill("Lý do loại", "Bản nháp sau khi tôi được phân công thêm");
  await act(async () => client.setQueryData(key, unassigned)); await settle();
  expect([...document.querySelectorAll("textarea")].some(t => t.value === "Bản nháp sau khi tôi được phân công thêm")).toBe(true);
  expect([...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Gửi và khóa phiếu")!.disabled).toBe(true);
});

it("separates legacy labels from current decisions and flags journal-like metadata without rewriting it", async () => {
  const legacy = { ...board.items[0]!, round: null, legacyStatus: "INCLUDED", legacyProvenance: true, title: "International Journal of Molecular Medicine", journalName: "International Journal of Molecular Medicine", doi: "10.3892/ijmm" };
  mocks.board.mockResolvedValue({ ...board, items: [legacy], progress: { total: 1, reviewed: 0, finalized: 0, legacy: 1 } });
  mocks.rounds.mockResolvedValue({ items: [], total: 0, page: 1, hasNext: false, legacy: { status: "INCLUDED" } });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  expect(document.body.textContent).toContain("Kho tài liệu");
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.begin).not.toHaveBeenCalled();
  await vi.waitFor(async () => {
    await settle();
    expect(document.body.textContent).toContain("Phân loại đã lưu trước đây");
  });
  expect(document.body.textContent).toContain("Tiêu đề trùng tên tạp chí");
  expect(document.querySelector('a[href="https://doi.org/10.3892%2Fijmm"]')).not.toBeNull();
  expect(document.querySelector('a[href="/papers/paper"]')).not.toBeNull();
  expect(mocks.action).not.toHaveBeenCalled();
});

it("lets an ordinary member initialize a never-started paper without Owner setup", async () => {
  mocks.board.mockResolvedValue({ ...board, settings: { ...settings, workflowVersion: 5 }, items: [{ ...board.items[0], round: null }] });
  mocks.rounds.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, hasNext: false, legacy: null });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  await click("Bắt đầu đánh giá độc lập");
  expect(mocks.begin).toHaveBeenCalledWith("p", "paper", expect.objectContaining({ confirmRescreen: false }));
});
it("requires deliberate confirmation before permitted provisional full-text advancement", async () => {
  const provisional = { ...round, hiddenReviews: false, canReview: false, status: "NEEDS_RESOLUTION", canAdvanceConservatively: true };
  mocks.detail.mockResolvedValue(provisional); mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0], round: provisional }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  const send = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Chuyển sang đọc toàn văn")!;
  expect(send.disabled).toBe(true); await fill("Lý do cần đọc toàn văn", "No independent third person is available for this abstract conflict");
  const consent = [...document.querySelectorAll("label")].find(label => label.textContent?.includes("Tôi hiểu bước này"))!.querySelector<HTMLInputElement>("input")!;
  await act(async () => consent.click()); await click("Chuyển sang đọc toàn văn");
  expect(mocks.advanceConservatively).toHaveBeenCalledWith("p", "round", expect.objectContaining({ confirmed: true, expectedVersion: 2 }));
});
