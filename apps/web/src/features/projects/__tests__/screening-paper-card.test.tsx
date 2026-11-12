// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScreeningAutomaticTask, ScreeningPersonalEvaluation, ScreeningWorkPaper, ScreeningWorkspaceSummary } from "@trend/shared-types";
import { MyWorkView } from "../components/my-work-view";
const mocks = vi.hoisted(() => ({ workspaceSummary: vi.fn(), extend: vi.fn(), release: vi.fn(), success: vi.fn() }));
vi.mock("../api/screening.api", () => ({ screeningApi: mocks }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn(), info: vi.fn() } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "a" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "vi", t: (key: string) => key }) }));
vi.mock("../components/screening-adjudication", () => ({ ScreeningAdjudicationDialog: ({ roundId, focusSection }: { roundId: string; focusSection: string }) => <div role="dialog">{roundId}/{focusSection}</div> }));
const card: ScreeningWorkPaper = {
  paperId: "paper", roundId: "round", title: "Actual research paper", authors: ["Author One"], publicationYear: 2023, journalName: "Research Journal",
  roundNumber: 1, phase: "TITLE_ABSTRACT", status: "IN_REVIEW", completed: 0, required: 2, hiddenReviews: true, reviews: [], acceptedForAnalysis: false, resolutionType: null, groupReason: null,
};
const ballot: ScreeningPersonalEvaluation = {
  ...card, myDecision: "INCLUDE", submittedAt: "2026-11-03T00:00:00Z", groupStatus: "WAITING_REVIEWER", finalDecision: null, isAdjudicated: false, resolverName: null, decidedAt: null,
};
const base: ScreeningWorkspaceSummary = {
  myActiveClaims: [], pendingConsensus: [], pendingAdjudications: [], pendingDiscussions: [], myEvaluations: [], workPapers: [card],
  myProposalsCount: 0, recentProposals: [], eligibleQueueCount: 0, nextEligiblePaperId: null,
  discoveryGoal: { enabled: false, target: 2, period: "WEEK", paused: false, currentCount: 0, remaining: 2 }, capacityAdvice: { queueStatus: "NORMAL", message: "" },
};
const claim = { ...card, assignmentId: "assignment", dueAt: "2026-11-04T00:00:00Z", expiresInSeconds: 86400, canExtend: true, canRelease: true };
let root: Root, container: HTMLDivElement, client: QueryClient, data: ScreeningWorkspaceSummary;
const openPaper = vi.fn();
async function settle(ms = 30) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function render() {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><MyWorkView projectId="project" readOnly={false} onOpenPaper={openPaper} onSwitchView={vi.fn()} /></MemoryRouter></QueryClientProvider>));
  await settle();
}
async function reviewed() { await act(async () => (container.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement).click()); }
function button(text: string) { return [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text))!; }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-03T00:00:00Z")); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks(); data = structuredClone(base);
  mocks.workspaceSummary.mockImplementation(async () => structuredClone(data));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("uses real submitted counts, ordered metadata and exact round navigation for an active claim", async () => {
  data.myActiveClaims = [claim]; await render();
  expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0');
  expect(container.querySelectorAll('[role="progressbar"] > span')).toHaveLength(2);
  const article = container.querySelector('article')!;
  const labels = ['Vòng 1', 'Đang đánh giá', card.title, 'Author One', '2023 · Research Journal', 'Tiến độ vòng đánh giá', 'Hạn phiếu đang giữ', 'Tiếp tục đánh giá'];
  const positions = labels.map(label => article.textContent!.indexOf(label));
  expect(positions.every((p, i) => p >= 0 && (!i || p > positions[i - 1]!))).toBe(true);
  await act(async () => button('Tiếp tục đánh giá').click());
  expect(openPaper).toHaveBeenCalledWith('paper', { roundId: 'round', section: 'review' });
  data.workPapers![0]!.completed = 1;
  await act(async () => { await client.invalidateQueries(); }); await settle();
  expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('1');
});
it("shows 1/2 and a waiting state without disclosing the peer's choice or a final outcome", async () => {
  data.myEvaluations = [ballot]; data.workPapers = [{ ...card, completed: 1, hiddenReviews: true, reviews: [{ reviewerId: 'b', name: 'Private peer', decision: 'EXCLUDE' }] }];
  await render(); await reviewed();
  expect(container.textContent).toContain('1/2 phiếu đã gửi');
  expect(container.textContent).toContain('Đánh giá của tôiPhù hợp');
  expect(container.textContent).toContain('Chờ đánh giá thứ hai');
  expect(container.textContent).not.toContain('Private peer');
  expect(container.textContent).not.toContain('Đã chọn cho phân tích');
});
it("shows two public choices on disagreements and opens the discussion section", async () => {
  data.myEvaluations = [{ ...ballot, groupStatus: 'CONFLICT' }];
  data.pendingDiscussions = [{ ...card, status: 'NEEDS_RESOLUTION', classification: 'CONFLICT' }];
  data.workPapers = [{ ...card, completed: 2, hiddenReviews: false, status: 'NEEDS_RESOLUTION', reviews: [{ reviewerId: 'a', name: 'Reviewer A', decision: 'INCLUDE' }, { reviewerId: 'b', name: 'Reviewer B', decision: 'EXCLUDE' }] }];
  await render();
  expect(container.textContent).toContain('2/2 phiếu đã gửi');
  expect(container.textContent).toContain('Reviewer BKhông phù hợp');
  expect(container.querySelector('.screening-paper-card-ballots-details')?.hasAttribute('open')).toBe(false);
  await act(async () => button('Thảo luận và giải quyết').click());
  expect(openPaper).toHaveBeenCalledWith('paper', { roundId: 'round', section: 'discussion' });
  data.workPapers[0]!.hiddenReviews = true;
  await act(async () => { await client.invalidateQueries(); }); await settle();
  expect(container.textContent).not.toContain('Reviewer B');
});
it("keeps unsure distinct from binary disagreement", async () => {
  data.myEvaluations = [{ ...ballot, myDecision: 'UNSURE', groupStatus: 'NEEDS_MORE_INFO' }];
  data.workPapers = [{ ...card, completed: 2, status: 'NEEDS_MORE_INFO' }];
  await render(); await reviewed();
  expect(container.textContent).toContain('Đánh giá của tôiCần xem xét thêm');
  expect(container.textContent).toContain('Cần làm rõ');
  expect(container.textContent).not.toContain('Cần giải quyết bất đồng');
  expect(container.querySelectorAll('[role="tab"]')[0]?.textContent).toBe('Cần xử lý0');
});
it("keeps clarification amber on actionable and evaluated cards and retains the same tone in read-only mode", async () => {
  data.myEvaluations = [{ ...ballot, myDecision: 'UNSURE', groupStatus: 'NEEDS_MORE_INFO' }];
  data.pendingDiscussions = [{ ...card, status: 'NEEDS_RESOLUTION', classification: 'NEEDS_CLARIFICATION' }];
  data.workPapers = [{ ...card, completed: 2, status: 'NEEDS_RESOLUTION', hiddenReviews: false, reviews: [{ reviewerId: 'a', name: 'A', decision: 'UNSURE' }, { reviewerId: 'b', name: 'B', decision: 'INCLUDE' }] }];
  await render();
  expect(container.querySelector('.screening-paper-card-status')?.getAttribute('data-tone')).toBe('warning');
  expect(container.querySelector('.screening-paper-card-next-step')?.textContent).toContain('Đối chiếu nguồn, bổ sung căn cứ hoặc cập nhật đánh giá của bạn.');
  expect(container.querySelectorAll('.screening-paper-card-status')).toHaveLength(1);
  expect(container.querySelector('.screening-task-callout')).toBeNull();
  await reviewed();
  expect(container.querySelector('.screening-paper-card-status')?.getAttribute('data-tone')).toBe('warning');
  expect(container.querySelector('dl > div:last-child dd')?.getAttribute('data-tone')).toBe('warning');
  data.readOnly = true;
  await act(async () => { await client.invalidateQueries(); }); await settle();
  expect(container.querySelector('.screening-paper-card-status')?.getAttribute('data-tone')).toBe('warning');
});
it("does not infer clarification color from hidden peer ballots", async () => {
  data.myEvaluations = [ballot];
  data.workPapers = [{ ...card, completed: 1, hiddenReviews: true, reviews: [{ reviewerId: 'b', name: 'Hidden B', decision: 'UNSURE' }] }];
  await render(); await reviewed();
  expect(container.querySelector('.screening-paper-card-status')?.getAttribute('data-tone')).toBe('neutral');
  expect(container.textContent).not.toContain('Hidden B');
});
it.each([
  [false, 'TITLE_ABSTRACT', 1, 'Qua vòng 1'],
  [false, 'FULL_TEXT', 2, 'Qua vòng 2'],
  [true, 'FULL_TEXT', 2, 'Đã chọn cho phân tích'],
  [true, 'TITLE_ABSTRACT', 1, 'Đã chọn cho phân tích'],
] as const)("uses protocol acceptance %s at %s without inventing a final selection", async (acceptedForAnalysis, phase, roundNumber, expected) => {
  data.myEvaluations = [{ ...ballot, groupStatus: 'INCLUDED' }];
  data.workPapers = [{ ...card, status: 'INCLUDED', phase, roundNumber, completed: 2, acceptedForAnalysis }];
  await render(); await reviewed();
  expect(container.querySelector('.screening-paper-card-status')?.textContent).toContain(expected);
  expect(container.textContent).not.toContain('chấp nhận cuối cùng');
});
it("keeps my ballot intact after exclusion and bounds the reason on the card", async () => {
  data.myEvaluations = [{ ...ballot, groupStatus: 'EXCLUDED', isAdjudicated: true }];
  data.workPapers = [{ ...card, status: 'EXCLUDED', completed: 2, resolutionType: 'ADJUDICATION', groupReason: 'Long sourced rationale. '.repeat(500) }];
  await render(); await reviewed();
  expect(container.textContent).toContain('Đánh giá của tôiPhù hợp');
  expect(container.textContent).toContain('Kết quả của nhómĐã loại');
  expect(container.textContent).toContain('Quyết định sau phân xử');
  expect(container.querySelector('.screening-paper-card-reason')).not.toBeNull();
});
it("opens the assigned case directly and removes completed statements from actionable work", async () => {
  data.pendingAdjudications = [{ ...card, status: 'ADJUDICATING', caseStatus: 'ASSIGNED' }];
  await render();
  await act(async () => button('Đưa ra kết luận').click());
  expect(container.querySelector('[role="dialog"]')?.textContent).toBe('round/decision');
});
it.each([
  ['COLLECTING', 'Đang thu thập ý kiến'], ['WAITING_ASSIGNMENT', 'Chờ phân công'],
  ['ASSIGNED', 'Đã phân công'], ['IN_PROGRESS', 'Đang phân xử'], ['NEEDS_MORE_INFO', 'Cần bổ sung thông tin'],
])("shows the actual %s case state to a reviewer who has no action left", async (caseStatus, expected) => {
  data.myEvaluations = [{ ...ballot, groupStatus: 'ADJUDICATING', caseStatus }];
  data.workPapers = [{ ...card, status: 'ADJUDICATING', completed: 2 }];
  await render(); await reviewed();
  expect(container.querySelector('.screening-paper-card-status')?.textContent).toContain(expected);
  expect(container.textContent).not.toContain('Đưa ra kết luận');
  expect(container.querySelectorAll('[role="tab"]')[0]?.textContent).toBe('Cần xử lý0');
});
it("uses backend deadlines for countdown, refreshes on expiry and removes the claim and counter", async () => {
  data.myActiveClaims = [{ ...claim, dueAt: '2026-11-03T00:00:02Z', expiresInSeconds: 99999 }];
  await render();
  expect(container.textContent).toContain('00:00:02');
  await settle(2100);
  expect(container.querySelector('article')).toBeNull();
  expect(container.querySelector('[role="tab"]')?.textContent).toBe('Cần xử lý0');
  expect(mocks.workspaceSummary.mock.calls.length).toBeGreaterThan(1);
});
it("refreshes claim operations through the shared cache and reports failed extensions", async () => {
  data.myActiveClaims = [claim];
  mocks.extend.mockImplementationOnce(async () => { data.myActiveClaims[0]!.dueAt = '2026-11-05T00:00:00Z'; return {}; });
  await render();
  await act(async () => button('Gia hạn +24h').click()); await settle();
  expect(container.textContent).toContain('48:00:00');
  expect(mocks.extend).toHaveBeenCalledWith('project', 'round', { clientKey: expect.any(String) });
  mocks.extend.mockRejectedValueOnce(new Error('Network failed'));
  await act(async () => button('Gia hạn +24h').click()); await settle();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(mocks.success).toHaveBeenCalledTimes(1);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  mocks.release.mockImplementationOnce(async () => { data.myActiveClaims = []; return {}; });
  await act(async () => button('Trả lại hàng đợi').click()); await settle();
  expect(container.querySelector('article')).toBeNull();
});
it("omits missing metadata without separators", async () => {
  data.myActiveClaims = [claim]; data.workPapers = [{ ...card, authors: [], publicationYear: null, journalName: null }];
  await render();
  expect(container.querySelector('.screening-paper-card-authors')).toBeNull();
  expect(container.querySelector('.screening-paper-card-metadata')).toBeNull();
});

