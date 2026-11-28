// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmissionHistory } from "@trend/shared-types";
import type { SubmissionSummary } from "../api/submissions.api";
import { SubmissionListPage } from "@/pages/submissions/submission-list";
import { SubmissionFeedbackPanel } from "../components/submission-feedback-panel";
import { SubmissionAiPreReview } from "../components/submission-ai-prereview";
import { clearRevisionDrafts, readRevisionDrafts, writeRevisionDraft } from "../revision-response-drafts";
import { resolveVersionReviewContext } from "../submission-review-status";

const mocks = vi.hoisted(() => ({
  useSubmissions: vi.fn(),
}));

vi.mock("@/features/submissions", () => ({
  useSubmissions: mocks.useSubmissions,
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: "student-qa" } }),
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (k: string, values?: Record<string, string | number>) =>
      k.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values?.[key] ?? "")),
    language: "vi",
  }),
}));

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;

async function renderNode(node: ReactNode) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter>
      </QueryClientProvider>,
    );
  });
}

function makeSubmission(overrides: Partial<SubmissionSummary>): SubmissionSummary {
  return {
    _id: "sub-default",
    projectId: "proj-1",
    title: "LumiGap",
    submissionType: "RESEARCH_PAPER",
    researchQuestions: [],
    keywords: [],
    status: "submitted",
    currentRevisionNumber: 1,
    createdAt: "2026-11-10T00:00:00Z",
    updatedAt: "2026-11-20T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  window.sessionStorage.clear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("SubmissionListPage refinement (LIST-01..10)", () => {
  it("filters accurately, sorts needs-revision first, hides missing researchField, and distinguishes duplicate titles", async () => {
    const items: SubmissionSummary[] = [
      makeSubmission({
        _id: "sub-unsent",
        title: "LumiGap",
        status: "submitted",
        researchField: "",
        latestFileName: "draft-outline.pdf",
        updatedAt: "2026-11-25T10:00:00Z",
        reviewSummary: {
          state: "UNSENT",
          hasReviewRequest: false,
          activeReviewerNames: [],
          openMandatoryRevisionCount: 0,
          openSuggestionCount: 0,
          totalReviewRequestCount: 0,
          hasFeedback: false,
          hasCompletedInternalApproval: false,
          hasMultipleMentors: false,
          waitingCount: 0,
          revisionRequestedCount: 0,
        },
      }),
      makeSubmission({
        _id: "sub-revision",
        title: "LumiGap",
        status: "revision_requested",
        currentRevisionNumber: 2,
        latestFileName: "paper-v2.pdf",
        updatedAt: "2026-11-22T10:00:00Z",
        reviewSummary: {
          state: "REVISION_REQUESTED",
          hasReviewRequest: true,
          activeReviewerNames: ["TS. Phạm Bảo Ngọc"],
          openMandatoryRevisionCount: 2,
          openSuggestionCount: 1,
          totalReviewRequestCount: 1,
          hasFeedback: true,
          hasCompletedInternalApproval: false,
          hasMultipleMentors: false,
          waitingCount: 0,
          revisionRequestedCount: 1,
        },
      }),
      makeSubmission({
        _id: "sub-waiting",
        title: "Experiment Appendix",
        status: "under_review",
        latestFileName: "appendix-v1.pdf",
        updatedAt: "2026-11-24T10:00:00Z",
        reviewSummary: {
          state: "RESUBMITTED",
          hasReviewRequest: true,
          activeReviewerNames: ["PGS. Trần Minh"],
          openMandatoryRevisionCount: 0,
          openSuggestionCount: 0,
          totalReviewRequestCount: 1,
          hasFeedback: true,
          hasCompletedInternalApproval: false,
          hasMultipleMentors: false,
          waitingCount: 1,
          revisionRequestedCount: 0,
        },
      }),
      makeSubmission({
        _id: "sub-approved",
        title: "Final Proposal",
        status: "completed",
        updatedAt: "2026-11-21T10:00:00Z",
        reviewSummary: {
          state: "INTERNAL_APPROVED",
          hasReviewRequest: true,
          activeReviewerNames: ["TS. Lê An"],
          openMandatoryRevisionCount: 0,
          openSuggestionCount: 0,
          totalReviewRequestCount: 1,
          hasFeedback: true,
          hasCompletedInternalApproval: true,
          hasMultipleMentors: false,
          waitingCount: 0,
          revisionRequestedCount: 0,
        },
      }),
    ];

    mocks.useSubmissions.mockReturnValue({ data: items, isLoading: false, error: null, refetch: vi.fn() });
    await renderNode(<SubmissionListPage projectId="proj-1" />);

    // Never displays English fallback for missing researchField
    expect(container.textContent).not.toContain("Research field not specified");

    // Priority sorting places "Cần chỉnh sửa" (paper-v2.pdf) first despite older updatedAt
    const articles = Array.from(container.querySelectorAll("article"));
    expect(articles).toHaveLength(4);
    expect(articles[0]!.textContent).toContain("paper-v2.pdf");
    expect(articles[0]!.textContent).toContain("Có 2 yêu cầu chỉnh sửa từ TS. Phạm Bảo Ngọc");
    expect(articles[0]!.textContent).toContain("Xem góp ý");

    // Duplicate title "LumiGap" distinguished via real filename & accurate "Chưa gửi" status
    expect(container.textContent).toContain("draft-outline.pdf");
    expect(container.textContent).toContain("Chưa gửi");
    expect(container.textContent).toContain("Chấp thuận nội bộ");

    // Filter: Cần chỉnh sửa -> returns only sub-revision
    const needsRevTab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) =>
      el.textContent?.includes("Cần chỉnh sửa"),
    ) as HTMLButtonElement;
    await act(async () => needsRevTab.click());
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.textContent).toContain("paper-v2.pdf");

    // Filter: Chưa gửi -> returns only sub-unsent (even though raw submission.status === "submitted")
    const unsentTab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) =>
      el.textContent?.includes("Chưa gửi"),
    ) as HTMLButtonElement;
    await act(async () => unsentTab.click());
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.textContent).toContain("draft-outline.pdf");

    // Search across all
    const allTab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) =>
      el.textContent?.includes("Tất cả"),
    ) as HTMLButtonElement;
    await act(async () => allTab.click());
    const searchInput = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(searchInput, "Trần Minh");
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.textContent).toContain("Experiment Appendix");
  });

  it("renders API error state (not empty state) and hides send CTA when readOnly (LIST-09, LIST-10)", async () => {
    mocks.useSubmissions.mockReturnValue({ data: undefined, isLoading: false, error: new Error("500"), refetch: vi.fn() });
    await renderNode(<SubmissionListPage projectId="proj-1" readOnly />);
    expect(container.textContent).toContain("Chưa thể tải danh sách bản thảo. Vui lòng thử lại.");
    expect(container.textContent).not.toContain("Chưa có bản thảo nào");
    expect(container.textContent).not.toContain("Gửi bản thảo để góp ý");
  });
});

