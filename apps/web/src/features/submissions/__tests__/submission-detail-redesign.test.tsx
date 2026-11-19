// @vitest-environment jsdom
import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SubmissionHistory } from "@trend/shared-types";
import { SubmissionDetailPage } from "@/pages/submissions/submission-detail";
import { SubmissionDocumentViewer } from "../components/submission-document-viewer";
import {
  normalizeReviewStatus,
  resolveSubmissionPrimaryAction,
  resolveVersionReviewContext,
} from "../submission-review-status";

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  history: vi.fn(),
  preReviews: vi.fn(),
  runPreReview: vi.fn(),
  revisionBlob: vi.fn(),
  downloadRevision: vi.fn(),
  prepareMentorReview: vi.fn(),
  invalidPreview: false,
}));

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (k: string, values?: Record<string, string | number>) => k.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values?.[key] ?? "")), language: "vi" }) }));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: "student-1" } }),
}));
vi.mock("@/features/academic-profile/components/private-evidence-pdf-preview", () => ({
  default: ({ blob, onError, onValidation }: { blob: Blob; onError?: () => void; onValidation?: (valid: boolean) => void }) => {
    useEffect(() => {
      onValidation?.(false); // Existing viewer reports "not validated yet" during loading.
      if (mocks.invalidPreview) onError?.();
    }, [onError, onValidation]);
    return <div data-testid="mock-pdf-canvas">PDF rendered ({blob.size} bytes)</div>;
  },
}));
vi.mock("@/features/submissions/components/mentor-manuscript-dialog", () => ({
  MentorManuscriptDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="mentor-dialog">Mentor Send Dialog</div> : null),
}));
vi.mock("@/features/reviews/components/submit-review-dialog", () => ({
  SubmitReviewDialog: () => <button>Submit for Review</button>,
}));
vi.mock("../api/submissions.api", () => ({
  submissionsApi: {
    revisionBlob: mocks.revisionBlob,
    downloadRevision: mocks.downloadRevision,
    prepareMentorReview: mocks.prepareMentorReview,
  },
}));
vi.mock("@/features/submissions", () => ({
  useSubmission: mocks.detail,
  useSubmissionHistory: mocks.history,
  useAiPreReviews: mocks.preReviews,
  useRunAiPreReview: () => ({ mutateAsync: mocks.runPreReview, isPending: false }),
  useAddSubmissionRevision: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateSubmissionVersion: () => ({ mutateAsync: vi.fn(), isPending: false }),
  submissionsApi: {
    revisionBlob: mocks.revisionBlob,
    downloadRevision: mocks.downloadRevision,
    prepareMentorReview: mocks.prepareMentorReview,
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let root: Root;
let container: HTMLDivElement;

async function renderPage(node: ReactNode) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/projects/proj-1?tab=submissions&submission=sub-1"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {node}
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

function makeHistory(overrides: Partial<SubmissionHistory> = {}): SubmissionHistory {
  return {
    canManage: true,
    sourceManuscriptWritable: true,
    canProvideFeedback: false,
    canRunAiPreReview: true,
    canRequestReview: true,
    assignedMentor: {
      id: "mentor-1",
      fullName: "TS. Phạm Bảo Ngọc",
      email: "ngoc@uni.edu",
      role: "MENTOR",
    },
    reviewRequests: [
      {
        id: "req-1",
        reviewerId: "mentor-1",
        reviewerName: "TS. Phạm Bảo Ngọc",
        status: "IN_REVIEW",
        revisionNumber: 1,
        revisionId: "rev-1",
        origin: "MENTOR_GUIDANCE",
        createdAt: "2026-11-14T06:57:52.343Z",
        dueAt: null,
        canView: true,
      },
    ],
    openForReview: false,
    currentRevisionId: "rev-1",
    currentRevisionNumber: 1,
    latestReviewedRevisionId: null,
    versions: [
      {
        id: "rev-1",
        revisionNumber: 1,
        contentType: "PDF",
        contentSnapshot: null,
        checksumSha256: "abc",
        sizeBytes: 46273,
        originalFileName: "LumiGap-v1.pdf",
        sourceRevisionId: null,
        manuscriptSnapshotId: null,
        responseToReview: null,
        createdAt: "2026-11-14T06:57:52.343Z",
        hasPdf: true,
        reviews: [],
      },
    ],
    contributions: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.invalidPreview = false;
  mocks.detail.mockReturnValue({
    data: {
      _id: "sub-1",
      projectId: "proj-1",
      sourceManuscriptId: "ms-1",
      title: "LumiGap",
      submissionType: "RESEARCH_PAPER",
      status: "under_review",
      currentRevisionId: "rev-1",
      currentRevisionNumber: 1,
      researchQuestions: [],
      updatedAt: "2026-11-17T03:05:40.500Z",
    },
    refetch: vi.fn(),
  });
  mocks.history.mockReturnValue({ data: makeHistory(), refetch: vi.fn() });
  mocks.preReviews.mockReturnValue({ data: [], refetch: vi.fn() });
  mocks.revisionBlob.mockResolvedValue(new Blob(["%PDF-1.4-v1"], { type: "application/pdf" }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

it("does not silently substitute the current PDF for an unavailable explicit revision", async () => {
  window.history.replaceState({}, "", "/?revision=private-revision");
  await renderPage(<SubmissionDetailPage submissionId="sub-1" projectId="proj-1" />);
  expect(container.textContent).toContain("Phiên bản này không còn khả dụng");
  expect(mocks.revisionBlob).not.toHaveBeenCalled();
});

it("hides protected content and management actions when a cached history refetch is denied", async () => {
  mocks.history.mockReturnValue({ data: makeHistory(), error: new Error("Access revoked"), refetch: vi.fn() });
  await renderPage(<SubmissionDetailPage submissionId="sub-1" projectId="proj-1" />);
  expect(mocks.revisionBlob).not.toHaveBeenCalled();
  expect(container.querySelector('a[href*="/manuscripts/"]')).toBeNull();
  expect(container.querySelector('[data-testid="mock-pdf-canvas"]')).toBeNull();
});

it("requires server-confirmed source write permission before offering an editor", async () => {
  mocks.history.mockReturnValue({ data: makeHistory({ sourceManuscriptWritable: false }), refetch: vi.fn() });
  await renderPage(<SubmissionDetailPage submissionId="sub-1" projectId="proj-1" />);
  expect(container.querySelector('a[href*="/manuscripts/"]')).toBeNull();
  expect(container.textContent).toContain("Chuẩn bị bản cập nhật");
});

it("retries a protected PDF request after a transient failure", async () => {
  mocks.revisionBlob.mockRejectedValueOnce(new Error("Network unavailable"));
  await renderPage(<SubmissionDetailPage submissionId="sub-1" projectId="proj-1" />);
  const retry = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.trim() === "Thử lại")!;
  await act(async () => retry.click());
  await act(async () => { await vi.dynamicImportSettled(); });
  expect(mocks.revisionBlob).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[data-testid="mock-pdf-canvas"]')).not.toBeNull();
});

it("keeps version history collapsed initially", async () => {
  await renderPage(<SubmissionDetailPage submissionId="sub-1" projectId="proj-1" />);
  const history = Array.from(container.querySelectorAll("details")).find(element => element.textContent?.includes("Lịch sử phiên bản"));
  expect(history?.open).toBe(false);
});

it("shows retry and download when the PDF renderer rejects malformed bytes", async () => {
  mocks.invalidPreview = true;
  await renderPage(<SubmissionDetailPage submissionId="sub-1" projectId="proj-1" />);
  expect(container.textContent).toContain("Không thể hiển thị trực tiếp bản PDF v1");
  expect(container.querySelector('[data-testid="mock-pdf-canvas"]')).toBeNull();
});

it("aborts an old PDF request and ignores its late response after switching versions", async () => {
  let resolveOld!: (blob: Blob) => void;
  mocks.revisionBlob.mockImplementationOnce(() => new Promise<Blob>(resolve => { resolveOld = resolve; }));
  const v1 = makeHistory().versions[0]!;
  await renderPage(<SubmissionDocumentViewer submissionId="sub-1" submissionTitle="Paper" version={v1} />);
  const signal = mocks.revisionBlob.mock.calls[0]![2] as AbortSignal;
  await renderPage(<SubmissionDocumentViewer submissionId="sub-1" submissionTitle="Paper" version={{ ...v1, id: "rev-2", revisionNumber: 2, originalFileName: "new-v2.pdf" }} />);
  expect(signal.aborted).toBe(true);
  await act(async () => resolveOld(new Blob(["old-private-pdf-response"])));
  expect(container.textContent).toContain("new-v2.pdf");
  expect(container.textContent).not.toContain("LumiGap-v1.pdf");
  expect(container.querySelector('[data-testid="mock-pdf-canvas"]')?.textContent).toContain("11 bytes");
});

it("selects the newest repeated request and requires exact revision IDs", () => {
  const history = makeHistory();
  const request = history.reviewRequests![0]!;
  history.reviewRequests = [{ ...request, id: "old", status: "CANCELLED", createdAt: "2026-11-13T00:00:00Z" }, { ...request, id: "new", createdAt: "2026-11-18T00:00:00Z" }];
  const result = resolveVersionReviewContext({ history, version: history.versions[0]!, isCurrentVersion: true, submissionStatus: "submitted" });
  expect(result.activeThread?.request?.id).toBe("new");
  history.reviewRequests = [{ ...request, revisionId: "other-revision" }];
  expect(resolveVersionReviewContext({ history, version: history.versions[0]!, isCurrentVersion: true, submissionStatus: "submitted" }).hasOpenReviewOnCurrentVersion).toBe(false);
});

it("renders clean header, review summary, in-app PDF viewer, single empty state and removes cluttered legacy sections", async () => {
  await renderPage(<SubmissionDetailPage submissionId="sub-1" projectId="proj-1" />);

  expect(container.textContent).toContain("LumiGap");
  expect(container.textContent).toContain("Bài báo nghiên cứu");
  expect(container.textContent).toContain("Phiên bản v1");
  expect(container.textContent).toContain("Giảng viên đang đánh giá");
  expect(container.querySelector('[data-testid="review-summary-text"]')?.textContent).toContain("TS. Phạm Bảo Ngọc");

  // In-app PDF viewer fetches exact version blob
  expect(mocks.revisionBlob).toHaveBeenCalledWith("sub-1", "rev-1", expect.any(AbortSignal));
  expect(container.querySelector('[data-testid="mock-pdf-canvas"]')?.textContent).toContain("PDF rendered");
  expect(container.textContent).toContain("LumiGap-v1.pdf");

  // Single clean empty feedback state — no repeated noise
  expect(container.textContent).toContain("Chưa có phản hồi từ giảng viên");
  expect(container.textContent).toContain("Bạn sẽ nhận thông báo khi giảng viên hoàn tất góp ý.");
  expect(container.textContent).not.toContain("Chưa có điểm");
  expect(container.textContent).not.toContain("Chưa có review chính thức");
  expect(container.textContent).not.toContain("Hai phiên bản chưa có review để so sánh");

  // Legacy cluttered / conflicting items removed from Mentor Review screen
  expect(container.textContent).not.toContain("Submit for Review");
  expect(container.textContent).not.toContain("Tạo bản Markdown mới");
  expect(container.textContent).not.toContain("Mở cơ hội phản biện");
  expect(container.textContent).not.toContain("Cập nhật trạng thái phản biện");
  expect(container.textContent).not.toContain("So sánh phiên bản"); // hidden when only v1 exists

  // AI Pre-review hidden when never run
  expect(container.querySelector('[data-testid="ai-prereview-panel"]')).toBeNull();

  // Context-aware primary CTA: editable manuscript under active review -> Tiếp tục chỉnh sửa
  const editLink = container.querySelector<HTMLAnchorElement>('a[href="/projects/proj-1/manuscripts/ms-1"]');
  expect(editLink?.textContent).toContain("Tiếp tục chỉnh sửa");
});

it("uses Chuẩn bị bản cập nhật instead of opening a non-existent editor for external PDF uploads", async () => {
  mocks.detail.mockReturnValue({
    data: {
      _id: "sub-1",
      projectId: "proj-1",
      sourceManuscriptId: null,
      title: "External PDF Study",
      submissionType: "RESEARCH_PAPER",
      status: "under_review",
      currentRevisionId: "rev-1",
      currentRevisionNumber: 1,
      researchQuestions: [],
      updatedAt: "2026-11-17T03:05:40.500Z",
    },
    refetch: vi.fn(),
  });
  await renderPage(<SubmissionDetailPage submissionId="sub-1" projectId="proj-1" />);

  expect(container.textContent).toContain("Chuẩn bị bản cập nhật");
  expect(container.querySelector('a[href*="/manuscripts/"]')).toBeNull();
});

it("displays PDF load error with retry and download fallback", async () => {
  mocks.revisionBlob.mockRejectedValueOnce(new Error("forbidden"));
  await renderPage(<SubmissionDetailPage submissionId="sub-1" projectId="proj-1" />);

  expect(container.textContent).toContain("Không thể hiển thị trực tiếp bản PDF v1");
  expect(container.textContent).toContain("Thử lại");
  expect(container.textContent).toContain("Tải PDF (v1)");
});

it("renders structured mentor feedback, required revisions, rubric scores and revision CTA", async () => {
  mocks.history.mockReturnValue({
    data: makeHistory({
      reviewRequests: [
        {
          id: "req-1",
          reviewerId: "mentor-1",
          reviewerName: "TS. Phạm Bảo Ngọc",
          status: "REVISION_REQUESTED",
          revisionNumber: 1,
          revisionId: "rev-1",
          origin: "MENTOR_GUIDANCE",
          createdAt: "2026-11-14T06:57:52.343Z",
          dueAt: null,
          canView: true,
        },
      ],
      versions: [
        {
          id: "rev-1",
          revisionNumber: 1,
          contentType: "LATEX",
          contentSnapshot: "\\section{Intro} Raw tex",
          checksumSha256: "abc",
          sizeBytes: 51200,
          originalFileName: "paper-snapshot.pdf",
          sourceRevisionId: null,
          manuscriptSnapshotId: "snap-1",
          responseToReview: null,
          createdAt: "2026-11-14T06:57:52.343Z",
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
              weightedScore: 4.2,
              overallAssessment: "REVISION_REQUESTED",
              keyStrengths: "Câu hỏi nghiên cứu rõ ràng.",
              keyConcerns: "Cần bổ sung thực nghiệm đối chứng.",
              overallComment: "Bản thảo có cấu trúc tốt nhưng cần bổ sung số liệu ablation.",
              submittedAt: "2026-11-16T08:00:00.000Z",
              requestId: "req-1",
              responses: [
                {
                  criterionKey: "rubric:methodology",
                  comment: "Thiếu mô tả chia tập dữ liệu.",
                  evidence: "Section 3.2",
                  assessment: "NEEDS_IMPROVEMENT",
                  score: 3,
                  notApplicable: false,
                },
              ],
              requiredRevisions: [
                {
                  id: "item-1",
                  description: "Bổ sung bảng so sánh baseline trên tập test.",
                  priority: "MAJOR",
                  status: "OPEN",
                  responses: [],
                },
              ],
            },
          ],
        },
      ],
    }),
    refetch: vi.fn(),
  });

  await renderPage(<SubmissionDetailPage submissionId="sub-1" projectId="proj-1" />);

  expect(container.textContent).toContain("Bản chụp LaTeX");
  expect(container.textContent).toContain("Cần chỉnh sửa");
  expect(container.textContent).toContain("Bản thảo có cấu trúc tốt nhưng cần bổ sung số liệu ablation.");
  expect(container.textContent).toContain("Bổ sung bảng so sánh baseline trên tập test.");
  expect(container.textContent).toContain("Phương pháp luận");
  expect(container.textContent).toContain("4.2");
  expect(container.textContent).not.toContain("/ 5.0"); // The history contract does not provide a scale maximum.
  expect(container.textContent).toContain("Gửi phiên bản mới để góp ý");
  expect(container.textContent).toContain("Tiếp tục chỉnh sửa");
});

it("supports version switching between v1 and v2 without auto-jumping back and unlocks version comparison", async () => {
  mocks.detail.mockReturnValue({
    data: {
      _id: "sub-1",
      projectId: "proj-1",
      sourceManuscriptId: "ms-1",
      title: "LumiGap",
      submissionType: "RESEARCH_PAPER",
      status: "under_review",
      currentRevisionId: "rev-2",
      currentRevisionNumber: 2,
      researchQuestions: [],
      updatedAt: "2026-11-18T03:05:40.500Z",
    },
    refetch: vi.fn(),
  });
  mocks.history.mockReturnValue({
    data: makeHistory({
      currentRevisionId: "rev-2",
      currentRevisionNumber: 2,
      latestReviewedRevisionId: "rev-1",
      reviewRequests: [
        {
          id: "req-2",
          reviewerId: "mentor-1",
          reviewerName: "TS. Phạm Bảo Ngọc",
          status: "IN_REVIEW",
          revisionNumber: 2,
          revisionId: "rev-2",
          origin: "MENTOR_GUIDANCE",
          createdAt: "2026-11-18T06:00:00.000Z",
          dueAt: null,
          canView: true,
        },
      ],
      versions: [
        {
          id: "rev-2",
          revisionNumber: 2,
          contentType: "PDF",
          contentSnapshot: null,
          checksumSha256: "def",
          sizeBytes: 60000,
          originalFileName: "LumiGap-v2.pdf",
          sourceRevisionId: "rev-1",
          manuscriptSnapshotId: null,
          responseToReview: "Đã bổ sung bảng ablation",
          createdAt: "2026-11-18T06:00:00.000Z",
          hasPdf: true,
          reviews: [],
        },
        {
          id: "rev-1",
          revisionNumber: 1,
          contentType: "PDF",
          contentSnapshot: null,
          checksumSha256: "abc",
          sizeBytes: 46273,
          originalFileName: "LumiGap-v1.pdf",
          sourceRevisionId: null,
          manuscriptSnapshotId: null,
          responseToReview: null,
          createdAt: "2026-11-14T06:57:52.343Z",
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
              weightedScore: null,
              overallAssessment: "REVISION_REQUESTED",
              keyStrengths: null,
              keyConcerns: null,
              overallComment: "Góp ý cũ dành riêng cho v1",
              submittedAt: "2026-11-15T10:00:00.000Z",
              requestId: "req-1",
              responses: [],
              requiredRevisions: [],
            },
          ],
        },
      ],
    }),
    refetch: vi.fn(),
  });

  await renderPage(<SubmissionDetailPage submissionId="sub-1" projectId="proj-1" />);

  // Defaults to v2
  expect(mocks.revisionBlob).toHaveBeenLastCalledWith("sub-1", "rev-2", expect.any(AbortSignal));
  expect(container.textContent).toContain("LumiGap-v2.pdf");
  expect(container.textContent).toContain("So sánh phiên bản");

  // Click v1 in version history -> loads v1 PDF & v1 feedback, stays on v1
  const v1Button = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent?.includes("v1") && !btn.textContent?.includes("v2"))!;
  await act(async () => v1Button.click());
  await act(async () => {
    await vi.dynamicImportSettled();
  });

  expect(mocks.revisionBlob).toHaveBeenLastCalledWith("sub-1", "rev-1", expect.any(AbortSignal));
  expect(container.textContent).toContain("LumiGap-v1.pdf");
  expect(container.textContent).toContain("Góp ý cũ dành riêng cho v1");
  expect(container.textContent).toContain("Phiên bản cũ");
});

it("keeps feedback isolated per mentor when two mentors review the same version", async () => {
  mocks.history.mockReturnValue({
    data: makeHistory({
      reviewRequests: [
        {
          id: "req-a",
          reviewerId: "mentor-a",
          reviewerName: "TS. Phạm Bảo Ngọc",
          status: "REVISION_REQUESTED",
          revisionNumber: 1,
          revisionId: "rev-1",
          origin: "MENTOR_GUIDANCE",
          createdAt: "2026-11-14T06:00:00.000Z",
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
          createdAt: "2026-11-14T07:00:00.000Z",
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
          sizeBytes: 46273,
          originalFileName: "LumiGap-v1.pdf",
          sourceRevisionId: null,
          manuscriptSnapshotId: null,
          responseToReview: null,
          createdAt: "2026-11-14T06:57:52.343Z",
          hasPdf: true,
          reviews: [
            {
              id: "rev-a",
              reviewerId: "mentor-a",
              reviewerName: "TS. Phạm Bảo Ngọc",
              reviewerAcademicRole: "LECTURER",
              revisionId: "rev-1",
              roundNumber: 1,
              templateVersionId: "tpl-1",
              weightedScore: null,
              overallAssessment: "REVISION_REQUESTED",
              keyStrengths: null,
              keyConcerns: null,
              overallComment: "Nhận xét riêng của TS. Ngọc",
              submittedAt: "2026-11-15T10:00:00.000Z",
              requestId: "req-a",
              responses: [],
              requiredRevisions: [],
            },
          ],
        },
      ],
    }),
    refetch: vi.fn(),
  });

  await renderPage(<SubmissionDetailPage submissionId="sub-1" projectId="proj-1" />);

  // First mentor tab selected by priority (REVISION_REQUESTED)
  expect(container.textContent).toContain("Nhận xét riêng của TS. Ngọc");

  // Switch to second mentor tab -> sees PGS. Trần Minh's independent IN_PROGRESS state without losing TS. Ngọc's review
  const secondMentorTab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) =>
    el.textContent?.includes("PGS. Trần Minh"),
  ) as HTMLButtonElement;
  await act(async () => secondMentorTab.click());

  expect(container.textContent).not.toContain("Nhận xét riêng của TS. Ngọc");
  expect(container.textContent).toContain("Chưa có phản hồi từ giảng viên");
  expect(container.querySelector('[data-testid="review-summary-text"]')?.textContent).toContain("PGS. Trần Minh");
});

