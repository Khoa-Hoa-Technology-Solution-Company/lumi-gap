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
import { ReadingPaperModal } from "../components/reading-paper-modal";
import type { ScreeningBoard, ScreeningRoundView } from "@trend/shared-types";
const mocks = vi.hoisted(() => ({ resumeFullText: vi.fn(), begin: vi.fn(), advanceConservatively: vi.fn(), requestAdjudication: vi.fn(), board: vi.fn(), rounds: vi.fn(), detail: vi.fn(), history: vi.fn(), ai: vi.fn(), action: vi.fn(), start: vi.fn(), assign: vi.fn(), configure: vi.fn(), analytics: vi.fn(), requestAi: vi.fn(), proposal: vi.fn(), confirm: vi.fn(), workspaceSummary: vi.fn(), claim: vi.fn(), release: vi.fn(), extend: vi.fn(), claimNext: vi.fn(), updateDiscoveryGoal: vi.fn() }));
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
  expect(document.querySelector('.screening-decision-choices input[type="radio"]')).toBeNull();
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
  await act(async () => document.querySelector<HTMLInputElement>(`input[type="radio"][value="${decision}"]`)!.click());
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
it.each([false, true])("allows fulltext evidence and RQ input with fixed stage, retaining saved context on edit=%s", async editing => {
  const question = { id: "rq-1", text: "Population and outcomes" };
  const full: ScreeningRoundView = { ...round, phase: "FULL_TEXT", completed: editing ? 1 : 0, canReview: !editing,
    settings: { ...settings, screeningMode: "TWO_STAGE", workflowVersion: 11, questionOptions: [question] },
    assignments: round.assignments.map(a => ({ ...a, completed: editing && a.id === "mine" })),
    myReview: editing ? { id: "review", assignmentId: "mine", reviewerId: "actor", revision: 1, decision: "INCLUDE", exclusionReason: "", comment: "Original source rationale", scope: "FULL_TEXT", fullTextReference: "PDF p. 4, participant criteria", researchQuestions: [question], submittedAt: new Date().toISOString() } : null };
  mocks.detail.mockResolvedValue(full);
  mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0]!, fullTextAvailable: true, round: full }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  if (editing) await click("Sửa lựa chọn");
  const source = [...document.querySelectorAll("label")].find(l => l.textContent?.startsWith("Nguồn toàn văn đã đọc"))!.querySelector("input")!;
  const rq = document.querySelector<HTMLInputElement>('.assessment-questions input[type="checkbox"]')!;
  expect(source.disabled).toBe(false);
  expect(rq.disabled).toBe(false);
  expect(document.querySelector('select[aria-label="Chọn phạm vi đã đọc"]')).toBeNull();
  expect(source.value).toBe(editing ? full.myReview!.fullTextReference : "");
  expect(rq.checked).toBe(editing);
  if (!editing) {
    await act(async () => { document.querySelector<HTMLInputElement>('input[type="radio"][value="INCLUDE"]')!.click(); rq.click(); });
    await fill("Lý do / Căn cứ phù hợp", "Evidence supports the registered population");
  }
  await fill("Nguồn toàn văn đã đọc", "PDF p. 5, updated population criteria");
  await click(editing ? "Cập nhật phiếu" : "Gửi và khóa phiếu");
  expect(mocks.action).toHaveBeenCalledWith("p", "round", "reviews", expect.objectContaining({ scope: "FULL_TEXT", fullTextReference: "PDF p. 5, updated population criteria", researchQuestionIds: [question.id] }));
});
it("preserves the include rationale while editing and blocks clearing it", async () => {
  const reviewed = { ...round, canReview: false, assignments: round.assignments.map(a => ({ ...a, completed: a.id === "mine" })), myReview: { id: "r", assignmentId: "mine", reviewerId: "actor", revision: 1, decision: "INCLUDE" as const, exclusionReason: "", comment: "Bài đáp ứng tiêu chí đối tượng", submittedAt: new Date().toISOString() } };
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
it("does not allow rationale-only editing once the other reviewer submitted, even before unblinding", async () => {
  const reviewed = { ...round, canReview: false, completed: 2, assignments: round.assignments.map(a => ({ ...a, completed: true })), myReview: { id: "r", assignmentId: "mine", reviewerId: "actor", revision: 1, decision: "INCLUDE" as const, exclusionReason: "", comment: "Phiếu hiện tại", submittedAt: new Date().toISOString() } };
  mocks.detail.mockResolvedValue(reviewed);
  mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0]!, round: reviewed }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  expect([...document.querySelectorAll('button')].find(b => b.textContent === 'Sửa lựa chọn')).toBeUndefined();
  expect(mocks.action).not.toHaveBeenCalled();
});
it("blocks an already-open rationale edit when the peer submits and retains the draft", async () => {
  const reviewed = { ...round, canReview: false, assignments: round.assignments.map(a => ({ ...a, completed: a.id === "mine" })), myReview: { id: "r", assignmentId: "mine", reviewerId: "actor", revision: 1, decision: "INCLUDE" as const, exclusionReason: "", comment: "Lý do ban đầu", submittedAt: new Date().toISOString() } };
  mocks.detail.mockResolvedValue(reviewed);
  mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0]!, round: reviewed }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  await click("Sửa lựa chọn");
  await fill("Lý do / Căn cứ phù hợp", "Bản nháp đang chỉnh sửa");
  const completed = { ...reviewed, completed: 2, assignments: reviewed.assignments.map(a => ({ ...a, completed: true })) };
  mocks.detail.mockResolvedValue(completed);
  await act(async () => { client.setQueryData(["project-research", "actor", "p", "screening-round", "round"], completed); });
  await settle();
  expect(document.body.textContent).toContain('Quyền gửi phiếu đã thay đổi');
  const area = [...document.querySelectorAll('textarea')].find(e => e.value === 'Bản nháp đang chỉnh sửa')!;
  expect(area).toBeDefined();
  await act(async () => area.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(mocks.action).not.toHaveBeenCalled();
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
it("keeps the edit action when my first ballot is visible but the other reviewer has not submitted", async () => {
  const mine = { id: "mine-review", assignmentId: "mine", reviewerId: "actor", revision: 1, decision: "INCLUDE" as const, exclusionReason: "", comment: "Căn cứ đang chờ reviewer còn lại", submittedAt: "2026-11-05T01:34:00.000Z" };
  const waiting: ScreeningRoundView = { ...round, hiddenReviews: false, myReview: mine, reviews: [mine], assignments: round.assignments.map(assignment => ({ ...assignment, completed: assignment.id === "mine" })) };
  mocks.detail.mockResolvedValue(waiting);
  mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0]!, round: waiting }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  await click("Sửa lựa chọn");
  expect(document.querySelector<HTMLInputElement>('input[type="radio"][value="INCLUDE"]')?.checked).toBe(true);
  expect([...document.querySelectorAll("textarea")].some(area => area.value === mine.comment)).toBe(true);
});
it.each(["INCLUDED", "EXCLUDED", "AWAITING_FINALIZATION"] as const)("shows each published ballot once, with my identity, in %s", async status => {
  const mine = { id: "mine-review", assignmentId: "mine", reviewerId: "actor", revision: 1, decision: "INCLUDE" as const, exclusionReason: "", comment: "Căn cứ riêng của reviewer hiện tại", submittedAt: "2026-11-05T01:34:00.000Z" };
  const peer = { ...mine, id: "peer-review", assignmentId: "peer", reviewerId: "peer", comment: "Căn cứ riêng của reviewer còn lại" };
  const published: ScreeningRoundView = {
    ...round, status, hiddenReviews: false, completed: 2, canReview: false, unblindedAt: mine.submittedAt,
    assignments: round.assignments.map(assignment => ({ ...assignment, completed: true })),
    myReview: mine, reviews: [mine, peer],
    finalDecision: status === "AWAITING_FINALIZATION" ? null : { id: "final", version: 3, decision: status, source: "MANUAL", reason: "Kết quả của nhóm được lưu riêng", resolverId: "owner", createdAt: mine.submittedAt },
  };
  mocks.detail.mockResolvedValue(published);
  mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0]!, round: published }] });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  expect([...document.querySelectorAll("h4")].some(heading => heading.textContent === "Phiếu của tôi")).toBe(false);
  const ballots = [...document.querySelectorAll(".screening-team-reviews li")];
  expect(ballots).toHaveLength(2);
  expect(document.querySelector('[aria-label="Phiếu của bạn"]')?.textContent).toContain("TôiBạn · Phù hợp");
  expect(document.body.textContent?.split(mine.comment)).toHaveLength(2);
  expect(document.body.textContent?.split(peer.comment)).toHaveLength(2);
  expect(mocks.action).not.toHaveBeenCalled();
});
it.each(["INCLUDED", "EXCLUDED"] as const)("shows saved discussion in the actual %s paper detail and removes AI screening", async decision => {
  const final = { ...round, status: decision, hiddenReviews: false, completed: 2, aiVisible: true, canReview: false, myReview: { id: "r", assignmentId: "mine", reviewerId: "actor", revision: 2, decision: "INCLUDE" as const, exclusionReason: "", comment: "Căn cứ phiếu của tôi", submittedAt: new Date().toISOString() }, finalDecision: { id: "final", version: 3, decision, source: "CONSENSUS" as const, reason: "Kết quả đã chốt", resolverId: null, createdAt: new Date().toISOString() } };
  mocks.detail.mockResolvedValue(final);
  mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0]!, round: final }] });
  mocks.history.mockResolvedValue({ items: [{ id: "saved-chat", type: "DISCUSSION", actorId: "peer", actorName: "Thành viên B", createdAt: new Date().toISOString(), details: { comment: "Đã đối chiếu nguồn trong cuộc thảo luận" } }], total: 1, page: 1, pageSize: 20, hasNext: false });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />); await settle();
  expect(document.body.textContent).toContain("Đã đối chiếu nguồn trong cuộc thảo luận");
  expect(document.querySelector('[data-screening-section="discussion"]')).not.toBeNull();
  expect(document.querySelector('.paper-discussion textarea')).toBeNull();
  expect(document.body.textContent).not.toContain('Trợ lý AI sàng lọc');
  expect(document.body.textContent).not.toContain('Yêu cầu đề xuất AI');
  expect(mocks.ai).not.toHaveBeenCalled(); expect(mocks.requestAi).not.toHaveBeenCalled();
});
it("keeps oversight separate and requires deliberate legacy reopening", async () => {
  mocks.board.mockResolvedValue({ ...board, canManage: true, items: [{ ...board.items[0], round: { ...round, legacyNeedsAudit: true } }] });
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  expect(document.querySelector('input[type="radio"][value="INCLUDE"]')).toBeNull();
  const start = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Mở vòng mới đã xác nhận")!;
  expect(start.disabled).toBe(true);
  const check = [...document.querySelectorAll("label")].find(l => l.textContent?.startsWith("Tạo vòng mới"))!.querySelector<HTMLInputElement>("input")!;
  await act(async () => check.click()); await click("Mở vòng mới đã xác nhận");
  expect(mocks.start).toHaveBeenCalledWith("p", expect.objectContaining({ paperIds: ["paper"], confirmRescreen: true }));
});
it.each([[true, false], [false, false], [true, true]])("shows legacy recovery in the Library reading modal, owner=%s readOnly=%s", async (canManage, readOnly) => {
  // Even an old cached capability must not expose a writable ballot for a flagged round.
  const legacy = { ...round, canManage, canReview: true, assigned: 3, completed: 2, legacyNeedsAudit: true };
  mocks.detail.mockResolvedValue(legacy);
  mocks.board.mockResolvedValue({ ...board, canManage, items: [{ ...board.items[0]!, round: legacy }] });
  await render(<ReadingPaperModal projectId="p" paperId="paper" readOnly={readOnly} onClose={vi.fn()} />);
  expect(document.querySelector('[aria-label="Rà soát vòng đánh giá cũ"]')).not.toBeNull();
  expect(document.querySelector('input[type="radio"][value="INCLUDE"]')).toBeNull();
  expect(document.body.textContent).toContain("Vòng này chỉ được xem");
  const reopen = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Mở vòng mới đã xác nhận");
  if (canManage && !readOnly) {
    expect(reopen?.disabled).toBe(true);
    expect(mocks.start).not.toHaveBeenCalled();
    mocks.start.mockImplementationOnce(async () => {
      const fresh = { ...round, id: "fresh-round", number: 2, canManage: true, canReview: false, myAssignmentId: null, assignments: [], assigned: 0, completed: 0 };
      mocks.detail.mockResolvedValue(fresh);
      mocks.board.mockResolvedValue({ ...board, canManage: true, items: [{ ...board.items[0]!, round: fresh }] });
      mocks.rounds.mockResolvedValue({ items: [fresh, { ...legacy, active: false }], total: 2, page: 1, pageSize: 10, hasNext: false, legacy: null });
      return { roundIds: [fresh.id] };
    });
    const checkbox = document.querySelector<HTMLInputElement>('[aria-label="Rà soát vòng đánh giá cũ"] input[type="checkbox"]')!;
    await act(async () => checkbox.click());
    await click("Mở vòng mới đã xác nhận");
    expect(mocks.start).toHaveBeenCalledWith("p", expect.objectContaining({ paperIds: ["paper"], phase: "TITLE_ABSTRACT", confirmRescreen: true }));
    expect(document.querySelector('[aria-label="Rà soát vòng đánh giá cũ"]')).toBeNull();
    expect(document.body.textContent).toContain("Vòng 2");
  } else {
    expect(reopen).toBeUndefined();
    expect(document.body.textContent).toContain("Chủ dự án cần xác nhận mở vòng mới");
    expect(mocks.start).not.toHaveBeenCalled();
  }
  expect(mocks.action).not.toHaveBeenCalled();
});
it("keeps an in-progress draft visible but blocks sending when a round becomes legacy-audited", async () => {
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  await act(async () => document.querySelector<HTMLInputElement>('input[type="radio"][value="EXCLUDE"]')!.click());
  await fill("Lý do loại", "Căn cứ đang viết cần được giữ");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "screening-round", "round"], { ...round, legacyNeedsAudit: true, canReview: false })); await settle();
  expect([...document.querySelectorAll("textarea")].some(t => t.value === "Căn cứ đang viết cần được giữ")).toBe(true);
  expect([...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Gửi và khóa phiếu")!.disabled).toBe(true);
  expect(mocks.action).not.toHaveBeenCalled();
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
  expect(document.querySelector('input[type="radio"][value="INCLUDE"]')).toBeNull();
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
  expect(document.body.textContent).toContain("Kết quả của vòng: Được chấp nhận");
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
it("restores the precise historical round from a task link even when a newer round is current", async () => {
  const historical = { ...round, id: "historical-round", number: 1, active: false, status: "INCLUDED" as const, canReview: false, extractionReady: false };
  mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0]!, round: { ...round, number: 2, phase: "FULL_TEXT" } }] });
  mocks.detail.mockResolvedValue(historical);
  await render(<ReadingPaperModal projectId="p" paperId="paper" readOnly={false} onClose={vi.fn()} />, "/projects/p?tab=papers&view=my-work&paper=paper&round=historical-round&section=history");
  expect(mocks.detail).toHaveBeenCalledWith("p", "historical-round");
  expect(mocks.detail.mock.calls.every(args => args[1] === "historical-round")).toBe(true);
  expect(document.body.textContent).not.toContain("Vòng 2");
});
it("rejects a round deep link that belongs to a different paper", async () => {
  mocks.board.mockResolvedValue(board);
  mocks.detail.mockResolvedValue({ ...round, paperId: "unrelated" });
  await render(<ReadingPaperModal projectId="p" paperId="paper" readOnly={false} onClose={vi.fn()} />, "/projects/p?tab=papers&paper=paper&round=wrong-round");
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  expect(document.querySelector("form")).toBeNull();
});

