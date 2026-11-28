// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchVersion } from "@trend/shared-types";
import type { ReviewWorkspace } from "../api/reviews.api";
import {
  buildCompatiblePriorCriteriaMap,
  computePreviousRevisionStats,
  parseLocatorPage,
  resolveComparisonBaseline,
  scopeRevisionResponses,
} from "../revision-comparison";

const mocks = vi.hoisted(() => ({
  useReviewWorkspace: vi.fn(),
  useSaveReview: vi.fn(),
  useSubmitReview: vi.fn(),
  verifyRevision: vi.fn(),
  revisionBlob: vi.fn(),
  downloadRevision: vi.fn(),
}));

vi.mock("@/features/reviews", () => ({
  useReviewWorkspace: mocks.useReviewWorkspace,
  useSaveReview: mocks.useSaveReview,
  useSubmitReview: mocks.useSubmitReview,
}));

vi.mock("@/features/reviews/api/reviews.api", async () => {
  const actual = await vi.importActual<typeof import("../api/reviews.api")>("../api/reviews.api");
  return {
    ...actual,
    reviewsApi: {
      ...actual.reviewsApi,
      verifyRevision: mocks.verifyRevision,
    },
  };
});

vi.mock("@/features/submissions", () => ({
  submissionsApi: {
    revisionBlob: mocks.revisionBlob,
    downloadRevision: mocks.downloadRevision,
  },
}));

vi.mock("@/features/reviews/components/assigned-review-advisory", () => ({
  AssignedReviewAdvisory: () => null,
}));

vi.mock("@/features/projects/components/workspace-common", () => ({
  useUnsavedWorkspace: () => undefined,
}));

vi.mock("@/features/reviews/components/pdf-manuscript-viewer", () => ({
  default: ({ ariaLabel }: { ariaLabel?: string }) => (
    <div data-testid="mock-pdf-viewer" aria-label={ariaLabel}>
      PDF Viewer Mock
    </div>
  ),
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "vi",
    t: (key: string, values?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        "reviewWorkspace.compare.ctaVersions": "Đối chiếu v{{before}} / v{{after}}",
        "reviewWorkspace.compare.backToReview": "Quay lại rà soát",
        "reviewWorkspace.compare.title": "Đối chiếu bản thảo",
        "reviewWorkspace.compare.missingPrevious":
          "Bản thảo trước không còn khả dụng hoặc chưa được chia sẻ trong phạm vi phản biện hiện tại.",
        "reviewWorkspace.revisionFirst.headerTitle": "Rà soát yêu cầu vòng trước",
        "reviewWorkspace.revisionFirst.noCurrentVersionResponse": "Chưa có phản hồi cho phiên bản này.",
        "reviewWorkspace.revisionFirst.markAccepted": "Đạt yêu cầu",
        "reviewWorkspace.revisionFirst.markReopened": "Cần sửa tiếp",
        "reviewWorkspace.roundTab.previous": "Rà soát chỉnh sửa ({{count}})",
        "reviewWorkspace.modeTab.rubric": "Đánh giá theo tiêu chí",
        "reviewWorkspace.modeTab.feedback": "Góp ý bản thảo",
        "reviewWorkspace.priorRound.scoreBadge": "Vòng trước: {{score}}/{{max}}",
      };
      const raw = map[key] ?? key;
      return raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(values?.[k] ?? ""));
    },
  }),
}));

import { ReviewWorkspacePage } from "@/pages/reviews/review-workspace";

function makeVersion(id: string, num: number): ResearchVersion {
  return {
    id,
    revisionNumber: num,
    contentType: "PDF",
    contentSnapshot: null,
    checksumSha256: `sha-${id}`,
    sizeBytes: 12000,
    sourceRevisionId: null,
    responseToReview: null,
    createdAt: `2026-11-1${num}T08:00:00Z`,
    hasPdf: true,
    reviews: [],
  };
}

