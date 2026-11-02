// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScreeningDisputeCase, ScreeningAdjudicationView } from "@trend/shared-types";
import { ScreeningCaseControls } from "../components/screening-case-controls";
import AdjudicationPage from "../components/screening-adjudication";
const mocks = vi.hoisted(() => ({ caseAction: vi.fn(), adjudication: vi.fn(), action: vi.fn() }));
vi.mock("../api/screening.api", () => ({ screeningApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: "actor" } }) }));
vi.mock("@/services/confirmation", () => ({ confirmUnsavedChanges: vi.fn().mockResolvedValue(true) }));
const base: ScreeningDisputeCase = {
  id: "case", active: true, status: "COLLECTING", version: 2, packetVersion: 1, ready: false, createdAt: "2026-11-02T00:00:00Z", deadline: "2026-11-04T00:00:00Z", requestedByIds: ["a"],
  invitation: { id: "invite", userId: "actor", name: "Mentor chính", role: "PRIMARY_MENTOR", status: "SENT", createdAt: "2026-11-02T00:00:00Z", respondedAt: null }, invitations: [],
  statements: [{ reviewerId: "a", name: "Reviewer A", completed: false, hidden: true, revision: 0 }, { reviewerId: "b", name: "Reviewer B", completed: false, hidden: true, revision: 0 }],
  candidates: [], conflicts: [], canRespond: false, canStatement: false, canCoordinate: false, canReport: false, canResolve: false,
};
let root: Root, container: HTMLDivElement, client: QueryClient;
async function settle() { await act(async () => { await new Promise(r => setTimeout(r, 15)); }); }
async function render(node: ReactNode) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/academic-support/projects/p/screening/r"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>)); await settle();
}
const controls = (data = base) => <ScreeningCaseControls projectId="p" roundId="r" data={data} onSaved={() => {}} />;
async function click(text: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text)!;
  expect(button).toBeDefined(); await act(async () => button.click()); await settle();
}
async function input(text: string) {
  const area = container.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, text); area.dispatchEvent(new Event("input", { bubbles: true })); }); await settle();
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); mocks.caseAction.mockReset().mockResolvedValue({}); mocks.action.mockReset(); mocks.adjudication.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });
it("shows direct assignment without accepting an invitation or opening a three-person chat", async () => {
  await render(controls({ ...base, status: "ASSIGNED", ready: true, lockedAt: "2026-11-02T02:00:00Z", canStart: true, invitation: { ...base.invitation!, status: "ASSIGNED" } }));
  expect(container.textContent).toContain("Đã phân công");
  expect(container.textContent).not.toContain("Nhận phân xử");
  expect(container.textContent).not.toContain("Từ chối");
  await click("Bắt đầu xem xét");
  expect(mocks.caseAction).toHaveBeenCalledWith("p", "r", expect.objectContaining({ action: "START", expectedCaseVersion: 2 }));
  expect(container.textContent).not.toContain("Trao đổi với người phân xử");
  expect(container.querySelector("textarea")).toBeNull();
});

