// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchVersion } from "@trend/shared-types";
import type { PreviousFeedbackPayload } from "../api/reviews.api";
import { RevisionCompareView } from "../components/revision-compare-view";
import { mentorWorkspaceEn, mentorWorkspaceVi } from "@/i18n/locales/mentor-workspace";

const mocks = vi.hoisted(() => ({
  previousFeedback: vi.fn(),
  downloadRevision: vi.fn(),
  lang: "en" as "en" | "vi",
  jumpEvents: [] as Array<{ side: string; page: number }>,
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "reviewer-1" } }),
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: mocks.lang,
    t: (key: string, values: Record<string, unknown> = {}) => {
      const dict = (mocks.lang === "vi" ? mentorWorkspaceVi : mentorWorkspaceEn) as Record<string, string>;
      return (dict[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(values[k] ?? ""));
    },
  }),
}));

vi.mock("../api/reviews.api", async importOriginal => {
  const actual = await importOriginal<typeof import("../api/reviews.api")>();
  return {
    ...actual,
    reviewsApi: {
      ...actual.reviewsApi,
      previousFeedback: mocks.previousFeedback,
    },
  };
});

vi.mock("@/features/submissions", () => ({
  submissionsApi: {
    downloadRevision: mocks.downloadRevision,
    revisionBlob: vi.fn(),
  },
}));

vi.mock("../components/assigned-revision-reader", () => ({
  AssignedRevisionReader: ({
    revisionId,
    jumpToPageRequest,
    ariaLabel,
  }: {
    revisionId?: string;
    jumpToPageRequest?: { page: number; nonce: number } | null;
    ariaLabel?: string;
  }) => {
    if (jumpToPageRequest) {
      mocks.jumpEvents.push({ side: revisionId ?? "unknown", page: jumpToPageRequest.page });
    }
    return (
      <div
        data-testid={`mock-reader-${revisionId}`}
        data-jump-page={jumpToPageRequest?.page ?? ""}
        aria-label={ariaLabel}
      >
        Reader {revisionId}
      </div>
    );
  },
}));

const ver1: ResearchVersion = {
  id: "rev-1",
  revisionNumber: 1,
  contentType: "PDF",
  contentSnapshot: null,
  checksumSha256: "sha1",
  sizeBytes: 1000,
  sourceRevisionId: null,
  responseToReview: null,
  createdAt: "2026-11-15T09:00:00Z",
  hasPdf: true,
  reviews: [],
};

const ver3: ResearchVersion = {
  id: "rev-3",
  revisionNumber: 3,
  contentType: "PDF",
  contentSnapshot: null,
  checksumSha256: "sha3",
  sizeBytes: 1200,
  sourceRevisionId: "rev-1",
  responseToReview: null,
  createdAt: "2026-11-20T09:00:00Z",
  hasPdf: true,
  reviews: [],
};

const ver4: ResearchVersion = {
  id: "rev-4",
  revisionNumber: 4,
  contentType: "PDF",
  contentSnapshot: null,
  checksumSha256: "sha4",
  sizeBytes: 1400,
  sourceRevisionId: "rev-3",
  responseToReview: null,
  createdAt: "2026-11-24T09:00:00Z",
  hasPdf: true,
  reviews: [],
};

const multiRoundPayload: PreviousFeedbackPayload = {
  assignmentId: "assign-1",
  submissionId: "sub-1",
  currentRoundNumber: 3,
  currentRevisionId: "rev-4",
  rounds: [
    {
      id: "round-2",
      roundNumber: 2,
      revisionId: "rev-3",
      revisionNumber: 3,
      reviewerName: "Dr. Minh",
      reviewMode: "RUBRIC_ASSESSMENT",
      overallComment: "Round 2 overall comment on v3.",
      keyStrengths: "Improved baseline table.",
      keyConcerns: "Discussion still short.",
      overallAssessment: "MINOR_REVISION",
      weightedScore: 4.2,
      submittedAt: "2026-11-21T10:00:00Z",
      responses: [
        {
          criterionKey: "methodology",
          criterionTitle: "Methodology",
          score: 4,
          maxScore: 5,
          comment: "Clear protocol",
          evidence: "Page 4",
          notApplicable: false,
        },
      ],
      revisionItems: [
        {
          id: "item-r2",
          priority: "MINOR",
          description: "Expand limitations paragraph.",
          locator: "Page 6, Section 5",
          quotation: "Limitations are minor.",
          status: "ADDRESSED",
          createdAt: "2026-11-21T10:00:00Z",
          responses: [
            {
              submissionRevisionId: "rev-4",
              submissionRevisionNumber: 4,
              responseText: "Expanded limitations in Section 5.2.",
              status: "ADDRESSED",
            },
          ],
        },
      ],
    },
    {
      id: "round-1",
      roundNumber: 1,
      revisionId: "rev-1",
      revisionNumber: 1,
      reviewerName: "Dr. Minh",
      reviewMode: "GUIDED_FEEDBACK",
      overallComment: "Round 1 overall comment on v1.",
      overallAssessment: "MAJOR_REVISION",
      submittedAt: "2026-11-16T08:00:00Z",
      responses: [],
      revisionItems: [
        {
          id: "item-r1",
          priority: "MAJOR",
          description: "Add baseline comparison.",
          status: "ACCEPTED",
          responses: [],
        },
      ],
    },
  ],
};

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 25));
  });
}