it("keeps AI pre-review clearly separate from Mentor Review and links formal contributions only when present", async () => {
  mocks.preReviews.mockReturnValue({
    data: [
      {
        id: "ai-1",
        status: "COMPLETED",
        sourceRevisionId: "rev-1",
        sourceRevisionNumber: 1,
        summary: "AI detected missing citation formatting.",
        rqCoverage: [],
        unsupportedClaims: [],
        citationIssues: [],
        reviewFocusAreas: [],
        limitations: [],
        createdAt: "2026-11-15T00:00:00.000Z",
      },
    ],
    refetch: vi.fn(),
  });
  mocks.history.mockReturnValue({
    data: makeHistory({
      contributions: [
        {
          reviewerId: "mentor-1",
          name: "TS. Phạm Bảo Ngọc",
          type: "REVIEW",
          status: "COMPLETED",
          rounds: [{ reviewId: "r-1", revisionId: "rev-1", roundNumber: 1, submittedAt: "2026-11-16T00:00:00.000Z", academicRole: "LECTURER" }],
        },
      ],
    }),
    refetch: vi.fn(),
  });

  await renderPage(<SubmissionDetailPage submissionId="sub-1" projectId="proj-1" />);

  const aiPanel = container.querySelector('[data-testid="ai-prereview-panel"]');
  expect(aiPanel).not.toBeNull();
  expect(aiPanel?.textContent).toContain("Đây là phân tích tự động của AI, không phải kết luận của giảng viên hướng dẫn");
  // Mentor status remains unchanged (IN_PROGRESS)
  expect(container.textContent).toContain("Giảng viên đang đánh giá");
  // Contribution link appears when formal contributions exist
  expect(container.querySelector('a[href="/projects/proj-1?tab=contributions"]')?.textContent).toContain("Đóng góp phản biện (1 giảng viên)");
});