it("requires a written opinion and provides no use-existing-ballot shortcut", async () => {
  const reviewer = { ...base, canRespond: false, canStatement: true, statements: [{ reviewerId: "actor", name: "Reviewer A", completed: false, hidden: false, revision: 0 }, base.statements[1]!] };
  await render(controls(reviewer));
  expect(container.textContent).not.toContain("Dùng phiếu đã ghi");
  const submit = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Gửi ý kiến")!;
  expect(submit.disabled).toBe(true);
  await input("   short  ");
  expect(submit.disabled).toBe(true);
  expect(mocks.caseAction).not.toHaveBeenCalled();
  await input("  Bài đáp ứng tiêu chí về đối tượng nghiên cứu.  ");
  await click("Gửi ý kiến");
  expect(mocks.caseAction).toHaveBeenCalledWith("p", "r", expect.objectContaining({ action: "STATEMENT", useExisting: false, text: "Bài đáp ứng tiêu chí về đối tượng nghiên cứu.", expectedPacketVersion: 1, expectedStatementRevision: 0 }));
  expect(container.textContent).toContain("Chờ gửi ý kiến");
});
it.each([0, 1])("puts the current reviewer's editor first while preserving A/B labels (%s)", async mine => {
  const statements = base.statements.map((s, i) => ({ ...s, reviewerId: i === mine ? "actor" : s.reviewerId, hidden: i !== mine, text: i !== mine ? "SEALED OTHER OPINION" : undefined }));
  await render(controls({ ...base, canStatement: true, statements }));
  const group = container.querySelector('[aria-label="Ý kiến từng bên"]')!;
  const articles = group.querySelectorAll("article");
  expect(articles[0]!.querySelector("h3")?.textContent).toContain(`${mine === 0 ? "A" : "B"} · Reviewer ${mine === 0 ? "A" : "B"} (Bạn)`);
  expect(articles[0]!.querySelector("textarea")).not.toBeNull();
  expect(articles[1]!.querySelector("h3")?.textContent).toContain(mine === 0 ? "B · Reviewer B" : "A · Reviewer A");
  expect(articles[1]!.textContent).toContain("Chờ gửi ý kiến");
  expect(container.textContent).not.toContain("SEALED OTHER OPINION");
  expect(group.className).not.toContain("grid-cols-2");
  await input("Quan điểm của riêng tôi dựa trên tiêu chí đã ghi");
  await click("Gửi ý kiến");
  expect(mocks.caseAction).toHaveBeenCalledWith("p", "r", expect.objectContaining({ action: "STATEMENT", text: "Quan điểm của riêng tôi dựa trên tiêu chí đã ghi" }));
});
it("retains a supplement on network failure, retries the same key, and blocks a stale packet", async () => {
  mocks.caseAction.mockRejectedValue(new Error("Offline"));
  const reviewer = { ...base, canRespond: false, canStatement: true, statements: [{ reviewerId: "actor", name: "Reviewer A", completed: false, hidden: false, revision: 0 }, base.statements[1]!] };
  await render(controls(reviewer));
  await input("My independent source based supplementary view");
  await click("Gửi ý kiến"); await click("Gửi ý kiến");
  expect(mocks.caseAction.mock.calls[0]![2].clientKey).toBe(mocks.caseAction.mock.calls[1]![2].clientKey);
  expect(container.querySelector("textarea")?.value).toContain("My independent");
  await render(controls({ ...reviewer, version: 4, packetVersion: 2 }));
  await click("Gửi ý kiến"); expect(mocks.caseAction).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("Phiếu hoặc ý kiến của bạn đã đổi");
});
it("shows silence without describing it as consent and omits assignment history", async () => {
  await render(controls({ ...base, invitations: [base.invitation!], status: "IN_PROGRESS", ready: true, canRespond: false, statements: base.statements.map(s => ({ ...s, hidden: false })) }));
  expect(container.textContent?.match(/Chưa bổ sung ý kiến/g)?.length).toBeGreaterThanOrEqual(2);
  expect(container.textContent).not.toContain("Đã đồng ý");
  expect(container.textContent).not.toContain("Lịch sử hồ sơ");
  expect(container.textContent).not.toContain("Lịch sử phân công");
});
it("only a coordinator gets candidate selection and requires a recorded reason", async () => {
  await render(controls({ ...base, invitation: null, status: "WAITING_ASSIGNMENT", canRespond: false, canCoordinate: false }));
  expect(container.querySelector("select")).toBeNull();
  await render(controls({ ...base, invitation: null, status: "WAITING_ASSIGNMENT", canRespond: false, canCoordinate: true, candidates: [{ id: "candidate", name: "Independent", role: "MEMBER" }] }));
  const select = container.querySelector("select")!;
  await act(async () => { select.value = "candidate"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await input("Chosen for the registered methodology expertise"); await click("Phân công trực tiếp");
  expect(mocks.caseAction).toHaveBeenCalledWith("p", "r", expect.objectContaining({ action: "SELECT", candidateId: "candidate", reason: "Chosen for the registered methodology expertise" }));
});
it("the adjudication page has no composer and cannot decide before readiness", async () => {
  const v = { case: base, packet: { roundId: "r", paperId: "paper", phase: "TITLE_ABSTRACT", roundVersion: 1, paper: { title: "Scoped source", abstractText: null, publicationYear: 2025, doi: null }, reviews: [], inclusionCriteria: [], exclusionCriteria: [], researchQuestions: [] }, version: 3, status: "ADJUDICATING", canResolve: false, finalDecision: null } as ScreeningAdjudicationView;
  mocks.adjudication.mockResolvedValue(v);
  await render(<Routes><Route path="/academic-support/projects/:projectId/screening/:roundId" element={<AdjudicationPage />} /></Routes>);
  expect(container.textContent).toContain("Hồ sơ phân xử"); expect(container.textContent).not.toContain("Nhận phân xử");
  expect(container.textContent).not.toContain("Ghi kết luận và lưu lịch sử");
  expect(container.textContent).not.toContain("Thảo luận về phân xử"); expect(container.querySelector("textarea")).toBeNull();
  expect(container.textContent).not.toContain("Đọc bài báo và xem căn cứ");
  expect(container.querySelector('[aria-label="Gói phân xử được chia sẻ"]')?.textContent).toContain("Scoped source");
  expect(container.querySelector('[aria-label="Gói phân xử được chia sẻ"]')?.closest("details")).toBeNull();
  expect(container.textContent).not.toContain("Bạn có thể xem gói này, nhưng hiện không có quyền ghi kết luận");
});

it("shows source and current ballots directly while omitting historical packet sections", async () => {
  const packet: ScreeningAdjudicationView["packet"] = {
    roundId: "r", paperId: "paper", phase: "TITLE_ABSTRACT", roundVersion: 1,
    paper: { title: "Research source", abstractText: "Source abstract text", publicationYear: 2024, doi: "10.1234/source" },
    protocol: { version: 1, workflowVersion: 5, stages: ["TITLE_ABSTRACT"], allowConservativeFullText: false },
    researchQuestions: ["Research question"], inclusionCriteria: ["Include population"], exclusionCriteria: ["Exclude population"],
    reviews: [
      { id: "ra", reviewerId: "a", reviewerName: "Alice", decision: "INCLUDE", comment: "Current rationale A", exclusionReason: "", revision: 1, scope: "TITLE_ABSTRACT", fullTextReference: null },
      { id: "rb", reviewerId: "b", reviewerName: "Bob", decision: "EXCLUDE", comment: "Current rationale B", exclusionReason: "Wrong population", revision: 2, scope: "TITLE_ABSTRACT", fullTextReference: null },
    ],
    allReviews: [{ id: "old", reviewerId: "b", revision: 1, decision: "UNSURE", comment: "Historical ballot text", exclusionReason: "", phaseMarker: "INDEPENDENT_INITIAL", submittedAt: base.createdAt }],
    discussion: [{ id: "discussion", actorName: "Alice", comment: "Historical discussion text", createdAt: base.createdAt }],
  };
  mocks.adjudication.mockResolvedValue({ case: { ...base, invitations: [base.invitation!] }, caseHistory: [base], packet, version: 3, status: "ADJUDICATING", canResolve: false, finalDecision: null });
  await render(<Routes><Route path="/academic-support/projects/:projectId/screening/:roundId" element={<AdjudicationPage />} /></Routes>);
  for (const text of ["Research source", "Source abstract text", "Research question", "Include population", "Exclude population", "Hai phiếu hiện hành", "Current rationale A", "Current rationale B", "Wrong population"]) {
    expect(container.textContent).toContain(text);
  }
  expect(container.querySelector('a[href="https://doi.org/10.1234/source"]')).not.toBeNull();
  for (const text of ["Lịch sử hồ sơ", "Lịch sử phân công", "Hồ sơ và lịch sử", "Đọc bài báo và xem căn cứ", "Tài liệu nguồn, tiêu chí, phiếu đánh giá và lịch sử trao đổi", "Lịch sử phiếu độc lập", "Thảo luận trước khi mở hồ sơ", "Historical ballot text", "Historical discussion text", "Gói chỉ gồm bài báo"]) {
    expect(container.textContent).not.toContain(text);
  }
  expect(container.querySelector('[aria-label="Gói phân xử được chia sẻ"]')?.closest("details")).toBeNull();
});

it("opens a direct private text field for the canonical reviewer despite a migrated public ID", async () => {
  const reviewer = { ...base, myReviewerId: "internal-a", canRespond: false, canStatement: true, statements: [{ reviewerId: "internal-a", name: "Reviewer A", completed: false, hidden: false, revision: 0 }, base.statements[1]!] };
  await render(controls(reviewer));
  expect(container.querySelectorAll('textarea')).toHaveLength(1);
  expect(container.querySelector('textarea')?.closest('article')?.textContent).toContain('A · Reviewer A (Bạn)');
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  await input("This paper fits the population and methods in our protocol");
  await click("Gửi ý kiến");
  expect(mocks.caseAction).toHaveBeenCalledWith("p", "r", expect.objectContaining({ action: "STATEMENT", useExisting: false, text: "This paper fits the population and methods in our protocol", expectedStatementRevision: 0 }));
});

it("shows both submitted opinions to the ready adjudicator without reviewer editing controls", async () => {
  await render(controls({ ...base, canRespond: false, ready: true, status: "IN_PROGRESS", statements: base.statements.map((s, i) => ({ ...s, hidden: false, completed: true, text: i === 0 ? "The population fits" : "The method is unclear", useExisting: false })) }));
  expect(container.textContent).toContain("The population fits");
  expect(container.textContent).toContain("The method is unclear");
  expect(container.querySelector('textarea')).toBeNull();
  expect(container.textContent).not.toContain("Gửi ý kiến");
});

it("preserves a typed draft when the packet becomes locked and removes editing controls", async () => {
  const reviewer = { ...base, invitation: null, canStatement: true, statements: [{ reviewerId: "actor", name: "Reviewer A", completed: false, hidden: false, revision: 0 }, base.statements[1]!] };
  await render(controls(reviewer));
  await input("Unsent source based reasoning remains on my screen");
  await render(controls({ ...reviewer, canStatement: false, ready: true, status: "ASSIGNED", lockedAt: "2026-11-02T02:00:00Z" }));
  expect(container.textContent).toContain("Unsent source based reasoning");
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.textContent).not.toContain("Gửi ý kiến");
  expect(mocks.caseAction).not.toHaveBeenCalled();
});
it("only independent coordinators see reassignment and must give a reason", async () => {
  await render(controls({ ...base, status: "ASSIGNED", canReassign: true, canCoordinate: true }));
  expect(container.textContent).toContain("Phân công lại người phân xử");
  await input("Assigned researcher is unavailable this week");
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await settle();
  expect(mocks.caseAction).toHaveBeenCalledWith("p", "r", expect.objectContaining({ action: "REASSIGN", reason: "Assigned researcher is unavailable this week", expectedCaseVersion: 2 }));
});