it("persists an explicit two-stage protocol without flattening it to a single stage", async () => {
  mocks.configure.mockResolvedValue({ version: 2 });
  await render(<ScreeningSettingsForm projectId="p" settings={{ ...settings, screeningMode: "TWO_STAGE", stages: ["TITLE_ABSTRACT", "FULL_TEXT"] }} />);
  const mode = [...container.querySelectorAll("select")].find(s => s.value === "TWO_STAGE")!;
  expect(mode).toBeDefined();
  await fill("Tiêu chí đưa vào", "University population updated");
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await settle();
  expect(mocks.configure).toHaveBeenCalledWith("p", expect.objectContaining({ screeningMode: "TWO_STAGE", stages: ["TITLE_ABSTRACT", "FULL_TEXT"], expectedVersion: 1 }));
  expect(container.textContent).toContain("Vòng 2 chỉ mở khi có toàn văn");
});

it("offers an authorized waiting-fulltext action and keeps a missing-source error visible", async () => {
  const waiting = { ...round, status: "WAITING_FULLTEXT" as const, settings: { ...settings, screeningMode: "TWO_STAGE" as const }, canResumeFullText: true, canReview: false, canManage: false };
  mocks.detail.mockResolvedValue(waiting); mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0], round: waiting }] });
  mocks.resumeFullText.mockRejectedValue({ isAxiosError: true, response: { data: { error: { code: "CONFLICT", message: "Chưa có toàn văn" } } } });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  expect(container.textContent).toContain("Chờ toàn văn");
  expect(document.querySelector('input[type="file"]')).not.toBeNull();
  expect(container.querySelector('input[type="radio"][value="INCLUDE"]')).toBeNull();
  await click("Đã có toàn văn · Mở vòng 2");
  expect(mocks.resumeFullText).toHaveBeenCalledWith("p", "round", expect.objectContaining({ expectedVersion: 2, confirmed: true }));
  expect(document.body.textContent).toContain("Chưa có toàn văn");
});
