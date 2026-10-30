// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ScreeningBoard, ScreeningRoundView } from "@trend/shared-types";
import { CollaborativeLibrary } from "../components/collaborative-library";
import { LibraryAssessment } from "../components/library-assessment";

const mocks = vi.hoisted(() => ({ board: vi.fn(), assess: vi.fn(), createSet: vi.fn(), sets: vi.fn(), confirm: vi.fn() }));
vi.mock("../api/screening.api", () => ({ screeningApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "actor" } }) }));
vi.mock("@/services/confirmation", () => ({ confirmUnsavedChanges: mocks.confirm }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "vi" }) }));
vi.mock("../components/screening-round", () => ({ ScreeningPaperDetail: () => <p>Chi tiết bài</p> }));
vi.mock("../components/library-related-papers", () => ({ LibraryRelatedPapers: () => <p>Quan hệ từ nguồn</p> }));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>, DialogContent: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>, DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>, DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p> }));

const settings = { reviewMode: "COLLABORATIVE" as const, blindReview: false, resolutionPolicy: "ADJUDICATION" as const, requiredReviewers: 1, version: 0, consensusPolicy: "UNANIMOUS" as const, aiAssisted: false, inclusionCriteria: [], exclusionCriteria: [], researchQuestions: [] };
const board: ScreeningBoard = { settings, canManage: true, progress: { total: 2, reviewed: 0, finalized: 0, legacy: 1 }, librarySummary: { selected: 0, attention: 2, discussion: 0 }, filters: { proposers: [], reviewers: [] }, people: [], myProgress: { assigned: 0, completed: 0, pending: 0, overdue: 0 }, page: 1, pageSize: 12, total: 2, hasNext: false, items: ["one", "two"].map(paperId => ({ paperId, title: `Source ${paperId} <script>unsafe()</script>`, abstractText: "Stored source abstract", doi: null, publicationYear: 2025, proposer: null, proposedAt: "2026-10-29T00:00:00Z", proposalReason: "", updatedAt: "2026-10-29T00:00:00Z", canEditProposal: false, legacyStatus: "INCLUDED", legacyProvenance: true, round: null, tags: ["Learning"] })) };
let root: Root, container: HTMLDivElement, client: QueryClient;
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); }
async function render(node: ReactNode) { await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>)); await settle(); }
async function click(text: string) { const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text); expect(button).toBeDefined(); await act(async () => button!.click()); await settle(); }
async function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); mocks.board.mockResolvedValue(board); mocks.assess.mockResolvedValue({ roundId: "round", revision: 1 }); mocks.sets.mockResolvedValue({ items: [], total: 0, page: 1, hasNext: false }); mocks.confirm.mockResolvedValue(true); client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });

