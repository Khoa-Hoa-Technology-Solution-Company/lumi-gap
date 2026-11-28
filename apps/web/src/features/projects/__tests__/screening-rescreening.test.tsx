// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScreeningMetrics, ScreeningPaperRow, ScreeningRoundView, WorkspacePerson } from "@trend/shared-types";
import { ScreeningPaperDetail } from "../components/screening-round";
import { ScreeningAnalytics } from "../components/screening-analytics";

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  rounds: vi.fn(),
  history: vi.fn(),
  reopenUnresolved: vi.fn(),
  assign: vi.fn(),
  claim: vi.fn(),
  analytics: vi.fn(),
  action: vi.fn(),
  ai: vi.fn(),
}));

vi.mock("../api/screening.api", () => ({ screeningApi: mocks }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "vi", t: (key: string) => key }) }));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (select: (state: { user: { id: string; fullName: string } }) => unknown) =>
    select({ user: { id: "rev-a", fullName: "Trần Reviewer A" } }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const people: WorkspacePerson[] = [
  { id: "owner-1", name: "Nguyễn Văn Chủ" },
  { id: "rev-a", name: "Trần Reviewer A" },
  { id: "rev-b", name: "Lê Reviewer B" },
  { id: "member-c", name: "Phạm Thành Viên C" },
];

function makeRound(overrides: Partial<ScreeningRoundView> = {}): ScreeningRoundView {
  return {
    id: "round-1",
    paperId: "paper-1",
    number: 1,
    phase: "TITLE_ABSTRACT",
    version: 3,
    active: true,
    status: "INCLUDED",
    settings: {
      workflowKind: "TEAM_SCREENING",
      screeningMode: "SINGLE_STAGE",
      workflowVersion: 13,
      reviewMode: "INDEPENDENT",
      blindReview: true,
      resolutionPolicy: "CONSENSUS",
      version: 2,
      requiredReviewers: 2,
      consensusPolicy: "UNANIMOUS",
      aiAssisted: false,
      inclusionCriteria: ["Empirical study"],
      exclusionCriteria: ["Wrong study design"],
      researchQuestions: [],
      stages: ["TITLE_ABSTRACT"],
    },
    unblindedAt: "2026-11-20T10:00:00.000Z",
    independenceCompromised: false,
    assignments: [
      { id: "asg-a", reviewerId: "rev-a", name: "Trần Reviewer A", revision: 1, completed: true, active: true, dueAt: null, overdue: false },
      { id: "asg-b", reviewerId: "rev-b", name: "Lê Reviewer B", revision: 1, completed: true, active: true, dueAt: null, overdue: false },
    ],
    reviews: [
      { id: "r-a", assignmentId: "asg-a", reviewerId: "rev-a", revision: 1, decision: "INCLUDE", exclusionReason: "", comment: "Đạt tiêu chí nghiên cứu", submittedAt: "2026-11-20T09:50:00.000Z" },
      { id: "r-b", assignmentId: "asg-b", reviewerId: "rev-b", revision: 1, decision: "INCLUDE", exclusionReason: "", comment: "Phù hợp câu hỏi nghiên cứu", submittedAt: "2026-11-20T10:00:00.000Z" },
    ],
    myReview: { id: "r-a", assignmentId: "asg-a", reviewerId: "rev-a", revision: 1, decision: "INCLUDE", exclusionReason: "", comment: "Đạt tiêu chí nghiên cứu", submittedAt: "2026-11-20T09:50:00.000Z" },
    myAssignmentId: "asg-a",
    hiddenReviews: false,
    completed: 2,
    assigned: 2,
    finalDecision: {
      id: "fd-1",
      version: 3,
      decision: "INCLUDED",
      source: "CONSENSUS",
      reason: "Tất cả reviewer xác nhận phù hợp theo tiêu chí của vòng",
      resolverId: null,
      createdAt: "2026-11-20T10:00:00.000Z",
    },
    finalizer: { id: "", name: "Chưa chỉ định" },
    canFinalize: false,
    canReview: false,
    canManage: false,
    aiVisible: true,
    canReopenUnresolved: true,
    canRescreenStages: ["TITLE_ABSTRACT"],
    extractionReady: true,
    createdAt: "2026-11-20T09:00:00.000Z",
    ...overrides,
  };
}

function makePaper(round: ScreeningRoundView): ScreeningPaperRow {
  return {
    paperId: "paper-1",
    title: "Dual-Reviewer Clinical Literature Screening with LLMs",
    abstractText: "A controlled empirical evaluation of systematic literature screening.",
    doi: "10.1000/test.2026",
    publicationYear: 2026,
    journalName: "Journal of Biomedical Informatics",
    authors: ["Alice Nguyen", "Bob Tran"],
    fullTextAvailable: true,
    legacyStatus: "INCLUDED",
    legacyProvenance: false,
    proposer: { id: "owner-1", name: "Nguyễn Văn Chủ" },
    proposedAt: "2026-11-19T08:00:00.000Z",
    proposalReason: "Core study for RQ1",
    updatedAt: "2026-11-20T10:00:00.000Z",
    canEditProposal: false,
    round,
  };
}

let root: Root, container: HTMLDivElement, client: QueryClient;

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 25));
  });
}

