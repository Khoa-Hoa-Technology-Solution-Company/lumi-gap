// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScreeningWorkspace } from "../components/screening-workspace";
import { ResearchLiterature } from "../components/research-literature";
import { ScreeningSettingsForm } from "../components/screening-management";
import type { ScreeningBoard, ScreeningRoundView } from "@trend/shared-types";
const mocks = vi.hoisted(() => ({ board: vi.fn(), rounds: vi.fn(), detail: vi.fn(), history: vi.fn(), ai: vi.fn(), action: vi.fn(), start: vi.fn(), assign: vi.fn(), configure: vi.fn(), analytics: vi.fn(), requestAi: vi.fn(), proposal: vi.fn(), confirm: vi.fn() }));
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
async function click(label: string) { const element = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label); expect(element, label).toBeDefined(); await act(async () => element!.click()); await settle(); }
async function fill(label: string, text: string) { const input = [...container.querySelectorAll("label")].find(l => l.textContent?.startsWith(label))?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input,textarea"); expect(input, label).toBeDefined(); await act(async () => { const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, text); input!.dispatchEvent(new Event("input", { bubbles: true })); }); await settle(); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks(); Object.values(mocks).forEach(m => m.mockResolvedValue(undefined)); mocks.confirm.mockResolvedValue(true); mocks.board.mockResolvedValue(board); mocks.detail.mockResolvedValue(round); mocks.rounds.mockResolvedValue({ items: [round], total: 1, page: 1, pageSize: 10, hasNext: false, legacy: null }); mocks.history.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, hasNext: false }); mocks.ai.mockResolvedValue(null);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("opens the shared library by default and keeps organization accessible", async () => {
  await render(<ResearchLiterature projectId="p" readOnly={false}><p>Thư viện cũ</p></ResearchLiterature>);
  expect(container.textContent).toContain("Thư viện của nhóm"); expect(container.textContent).not.toContain("Thư viện cũ");
  await click("Notes & Sources"); expect(container.textContent).toContain("Thư viện cũ");
});
it("shows safe completion and permissions, hides AI requests and renders paper text safely", async () => {
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  expect(container.textContent).toContain("1/2 phiếu đã gửi"); expect(container.textContent).toContain("Phiếu và nhận xét của người khác đang được ẩn"); expect(container.querySelector("script")).toBeNull();
  expect(mocks.ai).not.toHaveBeenCalled(); expect(container.textContent).not.toContain("Quản lý và xử lý bất đồng"); expect(container.textContent).not.toContain("Bắt đầu vòng cho bài đã chọn");
});
it("requires confirmation, keeps a failed review draft, and reuses its idempotency key", async () => {
  mocks.action.mockRejectedValue(new Error("Network unavailable"));
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  const send = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Gửi và khóa phiếu")!; expect(send.disabled).toBe(true);
  await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"][value="EXCLUDE"]')!.click()); await fill("Lý do loại", "Không đúng đối tượng nghiên cứu"); await fill("Giải thích", "Giữ nội dung của tôi");
  const confirmed = [...container.querySelectorAll("label")].find(l => l.textContent?.startsWith("Tôi xác nhận gửi phiếu"))!.querySelector<HTMLInputElement>("input")!;
  await act(async () => confirmed.click()); await click("Gửi và khóa phiếu");
  expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect([...container.querySelectorAll("textarea")].some(t => t.value === "Giữ nội dung của tôi")).toBe(true);
  await click("Gửi và khóa phiếu"); expect(mocks.action).toHaveBeenCalledTimes(2); expect(mocks.action.mock.calls[0]![3].clientKey).toBe(mocks.action.mock.calls[1]![3].clientKey);
  expect(mocks.action).toHaveBeenLastCalledWith("p", "round", "reviews", expect.objectContaining({ assignmentId: "mine", expectedRevision: 1, decision: "EXCLUDE", confirmed: true }));
});
it("protects an unfinished review when changing filters or closing its details", async () => {
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />); await fill("Giải thích", "Đang đọc và chưa hoàn thành"); mocks.confirm.mockResolvedValue(false);
  const select = container.querySelector<HTMLSelectElement>(".screening-toolbar select")!;
  await act(async () => { select.value = "PENDING"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
  expect(mocks.confirm).toHaveBeenCalledOnce(); expect(mocks.board).toHaveBeenCalledTimes(1); expect(select.value).toBe("ALL");
  await click("Đóng chi tiết"); expect(mocks.confirm).toHaveBeenCalledTimes(2); expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Đang đọc và chưa hoàn thành");
});
it("keeps submitted decisions locked and renders independent human provenance", async () => {
  const locked = { ...round, canReview: false, myReview: { id: "r", assignmentId: "mine", reviewerId: "actor", revision: 1, decision: "INCLUDE" as const, exclusionReason: "", comment: "Phiếu đã gửi", submittedAt: new Date().toISOString() } }; mocks.detail.mockResolvedValue(locked);
  mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0], round: locked }] });
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />); expect(container.textContent).toContain("Phù hợp · đã khóa"); expect(container.textContent).not.toContain("Gửi và khóa phiếu"); expect(mocks.action).not.toHaveBeenCalled();
});
it("requires explicit confirmation for bulk rounds and sends selected ids", async () => {
  mocks.board.mockResolvedValue({ ...board, canManage: true });
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  const start = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Bắt đầu vòng cho bài đã chọn")!; expect(start.disabled).toBe(true);
  await act(async () => container.querySelector<HTMLInputElement>('[aria-label^="Chọn bài"]')!.click());
  const confirm = [...container.querySelectorAll("label")].find(l => l.textContent?.startsWith("Xác nhận mở vòng mới"))!.querySelector<HTMLInputElement>("input")!; await act(async () => confirm.click()); await click("Bắt đầu vòng cho bài đã chọn");
  expect(mocks.start).toHaveBeenCalledWith("p", expect.objectContaining({ paperIds: ["paper"], phase: "TITLE_ABSTRACT", confirmRescreen: true }));
});
it("retains a review draft when a refreshed assignment removes submission access", async () => {
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  await fill("Giải thích", "Nhận xét chưa gửi của tôi");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "screening-round", "round"], { ...round, canReview: false, myAssignmentId: null, assignments: round.assignments.filter(a => a.id !== "mine") })); await settle();
  expect(container.textContent).toContain("Quyền gửi phiếu đã thay đổi");
  expect([...container.querySelectorAll("textarea")].some(t => t.value === "Nhận xét chưa gửi của tôi")).toBe(true);
  expect([...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Gửi và khóa phiếu")!.disabled).toBe(true);
  expect(mocks.action).not.toHaveBeenCalled();
});
it("keeps the cached workspace and review draft when a background board refresh fails", async () => {
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  await fill("Giải thích", "Bản nháp trong lúc mất mạng");
  mocks.board.mockRejectedValue(new Error("Offline"));
  await act(async () => { await client.refetchQueries({ queryKey: ["project-research", "actor", "p", "screening-board"] }); }); await settle();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect([...container.querySelectorAll("textarea")].some(t => t.value === "Bản nháp trong lúc mất mạng")).toBe(true);
  expect(container.textContent).toContain("Phiếu của tôi");
});
it("preserves settings drafts across collaborator changes until explicitly reloaded", async () => {
  await render(<ScreeningSettingsForm projectId="p" settings={settings} />);
  await fill("Ghi chú câu hỏi cho quy trình (tùy chọn)", "Câu hỏi tôi đang soạn");
  const updated = { ...settings, version: 2, researchQuestions: ["Câu hỏi mới của nhóm"] };
  await render(<ScreeningSettingsForm projectId="p" settings={updated} />);
  expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Câu hỏi tôi đang soạn");
  expect([...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Lưu cấu hình cho vòng mới")!.disabled).toBe(true);
  mocks.confirm.mockResolvedValue(false); await click("Tải cấu hình hiện tại");
  expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Câu hỏi tôi đang soạn");
  mocks.confirm.mockResolvedValue(true); await click("Tải cấu hình hiện tại");
  expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Câu hỏi mới của nhóm");
});
it("locks settings inputs while saving so later edits cannot be discarded by the response", async () => {
  let finish!: (value: { version: number }) => void;
  mocks.configure.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(<ScreeningSettingsForm projectId="p" settings={settings} />);
  await fill("Ghi chú câu hỏi cho quy trình (tùy chọn)", "Câu hỏi đã sửa");
  await click("Lưu cấu hình cho vòng mới");
  expect(container.querySelector("fieldset")?.disabled).toBe(true);
  await act(async () => finish({ version: 2 })); await settle();
  expect(container.querySelector("fieldset")?.disabled).toBe(false);
});

it("separates reviewed papers from final decisions and sends combined filters", async () => {
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  expect(container.textContent).toContain("Đã có đánh giá: 1/1 bài");
  expect(container.textContent).toContain("Đã có quyết định cuối: 0/1 bài");
  for (const [label, value] of [["Trạng thái bài", "AWAITING_FINALIZATION"], ["Người đề xuất", "peer"], ["Reviewer", "actor"]]) {
    const select = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    await act(async () => { select.value = value!; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
  }
  expect(mocks.board).toHaveBeenLastCalledWith("p", expect.objectContaining({ status: "AWAITING_FINALIZATION", proposerId: "peer", reviewerId: "actor", page: 1 }));
});
it("configures one reviewer without needing a third teammate", async () => {
  mocks.configure.mockResolvedValue({ version: 2 });
  await render(<ScreeningSettingsForm projectId="p" settings={settings} />);
  const select = [...container.querySelectorAll("label")].find(l => l.textContent?.startsWith("Phương thức đánh giá"))!.querySelector("select")!;
  await act(async () => { select.value = "SIMPLE"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
  const number = container.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect(number.value).toBe("1"); expect(number.min).toBe("1"); expect(number.max).toBe("1");
  await click("Lưu cấu hình cho vòng mới");
  expect(mocks.configure).toHaveBeenCalledWith("p", expect.objectContaining({ reviewMode: "SIMPLE", requiredReviewers: 1, blindReview: false, resolutionPolicy: "ADJUDICATION" }));
});
it("requires the assigned finalizer to confirm and explain a final decision", async () => {
  const review = { id: "review", assignmentId: "mine", reviewerId: "actor", revision: 1, decision: "INCLUDE" as const, exclusionReason: "", comment: "Matches criteria", submittedAt: "2026-10-29T01:00:00Z" };
  const ready = { ...round, status: "AWAITING_FINALIZATION" as const, canReview: false, canFinalize: true, hiddenReviews: false, unblindedAt: "2026-10-29T01:00:00Z", completed: 2, reviews: [review, { ...review, id: "other", assignmentId: "peer", reviewerId: "peer" }], myReview: review, finalizer: { id: "actor", name: "Tôi" } };
  mocks.detail.mockResolvedValue(ready); mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0], round: ready }] });
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  expect(container.textContent).toContain("Chờ quyết định");
  const save = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Xác nhận và lưu lịch sử")!;
  expect(save.disabled).toBe(true); expect(container.querySelector('option[value="finalizer"]')).toBeNull();
  await fill("Lý do (ít nhất 10 ký tự)", "Đã đối chiếu phạm vi và đối tượng theo tiêu chí");
  await act(async () => [...container.querySelectorAll("label")].find(l => l.textContent?.startsWith("Tôi hiểu tác động"))!.querySelector<HTMLInputElement>("input")!.click());
  await click("Xác nhận và lưu lịch sử");
  expect(mocks.action).toHaveBeenCalledWith("p", "round", "finalize", expect.objectContaining({ decision: "INCLUDED", expectedVersion: 2, confirmed: true }));
  await act(async () => client.setQueryData(["project-research", "actor", "p", "screening-round", "round"], { ...ready, status: "INCLUDED", canFinalize: false, finalDecision: { id: "final", version: 3, decision: "INCLUDED", source: "MANUAL", reason: "Đã đối chiếu phạm vi và đối tượng theo tiêu chí", resolverId: "actor", createdAt: "2026-10-29T02:00:00Z" } })); await settle();
  expect(container.textContent).toContain("Kết quả chính thức: Phù hợp");
  expect(container.textContent).not.toContain("Quyền thao tác đã thay đổi");
  expect(container.textContent).not.toContain("Xác nhận và lưu lịch sử");
});
it("blocks uncertain reviews from finalization in the UI", async () => {
  const uncertain = { ...round, status: "NEEDS_RESOLUTION" as const, canReview: false, canFinalize: true, hiddenReviews: false, completed: 2, unblindedAt: "2026-10-29T01:00:00Z", reviews: [{ id: "unsure", assignmentId: "peer", reviewerId: "peer", revision: 1, decision: "UNSURE" as const, exclusionReason: "", comment: "Need full text", submittedAt: "2026-10-29T01:00:00Z" }] };
  mocks.detail.mockResolvedValue(uncertain); mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0], round: uncertain }] });
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  expect(container.textContent).toContain("Còn phiếu chưa đủ thông tin");
  await fill("Lý do (ít nhất 10 ký tự)", "Thử chốt khi vẫn thiếu thông tin");
  await act(async () => [...container.querySelectorAll("label")].find(l => l.textContent?.startsWith("Tôi hiểu tác động"))!.querySelector<HTMLInputElement>("input")!.click());
  expect([...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Xác nhận và lưu lịch sử")!.disabled).toBe(true);
  expect(mocks.action).not.toHaveBeenCalled();
});

