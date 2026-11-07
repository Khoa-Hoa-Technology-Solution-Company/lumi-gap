// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScreeningWorkspaceSummary } from "@trend/shared-types";
import { MyWorkView } from "../components/my-work-view";
const mocks = vi.hoisted(() => ({ workspaceSummary: vi.fn() }));
vi.mock("../api/screening.api", () => ({ screeningApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "reviewer" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "vi", t: (key: string) => key }) }));
vi.mock("../components/screening-adjudication", () => ({ ScreeningAdjudicationDialog: ({ roundId, projectId }: { roundId: string; projectId: string }) => <div role="dialog">Ý kiến riêng: {projectId}/{roundId}</div> }));
const summary: ScreeningWorkspaceSummary = {
  myActiveClaims: [], pendingConsensus: [], pendingAdjudications: [], pendingDiscussions: [],
  myTrackedDisputes: [
    { paperId: "done", roundId: "done-round", title: "Already submitted", phase: "TITLE_ABSTRACT", status: "ADJUDICATING", caseStatus: "COLLECTING", myDecision: "INCLUDE", needsMyStatement: false },
    { paperId: "pending", roundId: "pending-round", title: "Study awaiting my opinion", phase: "TITLE_ABSTRACT", status: "ADJUDICATING", caseStatus: "COLLECTING", myDecision: "EXCLUDE", needsMyStatement: true, deadline: "2026-11-04T07:00:00Z" },
  ],
  myProposalsCount: 0, recentProposals: [], eligibleQueueCount: 0, nextEligiblePaperId: null,
  discoveryGoal: { enabled: false, target: 2, period: "WEEK", paused: false, currentCount: 0, remaining: 2 },
  capacityAdvice: { queueStatus: "NORMAL", message: "Theo dõi tiến độ" },
};
let root: Root, container: HTMLDivElement, client: QueryClient;
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
async function render(data = summary, readOnly = false) {
  mocks.workspaceSummary.mockResolvedValue(data);
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><MyWorkView projectId="project" readOnly={readOnly} onOpenPaper={vi.fn()} onSwitchView={vi.fn()} /></MemoryRouter></QueryClientProvider>));
  await settle();
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });
it("highlights missing opinions, prioritizes them and opens the correct dossier", async () => {
  await render({ ...summary, pendingDiscussions: [{ paperId: "pending", roundId: "pending-round", title: "Duplicate discussion", status: "ADJUDICATING" }] });
  const reminder = container.querySelector('[aria-label="Ý kiến phân xử cần gửi"]')!;
  expect(reminder.textContent).toContain("Cần gửi quan điểm phân xử");
  expect(reminder.textContent).toContain("Hạn gửi quan điểm");
  expect(reminder.textContent).toContain("Study awaiting my opinion");
  expect(container.textContent).not.toContain("Duplicate discussion");
  await act(async () => reminder.querySelector("button")!.click());
  expect(container.querySelector('[role="dialog"]')?.textContent).toContain("project/pending-round");
});
it("counts only actions waiting for me and removes passive adjudication dossiers", async () => {
  await render();
  const tabs = [...container.querySelectorAll('[role="tab"]')];
  expect(tabs.map(t => t.textContent)).toEqual(["Cần xử lý1", "Đã đánh giá0", "Bài được chấp nhận0"]);
  expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
  expect(container.textContent).toContain("Study awaiting my opinion");
  expect(container.textContent).not.toContain("Already submitted");
});
it("removes the reminder after refreshed submission state and suppresses it in read-only projects", async () => {
  await render();
  await act(async () => { client.setQueriesData({ queryKey: ["project-research", "reviewer", "project"] }, { ...summary, myTrackedDisputes: summary.myTrackedDisputes!.map(t => ({ ...t, needsMyStatement: false })) }); });
  await settle();
  expect(container.querySelector('[aria-label="Ý kiến phân xử cần gửi"]')).toBeNull();
  await render(summary, true);
  expect(container.textContent).not.toContain("Nhập ý kiến ngay");
});

function evaluation(paperId: string, groupStatus: NonNullable<ScreeningWorkspaceSummary["myEvaluations"]>[number]["groupStatus"] = "WAITING_REVIEWER") {
  return { paperId, roundId: `${paperId}-round`, title: `Study ${paperId}`, phase: "TITLE_ABSTRACT" as const, publicationYear: 2025, journalName: null, myDecision: "INCLUDE" as const, submittedAt: "2026-11-02T09:00:00Z", groupStatus, finalDecision: null, isAdjudicated: false, resolverName: null, decidedAt: null };
}
async function reviewed() { await act(async () => (container.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement).click()); }
it("keeps a personal include ballot distinct from team exclusion after adjudication", async () => {
  await render({ ...summary, myTrackedDisputes: [], myEvaluations: [{ ...evaluation("final", "EXCLUDED"), finalDecision: "EXCLUDED", isAdjudicated: true, resolverName: "Independent C" }] });
  expect(container.textContent).not.toContain("Study final");
  await reviewed();
  const row = container.querySelector('article')!;
  expect(row.textContent).toContain("Đánh giá của tôiPhù hợp");
  expect(row.textContent).toContain("Kết quả của nhómĐã loạiQuyết định sau phân xử");
  expect(row.textContent).toContain("Independent C");
});
it.each(["WAITING_REVIEWER", "CONFLICT", "ADJUDICATING", "INCLUDED", "EXCLUDED"] as const)("filters reviewed papers by team status %s without changing tab counters", async status => {
  const all = ["WAITING_REVIEWER", "CONFLICT", "ADJUDICATING", "INCLUDED", "EXCLUDED"] as const;
  await render({ ...summary, myTrackedDisputes: [], myEvaluations: all.map(s => evaluation(s, s)) });
  await reviewed();
  const filter = container.querySelector('select')!;
  await act(async () => { filter.value = status; filter.dispatchEvent(new Event("change", { bubbles: true })); });
  expect([...container.querySelectorAll('article h4')].map(h => h.textContent)).toEqual([`Study ${status}`]);
  expect(container.querySelectorAll('[role="tab"]')[1]?.textContent).toBe("Đã đánh giá5");
});
it("counts one paper across screening phases and retains earlier ballots", async () => {
  const first = evaluation("same", "INCLUDED");
  const later = { ...first, roundId: "full-text", phase: "FULL_TEXT" as const, submittedAt: "2026-11-03T09:00:00Z", groupStatus: "CONFLICT" as const, myDecision: "EXCLUDE" as const };
  await render({ ...summary, myTrackedDisputes: [], myEvaluations: [first, later] });
  await reviewed();
  expect(container.querySelectorAll('[role="tab"]')[1]?.textContent).toBe("Đã đánh giá1");
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.querySelector('article')?.textContent).toContain("Các vòng đã đánh giá trước (1)");
  expect(container.querySelector('article dl')?.textContent).toContain("Không phù hợp");
  expect(container.querySelector('article details')?.textContent).toContain("Phù hợp");
});