describe("Feedback tabs, revision drafts, integrity display, and multi-mentor consistency", () => {
  it("organizes feedback into 3 tabs, separates mandatory vs suggestions, syncs response drafts, and displays read-only integrity (FEED-01..08, REV-01..10)", async () => {
    const history: SubmissionHistory = {
      canManage: true,
      openForReview: false,
      currentRevisionId: "rev-1",
      currentRevisionNumber: 1,
      latestReviewedRevisionId: "rev-1",
      reviewRequests: [
        {
          id: "req-1",
          reviewerId: "mentor-1",
          reviewerName: "TS. Phạm Bảo Ngọc",
          status: "REVISION_REQUESTED",
          revisionNumber: 1,
          revisionId: "rev-1",
          origin: "MENTOR_GUIDANCE",
          createdAt: "2026-11-15T00:00:00Z",
          dueAt: null,
          canView: true,
        },
      ],
      versions: [
        {
          id: "rev-1",
          revisionNumber: 1,
          contentType: "PDF",
          contentSnapshot: null,
          checksumSha256: "abc",
          sizeBytes: 1000,
          originalFileName: "paper-v1.pdf",
          sourceRevisionId: null,
          responseToReview: null,
          createdAt: "2026-11-15T00:00:00Z",
          hasPdf: true,
          reviews: [
            {
              id: "r-1",
              reviewerId: "mentor-1",
              reviewerName: "TS. Phạm Bảo Ngọc",
              reviewerAcademicRole: "LECTURER",
              revisionId: "rev-1",
              roundNumber: 1,
              templateVersionId: "tpl-1",
              reviewMode: "RUBRIC_ASSESSMENT",
              weightedScore: 4.1,
              overallAssessment: "MAJOR_REVISION",
              keyStrengths: "Bố cục rõ ràng.",
              keyConcerns: "Thiếu dữ liệu thực nghiệm đối chứng.",
              overallComment: "Cần bổ sung bảng ablation và mô tả quy trình tách tập.",
              integrityChecks: {
                authorship: { status: "CHECKED" },
                borrowing: { status: "CHECKED" },
                data: { status: "CONCERN", note: "Cần làm rõ nguồn bộ dữ liệu công khai." },
                sources: { status: "CHECKED" },
                conflicts: { status: "CHECKED" },
                ai_disclosure: { status: "CHECKED" },
                ethics: { status: "NOT_APPLICABLE" },
                confidentiality: { status: "CHECKED" },
              },
              submittedAt: "2026-11-16T08:00:00Z",
              requestId: "req-1",
              responses: [
                {
                  criterionKey: "methodology",
                  criterionTitle: "Phương pháp nghiên cứu",
                  weight: 30,
                  maxScore: 5,
                  comment: "Thiếu tiêu chí chọn mẫu.",
                  evidence: "Mục 3.2",
                  assessment: null,
                  score: 3,
                  notApplicable: false,
                },
              ],
              requiredRevisions: [
                {
                  id: "item-major",
                  description: "Bổ sung cơ sở lựa chọn phương pháp nghiên cứu",
                  priority: "MAJOR",
                  status: "OPEN",
                  locator: "Mục 3.2",
                  responses: [],
                },
                {
                  id: "item-suggestion",
                  description: "Có thể bổ sung sơ đồ luồng dữ liệu ở phần mở đầu",
                  priority: "SUGGESTION",
                  status: "OPEN",
                  responses: [],
                },
              ],
            },
          ],
        },
      ],
      contributions: [],
    };

    const ctx = resolveVersionReviewContext({
      submissionStatus: "revision_requested",
      history,
      version: history.versions[0]!,
      isCurrentVersion: true,
    });

    const onOpenPrepare = vi.fn();
    await renderNode(
      <SubmissionFeedbackPanel
        submissionId="sub-1"
        projectId="proj-1"
        versionNumber={1}
        threads={ctx.threads}
        activeThread={ctx.activeThread}
        onSelectMentor={vi.fn()}
        language="vi"
        canPrepareRevision
        onOpenPrepareResubmission={onOpenPrepare}
      />,
    );

    // Defaults to "Cần chỉnh sửa" tab and counts only 1 mandatory item (suggestion excluded from mandatory count!)
    expect(container.textContent).toContain("Đã chuẩn bị phản hồi 0/1 yêu cầu bắt buộc.");
    expect(container.textContent).toContain("Bổ sung cơ sở lựa chọn phương pháp nghiên cứu");
    expect(container.textContent).toContain("Gợi ý");
    expect(container.textContent).toContain("Chưa chuẩn bị phản hồi");
    expect(container.textContent).not.toContain("OPEN"); // No raw enum

    // Draft a response inline -> persists in shared draft store & updates progress cleanly
    const openDraftBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Soạn phản hồi cho yêu cầu này"),
    )!;
    await act(async () => openDraftBtn.click());
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        textarea,
        "Nhóm đã bổ sung giải trình phương pháp ở mục 3.2.",
      );
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Đã chuẩn bị phản hồi cho tất cả yêu cầu bắt buộc.");
    expect(
      readRevisionDrafts({ userId: "student-qa", projectId: "proj-1", submissionId: "sub-1", requestId: "req-1" }),
    ).toEqual({
      "item-major": "Nhóm đã bổ sung giải trình phương pháp ở mục 3.2.",
    });

    // Switch to Assessment tab -> shows read-only rubric + integrity breakdown with calm disclaimer
    const assessmentTab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) =>
      el.textContent?.includes("Đánh giá"),
    ) as HTMLButtonElement;
    await act(async () => assessmentTab.click());
    expect(container.textContent).toContain("Phương pháp nghiên cứu");
    expect(container.textContent).toContain("3/5");
    expect(container.textContent).toContain("Đã kiểm tra 8/8 mục");
    expect(container.textContent).toContain("Cần làm rõ nguồn bộ dữ liệu công khai.");
    expect(container.textContent).toContain("Cần xem xét không đồng nghĩa với kết luận vi phạm");

    // Switch back to Revisions tab -> draft is preserved!
    const revisionsTab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) =>
      el.textContent?.includes("Cần chỉnh sửa"),
    ) as HTMLButtonElement;
    await act(async () => revisionsTab.click());
    expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "Nhóm đã bổ sung giải trình phương pháp ở mục 3.2.",
    );

    // Drafts for another mentor request remain strictly isolated (REV-09)
    writeRevisionDraft(
      { userId: "student-qa", projectId: "proj-1", submissionId: "sub-1", requestId: "req-mentor-2" },
      "item-other",
      "Mentor 2 response",
    );
    expect(
      readRevisionDrafts({ userId: "student-qa", projectId: "proj-1", submissionId: "sub-1", requestId: "req-1" }),
    ).not.toHaveProperty("item-other");
    clearRevisionDrafts({ userId: "student-qa", projectId: "proj-1", submissionId: "sub-1", requestId: "req-1" });
  });

  it("keeps overallVersionStatus stable when switching between multiple mentors (MULTI-01..05)", () => {
    const history: SubmissionHistory = {
      canManage: true,
      openForReview: false,
      currentRevisionId: "rev-1",
      currentRevisionNumber: 1,
      latestReviewedRevisionId: "rev-1",
      reviewRequests: [
        {
          id: "req-a",
          reviewerId: "mentor-a",
          reviewerName: "TS. Phạm Bảo Ngọc",
          status: "REVISION_REQUESTED",
          revisionNumber: 1,
          revisionId: "rev-1",
          origin: "MENTOR_GUIDANCE",
          createdAt: "2026-11-15T00:00:00Z",
          dueAt: null,
          canView: true,
        },
        {
          id: "req-b",
          reviewerId: "mentor-b",
          reviewerName: "PGS. Trần Minh",
          status: "IN_REVIEW",
          revisionNumber: 1,
          revisionId: "rev-1",
          origin: "MENTOR_GUIDANCE",
          createdAt: "2026-11-15T01:00:00Z",
          dueAt: null,
          canView: true,
        },
      ],
      versions: [
        {
          id: "rev-1",
          revisionNumber: 1,
          contentType: "PDF",
          contentSnapshot: null,
          checksumSha256: "abc",
          sizeBytes: 1000,
          originalFileName: "paper.pdf",
          sourceRevisionId: null,
          responseToReview: null,
          createdAt: "2026-11-15T00:00:00Z",
          hasPdf: true,
          reviews: [],
        },
      ],
      contributions: [],
    };

    const ctxA = resolveVersionReviewContext({
      submissionStatus: "revision_requested",
      history,
      version: history.versions[0]!,
      isCurrentVersion: true,
      selectedMentorKey: "mentor-a",
    });
    const ctxB = resolveVersionReviewContext({
      submissionStatus: "revision_requested",
      history,
      version: history.versions[0]!,
      isCurrentVersion: true,
      selectedMentorKey: "mentor-b",
    });

    // Global status stays REVISION_REQUESTED even while viewing Mentor B (IN_PROGRESS)
    expect(ctxA.overallVersionStatus.state).toBe("REVISION_REQUESTED");
    expect(ctxB.overallVersionStatus.state).toBe("REVISION_REQUESTED");
    expect(ctxB.activeThread?.status.state).toBe("IN_PROGRESS");
    expect(ctxB.overallSummaryText).toContain("Có yêu cầu chỉnh sửa cần xử lý");
    expect(ctxB.overallSummaryText).toContain("1 giảng viên đang phản biện");
    expect(ctxB.overallSummaryText).toContain("PGS. Trần Minh");
  });
});

