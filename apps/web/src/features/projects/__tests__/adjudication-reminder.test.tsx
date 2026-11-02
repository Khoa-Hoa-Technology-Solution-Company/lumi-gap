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
  expect(reminder.textContent).toContain("Bạn chưa gửi ý kiến cho 1 hồ sơ phân xử");
  expect(reminder.textContent).toContain("Hạn gửi:");
  expect(container.textContent).not.toContain("Duplicate discussion");
  const titles = [...container.querySelectorAll('[aria-label="Bài đang theo dõi phân xử"] h4')].map(h => h.textContent);
  expect(titles).toEqual(["Study awaiting my opinion", "Already submitted"]);
  await act(async () => reminder.querySelector("button")!.click());
  expect(container.querySelector('[role="dialog"]')?.textContent).toContain("project/pending-round");
});
it("includes missing opinions in action-needed filtering without counting the paper twice", async () => {
  await render();
  expect(container.textContent).toContain("Tất cả (2)");
  const filter = [...container.querySelectorAll("button")].find(b => b.textContent?.includes("Cần giải quyết (1)"))!;
  expect(filter).toBeDefined(); await act(async () => filter.click());
  const section = container.querySelector('[aria-label="Bài đang theo dõi phân xử"]')!;
  expect(section.textContent).toContain("Study awaiting my opinion");
  expect(section.textContent).not.toContain("Already submitted");
});
it("removes the reminder after refreshed submission state and suppresses it in read-only projects", async () => {
  await render();
  await act(async () => { client.setQueriesData({ queryKey: ["project-research", "reviewer", "project"] }, { ...summary, myTrackedDisputes: summary.myTrackedDisputes!.map(t => ({ ...t, needsMyStatement: false })) }); });
  await settle();
  expect(container.querySelector('[aria-label="Ý kiến phân xử cần gửi"]')).toBeNull();
  await render(summary, true);
  expect(container.textContent).not.toContain("Nhập ý kiến ngay");
});