it("keeps a long author list available behind a collapsed disclosure", async () => {
  data.myActiveClaims = [claim];
  data.workPapers = [{ ...card, authors: ['Author One', 'Author Two', 'Author Three', 'Author Four', 'Author Five'] }];
  await render();
  const disclosure = container.querySelector('details.screening-paper-card-authors')!;
  expect(disclosure.hasAttribute('open')).toBe(false);
  expect(disclosure.querySelector('summary')?.textContent).toContain('Author One, Author Two +3 tác giả');
  expect(disclosure.querySelector('p')?.textContent).toContain('Author Five');
  expect(container.querySelectorAll('.screening-paper-card-status')).toHaveLength(1);
  expect(container.textContent).not.toContain('Yêu cầu xử lý');
  expect(container.textContent).not.toContain('Cần bạn thực hiện');
});

it("prioritizes the statement task over underlying clarification in its instruction and action", async () => {
  data.workPapers = [{ ...card, status: 'NEEDS_MORE_INFO', completed: 2 }];
  data.myTrackedDisputes = [{ ...card, status: 'ADJUDICATING', caseStatus: 'COLLECTING', myDecision: 'UNSURE', needsMyStatement: true, deadline: '2026-11-05T00:00:00Z' }];
  await render();
  expect(container.querySelector('.screening-paper-card-next-step')?.textContent).toContain('Gửi quan điểm riêng và căn cứ của bạn trước hạn chung.');
  expect(container.textContent).not.toContain('Đối chiếu nguồn');
  await act(async () => button('Bổ sung quan điểm').click());
  expect(container.querySelector('[role="dialog"]')?.textContent).toBe('round/statement');
});

