// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScreeningBoard, ScreeningPaperRow } from "@trend/shared-types";
import { ScreeningQueueView } from "../components/screening-queue-view";
import { MyWorkView } from "../components/my-work-view";
const api = vi.hoisted(() => ({ board: vi.fn(), claim: vi.fn(), claimNext: vi.fn(), workspaceSummary: vi.fn(), success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("../api/screening.api", () => ({ screeningApi: api }));
vi.mock("sonner", () => ({ toast: { success: api.success, info: api.info, error: api.error } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: any) => select({ user: { id: "viewer" } }) }));
vi.mock("@/i18n", async () => {
  const { screeningQueueVi } = await import("@/i18n/locales/screening-queue");
  return { useI18n: () => ({ language: "vi", t: (key: string, values: Record<string, unknown> = {}) => (screeningQueueVi[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? "")) }) };
});
let root: Root, container: HTMLDivElement, client: QueryClient;
const open = vi.fn();
function paper(assigned = 0, completed = 0): ScreeningPaperRow {
  return { paperId: "p1", title: "Medical retrieval research", doi: "10.1000/queue", authors: ["Nguyen A"], publicationYear: 2025, journalName: "Medical Journal", abstractText: "A transparent research method.", proposer: null,
    proposedAt: new Date().toISOString(), proposalReason: "Important rationale ".repeat(200), updatedAt: new Date().toISOString(), canEditProposal: false, legacyStatus: "UNDECIDED", legacyProvenance: false,
    round: { id: "r1", paperId: "p1", number: 1, phase: "TITLE_ABSTRACT", version: 1, status: assigned ? "IN_REVIEW" : "NOT_REVIEWED", active: true,
      settings: { requiredReviewers: 2, reviewMode: "INDEPENDENT", version: 1, inclusionCriteria: [], exclusionCriteria: [], researchQuestions: [], aiAssisted: false, blindReview: true, consensusPolicy: "UNANIMOUS", resolutionPolicy: "CONSENSUS" },
      assigned, completed, hiddenReviews: true, reviews: [], assignments: [], myReview: null, myAssignmentId: null, unblindedAt: null, independenceCompromised: false, finalDecision: null, canClaim: true, canReview: false, canManage: false, canFinalize: false, aiVisible: false, finalizer: { id: "owner", name: "Owner" } } };
}
function board(items = [paper()]): ScreeningBoard {
  return { items, total: items.length, page: 1, pageSize: 12, hasNext: false, queueSummary: { available: items.length, unclaimed: items.filter(p => !p.round!.assigned).length, lastSlot: items.filter(p => p.round!.assigned === 1).length, awaitingSecondReview: items.filter(p => p.round!.completed === 1).length },
    settings: paper().round!.settings, people: [], canManage: false, filters: { proposers: [], reviewers: [] }, progress: { total: items.length, reviewed: 0, finalized: 0, legacy: 0 }, myProgress: { assigned: 0, completed: 0, pending: 0, overdue: 0 } };
}
const reply = { paperId: "p1", roundId: "r1", assignmentId: "a1", dueAt: new Date(Date.now() + 86400000).toISOString() };
async function settle(ms = 30) { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); }
async function render(readOnly = false) { await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><ScreeningQueueView projectId="project" readOnly={readOnly} onOpenPaper={open} /></MemoryRouter></QueryClientProvider>)); await settle(); }
function button(label: string) { return [...container.querySelectorAll<HTMLButtonElement>('button')].find(x => x.textContent === label)!; }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.board.mockResolvedValue(board()); api.claim.mockResolvedValue(reply); api.claimNext.mockResolvedValue(reply);
  api.workspaceSummary.mockResolvedValue({ myActiveClaims: [], pendingConsensus: [], pendingAdjudications: [], myEvaluations: [], eligibleQueueCount: 1 });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });
it.each([[0, 0], [1, 0], [1, 1]])("separates %i occupied slots from %i submitted reviews", async (occupied, submitted) => {
  api.board.mockResolvedValue(board([paper(occupied, submitted)])); await render();
  expect(container.textContent).toContain(`${occupied}/2 suất đã nhận`);
  expect(container.textContent).toContain(`${submitted}/2 phiếu đã gửi`);
  expect(container.textContent).toContain(`Còn ${2 - occupied} suất`);
  expect(container.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe(String(submitted));
});
it("opens a preview of the exact round without claiming", async () => {
  await render(); await act(async () => button("Xem trước").click());
  expect(open).toHaveBeenCalledWith("p1", { roundId: "r1", section: "source" });
  expect(api.claim).not.toHaveBeenCalled(); expect(api.claimNext).not.toHaveBeenCalled();
});
it("claims once, refreshes My Work and opens the canonical reader review section", async () => {
  let resolve!: (value: typeof reply) => void;
  api.claim.mockImplementation(() => new Promise(done => { resolve = done; }));
  const summaryKey = ["project-research", "viewer", "project", "screening-workspace-summary"];
  const refreshSummary = vi.fn().mockResolvedValue({ pending: 1 });
  const observer = new QueryObserver(client, { queryKey: summaryKey, queryFn: refreshSummary, initialData: { pending: 0 }, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  await render(); await act(async () => { button("Nhận đánh giá").click(); });
  expect(api.claim).toHaveBeenCalledOnce(); expect(api.claim.mock.calls[0]![2].clientKey).toMatch(/^[0-9a-f-]{36}$/);
  await act(async () => resolve({ ...reply, paperId: "canonical-paper", roundId: "canonical-round" })); await settle();
  expect(open).toHaveBeenCalledWith("canonical-paper", { roundId: "canonical-round", section: "review" });
  expect(refreshSummary).toHaveBeenCalledOnce(); expect(observer.getCurrentResult().data).toEqual({ pending: 1 });
  expect(api.success).toHaveBeenCalled(); unsubscribe();
});
it("refreshes after losing the final slot and preserves the search context", async () => {
  api.claim.mockRejectedValue({ isAxiosError: true, response: { status: 409 } }); await render();
  api.board.mockResolvedValue(board([]));
  await act(async () => button("Nhận đánh giá").click()); await settle();
  expect(api.board.mock.calls.length).toBeGreaterThan(1); expect(open).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')!.textContent).toContain("Suất vừa được người khác nhận");
  expect(container.querySelector('input[type="search"]')).not.toBeNull();
});
it("debounces and bounds search then sends the slot filter to the server", async () => {
  await render(); const input = container.querySelector('input')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Nguyen"); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await settle(300); expect(api.board).toHaveBeenLastCalledWith("project", expect.objectContaining({ q: "Nguyen", page: 1 }));
  const last = container.querySelector<HTMLButtonElement>('button[aria-pressed="false"]:last-child')!;
  await act(async () => last.click()); await settle();
  expect(api.board).toHaveBeenLastCalledWith("project", expect.objectContaining({ slots: "LAST_SLOT" }));
  expect(input.maxLength).toBe(200);
});
it("keeps the global claim-next action available when a search has no matches", async () => {
  api.board.mockResolvedValue({ ...board([]), queueSummary: { available: 3, unclaimed: 1, lastSlot: 2, awaitingSecondReview: 1 } });
  await render(); await act(async () => button("Nhận bài tiếp theo").click()); await settle();
  expect(api.claimNext).toHaveBeenCalledWith("project", { clientKey: expect.any(String) });
  expect(open).toHaveBeenCalledWith("p1", { roundId: "r1", section: "review" });
});
it("clamps the page after the final result on a later page disappears", async () => {
  api.board.mockImplementation(async (_id, query) => query.page === 1 ? { ...board(), hasNext: true, total: 13 } : { ...board([]), page: 2, total: 1 });
  await render(); await act(async () => button("Trang sau").click()); await settle(); await settle();
  expect(api.board).toHaveBeenLastCalledWith("project", expect.objectContaining({ page: 1 }));
});
it("hides full/finalized cards and never offers mutation controls in read-only mode", async () => {
  const full = paper(2, 1); api.board.mockResolvedValue(board([full])); await render();
  expect(container.querySelector('article')).toBeNull();
  api.board.mockResolvedValue(board()); await client.invalidateQueries(); await render(true);
  expect(button("Nhận đánh giá")).toBeUndefined(); expect(button("Nhận bài tiếp theo")).toBeUndefined();
});
it("omits missing metadata and contains long proposal reasons without HTML injection", async () => {
  const item = paper(); item.authors = []; item.journalName = null; item.publicationYear = 0; item.proposalReason = '<script>unsafe()</script>' + 'reason '.repeat(1000);
  api.board.mockResolvedValue(board([item])); await render();
  expect(container.querySelector('.screening-paper-card-meta')).toBeNull(); expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('.queue-proposal-reason')!.textContent).toContain('<script>unsafe()</script>');
});
it("uses the same canonical claim navigation and idempotency key from My Work", async () => {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><MyWorkView projectId="project" readOnly={false} onOpenPaper={open} onSwitchView={vi.fn()} /></MemoryRouter></QueryClientProvider>)); await settle();
  await act(async () => button("Nhận bài tiếp theo").click()); await settle();
  expect(api.claimNext).toHaveBeenCalledWith("project", { clientKey: expect.any(String) });
  expect(open).toHaveBeenCalledWith("p1", { roundId: "r1", section: "review" });
});
