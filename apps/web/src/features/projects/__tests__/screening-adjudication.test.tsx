// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScreeningAdjudicationView, ScreeningRoundView } from "@trend/shared-types";
import AdjudicationPage from "../components/screening-adjudication";
import { OwnerActions } from "../components/screening-round";
import { ScreeningAgreementPanel } from "../components/screening-agreement";
const mocks = vi.hoisted(() => ({ adjudication: vi.fn(), action: vi.fn(), proposeAgreement: vi.fn(), confirmAgreement: vi.fn(), declineAgreement: vi.fn() }));
vi.mock("../api/screening.api", () => ({ screeningApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: "actor" } }) }));
vi.mock("@/services/confirmation", () => ({ confirmUnsavedChanges: vi.fn().mockResolvedValue(true) }));
const view: ScreeningAdjudicationView = {
  version: 5, status: "ADJUDICATING", canResolve: true, finalDecision: null,
  packet: { roundId: "r", paperId: "paper", phase: "TITLE_ABSTRACT", roundVersion: 4,
    paper: { title: "Paper <script>unsafe()</script>", abstractText: "Shared abstract", doi: null, publicationYear: 2025 },
    inclusionCriteria: ["University students"], exclusionCriteria: [], researchQuestions: ["Does it help learning?"],
    reviews: [{ id: "one", decision: "INCLUDE", comment: "Matches population", exclusionReason: "", revision: 1, scope: "TITLE_ABSTRACT", fullTextReference: null }, { id: "two", decision: "EXCLUDE", comment: "Needs population verification", exclusionReason: "Wrong population", revision: 1, scope: "TITLE_ABSTRACT", fullTextReference: null }],
  },
};
let root: Root, container: HTMLDivElement, client: QueryClient;
async function settle() { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); }
async function render(node: ReactNode = <Routes><Route path="/academic-support/projects/:projectId/screening/:roundId" element={<AdjudicationPage />} /></Routes>) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/academic-support/projects/p/screening/r"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>)); await settle();
}
async function click(text: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text)!;
  expect(button).toBeDefined(); await act(async () => button.click()); await settle();
}
async function reason(text: string) {
  const input = container.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); }); await settle();
}
async function confirm() { await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()); await settle(); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); mocks.adjudication.mockReset().mockResolvedValue(view); mocks.action.mockReset(); mocks.proposeAgreement.mockReset(); mocks.confirmAgreement.mockReset(); mocks.declineAgreement.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });
it("shows only the scoped packet as escaped text and requires deliberate confirmation", async () => {
  await render(); expect(mocks.adjudication).toHaveBeenCalledWith("p", "r");
  expect(container.textContent).toContain("Shared abstract"); expect(container.textContent).toContain("Reviewer 1");
  expect(container.querySelector("script")).toBeNull(); expect(container.textContent).not.toContain("Thư viện của nhóm");
  const send = container.querySelector<HTMLButtonElement>('button[type="submit"],form button:last-child')!;
  expect(send.disabled).toBe(true); await reason("The population matches the stated criteria"); expect(send.disabled).toBe(true);
  await confirm(); expect(send.disabled).toBe(false); await click("Ghi kết luận và lưu lịch sử");
  expect(mocks.action).toHaveBeenCalledWith("p", "r", "resolve", expect.objectContaining({ expectedVersion: 5, decision: "INCLUDED", confirmed: true }));
});
it("retains a failed conclusion and reuses its request key on retry", async () => {
  mocks.action.mockRejectedValue(new Error("Offline")); await render();
  await reason("Keep this conclusion while the network is offline"); await confirm();
  await click("Ghi kết luận và lưu lịch sử"); await click("Ghi kết luận và lưu lịch sử");
  expect(container.querySelector("textarea")?.value).toContain("Keep this conclusion");
  expect(mocks.action.mock.calls[0]![3].clientKey).toBe(mocks.action.mock.calls[1]![3].clientKey);
});
it("blocks a stale draft until the revised packet is checked again", async () => {
  await render(); await reason("My draft based on the earlier packet"); await confirm();
  await act(async () => client.setQueryData(["project-research", "actor", "p", "screening-adjudication", "r"], { ...view, version: 6 })); await settle();
  expect(container.textContent).toContain("Gói hoặc phân công đã thay đổi");
  expect(container.querySelector("textarea")?.value).toContain("My draft");
  await click("Ghi kết luận và lưu lịch sử"); expect(mocks.action).not.toHaveBeenCalled();
  await click("Tôi đã kiểm tra gói hiện tại"); await confirm(); await click("Ghi kết luận và lưu lịch sử");
  expect(mocks.action.mock.calls[0]![3].expectedVersion).toBe(6);
});
it("hides a previously loaded packet after access revocation", async () => {
  await render(); mocks.adjudication.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
  await act(async () => { await client.refetchQueries({ queryKey: ["project-research", "actor", "p", "screening-adjudication", "r"] }); }); await settle();
  expect(container.textContent).not.toContain("Shared abstract"); expect(container.querySelector("form")).toBeNull(); expect(container.querySelector('[role="alert"]')).not.toBeNull();
});
it("shows completed decisions without a second submission form", async () => {
  mocks.adjudication.mockResolvedValue({ ...view, status: "INCLUDED", canResolve: false, finalDecision: { decision: "INCLUDED", reason: "Eligibility confirmed", createdAt: "2026-10-31T00:00:00Z" } });
  await render(); expect(container.textContent).toContain("Đã ghi kết luận: Phù hợp"); expect(container.querySelector("form")).toBeNull();
});
it("resets the draft when navigating to another adjudication round", async () => {
  await render(<><Link to="/academic-support/projects/p/screening/other">Other packet</Link><Routes><Route path="/academic-support/projects/:projectId/screening/:roundId" element={<AdjudicationPage />} /></Routes></>);
  await reason("This draft belongs only to round r");
  await act(async () => [...container.querySelectorAll("a")].find(a => a.textContent === "Other packet")!.click()); await settle();
  expect(mocks.adjudication).toHaveBeenLastCalledWith("p", "other"); expect(container.querySelector("textarea")?.value).toBe("");
});
it("requires owner approval of the current packet before assigning an external lecturer", async () => {
  const round = { id: "r", paperId: "paper", version: 5, active: true, status: "NEEDS_RESOLUTION", finalizer: { id: "", name: "Chưa chỉ định" }, canManage: true, canFinalize: false, myAssignmentId: null, settings: { reviewMode: "INDEPENDENT", workflowVersion: 3, requiredReviewers: 2, resolutionPolicy: "ADJUDICATION" }, reviews: [], assignments: [], assigned: 2, completed: 2, discussionReady: true, finalDecision: null, adjudicators: [{ id: "lecturer", name: "Lecturer", mentor: true, proposer: false }] } as unknown as ScreeningRoundView;
  await render(<OwnerActions projectId="p" round={round} people={[]} readOnly={false} />);
  const select = container.querySelectorAll("select")[1]!;
  await act(async () => { select.value = "lecturer"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
  await reason("Independent expertise is needed to resolve this dispute");
  const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  await act(async () => checkboxes[checkboxes.length - 1]!.click()); await settle();
  const send = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Xác nhận và lưu lịch sử")!;
  expect(send.disabled).toBe(true); expect(container.querySelector('[aria-label="Gói phân xử được chia sẻ"]')).not.toBeNull();
  await act(async () => checkboxes[0]!.click()); await settle(); expect(send.disabled).toBe(false);
  await click("Xác nhận và lưu lịch sử");
  expect(mocks.action).toHaveBeenCalledWith("p", "r", "finalizer", expect.objectContaining({ finalizerId: "lecturer", shareWithMentor: true, expectedVersion: 5 }));
});
const agreementRound = {
  id: "r", version: 8, phase: "TITLE_ABSTRACT", hiddenReviews: false, canProposeAgreement: true,
  assignments: [{ reviewerId: "actor", name: "Reviewer A" }, { reviewerId: "peer", name: "Reviewer B" }],
  agreement: { id: "proposal", decision: "INCLUDED", reason: "Read full text to clarify the disputed population", proposedById: "peer", reviewIds: ["one", "two"], confirmedByIds: [], requiredReviewerIds: ["actor", "peer"], canConfirm: true, createdAt: "2026-10-31T00:00:00Z" },
} as unknown as ScreeningRoundView;
it("requires individual agreement confirmation and sends the current proposal and round version", async () => {
  await render(<ScreeningAgreementPanel projectId="p" round={agreementRound} readOnly={false} />);
  expect(container.textContent).toContain("Reviewer A: Chờ xác nhận");
  const send = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Xác nhận quyết định chung")!;
  expect(send.disabled).toBe(true); await confirm(); expect(send.disabled).toBe(false);
  await click("Xác nhận quyết định chung");
  expect(mocks.confirmAgreement).toHaveBeenCalledWith("p", "r", expect.objectContaining({ proposalId: "proposal", expectedVersion: 8, confirmed: true }));
  expect(mocks.action).not.toHaveBeenCalled();
});
it("clears agreement consent when the proposal or round version changes", async () => {
  await render(<ScreeningAgreementPanel projectId="p" round={agreementRound} readOnly={false} />); await confirm();
  await render(<ScreeningAgreementPanel projectId="p" round={{ ...agreementRound, version: 9, agreement: { ...agreementRound.agreement!, id: "new-proposal" } }} readOnly={false} />);
  await click("Xác nhận quyết định chung"); expect(mocks.confirmAgreement).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
});
it("retains failed agreement drafts with the same idempotency key and blocks a stale version", async () => {
  mocks.proposeAgreement.mockRejectedValue(new Error("Offline"));
  await render(<ScreeningAgreementPanel projectId="p" round={{ ...agreementRound, agreement: null }} readOnly={false} />);
  await reason("The group agrees to verify eligibility in full text");
  await click("Gửi đề xuất cho reviewer xác nhận"); await click("Gửi đề xuất cho reviewer xác nhận");
  expect(mocks.proposeAgreement.mock.calls[0]![2].clientKey).toBe(mocks.proposeAgreement.mock.calls[1]![2].clientKey);
  await render(<ScreeningAgreementPanel projectId="p" round={{ ...agreementRound, agreement: null, version: 9 }} readOnly={false} />);
  expect(container.querySelector("textarea")?.value).toContain("The group agrees");
  await click("Gửi đề xuất cho reviewer xác nhận"); expect(mocks.proposeAgreement).toHaveBeenCalledTimes(2);
});
it("hides agreement actions before independent reviews are disclosed and for read-only users", async () => {
  await render(<ScreeningAgreementPanel projectId="p" round={{ ...agreementRound, hiddenReviews: true }} readOnly={false} />);
  expect(container.querySelector("section")).toBeNull();
  await render(<ScreeningAgreementPanel projectId="p" round={{ ...agreementRound, canProposeAgreement: false }} readOnly />);
  expect(container.querySelector("form")).toBeNull(); expect(container.textContent).toContain("Read full text");
});
it("renders selected discussion as escaped text without giving access to the full project", async () => {
  mocks.adjudication.mockResolvedValue({ ...view, packet: { ...view.packet, discussion: [{ id: "c", comment: "Discuss <img src=x onerror=unsafe()> eligibility", createdAt: "2026-10-31T00:00:00Z" }] } });
  await render(); expect(container.textContent).toContain("Discuss <img src=x onerror=unsafe()> eligibility");
  expect(container.querySelector("img")).toBeNull(); expect(container.textContent).toContain("Thảo luận được chọn để chia sẻ");
});
it("requires renewed sharing approval when the owner changes the selected discussion", async () => {
  mocks.adjudication.mockResolvedValue({ ...view, availableDiscussion: [{ id: "c1", comment: "Share this methodological question", createdAt: "2026-10-31T00:00:00Z" }, { id: "c2", comment: "Keep this internal", createdAt: "2026-10-31T00:00:00Z" }] });
  const round = { id: "r", paperId: "paper", version: 5, active: true, status: "NEEDS_RESOLUTION", finalizer: { id: "", name: "Chưa chỉ định" }, canManage: true, canFinalize: false, myAssignmentId: null, settings: { reviewMode: "INDEPENDENT", workflowVersion: 4, requiredReviewers: 2, resolutionPolicy: "ADJUDICATION" }, reviews: [], assignments: [], assigned: 2, completed: 2, discussionReady: true, finalDecision: null, adjudicators: [{ id: "lecturer", name: "Lecturer", mentor: true, proposer: false }] } as unknown as ScreeningRoundView;
  await render(<OwnerActions projectId="p" round={round} people={[]} readOnly={false} />);
  const select = container.querySelectorAll("select")[1]!;
  await act(async () => { select.value = "lecturer"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
  await reason("The lecturer should assess this methodological question");
  const checkbox = (text: string) => [...container.querySelectorAll("label")].find(label => label.textContent?.includes(text))!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(async () => { checkbox("Tôi đã duyệt").click(); checkbox("Tôi hiểu tác động").click(); }); await settle();
  const send = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Xác nhận và lưu lịch sử")!;
  expect(send.disabled).toBe(false);
  await act(async () => checkbox("Share this methodological question").click()); await settle();
  expect(send.disabled).toBe(true); expect(checkbox("Tôi đã duyệt").checked).toBe(false);
  expect(container.querySelector('[aria-label="Gói phân xử được chia sẻ"]')?.textContent).toContain("Share this methodological question");
  expect(container.querySelector('[aria-label="Gói phân xử được chia sẻ"]')?.textContent).not.toContain("Keep this internal");
  await act(async () => { checkbox("Tôi đã duyệt").click(); checkbox("Tôi hiểu tác động").click(); }); await settle();
  await click("Xác nhận và lưu lịch sử");
  expect(mocks.action).toHaveBeenCalledWith("p", "r", "finalizer", expect.objectContaining({ discussionIds: ["c1"], shareWithMentor: true }));
});

it("V5 requires proposer consent, supports further information, and resets consent after editing", async () => {
  const round = { ...agreementRound, settings: { ...agreementRound.settings, workflowVersion: 5 }, agreement: null };
  await render(<ScreeningAgreementPanel projectId="p" round={round} readOnly={false} />);
  await reason("Both reviewers need additional information before a decision");
  const select = container.querySelector("select")!;
  await act(async () => { select.value = "NEEDS_MORE_INFO"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
  const send = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Gửi đề xuất cho reviewer xác nhận")!;
  expect(send.disabled).toBe(true); await confirm(); expect(send.disabled).toBe(false);
  await reason("Updated proposal needs a new explicit consent from the author"); expect(send.disabled).toBe(true);
  await confirm(); await click("Gửi đề xuất cho reviewer xác nhận");
  expect(mocks.proposeAgreement).toHaveBeenCalledWith("p", "r", expect.objectContaining({ decision: "NEEDS_MORE_INFO", confirmed: true, expectedVersion: 8 }));
});
it("the other reviewer can continue discussion and cannot decline a stale proposal", async () => {
  const round = { ...agreementRound, agreement: { ...agreementRound.agreement!, canDecline: true } };
  await render(<ScreeningAgreementPanel projectId="p" round={round} readOnly={false} />);
  await reason("The source still needs verification against our population criteria");
  await render(<ScreeningAgreementPanel projectId="p" round={{ ...round, version: 9 }} readOnly={false} />);
  await click("Tiếp tục thảo luận, chưa chốt"); expect(mocks.declineAgreement).not.toHaveBeenCalled();
  expect(container.querySelector("textarea")?.value).toContain("source still needs");
  await click("Tôi đã đọc lại đề xuất"); await click("Tiếp tục thảo luận, chưa chốt");
  expect(mocks.declineAgreement).toHaveBeenCalledWith("p", "r", expect.objectContaining({ expectedVersion: 9, proposalId: "proposal" }));
});
it("an adjudicator can request information without manufacturing a binary outcome", async () => {
  await render();
  await act(async () => [...container.querySelectorAll("label")].find(label => label.textContent?.includes("Cần đọc thêm / bổ sung thông tin"))!.querySelector<HTMLInputElement>("input")!.click());
  await reason("Obtain the full text before the population can be determined"); await confirm(); await click("Ghi kết luận và lưu lịch sử");
  expect(mocks.action).toHaveBeenCalledWith("p", "r", "resolve", expect.objectContaining({ decision: "NEEDS_MORE_INFO" }));
});