describe("RevisionCompareView — Previous Review Feedback Panel (AC-01..AC-13)", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    mocks.lang = "en";
    mocks.jumpEvents = [];
    mocks.previousFeedback.mockResolvedValue(structuredClone(multiRoundPayload));
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    vi.unstubAllGlobals();
  });

  function renderCompare(overrides: Partial<React.ComponentProps<typeof RevisionCompareView>> = {}) {
    return act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <RevisionCompareView
              assignmentId="assign-1"
              submissionId="sub-1"
              before={ver3}
              after={ver4}
              selectableBaselines={[ver3, ver1]}
              onSelectBaseline={vi.fn()}
              baselineRoundNumber={2}
              currentRoundNumber={3}
              hasPreviousFeedback={true}
              previousFeedbackCount={2}
              onExitCompare={vi.fn()}
              {...overrides}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
  }

  it("hides Previous Feedback button when no valid prior feedback exists (AC-01, BR-01)", async () => {
    await renderCompare({ hasPreviousFeedback: false, previousFeedbackCount: 0 });
    expect(host.querySelector('[data-testid="compare-previous-feedback-toggle"]')).toBeNull();
    expect(host.querySelector('[data-testid="compare-previous-feedback-panel"]')).toBeNull();
    expect(mocks.previousFeedback).not.toHaveBeenCalled();
  });

  it("keeps panel closed by default, opens read-only multi-round feedback, switches rounds, and jumps ONLY the left historical PDF (AC-02, AC-03, AC-04, AC-05, AC-08)", async () => {
    const onSelectBaseline = vi.fn();
    await renderCompare({ onSelectBaseline });

    // Closed by default
    expect(host.querySelector('[data-testid="compare-previous-feedback-panel"]')).toBeNull();
    expect(mocks.previousFeedback).not.toHaveBeenCalled();

    // Click toggle button
    const toggle = host.querySelector<HTMLButtonElement>('[data-testid="compare-previous-feedback-toggle"]')!;
    expect(toggle.textContent).toContain("Previous Feedback");
    await act(async () => toggle.click());
    await flush();

    expect(mocks.previousFeedback).toHaveBeenCalledWith("assign-1", expect.any(AbortSignal));
    const panel = host.querySelector('[data-testid="compare-previous-feedback-panel"]')!;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain("Read-only");
    expect(panel.textContent).toContain("Dr. Minh");
    expect(panel.textContent).toContain("Round 2 overall comment on v3.");
    expect(panel.textContent).toContain("Improved baseline table.");
    expect(panel.textContent).toContain("Discussion still short.");
    expect(panel.textContent).toContain("Methodology");
    expect(panel.textContent).toContain("4 / 5");
    expect(panel.textContent).toContain("Expand limitations paragraph.");
    expect(panel.textContent).toContain("Expanded limitations in Section 5.2.");
    // Strictly read-only: no textareas or edit inputs inside panel
    expect(panel.querySelectorAll("textarea, input")).toHaveLength(0);

    // Click page jump button -> jumps ONLY left PDF (rev-3), never right PDF (rev-4)
    const jumpBtn = panel.querySelector<HTMLButtonElement>('[data-testid="feedback-jump-page-6"]')!;
    await act(async () => jumpBtn.click());
    expect(host.querySelector('[data-testid="mock-reader-rev-3"]')?.getAttribute("data-jump-page")).toBe("6");
    expect(host.querySelector('[data-testid="mock-reader-rev-4"]')?.getAttribute("data-jump-page")).toBe("");

    // Switch to Round 1 (v1) via selector
    const roundSelect = panel.querySelector<HTMLSelectElement>('[data-testid="previous-feedback-round-select"]')!;
    await act(async () => {
      roundSelect.value = "round-1";
      roundSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(panel.textContent).toContain("Round 1 overall comment on v1.");
    expect(panel.textContent).toContain("Add baseline comparison.");
    // Mismatch notice because left pane is v3 while Round 1 reviewed v1
    expect(panel.textContent).toContain("Show v1 on the left");
    // No rubric section when responses is empty
    expect(panel.textContent).not.toContain("Rubric evaluation");
  });

  it("handles API error with working Retry (AC-10)", async () => {
    mocks.previousFeedback.mockRejectedValueOnce(new Error("Network error"));
    await renderCompare();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="compare-previous-feedback-toggle"]')!.click();
    });
    await flush();

    const panel = host.querySelector('[data-testid="compare-previous-feedback-panel"]')!;
    expect(panel.querySelector('[role="alert"]')?.textContent).toContain("Could not load previous feedback");

    // Retry recovers cleanly
    const retryBtn = [...panel.querySelectorAll("button")].find(b => b.textContent?.includes("Try again"))!;
    await act(async () => retryBtn.click());
    await flush();
    expect(panel.textContent).toContain("Round 2 overall comment on v3.");
  });

  it("renders distinct Unauthorized (403) state without retry loop (AC-10)", async () => {
    mocks.previousFeedback.mockRejectedValueOnce({ response: { status: 403 } });
    await renderCompare({ assignmentId: "assign-forbidden" });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="compare-previous-feedback-toggle"]')!.click();
    });
    await flush();
    const forbiddenPanel = host.querySelector('[data-testid="compare-previous-feedback-panel"]')!;
    expect(forbiddenPanel.querySelector('[role="alert"]')?.textContent).toContain("do not have permission");
    expect([...forbiddenPanel.querySelectorAll("button")].some(b => b.textContent?.includes("Try again"))).toBe(false);
  });

  it("renders calm empty state when API returns empty rounds array (AC-10)", async () => {
    mocks.previousFeedback.mockResolvedValueOnce({
      assignmentId: "assign-empty",
      submissionId: "sub-1",
      currentRoundNumber: 2,
      currentRevisionId: "rev-4",
      rounds: [],
    });
    await renderCompare({ assignmentId: "assign-empty" });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="compare-previous-feedback-toggle"]')!.click();
    });
    await flush();
    const panel = host.querySelector('[data-testid="compare-previous-feedback-panel"]')!;
    expect(panel.querySelector('[role="status"]')?.textContent).toContain("No submitted feedback");
  });

  it("closes panel and never leaks old assignment feedback when switching assignments (AC-13)", async () => {
    await renderCompare({ assignmentId: "assign-1" });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="compare-previous-feedback-toggle"]')!.click();
    });
    await flush();
    expect(host.textContent).toContain("Round 2 overall comment on v3.");

    // Switch assignmentId -> panel automatically resets/closes and does not show assign-1 data
    mocks.previousFeedback.mockResolvedValueOnce({
      assignmentId: "assign-2",
      submissionId: "sub-2",
      currentRoundNumber: 2,
      currentRevisionId: "rev-4",
      rounds: [
        {
          id: "r-assign-2",
          roundNumber: 1,
          revisionId: "rev-3",
          revisionNumber: 3,
          overallComment: "Brand new assignment 2 feedback.",
          responses: [],
          revisionItems: [],
        },
      ],
    });
    await renderCompare({ assignmentId: "assign-2" });
    await flush();
    expect(host.querySelector('[data-testid="compare-previous-feedback-panel"]')).toBeNull();

    // Open on assign-2 -> only assign-2 feedback appears
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="compare-previous-feedback-toggle"]')!.click();
    });
    await flush();
    expect(host.textContent).toContain("Brand new assignment 2 feedback.");
    expect(host.textContent).not.toContain("Round 2 overall comment on v3.");
  });

  it("renders Vietnamese labels accurately when language is vi (AC-11)", async () => {
    mocks.lang = "vi";
    await renderCompare();
    const toggle = host.querySelector<HTMLButtonElement>('[data-testid="compare-previous-feedback-toggle"]')!;
    expect(toggle.textContent).toContain("Nhận xét vòng trước");
    await act(async () => toggle.click());
    await flush();
    const panel = host.querySelector('[data-testid="compare-previous-feedback-panel"]')!;
    expect(panel.textContent).toContain("Chỉ đọc");
    expect(panel.textContent).toContain("Tóm tắt phản biện");
    expect(panel.textContent).toContain("Đánh giá theo tiêu chí");
    expect(panel.textContent).toContain("Trang 6 (bản v3)");
  });
});