it("maps all review statuses and primary action plans accurately without fabricating publication acceptance", () => {
  expect(normalizeReviewStatus({ requestStatus: "REQUESTED" }).label).toBe("Chờ giảng viên phản hồi");
  expect(normalizeReviewStatus({ requestStatus: "IN_REVIEW" }).label).toBe("Giảng viên đang đánh giá");
  expect(normalizeReviewStatus({ requestStatus: "SUBMITTED" }).hasFeedback).toBe(false);
  expect(normalizeReviewStatus({ requestStatus: "ACCEPTED" }).state).toBe("PENDING");
  expect(normalizeReviewStatus({ requestStatus: "REVISION_REQUESTED" }).label).toBe("Cần chỉnh sửa");
  const completed = normalizeReviewStatus({ requestStatus: "COMPLETED" });
  expect(completed.label).toBe("Đã hoàn tất góp ý");
  expect(completed.label).not.toContain("đăng bài");
  expect(normalizeReviewStatus({ requestStatus: "CANCELLED" }).label).toBe("Yêu cầu đã hủy");

  const mentorAction = resolveSubmissionPrimaryAction({
    readOnly: false,
    canProvideFeedback: true,
    canRevise: false,
    hasEditableSource: false,
    hasAssignedMentor: true,
    status: normalizeReviewStatus({ requestStatus: "IN_REVIEW" }),
    hasOpenReviewOnCurrentVersion: true,
    currentRevisionNumber: 1,
  });
  expect(mentorAction.kind).toBe("OPEN_MENTOR_REVIEW");

  const ctx = resolveVersionReviewContext({
    submissionStatus: "submitted",
    history: makeHistory({ reviewRequests: [], assignedMentor: null }),
    version: makeHistory().versions[0]!,
    isCurrentVersion: true,
  });
  expect(ctx.versionStatus.state).toBe("UNSENT");
});