it("shows the shared library without turning historical labels into new decisions", async () => {
  const add = vi.fn(); await render(<CollaborativeLibrary projectId="p" readOnly={false} onAdd={add} />);
  expect(container.querySelectorAll("article")).toHaveLength(2); expect(container.querySelector("script")).toBeNull();
  expect(container.textContent).toContain("phân loại cũ không được tính"); expect(container.querySelectorAll('[data-state="NOT_REVIEWED"]')).toHaveLength(2);
  await click("Thêm bài báo"); expect(add).toHaveBeenCalledOnce();
});
it("allows an optional exclusion note and preserves the draft/idempotency key after failure", async () => {
  mocks.assess.mockRejectedValue(new Error("Offline"));
  await render(<LibraryAssessment projectId="p" paperId="one" round={null} settings={settings} readOnly={false} />);
  const radio = [...container.querySelectorAll("label")].find(l => l.textContent === "Không phù hợp")!.querySelector<HTMLInputElement>("input")!;
  await act(async () => radio.click()); expect(container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(false);
  await input(container.querySelector("textarea")!, "Wrong population for our question"); await click("Lưu ý kiến"); await click("Lưu ý kiến");
  expect(mocks.assess).toHaveBeenCalledTimes(2); expect(mocks.assess.mock.calls[0]![2].clientKey).toBe(mocks.assess.mock.calls[1]![2].clientKey);
  expect(container.querySelector("textarea")!.value).toBe("Wrong population for our question"); expect(container.querySelector('[role="alert"]')).not.toBeNull();
});
it("submits only the current user's expected revision and retains drafts if access is revoked", async () => {
  mocks.assess.mockResolvedValue({ roundId: "round", revision: 3 });
  const own = { id: "review", assignmentId: "assignment", reviewerId: "actor", revision: 2, decision: "INCLUDE" as const, exclusionReason: "", comment: "My original opinion", submittedAt: "2026-10-29T00:00:00Z" };
  const round = { id: "round", settings, myReview: own, canReview: true, finalDecision: null } as unknown as ScreeningRoundView;
  await render(<LibraryAssessment projectId="p" paperId="one" round={round} settings={settings} readOnly={false} />);
  await input(container.querySelector("textarea")!, "Updated after reading methods"); await click("Cập nhật ý kiến");
  expect(mocks.assess.mock.calls[0]![2]).toMatchObject({ roundId: "round", expectedRevision: 2, comment: "Updated after reading methods" });
  expect(mocks.assess.mock.calls[0]![2]).not.toHaveProperty("reviewerId");
  await input(container.querySelector("textarea")!, "A new draft to keep");
  await render(<LibraryAssessment projectId="p" paperId="one" round={{ ...round, canReview: false }} settings={settings} readOnly={false} />);
  expect(container.querySelector("textarea")!.value).toBe("A new draft to keep"); expect(container.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true);
});
it("creates an exact draft set without invoking AI and exposes official mode only to the owner", async () => {
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  const checks = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'); await act(async () => { checks[0]!.click(); checks[1]!.click(); });
  await click("Đưa vào phân tích"); expect(container.textContent).toContain("Chưa chạy AI");
  expect(container.querySelector('option[value="OFFICIAL"]')).not.toBeNull();
  mocks.createSet.mockRejectedValue(new Error("Network failed"));
  await input(container.querySelector('[role="dialog"] input')!, "Methods comparison"); await click("Lưu bộ bài & mở phân tích");
  expect(mocks.createSet.mock.calls[0]![1]).toMatchObject({ mode: "DRAFT", topic: "Methods comparison", paperIds: ["one", "two"] });
  expect((container.querySelector('[role="dialog"] input') as HTMLInputElement).value).toBe("Methods comparison");
});
it("hides contribution actions for a read-only library", async () => {
  await render(<CollaborativeLibrary projectId="p" readOnly />);
  expect(container.querySelector('input[type="checkbox"]')).toBeNull(); expect(container.textContent).not.toContain("Thêm bài báo");
});

it("uses an existing unsubmitted assignment revision and the revision returned by the server", async () => {
  const round = { id: "round", settings, myReview: null, myAssignmentId: "assignment", assignments: [{ id: "assignment", revision: 1 }], canReview: true, finalDecision: null } as unknown as ScreeningRoundView;
  mocks.assess.mockResolvedValue({ roundId: "round", revision: 1 });
  await render(<LibraryAssessment projectId="p" paperId="one" round={round} settings={settings} readOnly={false} />);
  await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  await click("Lưu ý kiến");
  expect(mocks.assess.mock.calls[0]![2].expectedRevision).toBe(1);
  await input(container.querySelector("textarea")!, "More detail after reading");
  await click("Lưu ý kiến");
  expect(mocks.assess.mock.calls[1]![2].expectedRevision).toBe(1);
});

it("records actual question IDs and requires full-text context without imposing an exclusion essay", async () => {
  const questionId = "d1d88a58-d94a-4b05-819e-1c0f565de2f2";
  await render(<LibraryAssessment projectId="p" paperId="one" round={null} settings={{ ...settings, questionOptions: [{ id: questionId, text: "How does this method help students?" }] }} readOnly={false} />);
  await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  const scope = container.querySelector<HTMLSelectElement>("select")!;
  await act(async () => { scope.value = "FULL_TEXT"; scope.dispatchEvent(new Event("change", { bubbles: true })); });
  const save = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Lưu ý kiến")!;
  expect(save.disabled).toBe(true);
  await input(container.querySelector<HTMLInputElement>('input:not([type="radio"]):not([type="checkbox"])')!, "Licensed full text read, pages 1 to 10");
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await click("Lưu ý kiến");
  expect(mocks.assess.mock.calls[0]![2]).toMatchObject({ scope: "FULL_TEXT", fullTextReference: "Licensed full text read, pages 1 to 10", researchQuestionIds: [questionId], comment: "" });
  expect(container.textContent).toContain("Đã lưu ý kiến của bạn.");
});

it("navigates between papers without returning to the list and keeps reviewer filters on the server", async () => {
  mocks.board.mockResolvedValue({ ...board, filters: { ...board.filters, reviewers: [{ id: "reviewer", name: "Peer reviewer" }] } });
  await render(<CollaborativeLibrary projectId="p" readOnly={false} />);
  await click("Source one <script>unsafe()</script>");
  expect(container.querySelector('[aria-label="Chuyển bài báo"]')?.textContent).toContain("1 / 2 bài");
  await click("Bài tiếp →");
  expect(container.querySelector('[aria-label="Chuyển bài báo"]')?.textContent).toContain("2 / 2 bài");
  expect(container.querySelector('[role="dialog"] script')).toBeNull();
  const reviewer = container.querySelector<HTMLSelectElement>('[aria-label="Người đánh giá"]')!;
  await act(async () => { reviewer.value = "reviewer"; reviewer.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle();
  expect(mocks.board.mock.calls.some(call => call[1].reviewerId === "reviewer")).toBe(true);
});

it("keeps the current paper when the researcher declines to discard a pending assessment", async () => {
  await render(<><CollaborativeLibrary projectId="p" readOnly={false} /><LibraryAssessment projectId="p" paperId="draft" round={null} settings={settings} readOnly={false} /></>);
  await click("Source one <script>unsafe()</script>");
  await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  mocks.confirm.mockResolvedValue(false);
  await click("Bài tiếp →");
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(container.querySelector('[aria-label="Chuyển bài báo"]')?.textContent).toContain("1 / 2 bài");
});
