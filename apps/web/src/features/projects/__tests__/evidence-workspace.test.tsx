// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResearchEvidence } from "../components/research-evidence";
import { EvidenceDetail } from "../components/research-evidence-detail";
import type { ProjectEvidence, ResearchSynthesisPaper } from "@trend/shared-types";

const mocks = vi.hoisted(() => Object.fromEntries(["evidenceWorkspace", "evidence", "createEvidence", "editEvidence", "reviewEvidence", "evidenceHistory", "suggestions", "paperAnalysis", "confirm"].map(key => [key, vi.fn()])));
vi.mock("../api/project-research.api", () => ({ researchApi: mocks }));
vi.mock("@/services/confirmation", () => ({ confirmUnsavedChanges: mocks.confirm }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (value: { user: { id: string } }) => unknown) => select({ user: { id: "actor" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "vi", t: (key: string) => key }) }));
const page = { page: 1, pageSize: 20, total: 1, hasNext: false };
const questions = [{ id: "q1", text: "Which method helps?" }, { id: "q2", text: "Which limitations remain?" }];
const content = { claim: "A bounded finding", methodology: "Interviews", limitations: "Single site", quotation: "LONG SOURCE QUOTATION", locator: "Abstract", results: "A bounded finding", context: "University", population: "24 participants", themes: ["learning"] };
const item: ProjectEvidence = { ...content, id: "e1", projectId: "p", paperId: "paper", version: 1, origin: "AI_SUGGESTED", reviewState: "PENDING", reviewRationale: "", extractedById: "actor", reviewedById: null, reviewedAt: null, createdAt: "2026-11-02T00:00:00Z", updatedAt: "2026-11-02T00:00:00Z", sourceSnapshot: { sourceKind: "ABSTRACT" }, sourceTitle: "Source study", sourceScope: "ABSTRACT", verificationStatus: "NEEDS_VERIFICATION", relatedQuestions: [questions[0]!] };
const paper: ResearchSynthesisPaper = { paperId: "paper", title: "Source study", doi: null, publicationYear: 2024, eligible: true, eligibilityReason: null, screeningStatus: "INCLUDED", extractionCount: 2, verifiedCount: 0, entries: [item], themes: ["learning"], questions: [questions[0]!] };
let root: Root, container: HTMLDivElement, client: QueryClient;
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); }
async function render(node: ReactNode = <ResearchEvidence projectId="p" readOnly={false} />, path = "/projects/p?tab=papers&view=evidence") { await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>)); await settle(); }
async function click(label: string) { const element = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === label); expect(element, label).toBeDefined(); await act(async () => element!.click()); await settle(); }
async function fill(label: string, value: string) {
  const element = [...container.querySelectorAll("label")].find(node => node.textContent?.startsWith(label))?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input,textarea,select"); expect(element, label).toBeDefined();
  await act(async () => { const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value); element!.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }); await settle();
}
async function filter(label: string, value: string) { const element = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!; await act(async () => { element.value = value; element.dispatchEvent(new Event("change", { bubbles: true })); }); await settle(); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks();
  mocks.evidenceWorkspace!.mockResolvedValue({ ...page, items: [paper], questions, themes: ["learning"] });
  mocks.evidence!.mockResolvedValue({ ...page, items: [item, { ...item, id: "e2", claim: "A separate finding" }] }); mocks.suggestions!.mockResolvedValue([]); mocks.evidenceHistory!.mockResolvedValue([]); mocks.confirm!.mockResolvedValue(true); mocks.createEvidence!.mockResolvedValue({}); mocks.editEvidence!.mockResolvedValue({}); mocks.reviewEvidence!.mockResolvedValue({});
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("renders one overview row per paper, omits long source passages, and expands distinct extractions separately", async () => {
  await render(); expect(container.querySelectorAll('tr[data-paper-id="paper"]')).toHaveLength(1); expect(container.querySelectorAll("thead th")).toHaveLength(6);
  expect(container.textContent).not.toContain(content.quotation); expect(container.textContent).not.toContain("Tạo công việc"); expect(mocks.evidence).not.toHaveBeenCalled();
  await click("Source study"); expect(container.querySelectorAll("[data-extraction-id]")).toHaveLength(2); expect(container.textContent).toContain("A separate finding"); expect(container.querySelectorAll('tr[data-paper-id="paper"]')).toHaveLength(1);
  expect(container.querySelectorAll('.evidence-record:not([open])')).toHaveLength(2);
  expect(mocks.evidence).toHaveBeenCalledWith("p", expect.objectContaining({ paperId: "paper", pageSize: 10 }));
});
it("passes RQ, topic, verification, eligibility and content search to the project-scoped API", async () => {
  await render(); await filter("Lọc theo Research Question", "q1"); await filter("Lọc theo chủ đề", "learning"); await filter("Trạng thái kiểm chứng", "VERIFIED"); await filter("Điều kiện nguồn", "ALL");
  expect(mocks.evidenceWorkspace).toHaveBeenLastCalledWith("p", expect.objectContaining({ questionId: "q1", theme: "learning", status: "VERIFIED", eligibility: "ALL", page: 1 }));
  const search = container.querySelector<HTMLInputElement>('[aria-label="Tìm bài báo hoặc nội dung"]')!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "method"); search.dispatchEvent(new Event("input", { bubbles: true })); }); await click("Tìm");
  expect(mocks.evidenceWorkspace).toHaveBeenLastCalledWith("p", expect.objectContaining({ q: "method" }));
});
it("shows each RQ's own finding instead of attributing another extraction's conclusion to it", async () => {
  mocks.evidenceWorkspace!.mockResolvedValue({ ...page, items: [{ ...paper, questions, entries: [item, { ...item, id: "e2", claim: "Other RQ finding", relatedQuestions: [questions[1]!] }] }], questions, themes: [] });
  await render(); await click("Theo Research Question"); const groups = container.querySelectorAll(".evidence-rq-group"); expect(groups).toHaveLength(2);
  expect(groups[0]?.textContent).toContain("A bounded finding"); expect(groups[0]?.textContent).not.toContain("Other RQ finding"); expect(groups[1]?.textContent).toContain("Other RQ finding");
});
it("defaults to eligible sources and provides a useful empty state without changing screening", async () => {
  mocks.evidenceWorkspace!.mockResolvedValue({ ...page, total: 0, items: [], questions: [], themes: [] }); await render();
  expect(mocks.evidenceWorkspace).toHaveBeenCalledWith("p", expect.objectContaining({ eligibility: "ELIGIBLE" })); expect(container.textContent).toContain("Bắt đầu từ một bài báo đã được chọn"); expect(container.querySelector('a[href="/projects/p?tab=papers&view=library"]')).not.toBeNull();
});
it("loads AI suggestions only on request and saves them as unverified drafts with their attribution", async () => {
  mocks.suggestions!.mockResolvedValue([{ paperId: "paper", corpusPaperId: "cp", content }]);
  await render(); await click("Thêm trích xuất"); await fill("Bài báo", "paper"); expect(mocks.suggestions).not.toHaveBeenCalled(); expect(mocks.paperAnalysis).not.toHaveBeenCalled();
  await click("Xem gợi ý AI có sẵn"); await click("Dùng làm bản nháp"); expect(container.textContent).toContain("Nguồn gốc AI vẫn được giữ"); await click("Lưu bản nháp");
  expect(mocks.createEvidence).toHaveBeenCalledWith("p", expect.objectContaining({ origin: "AI_SUGGESTED", corpusPaperId: "cp", draft: true, claim: content.claim })); expect(mocks.reviewEvidence).not.toHaveBeenCalled();
});
it("retains failed extraction content and themes so a user can correct and retry", async () => {
  mocks.createEvidence!.mockRejectedValue(new Error("Conflict")); await render(); await click("Thêm trích xuất"); await fill("Bài báo", "paper"); await fill("Phát hiện chính", "My retained interpretation"); await fill("Chủ đề", "transfer, replication,"); await click("Lưu để kiểm chứng");
  expect(container.querySelector<HTMLTextAreaElement>('.research-editor textarea[required]')?.value).toBe("My retained interpretation"); expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(mocks.createEvidence).toHaveBeenCalledWith("p", expect.objectContaining({ themes: ["transfer", "replication"], draft: false }));
});
it("protects written extraction content when declining a source change", async () => {
  mocks.evidenceWorkspace!.mockResolvedValue({ ...page, items: [paper, { ...paper, paperId: "other", title: "Another study" }], questions, themes: [] });
  await render(); await click("Thêm trích xuất"); await fill("Bài báo", "paper"); await fill("Phát hiện chính", "Keep my interpretation"); mocks.confirm!.mockResolvedValue(false); await fill("Bài báo", "other");
  expect(mocks.confirm).toHaveBeenCalledOnce(); expect(container.querySelector<HTMLTextAreaElement>('.research-editor textarea[required]')?.value).toBe("Keep my interpretation"); await click("Lưu bản nháp"); expect(mocks.createEvidence).toHaveBeenCalledWith("p", expect.objectContaining({ paperId: "paper" }));
});
it("disables saving when no source is selected and explains how to find an eligible paper", async () => {
  mocks.evidenceWorkspace!.mockResolvedValue({ ...page, total: 0, items: [], questions: [], themes: [] }); await render(); await click("Thêm trích xuất");
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Hoàn tất sàng lọc"); expect([...container.querySelectorAll("button")].find(button => button.textContent === "Lưu bản nháp")?.disabled).toBe(true);
});
it("checks source eligibility for direct extraction links before allowing a save", async () => {
  mocks.evidenceWorkspace!.mockImplementation(async (_id, params) => ({ ...page, items: params.paperId ? [{ ...paper, eligible: false }] : [paper], questions, themes: [] }));
  await render(<ResearchEvidence projectId="p" readOnly={false} />, "/projects/p?tab=papers&view=evidence&extract=paper");
  await fill("Phát hiện chính", "A manually entered interpretation");
  expect(container.textContent).toContain("Bài đang chọn chưa đủ điều kiện phân tích");
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "Lưu bản nháp")?.disabled).toBe(true);
  expect(mocks.createEvidence).not.toHaveBeenCalled(); expect(mocks.suggestions).not.toHaveBeenCalled();
});
it("requires active human confirmation before verification, keeps the opened version and never accepts on save", async () => {
  await render(<EvidenceDetail projectId="p" item={item} readOnly={false} onEdit={() => undefined} />); await click("Đối chiếu trích xuất");
  const accept = [...container.querySelectorAll("button")].find(button => button.textContent === "Xác nhận đã đối chiếu")!; expect(accept.disabled).toBe(true);
  await act(async () => container.querySelector<HTMLInputElement>('.research-review input[type="checkbox"]')!.click()); await click("Xác nhận đã đối chiếu");
  expect(mocks.reviewEvidence).toHaveBeenCalledWith("p", "e1", expect.objectContaining({ expectedVersion: 1, state: "ACCEPTED", sourceConfirmed: true }));
});
it("does not silently confirm a collaborator's newer extraction version", async () => {
  await render(<EvidenceDetail projectId="p" item={item} readOnly={false} onEdit={() => undefined} />); await click("Đối chiếu trích xuất"); await fill("Ghi chú đối chiếu", "Compared old version");
  await render(<EvidenceDetail projectId="p" item={{ ...item, version: 2, claim: "Changed interpretation" }} readOnly={false} onEdit={() => undefined} />);
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "Xác nhận đã đối chiếu")?.disabled).toBe(true); expect(container.textContent).toContain("Bản trích xuất đã thay đổi"); expect(mocks.reviewEvidence).not.toHaveBeenCalled();
});
it.each(["filter", "page", "search"])("protects a drafted review when changing %s", async action => {
  mocks.evidenceWorkspace!.mockResolvedValue({ ...page, hasNext: true, items: [paper], questions, themes: [] }); await render(); await click("Source study");
  await act(async () => container.querySelector<HTMLButtonElement>('.evidence-detail button')!.click()); await settle(); await fill("Ghi chú đối chiếu", "Keep my source review"); mocks.confirm!.mockResolvedValue(false); const calls = mocks.evidenceWorkspace!.mock.calls.length;
  if (action === "filter") await filter("Trạng thái kiểm chứng", "VERIFIED"); else if (action === "page") await click("Trang sau"); else await click("Tìm");
  expect(mocks.confirm).toHaveBeenCalledOnce(); expect(mocks.evidenceWorkspace!.mock.calls.length).toBe(calls); expect(container.querySelector<HTMLTextAreaElement>('.research-review textarea')?.value).toBe("Keep my source review");
});
it("keeps read-only details safe, labels abstract-only scope, and loads full history only when requested", async () => {
  await render(<EvidenceDetail projectId="p" item={{ ...item, claim: "<script>untrusted()</script>" }} readOnly onEdit={() => undefined} />);
  expect(container.querySelector("script")).toBeNull(); expect(container.textContent).toContain("<script>untrusted()</script>"); expect(container.textContent).toContain("Chỉ dựa trên tóm tắt"); expect(container.textContent).not.toContain("Đối chiếu trích xuất"); expect(mocks.evidenceHistory).not.toHaveBeenCalled();
  const details = [...container.querySelectorAll("details")].find(node => node.querySelector("summary")?.textContent === "Lịch sử và phiên bản")!;
  await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); }); await settle(); expect(mocks.evidenceHistory).toHaveBeenCalledWith("p", "e1");
});
it("keeps changed sources visible in explicit archive view and blocks their acceptance", async () => {
  await render(<EvidenceDetail projectId="p" item={{ ...item, sourceNeedsReview: true, verificationStatus: "REVISIT" }} readOnly={false} onEdit={() => undefined} />); expect(container.textContent).toContain("Cần xem xét lại"); await click("Đối chiếu trích xuất"); await act(async () => container.querySelector<HTMLInputElement>('.research-review input')!.click());
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "Xác nhận đã đối chiếu")?.disabled).toBe(true);
});
it("preserves linked extraction and legacy-gap destinations instead of losing historical links", async () => {
  mocks.evidence!.mockResolvedValue({ ...page, items: [], legacyGapId: "legacy" }); await render(<ResearchEvidence projectId="p" readOnly />, "/projects/p?tab=papers&view=evidence&evidence=old");
  expect(mocks.evidence).toHaveBeenCalledWith("p", expect.objectContaining({ itemId: "old" })); expect(container.querySelector('a[href="/gaps/legacy"]')).not.toBeNull(); expect(mocks.evidenceWorkspace).not.toHaveBeenCalled(); await click("← Xem tất cả bài báo"); expect(mocks.evidenceWorkspace).toHaveBeenCalled();
});