function makeRound2Workspace(overrides: Partial<ReviewWorkspace> = {}): ReviewWorkspace {
  return {
    projectTitle: "LumiGap Project",
    roundNumber: 2,
    assignment: {
      id: "assign-1",
      status: "accepted",
      submissionId: {
        id: "sub-1",
        title: "Nghiên cứu nền tảng phản biện",
        submissionType: "RESEARCH_PAPER",
        status: "revised",
        currentRevisionNumber: 4,
      },
    },
    request: {
      id: "req-1",
      origin: "MENTOR_GUIDANCE",
      status: "RESUBMITTED",
      message: "Nhóm đã bổ sung phần phương pháp ở bản v4.",
    },
    templateVersion: {
      id: "tpl-v1",
      versionNumber: 1,
      status: "PUBLISHED",
      reviewMode: "RUBRIC_ASSESSMENT",
      guidelines: [],
      criteria: [
        {
          id: "c1",
          key: "methodology",
          title: "Phương pháp nghiên cứu",
          order: 1,
          required: true,
          allowNotApplicable: false,
          weight: 50,
          levels: [
            { id: "l1", score: 1, label: "Weak", position: 0 },
            { id: "l2", score: 2, label: "Fair", position: 1 },
            { id: "l3", score: 3, label: "Adequate", position: 2 },
            { id: "l4", score: 4, label: "Good", position: 3 },
            { id: "l5", score: 5, label: "Strong", position: 4 },
          ],
        },
      ],
    },
    criteria: [
      {
        id: "c1",
        key: "methodology",
        title: "Phương pháp nghiên cứu",
        order: 1,
        required: true,
        allowNotApplicable: false,
        weight: 50,
        levels: [
          { id: "l1", score: 1, label: "Weak", position: 0 },
          { id: "l2", score: 2, label: "Fair", position: 1 },
          { id: "l3", score: 3, label: "Adequate", position: 2 },
          { id: "l4", score: 4, label: "Good", position: 3 },
          { id: "l5", score: 5, label: "Strong", position: 4 },
        ],
      },
    ],
    responses: [],
    requiredRevisions: [],
    artifactRevision: { id: "rev-4", revisionNumber: 4, contentType: "PDF" },
    comparisonVersions: [makeVersion("rev-1", 1), makeVersion("rev-3", 3), makeVersion("rev-4", 4)],
    previousReviews: [
      {
        id: "hr-1",
        roundNumber: 1,
        revisionId: "rev-1",
        revisionNumber: 1,
        templateVersionId: "tpl-v1",
        overallComment: "Cần giải trình phương pháp chọn mẫu.",
        weightedScore: 3.0,
        integrityChecks: {
          data: { status: "CONCERN", note: "Cần nêu rõ nguồn tập dữ liệu." },
        },
        responses: [
          {
            criterionKey: "methodology",
            comment: "Thiếu tiêu chí chọn mẫu ở bản v1.",
            score: 3,
            notApplicable: false,
          },
        ],
        submittedAt: "2026-11-12T10:00:00Z",
      },
    ],
    previousRevisionItems: [
      {
        id: "item-1",
        reviewId: "hr-1",
        roundNumber: 1,
        revisionId: "rev-1",
        revisionNumber: 1,
        priority: "MAJOR",
        description: "Bổ sung cơ sở lựa chọn phương pháp nghiên cứu",
        locator: "Trang 5, Mục 3.2",
        status: "ADDRESSED",
        responses: [
          {
            submissionRevisionId: "rev-4",
            responseText: "Đã bổ sung tại Mục 3.2, trang 5 bản v4.",
            status: "ADDRESSED",
          },
          {
            submissionRevisionId: "rev-2",
            responseText: "Bản nháp phản hồi cũ ở v2.",
            status: "ADDRESSED",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("Pure revision-comparison & baseline helpers (VER-01..05, REV-02..10)", () => {
  it("selects actual prior reviewed revision v1 against v4 even when v3 exists (VER-01, VER-02)", () => {
    const res = resolveComparisonBaseline({
      artifactRevision: { id: "rev-4", revisionNumber: 4, contentType: "PDF" },
      comparisonVersions: [makeVersion("rev-1", 1), makeVersion("rev-3", 3), makeVersion("rev-4", 4)],
      previousReviews: [{ id: "hr-1", roundNumber: 1, revisionId: "rev-1", revisionNumber: 1 }],
    });
    expect(res.status).toBe("available");
    if (res.status === "available") {
      expect(res.defaultBefore.id).toBe("rev-1");
      expect(res.defaultBefore.revisionNumber).toBe(1);
      expect(res.after.id).toBe("rev-4");
    }
  });

  it("reports missing_previous without silently falling back when prior reviewed version is unavailable (VER-04)", () => {
    const res = resolveComparisonBaseline({
      artifactRevision: { id: "rev-4", revisionNumber: 4, contentType: "PDF" },
      comparisonVersions: [makeVersion("rev-3", 3), makeVersion("rev-4", 4)],
      previousReviews: [{ id: "hr-1", roundNumber: 1, revisionId: "rev-1", revisionNumber: 1 }],
    });
    expect(res.status).toBe("missing_previous");
  });

  it("scopes author responses strictly to assignedRevisionId and separates older responses (REV-02)", () => {
    const scoped = scopeRevisionResponses(
      [
        { submissionRevisionId: "rev-4", responseText: "Current v4", status: "ADDRESSED" },
        { submissionRevisionId: "rev-2", responseText: "Older v2", status: "ADDRESSED" },
      ],
      "rev-4",
    );
    expect(scoped.current?.responseText).toBe("Current v4");
    expect(scoped.historical).toHaveLength(1);

    const noneForCurrent = scopeRevisionResponses(
      [{ submissionRevisionId: "rev-2", responseText: "Older v2", status: "ADDRESSED" }],
      "rev-4",
    );
    expect(noneForCurrent.current).toBeUndefined();
    expect(noneForCurrent.historical).toHaveLength(1);
  });

  it("distinguishes reviewed vs accepted and never reports allMandatoryResolved when REOPENED exists", () => {
    const stats = computePreviousRevisionStats([
      { status: "ACCEPTED", priority: "MAJOR" },
      { status: "REOPENED", priority: "MINOR" },
      { status: "OPEN", priority: "SUGGESTION" },
    ]);
    expect(stats.totalMandatory).toBe(2);
    expect(stats.reviewedMandatory).toBe(2);
    expect(stats.acceptedMandatory).toBe(1);
    expect(stats.reopenedMandatory).toBe(1);
    expect(stats.allMandatoryResolved).toBe(false);
  });

  it("extracts page numbers from Vietnamese and English locators and only maps compatible template prior scores", () => {
    expect(parseLocatorPage("Trang 5, Mục 3.2")).toBe(5);
    expect(parseLocatorPage("Page 12")).toBe(12);
    expect(parseLocatorPage("Toàn bộ bài viết")).toBeNull();

    const matched = buildCompatiblePriorCriteriaMap({
      previousReviews: makeRound2Workspace().previousReviews,
      currentTemplateVersionId: "tpl-v1",
    });
    expect(matched.methodology?.score).toBe(3);

    const mismatched = buildCompatiblePriorCriteriaMap({
      previousReviews: makeRound2Workspace().previousReviews,
      currentTemplateVersionId: "tpl-v2-different",
    });
    expect(Object.keys(mismatched)).toHaveLength(0);
  });
});

describe("ReviewWorkspacePage — 3-PDF fix, Compare Mode, Revision-First & State Preservation", () => {
  let host: HTMLDivElement;
  let root: Root;
  let client: QueryClient;
  let refetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    if (typeof URL.createObjectURL !== "function") {
      Object.defineProperty(URL, "createObjectURL", { writable: true, configurable: true, value: vi.fn(() => "blob:mock") });
    }
    if (typeof URL.revokeObjectURL !== "function") {
      Object.defineProperty(URL, "revokeObjectURL", { writable: true, configurable: true, value: vi.fn() });
    }
    vi.clearAllMocks();
    refetchMock = vi.fn().mockResolvedValue(undefined);
    mocks.useSaveReview.mockReturnValue({ isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) });
    mocks.useSubmitReview.mockReturnValue({ isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) });
    mocks.verifyRevision.mockResolvedValue(undefined);
    const fakePdf = new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" });
    mocks.revisionBlob.mockResolvedValue(fakePdf);

    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    client.clear();
    vi.unstubAllGlobals();
  });

  async function renderWorkspace(workspaceData: ReviewWorkspace) {
    mocks.useReviewWorkspace.mockReturnValue({
      data: workspaceData,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: refetchMock,
    });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={["/reviews/assign-1"]}>
            <Routes>
              <Route path="/reviews/:assignmentId" element={<ReviewWorkspacePage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }

  it("defaults to Revision-First on Round 2+, renders only 1 PDF in Review Mode, lazy-loads v1 ONLY in Compare Mode (2 PDFs max), and preserves rubric state (LAYOUT-01..06, STATE-01..06)", async () => {
    await renderWorkspace(makeRound2Workspace());

    // LAYOUT-01 & Revision-First default: 1 reader mounted, Revision-First panel active immediately, NO historical PDF fetched yet!
    expect(document.querySelectorAll('[data-testid="review-mode-reader"]')).toHaveLength(1);
    expect(document.querySelector('[data-testid="previous-revision-panel"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="review-compare-mode"]')).toBeNull();
    expect(document.body.textContent).toContain("Đối chiếu v1 / v4");
    expect(document.body.textContent).toContain("Đã bổ sung tại Mục 3.2, trang 5 bản v4.");

    // STATE-06: Only assigned revision rev-4 fetched in Review Mode (rev-1 NOT fetched yet!)
    expect(mocks.revisionBlob).toHaveBeenCalledTimes(1);
    expect(mocks.revisionBlob).toHaveBeenCalledWith("sub-1", "rev-4", expect.any(AbortSignal));

    // Switch to Rubric tab, verify prior reference "Vòng trước: 3/5" appears WITHOUT auto-selecting score, select score 4
    const rubricTab = Array.from(document.querySelectorAll('[role="tab"]')).find(el =>
      el.textContent?.includes("Đánh giá theo tiêu chí"),
    ) as HTMLButtonElement;
    await act(async () => rubricTab.click());
    expect(document.body.textContent).toContain("Vòng trước: 3/5");

    const score4Btn = Array.from(document.querySelectorAll<HTMLButtonElement>(".rw-matrix-score-btn")).find(
      b => b.textContent?.trim() === "4",
    )!;
    expect(score4Btn.getAttribute("aria-pressed")).toBe("false");
    await act(async () => score4Btn.click());
    expect(score4Btn.getAttribute("aria-pressed")).toBe("true");

    // Enter Compare Mode -> review-mode-reader unmounts (NEVER 3 PDFs!), exactly 2 compare panes mount, rev-1 lazy-loaded, rev-4 cached!
    const compareBtn = document.querySelector<HTMLButtonElement>('[data-testid="header-compare-toggle"]')!;
    await act(async () => compareBtn.click());
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(document.querySelector('[data-testid="review-mode-reader"]')).toBeNull();
    expect(document.querySelector('[data-testid="review-compare-mode"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="compare-pane-before"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="compare-pane-after"]')).not.toBeNull();
    // rev-1 fetched now; rev-4 reused from cache (so total calls = 2, NOT 3!)
    expect(mocks.revisionBlob).toHaveBeenCalledTimes(2);
    expect(mocks.revisionBlob).toHaveBeenLastCalledWith("sub-1", "rev-1", expect.any(AbortSignal));

    // Return to Review Mode -> Compare Mode unmounts, Rubric score 4 is STILL preserved! (STATE-01)
    const backBtn = Array.from(document.querySelectorAll("button")).find(b =>
      b.textContent?.includes("Quay lại rà soát"),
    ) as HTMLButtonElement;
    await act(async () => backBtn.click());
    expect(document.querySelector('[data-testid="review-compare-mode"]')).toBeNull();
    expect(document.querySelectorAll('[data-testid="review-mode-reader"]')).toHaveLength(1);
    const restoredScore4 = Array.from(document.querySelectorAll<HTMLButtonElement>(".rw-matrix-score-btn")).find(
      b => b.textContent?.trim() === "4",
    )!;
    expect(restoredScore4.getAttribute("aria-pressed")).toBe("true");
  });

  it("verifies previous revision item via reviewsApi.verifyRevision without resetting unsaved draft state (REV-03, REV-09)", async () => {
    await renderWorkspace(makeRound2Workspace());
    const acceptBtn = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b =>
      b.textContent?.includes("Đạt yêu cầu"),
    )!;
    await act(async () => acceptBtn.click());
    expect(mocks.verifyRevision).toHaveBeenCalledWith("req-1", "item-1", "ACCEPTED", "rev-4");
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("hides Compare UI cleanly on Round 1 when there is no previous revision (LAYOUT-08)", async () => {
    await renderWorkspace(
      makeRound2Workspace({
        roundNumber: 1,
        artifactRevision: { id: "rev-1", revisionNumber: 1, contentType: "PDF" },
        comparisonVersions: [makeVersion("rev-1", 1)],
        previousReviews: [],
        previousRevisionItems: [],
      }),
    );
    expect(document.querySelector('[data-testid="header-compare-toggle"]')).toBeNull();
    expect(document.querySelector('[data-testid="previous-revision-panel"]')).toBeNull();
    expect(document.querySelectorAll('[data-testid="review-mode-reader"]')).toHaveLength(1);
  });
});