it("shows project acceptance separately from my ballot and supports search and opening the paper", async () => {
  const own = { ...evaluation("accepted", "INCLUDED"), myDecision: "EXCLUDE" as const, isAdjudicated: true, acceptedForAnalysis: true };
  const accepted = { paperId: "accepted", roundId: own.roundId, title: own.title, phase: own.phase, publicationYear: 2025, journalName: null, acceptedAt: own.submittedAt, isAdjudicated: true, resolverName: "Independent C" };
  await render({ ...summary, myTrackedDisputes: [], myEvaluations: [own, evaluation("waiting")], acceptedPapers: [accepted] });
  const tabs = container.querySelectorAll('[role="tab"]');
  expect([...tabs].map(t => t.textContent)).toEqual(["Cần xử lý0", "Đã đánh giá2", "Bài được chấp nhận1"]);
  await reviewed();
  expect(container.querySelectorAll('article')).toHaveLength(2);
  const reviewedPaper = [...container.querySelectorAll('article')].find(row => row.textContent?.includes("Study accepted"))!;
  expect(reviewedPaper.textContent).toContain("Đánh giá của tôiKhông phù hợp");
  expect(reviewedPaper.textContent).toContain("Kết quả của nhómĐã chọn cho phân tíchQuyết định sau phân xử");
  await act(async () => (tabs[2] as HTMLButtonElement).click());
  expect(container.querySelector('select')).toBeNull();
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.textContent).toContain("Đánh giá của tôiKhông phù hợp");
  expect(container.textContent).toContain("Kết quả của nhómĐã chọn cho phân tíchQuyết định sau phân xử");
  expect(container.textContent).not.toContain("Study waiting");
  const search = container.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "missing");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.querySelectorAll('article')).toHaveLength(0);
  expect(tabs[2]?.textContent).toBe("Bài được chấp nhận1");
});

it("uses all three tabs for keyboard navigation and shows the accepted empty state", async () => {
  await render();
  const tabs = container.querySelectorAll('[role="tab"]');
  await act(async () => tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(tabs[2]!.getAttribute("aria-selected")).toBe("true");
  expect(container.textContent).toContain("Chưa có bài được chấp nhận");
  await act(async () => tabs[2]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
});

it("filters actionable statements without reintroducing passive dossiers", async () => {
  const activeClaim = { paperId: "claim", roundId: "claim-round", title: "A claimed study", publicationYear: null, phase: "TITLE_ABSTRACT" as const, status: "IN_REVIEW", assignmentId: "assignment", dueAt: "2099-11-04T07:00:00Z", expiresInSeconds: 86400, canExtend: false, canRelease: false };
  await render({ ...summary, myActiveClaims: [activeClaim] });
  expect(container.querySelectorAll('article')).toHaveLength(2);
  const todoFilter = container.querySelector('[role="group"][aria-label="Lọc việc cần xử lý"]')!;
  expect(todoFilter).not.toBeNull();
  expect(container.querySelector('select[aria-label="Lọc việc cần xử lý"]')).toBeNull();
  const statement = [...todoFilter.querySelectorAll('button')].find(b => b.textContent?.includes('Gửi quan điểm'))!;
  await act(async () => statement.click());
  expect(statement.getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.textContent).toContain("Study awaiting my opinion");
  expect(container.textContent).not.toContain("Already submitted");
  await act(async () => { client.setQueriesData({ queryKey: ["project-research", "reviewer", "project"] }, { ...summary, myActiveClaims: [activeClaim], myTrackedDisputes: [] }); });
  await settle();
  expect(container.querySelectorAll('article')).toHaveLength(0);
  const reset = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Lọc việc cần xử lý"] button')].find(b => b.textContent?.includes('Tất cả'))!;
  expect(reset).toBeDefined();
  await act(async () => reset.click());
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.textContent).toContain('A claimed study');
});

it("omits unnecessary category filters when there is only one kind of work", async () => {
  await render();
  expect(container.querySelector('[aria-label="Lọc việc cần xử lý"]')).toBeNull();
});