it("filters automatic work by its action kind and protocol classification instead of translated labels", async () => {
  const obligation = (id: string, actionType: ScreeningAutomaticTask['actionType']): ScreeningAutomaticTask => ({
    id, paperId: id, roundId: `${id}-round`, assigneeId: 'a', actionType, status: 'TODO',
    title: `Study ${id}`, reason: 'Backend instruction', phase: 'TITLE_ABSTRACT', roundNumber: 1,
    roundStatus: 'NEEDS_RESOLUTION', roundActive: true, dueAt: null, endedAt: null, updatedAt: '2026-11-03T00:00:00Z',
  });
  data.automaticTasks = [obligation('clarify', 'DISCUSSION'), obligation('opinion', 'STATEMENT')];
  data.pendingDiscussions = [{ paperId: 'clarify', roundId: 'clarify-round', title: 'Study clarify', status: 'NEEDS_RESOLUTION', classification: 'NEEDS_CLARIFICATION' }];
  await render();
  await act(async () => button('Làm rõ đánh giá1').click());
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.querySelector('.screening-paper-card-status')?.textContent).toContain('Cần làm rõ');
  expect(container.querySelector('article h4')?.textContent).toBe('Study clarify');
  await act(async () => button('Gửi quan điểm1').click());
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.querySelector('article h4')?.textContent).toBe('Study opinion');
  expect(container.querySelector('.screening-paper-card-status')?.textContent).toContain('Cần gửi quan điểm phân xử');
});
