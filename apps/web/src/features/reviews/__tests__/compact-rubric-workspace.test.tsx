// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewWorkspacePage } from "@/pages/reviews/review-workspace";
import { computeRubricReadiness } from "@/features/reviews/review-readiness";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  submit: vi.fn(),
  workspace: null as any,
  readerMountCount: 0,
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "en",
    t: (key: string, values?: Record<string, string | number>) => {
      if (!values) return key;
      let out = key;
      for (const [k, v] of Object.entries(values)) out += `:${k}=${v}`;
      return out;
    },
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/submissions/components/content-comparison", () => ({
  ContentComparison: () => <div data-testid="content-comparison">ContentComparison</div>,
}));
vi.mock("@/features/reviews/components/assigned-review-advisory", () => ({
  AssignedReviewAdvisory: () => null,
}));
vi.mock("@/features/reviews/components/next-mentor-review", () => ({
  NextMentorReview: () => null,
}));
vi.mock("@/features/reviews/components/assigned-revision-reader", () => ({
  AssignedRevisionReader: function MockReader() {
    useEffect(() => {
      mocks.readerMountCount += 1;
    }, []);
    return <div data-testid="pdf-reader">PDF Reader</div>;
  },
}));
vi.mock("@/features/reviews", () => ({
  useReviewWorkspace: () => ({ data: mocks.workspace, isLoading: false, error: null, refetch: vi.fn() }),
  useSaveReview: () => ({ mutateAsync: mocks.save, isPending: false }),
  useSubmitReview: () => ({ mutateAsync: mocks.submit, isPending: false }),
}));

function makeWorkspace(overrides: Partial<any> = {}) {
  return {
    assignment: {
      id: "assign-1",
      submissionId: { id: "sub-1", title: "Compact Rubric Paper", currentRevisionNumber: 1 },
    },
    request: { id: "req-1", origin: "MENTOR_GUIDANCE", status: "IN_REVIEW" },
    review: null,
    responses: [{ criterionKey: "methods", performanceLevelId: undefined, comment: "", notApplicable: false }],
    requiredRevisions: [],
    templateVersion: {
      versionNumber: 1,
      reviewMode: "RUBRIC_ASSESSMENT",
      guidelines: ["Evidence-based peer review"],
    },
    criteria: [
      {
        key: "problem",
        title: "Problem & Gap",
        description: "Clarity of research problem",
        order: 1,
        required: true,
        allowNotApplicable: false,
        weight: 2,
        levels: [
          { id: "p-1", score: 1, label: "Weak", description: "Unclear problem" },
          { id: "p-2", score: 2, label: "Fair", description: "Partially defined" },
          { id: "p-3", score: 3, label: "Good", description: "Clear problem" },
          { id: "p-4", score: 4, label: "Strong", description: "Rigorous gap" },
        ],
      },
      {
        key: "methods",
        title: "Methodology",
        description: "Soundness of experimental design",
        order: 2,
        required: true,
        allowNotApplicable: true,
        weight: 3,
        levels: [
          { id: "m-1", score: 1, label: "Weak", description: "Flawed methods" },
          { id: "m-2", score: 2, label: "Fair", description: "Missing baselines" },
          { id: "m-3", score: 3, label: "Good", description: "Sound design" },
          { id: "m-4", score: 4, label: "Strong", description: "Reproducible & strong" },
        ],
      },
    ],
    artifactRevision: { id: "rev-1", revisionNumber: 1, contentType: "application/pdf" },
    previousRevisionItems: [],
    previousReviews: [],
    roundNumber: 1,
    ...overrides,
  };
}

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

function SubmittedRequest() {
  const location = useLocation();
  return <output data-testid="submitted-request">{location.pathname}{location.search}</output>;
}
function MentorRoute() {
  const location = useLocation();
  return new URLSearchParams(location.search).get("view") === "review-request" ? <SubmittedRequest /> : <ReviewWorkspacePage />;
}

async function mountWorkspace(path = "/reviews/assign-1") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[path]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/reviews/:assignmentId" element={<ReviewWorkspacePage />} />
            <Route path="/mentor-workspace" element={<MentorRoute />} />
            <Route path="/review-requests/:requestId" element={<SubmittedRequest />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
}

async function clickButtonContaining(text: string) {
  const btn = [...host.querySelectorAll("button")].find(el => el.textContent?.includes(text));
  expect(btn, `Expected button containing "${text}"`).toBeDefined();
  await act(async () => btn!.click());
}