it("keeps a final decision draft visible when another person receives finalizer rights", async () => {
  const ready = { ...round, status: "AWAITING_FINALIZATION" as const, canReview: false, canFinalize: true, hiddenReviews: false, completed: 2, unblindedAt: "2026-10-29T01:00:00Z", reviews: [{ id: "v", assignmentId: "peer", reviewerId: "peer", revision: 1, decision: "INCLUDE" as const, exclusionReason: "", comment: "Matches", submittedAt: "2026-10-29T01:00:00Z" }] };
  mocks.detail.mockResolvedValue(ready); mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0], round: ready }] });
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  await fill("Lý do (ít nhất 10 ký tự)", "Bản nháp kết luận cần được giữ để sao chép");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "screening-round", "round"], { ...ready, version: 3, canFinalize: false, finalizer: { id: "peer", name: "Thành viên B" } })); await settle();
  expect([...container.querySelectorAll("textarea")].some(t => t.value === "Bản nháp kết luận cần được giữ để sao chép")).toBe(true);
  expect([...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Xác nhận và lưu lịch sử")!.disabled).toBe(true);
  expect(mocks.action).not.toHaveBeenCalled();
});
it("keeps proposal drafts accessible after edit access is revoked", async () => {
  const own = { ...board.items[0]!, canEditProposal: true };
  const ownBoard = { ...board, items: [own] }; mocks.board.mockResolvedValue(ownBoard);
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  await fill("Bài này liên quan câu hỏi nghiên cứu nào?", "Bản nháp lý do của tôi chưa được gửi");
  await act(async () => client.setQueryData(["project-research", "actor", "p", "screening-board", "", 1, "ALL", "", "", ""], { ...ownBoard, items: [{ ...own, canEditProposal: false }] })); await settle();
  expect([...container.querySelectorAll("textarea")].some(t => t.value === "Bản nháp lý do của tôi chưa được gửi")).toBe(true);
  expect([...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Lưu lý do đề xuất")!.disabled).toBe(true);
  expect(mocks.proposal).not.toHaveBeenCalled();
});
it("uses the saved proposal timestamp for the next edit without reporting a false conflict", async () => {
  const own = { ...board.items[0]!, canEditProposal: true };
  mocks.board.mockResolvedValue({ ...board, items: [own] });
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  const reason = "Bài cung cấp minh chứng cho câu hỏi nghiên cứu thứ hai";
  const savedAt = "2026-10-29T02:00:00.000Z";
  await fill("Bài này liên quan câu hỏi nghiên cứu nào?", reason);
  mocks.proposal.mockResolvedValue({ id: "link", updatedAt: savedAt });
  mocks.board.mockResolvedValue({ ...board, items: [{ ...own, proposalReason: reason, updatedAt: savedAt }] });
  await click("Lưu lý do đề xuất");
  expect(container.textContent).not.toContain("Tôi đã kiểm tra thay đổi, dùng phiên bản hiện tại");
  await fill("Bài này liên quan câu hỏi nghiên cứu nào?", `${reason}, đã đọc toàn văn`);
  await click("Lưu lý do đề xuất");
  expect(mocks.proposal).toHaveBeenLastCalledWith("p", "paper", expect.objectContaining({ expectedUpdatedAt: savedAt }));
});
it("retains a review draft when access was granted after the detail first opened", async () => {
  const unassigned = { ...round, canReview: false, myAssignmentId: null };
  mocks.detail.mockResolvedValue(unassigned); mocks.board.mockResolvedValue({ ...board, items: [{ ...board.items[0], round: unassigned }] });
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  const key = ["project-research", "actor", "p", "screening-round", "round"];
  await act(async () => client.setQueryData(key, round)); await settle();
  await fill("Giải thích", "Bản nháp sau khi tôi được phân công thêm");
  await act(async () => client.setQueryData(key, unassigned)); await settle();
  expect([...container.querySelectorAll("textarea")].some(t => t.value === "Bản nháp sau khi tôi được phân công thêm")).toBe(true);
  expect([...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Gửi và khóa phiếu")!.disabled).toBe(true);
});

it("separates legacy labels from current decisions and flags journal-like metadata without rewriting it", async () => {
  const legacy = { ...board.items[0]!, round: null, legacyStatus: "INCLUDED", legacyProvenance: true, title: "International Journal of Molecular Medicine", journalName: "International Journal of Molecular Medicine", doi: "10.3892/ijmm" };
  mocks.board.mockResolvedValue({ ...board, items: [legacy], progress: { total: 1, reviewed: 0, finalized: 0, legacy: 1 } });
  mocks.rounds.mockResolvedValue({ items: [], total: 0, page: 1, hasNext: false, legacy: { status: "INCLUDED" } });
  await render(<ScreeningWorkspace projectId="p" readOnly={false} />);
  expect(container.textContent).toContain("Đã có đánh giá: 0/1 bài");
  expect(container.textContent).toContain("Đã có quyết định cuối: 0/1 bài");
  expect(container.querySelector(".screening-paper .screening-state")?.textContent).toBe("Chưa có đánh giá");
  expect(container.textContent).toContain("Phân loại lịch sử: Phù hợp");
  expect(container.textContent).toContain("Tiêu đề trùng tên tạp chí");
  expect(container.querySelector('a[href="https://doi.org/10.3892%2Fijmm"]')).not.toBeNull();
  expect(container.querySelector('a[href="/papers/paper"]')).not.toBeNull();
  expect(mocks.action).not.toHaveBeenCalled();
});