describe("SubmissionAiPreReview version isolation, concurrency, and failure recovery (AI-01..15)", () => {
  it("isolates AI pre-review strictly per sourceRevisionId and never shows v1 analysis under v2", async () => {
    const onRun = vi.fn();
    const onSelectVersion = vi.fn();
    await renderNode(
      <SubmissionAiPreReview
        preReviews={[
          {
            id: "ai-v1",
            rqCoverage: [], unsupportedClaims: [], citationIssues: [], reviewFocusAreas: [], limitations: [],
            status: "COMPLETED",
            sourceRevisionId: "rev-1",
            sourceRevisionNumber: 1,
            summary: "Tóm tắt riêng của v1",
            createdAt: "2026-11-20T08:00:00Z",
            completedAt: "2026-11-20T08:01:00Z",
          },
        ]}
        selectedRevisionId="rev-2"
        selectedRevisionNumber={2}
        canRunPreReview
        isRunning={false}
        onRun={onRun}
        onSelectVersion={onSelectVersion}
      />,
    );

    expect(container.textContent).toContain("Phiên bản v2 chưa có đánh giá sơ bộ bằng AI.");
    expect(container.textContent).not.toContain("Tóm tắt riêng của v1");

    const runBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Phân tích phiên bản v2"),
    ) as HTMLButtonElement;
    await act(async () => runBtn.click());
    expect(onRun).toHaveBeenCalledWith("rev-2");

    const prevLink = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Xem phân tích của phiên bản trước (v1)"),
    ) as HTMLButtonElement;
    await act(async () => prevLink.click());
    expect(onSelectVersion).toHaveBeenCalledWith("rev-1");
  });

  it("warns when another version is currently running and disables starting a second concurrent job", async () => {
    await renderNode(
      <SubmissionAiPreReview
        preReviews={[
          {
            id: "ai-v1-running",
            rqCoverage: [], unsupportedClaims: [], citationIssues: [], reviewFocusAreas: [], limitations: [],
            status: "PROCESSING",
            sourceRevisionId: "rev-1",
            sourceRevisionNumber: 1,
            createdAt: new Date().toISOString(),
          },
        ]}
        selectedRevisionId="rev-2"
        selectedRevisionNumber={2}
        canRunPreReview
        isRunning={false}
        onRun={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Phiên bản v1 đang được phân tích.");
    const runBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Phân tích phiên bản v2"),
    ) as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);
  });

  it("preserves last completed analysis for the same version when a newer retry fails (AI-13)", async () => {
    const onRun = vi.fn();
    await renderNode(
      <SubmissionAiPreReview
        preReviews={[
          {
            id: "ai-v2-failed",
            rqCoverage: [], unsupportedClaims: [], citationIssues: [], reviewFocusAreas: [], limitations: [],
            status: "FAILED",
            sourceRevisionId: "rev-2",
            sourceRevisionNumber: 2,
            errorMessage: "Dịch vụ AI tạm gián đoạn.",
            createdAt: "2026-11-25T10:00:00Z",
          },
          {
            id: "ai-v2-ok",
            rqCoverage: [], unsupportedClaims: [], citationIssues: [], reviewFocusAreas: [],
            status: "COMPLETED",
            sourceRevisionId: "rev-2",
            sourceRevisionNumber: 2,
            summary: "Phân tích v2 thành công trước đó",
            limitations: ["Bản thảo dài hơn giới hạn phân tích."],
            createdAt: "2026-11-24T10:00:00Z",
            completedAt: "2026-11-24T10:01:00Z",
          },
        ]}
        selectedRevisionId="rev-2"
        selectedRevisionNumber={2}
        canRunPreReview
        isRunning={false}
        onRun={onRun}
      />,
    );

    expect(container.textContent).toContain("Chưa thể hoàn tất phân tích AI.");
    expect(container.textContent).toContain("Dịch vụ AI tạm gián đoạn.");
    expect(container.textContent).toContain("Phân tích v2 thành công trước đó");
    expect(container.textContent).toContain("Kết quả lần phân tích thành công trước đó");
    expect(container.textContent).toContain("Bản thảo dài hơn giới hạn phân tích.");
    const retryBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Thử lại"),
    ) as HTMLButtonElement;
    await act(async () => retryBtn.click());
    expect(onRun).toHaveBeenCalledWith("rev-2");
  });
});