async function mount(node: ReactNode) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {node}
        </MemoryRouter>
      </QueryClientProvider>
    );
  });
  await settle();
}

describe("Re-screening & Decision Revision UI", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.resetAllMocks();
    mocks.history.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, hasNext: false });
    mocks.ai.mockResolvedValue(null);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows secondary 'Đánh giá lại' beside 'Lịch sử đánh giá' for authorized reviewer and hides it when unauthorized", async () => {
    const allowedRound = makeRound({ canReopenUnresolved: true });
    mocks.detail.mockResolvedValue(allowedRound);
    mocks.rounds.mockResolvedValue({ items: [allowedRound], page: 1, pageSize: 10, total: 1, hasNext: false, legacy: null });

    await mount(<ScreeningPaperDetail projectId="proj-1" paper={makePaper(allowedRound)} people={people} readOnly={false} />);

    const buttons = [...document.querySelectorAll("button")].map(b => b.textContent?.trim() ?? "");
    expect(buttons.some(t => t.includes("Đánh giá lại"))).toBe(true);
    expect(buttons.some(t => t.includes("Lịch sử đánh giá"))).toBe(true);

    client.clear();
    const deniedRound = makeRound({ id: "round-denied", canReopenUnresolved: false, myAssignmentId: null, myReview: null });
    mocks.detail.mockResolvedValue(deniedRound);
    mocks.rounds.mockResolvedValue({ items: [deniedRound], page: 1, pageSize: 10, total: 1, hasNext: false, legacy: null });

    await mount(<ScreeningPaperDetail key="denied" projectId="proj-1" paper={makePaper(deniedRound)} people={people} readOnly={false} />);
    const buttonsDenied = [...document.querySelectorAll("button")].map(b => b.textContent?.trim() ?? "");
    expect(buttonsDenied.some(t => t === "Đánh giá lại")).toBe(false);
  });

  it("opens compact Reopen Dialog with pre-filled context, criteria-change warning, and submits reasonCategory + reason", async () => {
    const round = makeRound({
      phase: "FULL_TEXT",
      canRescreenStages: ["FULL_TEXT", "TITLE_ABSTRACT"],
    });
    mocks.detail.mockResolvedValue(round);
    mocks.rounds.mockResolvedValue({ items: [round], page: 1, pageSize: 10, total: 1, hasNext: false, legacy: null });
    mocks.reopenUnresolved.mockResolvedValue({ roundId: "round-2", id: "round-2", version: 1 });

    await mount(<ScreeningPaperDetail projectId="proj-1" paper={makePaper(round)} people={people} readOnly={false} />);

    const reopenBtn = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Đánh giá lại");
    expect(reopenBtn).toBeDefined();
    await act(async () => { reopenBtn!.click(); });
    await settle();

    expect(document.body.textContent).toContain("Đánh giá lại bài báo");
    expect(document.body.textContent).toContain("Kết quả cũ được giữ cho đến khi vòng đánh giá mới hoàn tất");
    expect(document.body.textContent).toContain("Trần Reviewer A · Lê Reviewer B");

    const options = [...document.querySelectorAll("details")].find(el => el.querySelector("summary")?.textContent === "Tùy chọn giai đoạn và lý do")!;
    expect(options.open).toBe(false);
    await act(async () => { options.querySelector("summary")!.click(); });
    // Select CRITERIA_CHANGED and verify warning without silently mutating protocol
    const criteriaRadio = document.querySelector<HTMLInputElement>('input[type="radio"][value="CRITERIA_CHANGED"]');
    expect(criteriaRadio).not.toBeNull();
    await act(async () => { criteriaRadio!.click(); });
    await settle();
    expect(document.body.textContent).toContain("phiên bản tiêu chí (v2)");
    expect(document.body.textContent).toContain("âm thầm sửa protocol");

    // Fill short explanation & submit
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[id^="rescreen-reason-"]');
    expect(textarea).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        textarea,
        "Sau khi đọc lại Methodology, mẫu dữ liệu chưa đạt tiêu chí mới."
      );
      textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();

    const submitBtn = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Bắt đầu đánh giá lại");
    expect(submitBtn).toBeDefined();
    await act(async () => { submitBtn!.click(); });
    await settle();

    expect(mocks.reopenUnresolved).toHaveBeenCalledWith(
      "proj-1",
      "round-1",
      expect.objectContaining({
        expectedVersion: 3,
        reasonCategory: "CRITERIA_CHANGED",
        reason: "Sau khi đọc lại Methodology, mẫu dữ liệu chưa đạt tiêu chí mới.",
      })
    );
  });

  it("renders In-Progress Re-screening banner, inline review form, and Blind-safe Decision History", async () => {
    const round1 = makeRound({ id: "round-1", number: 1, active: false, status: "INCLUDED" });
    const round2 = makeRound({
      id: "round-2",
      number: 2,
      active: true,
      status: "NOT_REVIEWED",
      unblindedAt: null,
      hiddenReviews: true,
      completed: 0,
      assigned: 2,
      reviews: [],
      myReview: null,
      finalDecision: null,
      canReview: true,
      canReopenUnresolved: false,
      rescreening: true,
      publishedResult: { roundId: "round-1", number: 1, status: "INCLUDED", phase: "TITLE_ABSTRACT" },
      rescreenContext: {
        previousRoundId: "round-1",
        previousRoundNumber: 1,
        previousStatus: "INCLUDED",
        reasonCategory: "NEW_INFORMATION",
        reason: "Bổ sung bản PDF toàn văn mới từ tác giả",
        openedById: "rev-a",
        openedByName: "Trần Reviewer A",
        openedAt: "2026-11-21T08:00:00.000Z",
      },
      assignments: [
        { id: "asg-a2", reviewerId: "rev-a", name: "Trần Reviewer A", revision: 1, completed: false, active: true, dueAt: null, overdue: false },
        { id: "asg-b2", reviewerId: "rev-b", name: "Lê Reviewer B", revision: 1, completed: false, active: true, dueAt: null, overdue: false },
      ],
      myAssignmentId: "asg-a2",
    });

    mocks.detail.mockResolvedValue(round2);
    mocks.rounds.mockResolvedValue({ items: [round2, round1], page: 1, pageSize: 10, total: 2, hasNext: false, legacy: null });

    await mount(<ScreeningPaperDetail projectId="proj-1" paper={makePaper(round2)} people={people} readOnly={false} />);

    expect(document.body.textContent).toContain("Đang đánh giá lại · Vòng 2");
    expect(document.body.textContent).toContain("Kết quả trước đó (Vòng 1): Đã chọn");
    expect(document.body.textContent).toContain("Bổ sung bản PDF toàn văn mới từ tác giả");
    expect([...document.querySelectorAll("button")].some(b => b.textContent?.trim() === "Gửi phiếu đánh giá")).toBe(true);
    expect(document.body.textContent).toContain("Lịch sử đánh giá (2 vòng)");
    expect(document.body.textContent).toContain("Phiếu của vòng này đang được ẩn theo chế độ đánh giá độc lập");
  });

  it("leaves replacement reviewers to claim the round instead of offering manual assignment", async () => {
    const round2 = makeRound({
      id: "round-2",
      number: 2,
      active: true,
      status: "NOT_REVIEWED",
      unblindedAt: null,
      hiddenReviews: true,
      completed: 0,
      assigned: 1,
      reviews: [],
      myReview: null,
      finalDecision: null,
      canReview: false,
      canReopenUnresolved: false,
      canAssignReviewers: true,
      canClaim: true,
      rescreening: true,
      publishedResult: { roundId: "round-1", number: 1, status: "INCLUDED", phase: "TITLE_ABSTRACT" },
      assignments: [
        { id: "asg-b2", reviewerId: "rev-b", name: "Lê Reviewer B", revision: 1, completed: false, active: true, dueAt: null, overdue: false },
      ],
      myAssignmentId: null,
    });
    mocks.claim.mockResolvedValue({ roundId: "round-2" });
    mocks.detail.mockResolvedValue(round2);
    mocks.rounds.mockResolvedValue({ items: [round2], page: 1, pageSize: 10, total: 1, hasNext: false, legacy: null });

    await mount(<ScreeningPaperDetail projectId="proj-1" paper={makePaper(round2)} people={people} readOnly={false} />);

    expect(document.body.textContent).not.toContain("Phân công thay thế");
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(document.querySelector('select[aria-label="Chọn reviewer thay thế"]')).toBeNull();
    const claim = document.querySelector<HTMLButtonElement>('[data-screening-section="claim-slot"] button');
    expect(claim?.textContent).toContain("Nhận lượt đánh giá");
    await act(async () => claim!.click());
    await settle();
    expect(mocks.claim).toHaveBeenCalledWith("proj-1", "round-2", { clientKey: expect.any(String) });
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it("renders PRISMA summary with active re-screening warning and separates Closed Without Consensus from Excluded", async () => {
    const metrics: ScreeningMetrics = {
      totalPapers: 10,
      evaluatedPapers: 10,
      reviewedPapers: 10,
      finalizedPapers: 8,
      legacyPapers: 0,
      fullyParticipated: 8,
      fullyReviewed: 8,
      agreements: 7,
      disagreements: 1,
      pendingReviews: 2,
      submittedReviews: 18,
      assignedReviews: 20,
      completionRate: 90,
      agreementRate: 87.5,
      conflictRate: 12.5,
      unresolved: 1,
      resolved: 0,
      excludedFromAgreement: 0,
      rescreeningPapers: 2,
      distribution: {
        CONSENSUS_REQUIRED: 0, CONSENSUS_IN_PROGRESS: 0, WAITING_FULLTEXT: 0,
        NOT_REVIEWED: 0, IN_REVIEW: 2, NEEDS_RESOLUTION: 0, NEEDS_MORE_INFO: 0,
        ADJUDICATING: 0, AWAITING_FINALIZATION: 0, INCLUDED: 5, EXCLUDED: 2,
        BACKGROUND: 0, CLOSED_UNRESOLVED: 1,
      },
      exclusionReasons: [{ reason: "Wrong study design", count: 2 }],
      workload: [],
      kappa: { value: 0.75, reason: "OK", papers: 8, reviewerIds: ["rev-a", "rev-b"] },
      prismaSummary: {
        identified: 10,
        screened: 10,
        included: 5,
        excluded: 2,
        closedUnresolved: 1,
        pending: 2,
        rescreeningInProgress: 2,
        excludedByStage: {
          TITLE_ABSTRACT: { count: 1, reasons: [{ reason: "Wrong study design", count: 1 }] },
          FULL_TEXT: { count: 1, reasons: [{ reason: "Wrong study design", count: 1 }] },
        },
      },
    };
    mocks.analytics.mockResolvedValue(metrics);

    await mount(<ScreeningAnalytics projectId="proj-1" />);

    expect(document.body.textContent).toContain("Tổng hợp PRISMA theo kết quả hiệu lực");
    expect(document.body.textContent).toContain("2 bài đang đánh giá lại");
    expect(document.body.textContent).toContain("Tách biệt với Loại theo tiêu chí");
    expect(document.body.textContent).toContain("Tóm tắt: 1 · Toàn văn: 1");
  });
  it("shows the immutable first ballot on a closed disagreement after a later revision", async () => {
    const base = makeRound(), initial = base.reviews[0]!;
    const round = makeRound({ status: "CLOSED_UNRESOLVED", canReopenUnresolved: false,
      reviews: [{ ...initial, id: "r-a-v2", revision: 2, comment: "Later revised rationale" }, base.reviews[1]!],
      closureDetails: { actorType: "REVIEWERS", reason: "NO_CONSENSUS", closedAt: "2026-11-20T11:00:00.000Z" },
      finalDecision: { ...base.finalDecision!, decision: "CLOSED_UNRESOLVED" },
      reviewHistory: [{ ...initial, reviewerName: "Trần Reviewer A", phaseMarker: "INDEPENDENT_INITIAL" }],
    });
    mocks.detail.mockResolvedValue(round); mocks.rounds.mockResolvedValue({ items: [round], page: 1, pageSize: 10, total: 1, hasNext: false, legacy: null });
    await mount(<ScreeningPaperDetail projectId="proj-1" paper={makePaper(round)} people={people} readOnly={false} />);
    const heading = [...document.querySelectorAll("h5")].find(el => el.textContent?.includes("Hai phiếu đánh giá độc lập ban đầu"))!;
    expect(heading.parentElement?.querySelector(".p-3 p")?.textContent).toBe(initial.comment);
  });

});