async function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.readerMountCount = 0;
  mocks.save.mockResolvedValue({});
  mocks.submit.mockResolvedValue({});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  vi.unstubAllGlobals();
});

describe("Compact Rubric Review Workspace", () => {
  it.each([
    [false, "/reviews/assign-1"],
    [true, "/reviews/assign-1"],
    [false, "/mentor-workspace?view=review&assignmentId=assign-1&returnTo=%2Fmentor-workspace%3Fview%3Dwork%26workStatus%3DWAITING"],
  ] as const)("navigates to the persisted request only after a successful submission (failure=%s, %s)", async (fail, path) => {
    mocks.workspace = makeWorkspace({
      review: { id: "draft", status: "DRAFT", recommendation: "COMMENT_ONLY", overallComment: "Useful feedback for the authors to retain." },
    });
    if (fail) mocks.submit.mockRejectedValueOnce(new Error("Network failure"));
    else mocks.submit.mockResolvedValueOnce({ review: { id: "sent-review" } });
    await mountWorkspace(path);
    await clickButtonContaining("reviewWorkspace.feedbackFirst.submitBtn");
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    const confirm = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("reviewWorkspace.feedbackFirst.confirmSubmit"));
    expect(confirm).toBeDefined();
    await act(async () => confirm!.click());
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-testid="submitted-request"]') !== null).toBe(!fail);
    if (!fail) {
      const target = new URL(host.querySelector('[data-testid="submitted-request"]')!.textContent!, "http://localhost");
      expect(target.searchParams.get("reviewId")).toBe("sent-review");
      expect(target.searchParams.get("detailTab")).toBe("feedback");
      if (path.startsWith("/mentor-workspace")) {
        expect(target.searchParams.get("view")).toBe("review-request");
        expect(target.searchParams.get("requestId")).toBe("req-1");
        expect(target.searchParams.get("returnTo")).toContain("workStatus=WAITING");
      }
    }
  });
  it("renders dynamic 4-level matrix rows without preselecting scores and scores without auto-advancing", async () => {
    mocks.workspace = makeWorkspace({
      request: { id: "req-1", origin: "PEER_REVIEW", status: "IN_REVIEW" },
    });
    await mountWorkspace();

    // Dynamic 4-level columns (1,2,3,4 + N/A because methods allows N/A) — NOT hardcoded 5!
    const headers = [...host.querySelectorAll("thead th")].map(th => th.textContent?.trim());
    expect(headers).toEqual(["reviewWorkspace.matrix.criterionCol", "1", "2", "3", "4", "N/A", "reviewWorkspace.matrix.details"]);

    // No criterion detail forms expanded by default, no preselected scores
    expect(host.querySelector(".rw-criterion-detail")).toBeNull();
    expect(host.querySelector('[aria-pressed="true"]')).toBeNull();

    // Click score 4 on Problem & Gap directly on the matrix row
    const problemScore4 = host.querySelector<HTMLButtonElement>('button[aria-label^="Problem & Gap: 4"]')!;
    await act(async () => problemScore4.click());
    expect(problemScore4.getAttribute("aria-pressed")).toBe("true");
    // Does NOT auto-advance or forcibly open another criterion's detail panel
    expect(host.querySelector(".rw-criterion-detail")).toBeNull();

    // Click score 3 on Methodology → weighted score = (4*2 + 3*3) / (2+3) = 17/5 = 3.4
    const methodsScore3 = host.querySelector<HTMLButtonElement>('button[aria-label^="Methodology: 3"]')!;
    await act(async () => methodsScore3.click());
    expect(host.querySelector(".rw-score-summary-pill")?.textContent).toContain("3.4");
  });

  it("opens single criterion detail, creates linked revision via explicit confirmation, and guards duplicates", async () => {
    mocks.workspace = makeWorkspace({
      request: { id: "req-1", origin: "PEER_REVIEW", status: "IN_REVIEW" },
    });
    await mountWorkspace();

    // Score Methods = 2 (low score) -> MUST NOT auto-create revision item
    const methodsScore2 = host.querySelector<HTMLButtonElement>('button[aria-label^="Methodology: 2"]')!;
    await act(async () => methodsScore2.click());
    expect(host.textContent).toContain("reviewWorkspace.matrix.needsCommentShort");

    // Expand Methodology details
    const detailButtons = [...host.querySelectorAll<HTMLButtonElement>(".rw-matrix-expand-btn")];
    await act(async () => detailButtons[1]!.click());
    expect(host.querySelectorAll(".rw-criterion-detail")).toHaveLength(1);

    // Type academic comment & expand optional evidence before entering location
    const commentBox = host.querySelector<HTMLTextAreaElement>(".rw-criterion-detail textarea")!;
    await setTextareaValue(commentBox, "Add ablation study comparing baseline.");
    await clickButtonContaining("reviewWorkspace.addEvidenceCta");
    const evidenceInput = host.querySelector<HTMLInputElement>("#rw-evidence-methods")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(evidenceInput, "Section 4.2, Table 1");
      evidenceInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Still 0 revision items until user explicitly clicks Create revision request & confirms
    const subTabs = () => host.querySelectorAll(".rw-subnav [role='tab']");
    expect(subTabs()[1]?.textContent).toContain("0");

    await clickButtonContaining("reviewWorkspace.matrix.createRevision");
    const composerTextarea = host.querySelector<HTMLTextAreaElement>(".rw-inline-composer textarea")!;
    // Pre-filled from criterion comment
    expect(composerTextarea.value).toBe("Add ablation study comparing baseline.");

    await clickButtonContaining("reviewWorkspace.matrix.confirmAddRevision");
    expect(subTabs()[1]?.textContent).toContain("1");

    // Duplicate guard: trying to add exact same revision for same criterion is blocked
    await clickButtonContaining("reviewWorkspace.matrix.createRevision");
    await clickButtonContaining("reviewWorkspace.matrix.confirmAddRevision");
    expect(host.textContent).toContain("reviewWorkspace.matrix.revisionDuplicate");
    expect(subTabs()[1]?.textContent).toContain("1");
  });

  it("jumps directly from Submit Dialog missing-item checklist to the exact missing criterion", async () => {
    mocks.workspace = makeWorkspace({
      request: { id: "req-1", origin: "PEER_REVIEW", status: "IN_REVIEW" },
    });
    await mountWorkspace();

    // Open Submit Dialog while criteria & summary are incomplete
    await clickButtonContaining("reviewWorkspace.submitReview");
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("reviewWorkspace.readiness.missingCriterion");

    // Click "Go to" on first missing criterion ("Problem & Gap")
    const jumpBtn = dialog.querySelector<HTMLButtonElement>(".rw-readiness-jump-btn")!;
    await act(async () => jumpBtn.click());

    // Dialog closes and Problem & Gap criterion detail panel opens directly
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector("#rw-criterion-detail-problem")).not.toBeNull();
  });

  it("preserves unsaved drafts across Criteria / Revisions / Summary tabs without remounting PDF reader", async () => {
    mocks.workspace = makeWorkspace({
      request: { id: "req-1", origin: "PEER_REVIEW", status: "IN_REVIEW" },
    });
    await mountWorkspace();
    expect(mocks.readerMountCount).toBe(1);

    // Score Problem = 4
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label^="Problem & Gap: 4"]')!.click());

    // Switch to Summary tab and write overall comment
    await clickButtonContaining("reviewWorkspace.subTab.summary");
    const overall = host.querySelector<HTMLTextAreaElement>("#review-overall-comment")!;
    await setTextareaValue(overall, "Strong contribution overall.");

    // Switch to Revisions tab (empty state) and add item
    await clickButtonContaining("reviewWorkspace.subTab.revisions");
    expect(host.textContent).toContain("reviewWorkspace.revisions.empty");
    await clickButtonContaining("reviewWorkspace.revisions.addCta");
    const revInput = host.querySelector<HTMLInputElement>('input[aria-label="Required change"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(revInput, "Clarify dataset split");
      revInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Switch back to Criteria and Summary -> everything preserved, PDF reader NEVER remounted
    await clickButtonContaining("reviewWorkspace.subTab.criteria");
    expect(host.querySelector<HTMLButtonElement>('button[aria-label^="Problem & Gap: 4"]')?.getAttribute("aria-pressed")).toBe("true");
    await clickButtonContaining("reviewWorkspace.subTab.summary");
    expect(host.querySelector<HTMLTextAreaElement>("#review-overall-comment")?.value).toBe("Strong contribution overall.");
    expect(mocks.readerMountCount).toBe(1);
    // Inline ContentComparison is intentionally removed from Review Mode to prevent 3-PDF duplication
    expect(host.querySelector('[data-testid="content-comparison"]')).toBeNull();
  });

  it("distinguishes criteria scored from ready-to-submit and hides misleading revision counts in comment-only mode", async () => {
    mocks.workspace = makeWorkspace({
      request: { id: "req-1", origin: "MENTOR_GUIDANCE", status: "IN_REVIEW" },
      responses: [{ criterionKey: "problem", performanceLevelId: "p-4", comment: "Good", notApplicable: false }],
    });
    await mountWorkspace();

    // Score remaining criterion so all criteria are scored (2/2), yet Summary/decision is still incomplete
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label^="Methodology: 4"]')!.click());
    expect(host.textContent).toContain("reviewWorkspace.readiness.criteriaDone");
    expect(host.textContent).not.toContain("reviewWorkspace.readiness.readyToSubmit");
    // Duplicate footer progress bar is removed
    expect(host.querySelector(".rw-footer-track")).toBeNull();

    // Add a draft revision item in Revisions tab
    await clickButtonContaining("reviewWorkspace.subTab.revisions");
    await clickButtonContaining("reviewWorkspace.revisions.addCta");
    const revInput = host.querySelector<HTMLInputElement>('input[aria-label="Required change"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(revInput, "Tighten abstract");
      revInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Switch to Summary, pick Comment-only outcome & enter overall comment
    await clickButtonContaining("reviewWorkspace.subTab.summary");
    const commentRadio = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')][0]!;
    await act(async () => commentRadio.click());
    await setTextareaValue(host.querySelector<HTMLTextAreaElement>("#review-overall-comment")!, "Helpful feedback only.");

    // Draft revision notice shown cleanly; switching back to Request changes preserves draft revision!
    expect(host.textContent).toContain("reviewWorkspace.summary.commentOnlyDraftNote");
    await clickButtonContaining("reviewWorkspace.submitReview");
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).not.toContain("reviewWorkspace.submitDialog.currentRevisions");
    expect(dialog.textContent).toContain("reviewWorkspace.submitDialog.commentOnlyExcluded");

    // Close dialog, switch to Request changes -> draft revision is still intact (count 1)
    const cancelBtn = [...dialog.querySelectorAll("button")].find(b => b.textContent?.includes("reviewWorkspace.continueEditing"))!;
    await act(async () => cancelBtn.click());
    const changesRadio = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')][1]!;
    await act(async () => changesRadio.click());
    expect(host.textContent).toContain("reviewWorkspace.summary.revisionsIncluded:count=1");
  });

  it("does not force STRUCTURED_REVIEW onto a numeric rubric matrix", async () => {
    mocks.workspace = makeWorkspace({
      request: { id: "req-1", origin: "PEER_REVIEW", status: "IN_REVIEW" },
      templateVersion: { versionNumber: 1, reviewMode: "STRUCTURED_REVIEW", guidelines: [] },
      criteria: [
        { key: "clarity", title: "Writing Clarity", description: "Check prose", order: 1, required: true, allowNotApplicable: false, levels: [] },
      ],
    });
    await mountWorkspace();
    expect(host.querySelector(".rw-matrix-table")).toBeNull();
    expect(host.querySelector(".rw-compact-list")).not.toBeNull();
  });

  it("computes backend-aligned readiness rules for low scores, integrity checks, and STRONG approval", () => {
    const result = computeRubricReadiness({
      criteria: [
        { key: "m", title: "Methods", required: true, allowNotApplicable: false, levels: [{ id: "m2", score: 2 }, { id: "m4", score: 4 }] },
      ],
      responses: { m: { comment: "", evidence: "", performanceLevelId: "m2", notApplicable: false } },
      reviewMode: "RUBRIC_ASSESSMENT",
      commentOnly: false,
      overallAssessment: "STRONG",
      overallComment: "Looks good",
      requiredRevisions: [{ priority: "MINOR", description: "Fix typo" }],
      integrityChecks: {},
      guidelines: ["Evidence-based peer review"],
      origin: "MENTOR_GUIDANCE",
      previousRevisionItems: [],
    });

    expect(result.isReadyToSubmit).toBe(false);
    expect(result.issues.map(i => i.category)).toEqual(
      expect.arrayContaining(["low_score_comment", "integrity", "revisions"]),
    );
  });
});
