// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScreeningPersonalEvaluation, ScreeningWorkspaceSummary } from "@trend/shared-types";
import { ScreeningTasksPanel } from "../components/screening-tasks-panel";
import { WorkspaceTasksPanel } from "../components/workspace-tasks";
const mocks = vi.hoisted(() => ({ workspaceSummary: vi.fn() }));
vi.mock("../api/screening.api", () => ({ screeningApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "reviewer" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "vi", t: (key: string) => key }) }));
vi.mock("../components/screening-adjudication", () => ({ ScreeningAdjudicationDialog: ({ roundId, focusSection }: { roundId: string; focusSection?: string }) => <div role="dialog">{roundId}/{focusSection}</div> }));
vi.mock("../components/workspace-task-board", () => ({ TaskBoardView: () => <div>Existing team board</div> }));
const own: ScreeningPersonalEvaluation = { paperId: "conflict", roundId: "conflict-round", title: "Disputed study", phase: "TITLE_ABSTRACT", publicationYear: 2025, journalName: null, myDecision: "INCLUDE", submittedAt: "2026-11-01T09:00:00Z", groupStatus: "ADJUDICATING", finalDecision: null, isAdjudicated: false, resolverName: null, decidedAt: null };
const summary: ScreeningWorkspaceSummary = {
  myActiveClaims: [{ paperId: "claimed", roundId: "claimed-round", title: "Unfinished review", assignmentId: "a", publicationYear: 2024, phase: "TITLE_ABSTRACT", dueAt: null, expiresInSeconds: null, canExtend: false, canRelease: true }],
  pendingConsensus: [], pendingDiscussions: [], pendingAdjudications: [{ paperId: "third", roundId: "third-round", title: "Assigned case", status: "ADJUDICATING", caseStatus: "ASSIGNED" }],
  myTrackedDisputes: [{ ...own, status: "ADJUDICATING", caseStatus: "COLLECTING", needsMyStatement: true }],
  myEvaluations: [own], myProposalsCount: 0, recentProposals: [], eligibleQueueCount: 0, nextEligiblePaperId: null,
  discoveryGoal: { enabled: false, target: 2, period: "WEEK", paused: false, currentCount: 0, remaining: 2 }, capacityAdvice: { queueStatus: "NORMAL", message: "" },
};
let root: Root, container: HTMLDivElement, client: QueryClient;
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); }
async function render(url = "/projects/project?tab=tasks", full = false) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}>{full ? <WorkspaceTasksPanel projectId="project" readOnly={false} /> : <ScreeningTasksPanel projectId="project" readOnly={false} />}</MemoryRouter></QueryClientProvider>));
  await settle();
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.workspaceSummary.mockResolvedValue(summary);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });
it("groups real actions, counts submitted ballots separately and links to the precise round and section", async () => {
  await render();
  expect([...container.querySelectorAll('[role="tab"]')].map(el => el.textContent)).toEqual(["Cần xử lý3", "Đã đánh giá1"]);
  expect(container.querySelector('[role="tab"]')?.getAttribute("aria-selected")).toBe("true");
  const review = container.querySelector('[aria-label="Đang đánh giá"]')!;
  const resolution = container.querySelector('[aria-label="Cần giải quyết"]')!;
  const adjudication = container.querySelector('[aria-label="Cần tôi phân xử"]')!;
  expect(review.textContent).toContain("Unfinished review");
  expect(resolution.textContent).toContain("Disputed study");
  expect(adjudication.textContent).toContain("Assigned case");
  expect(review.querySelector('a')?.getAttribute("href")).toContain("round=claimed-round&paper=claimed&section=review");
  expect(resolution.querySelector('a')?.getAttribute("href")).toContain("screeningRound=conflict-round&screeningPaper=conflict&screeningSection=statement");
  expect(adjudication.querySelector('a')?.getAttribute("href")).toContain("screeningSection=decision");
});
it("removes my action after my statement while retaining the ballot in reviewed history", async () => {
  await render();
  await act(async () => { client.setQueriesData({ queryKey: ["project-research", "reviewer", "project"] }, { ...summary, myTrackedDisputes: summary.myTrackedDisputes!.map(t => ({ ...t, needsMyStatement: false })) }); });
  await settle();
  expect(container.querySelector('[role="tab"]')?.textContent).toBe("Cần xử lý2");
  expect(container.querySelector('[aria-label="Cần giải quyết"]')?.textContent).not.toContain("Disputed study");
  await act(async () => (container.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement).click());
  expect(container.textContent).toContain("Disputed study");
  expect(container.textContent).toContain("Đánh giá của tôiPhù hợp");
  expect(container.textContent).toContain("Đang thu thập ý kiến");
});
it("filters outcomes while preserving my vote and shows the adjudicator's reason", async () => {
  const final = { ...own, paperId: "final", roundId: "final-round", title: "Final study", groupStatus: "EXCLUDED", isAdjudicated: true, finalDecision: "EXCLUDED", resolverName: "Independent C", groupReason: "Population fails the registered inclusion criteria" };
  mocks.workspaceSummary.mockResolvedValue({ ...summary, myEvaluations: [own, final] });
  await render("/projects/project?tab=tasks&screeningTab=reviewed&screeningHistory=DECIDED");
  expect(container.textContent).toContain("Final study");
  expect(container.textContent).not.toContain("Disputed study");
  expect(container.textContent).toContain("Đánh giá của tôiPhù hợp");
  expect(container.textContent).toContain("Kết quả của nhómĐã loạiQuyết định sau phân xử");
  expect(container.textContent).toContain("Independent C");
  expect(container.querySelector(".screening-paper-card-reason")?.textContent).toContain(final.groupReason);
  expect(container.querySelectorAll('[role="tab"]')[1]?.textContent).toBe("Đã đánh giá2");
  const select = container.querySelector("select")!;
  await act(async () => { select.value = "PENDING"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.textContent).toContain("Disputed study"); expect(container.textContent).not.toContain("Final study");
});
it("restores a directly opened adjudication statement URL", async () => {
  await render("/projects/project?tab=tasks&view=screening&screeningRound=conflict-round&screeningSection=statement");
  expect(container.querySelector('[role="dialog"]')?.textContent).toBe("conflict-round/statement");
});
it("opens the team board by default, including old screening links, without a separate screening section", async () => {
  await render("/projects/project?tab=tasks&view=screening&screeningTab=pending", true);
  expect(container.textContent).not.toContain("Đánh giá tài liệu");
  expect(container.textContent).toContain("Existing team board");
  const board = [...container.querySelectorAll(".task-section-nav button")].find(button => button.textContent === "Team tasks") as HTMLButtonElement;
  await act(async () => board.click()); await settle();
  expect(container.textContent).toContain("Existing team board");
  expect(container.querySelector('[aria-label="Đánh giá tài liệu"]')).toBeNull();
});
it("keeps case links functional from the integrated team board", async () => {
  await render("/projects/project?tab=tasks&view=screening&screeningRound=conflict-round&screeningSection=statement", true);
  expect(container.querySelector('[role="dialog"]')?.textContent).toBe("conflict-round/statement");
  expect(container.textContent).toContain("Existing team board");
});
