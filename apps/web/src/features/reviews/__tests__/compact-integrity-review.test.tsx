// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCIENTIFIC_REVIEW_POLICY_V2,
  scientificIntegrityChecks,
  type ReviewIntegrityEvidenceMap,
} from "@trend/shared-types";
import { computeRubricReadiness } from "@/features/reviews/review-readiness";
import { ReviewWorkspacePage } from "@/pages/reviews/review-workspace";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  submit: vi.fn(),
  workspace: null as any,
  readerMountCount: 0,
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "vi",
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
  ContentComparison: () => null,
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

const sampleEvidence: ReviewIntegrityEvidenceMap = {
  authorship: { access: "RESTRICTED", facts: [] },
  borrowing: {
    access: "AVAILABLE",
    facts: [{ label: "cited_keys", value: "24", tone: "neutral" }],
    advisoryNotes: ["Check citation in Section 2.1"],
  },
  data: { access: "EMPTY", facts: [] },
  sources: {
    access: "AVAILABLE",
    facts: [{ label: "citation_metadata_verified", value: "22/24", tone: "info" }],
  },
  conflicts: {
    access: "AVAILABLE",
    facts: [{ label: "declared_conflicts_count", value: "0", tone: "neutral" }],
  },
  ai_disclosure: {
    access: "AVAILABLE",
    facts: [{ label: "ai_tools_declared", value: "1", tone: "neutral" }],
  },
  ethics: { access: "EMPTY", facts: [] },
  confidentiality: { access: "EMPTY", facts: [] },
};

function makeIntegrityWorkspace(overrides: Partial<any> = {}) {
  return {
    assignment: {
      id: "assign-int",
      submissionId: {
        id: "sub-int",
        title: "Integrity Review Manuscript",
        submissionType: "RESEARCH_PAPER",
        currentRevisionNumber: 1,
      },
    },
    request: { id: "req-int", origin: "PEER_REVIEW", status: "IN_REVIEW" },
    review: null,
    responses: [{ criterionKey: "problem", performanceLevelId: "p-5", comment: "Strong", notApplicable: false }],
    requiredRevisions: [],
    templateVersion: {
      versionNumber: 2,
      reviewMode: "RUBRIC_ASSESSMENT",
      guidelines: [SCIENTIFIC_REVIEW_POLICY_V2],
    },
    criteria: [
      {
        key: "problem",
        title: "Research Problem & Research Questions",
        description: "Clear problem.",
        order: 0,
        required: true,
        allowNotApplicable: false,
        weight: 10,
        levels: [
          { id: "p-4", score: 4, label: "Good / Tốt", description: "Good" },
          { id: "p-5", score: 5, label: "Excellent / Rất tốt", description: "Excellent" },
        ],
      },
    ],
    artifactRevision: { id: "rev-int", revisionNumber: 1, contentType: "MARKDOWN" },
    artifactContent: "Draft text",
    integrityEvidence: sampleEvidence,
    previousRevisionItems: [],
    previousReviews: [],
    roundNumber: 1,
    ...overrides,
  };
}

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

async function mountWorkspace() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={["/reviews/assign-int"]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/reviews/:assignmentId" element={<ReviewWorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
}

async function setTextarea(el: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
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

describe("Compact Research Integrity & Ethics Review (INT/SCORE/SUB/SEC/STATE/UI)", () => {
  it("shows dedicated Integrity tab only when policy requires it, defaults all 8 items unchecked, and restricts N/A to allowed items (INT-01, INT-06, UI-06, UI-07)", async () => {
    mocks.workspace = makeIntegrityWorkspace();
    await mountWorkspace();

    const tabs = [...host.querySelectorAll<HTMLButtonElement>(".rw-subnav [role='tab']")];
    expect(tabs).toHaveLength(4);
    expect(tabs[1]?.textContent).toContain("reviewWorkspace.subTab.integrity");
    expect(tabs[1]?.textContent).toContain("0/8");

    // Open Integrity tab -> PDF reader never remounts
    await act(async () => tabs[1]!.click());
    expect(mocks.readerMountCount).toBe(1);

    // Default: all 8 items unchecked (INT-01) and zero textareas rendered by default (UI-07)
    expect(host.querySelectorAll(".rw-integrity-row")).toHaveLength(8);
    expect(host.querySelectorAll('.rw-integrity-choice-btn[aria-pressed="true"]')).toHaveLength(0);
    expect(host.querySelectorAll("#review-integrity textarea")).toHaveLength(0);

    // N/A button exists ONLY on allowNotApplicable=true items (data, ai_disclosure, ethics, confidentiality = 4)
    const naButtons = host.querySelectorAll('.rw-integrity-choice-btn[data-choice="na"]');
    expect(naButtons).toHaveLength(4);
    expect(host.querySelector('#integrity-row-authorship [data-choice="na"]')).toBeNull();
    expect(host.querySelector('#integrity-row-ethics [data-choice="na"]')).not.toBeNull();
  });

  it("hides Integrity tab when review policy does not require scientific integrity", async () => {
    mocks.workspace = makeIntegrityWorkspace({
      templateVersion: { versionNumber: 1, reviewMode: "RUBRIC_ASSESSMENT", guidelines: ["Custom seminar rubric"] },
    });
    await mountWorkspace();
    const tabs = [...host.querySelectorAll<HTMLButtonElement>(".rw-subnav [role='tab']")];
    expect(tabs).toHaveLength(3);
    expect(host.textContent).not.toContain("reviewWorkspace.subTab.integrity");
  });

  it("handles CHECKED, CONCERN note validation, stale-note stripping on status change, scoped evidence, and concern-to-revision creation without changing weighted score (INT-02..09, SCORE-01..04, SEC-01..07)", async () => {
    mocks.workspace = makeIntegrityWorkspace();
    await mountWorkspace();

    // Weighted score starts at 5,00 / 5
    const scoreBefore = host.querySelector(".rw-score-summary-pill")?.textContent;
    expect(scoreBefore).toContain("5,00");

    // Open Integrity tab
    const integrityTab = () => host.querySelectorAll<HTMLButtonElement>(".rw-subnav [role='tab']")[1]!;
    await act(async () => integrityTab().click());

    // Open authorship row info -> shows RESTRICTED evidence copy without marking N/A or CHECKED (SEC-01, SEC-02)
    const authorshipInfoBtn = host.querySelector<HTMLButtonElement>("#integrity-row-authorship .rw-integrity-info-btn")!;
    await act(async () => authorshipInfoBtn.click());
    expect(host.querySelector("#integrity-detail-authorship")?.textContent).toContain(
      "reviewWorkspace.integrity.evidenceRestricted",
    );

    // Select CHECKED on authorship (INT-02)
    await act(async () =>
      host.querySelector<HTMLButtonElement>('#integrity-row-authorship [data-choice="checked"]')!.click(),
    );
    expect(integrityTab().textContent).toContain("1/8");

    // Select CONCERN on ethics -> opens concern editor automatically (INT-03)
    await act(async () =>
      host.querySelector<HTMLButtonElement>('#integrity-row-ethics [data-choice="concern"]')!.click(),
    );
    const noteBox = host.querySelector<HTMLTextAreaElement>("#integrity-note-ethics")!;
    expect(noteBox).not.toBeNull();

    // Whitespace-only or < 10 chars is NOT counted as valid completion (INT-04, INT-05)
    await setTextarea(noteBox, "   short ");
    expect(integrityTab().textContent).toContain("1/8");

    // Valid >= 10 char explanation counts as valid completion
    await setTextarea(noteBox, "Chưa thấy mã chấp thuận hội đồng đạo đức cho khảo sát người tham gia.");
    expect(integrityTab().textContent).toContain("2/8");

    // Weighted score is completely unchanged by CONCERN (SCORE-01, SCORE-04)
    expect(host.querySelector(".rw-score-summary-pill")?.textContent).toBe(scoreBefore);

    // Create actionable clarification revision from CONCERN -> adds to shared requiredRevisions WITHOUT faking criterionKey
    const addClarificationBtn = [...host.querySelectorAll<HTMLButtonElement>("#integrity-detail-ethics button")].find(b =>
      b.textContent?.includes("reviewWorkspace.integrity.createRevisionCta"),
    )!;
    await act(async () => addClarificationBtn.click());
    const confirmBtn = [...host.querySelectorAll<HTMLButtonElement>("#integrity-detail-ethics button")].find(b =>
      b.textContent?.includes("reviewWorkspace.matrix.confirmAddRevision"),
    )!;
    await act(async () => confirmBtn.click());
    const revisionsTab = host.querySelectorAll<HTMLButtonElement>(".rw-subnav [role='tab']")[2]!;
    expect(revisionsTab.textContent).toContain("1");

    // Switch ethics from CONCERN -> NOT_APPLICABLE and save draft -> stale concern note MUST NOT be sent in payload (INT-09)
    await act(async () =>
      host.querySelector<HTMLButtonElement>('#integrity-row-ethics [data-choice="na"]')!.click(),
    );
    const saveBtn = [...host.querySelectorAll("button")].find(b => b.textContent?.includes("reviewWorkspace.saveDraft"))!;
    await act(async () => saveBtn.click());
    expect(mocks.save).toHaveBeenCalledTimes(1);
    const savedPayload = mocks.save.mock.calls[0]![0];
    expect(savedPayload.integrityChecks.ethics).toEqual({ status: "NOT_APPLICABLE" });
    expect(savedPayload.requiredRevisions[0]).not.toHaveProperty("criterionKey");

    // Switch ethics back to CONCERN -> local draft note is restored cleanly!
    await act(async () =>
      host.querySelector<HTMLButtonElement>('#integrity-row-ethics [data-choice="concern"]')!.click(),
    );
    expect(host.querySelector<HTMLTextAreaElement>("#integrity-note-ethics")!.value).toContain(
      "Chưa thấy mã chấp thuận hội đồng đạo đức",
    );

    // Switch to Summary -> two-group separation + flagged concern visible + preserves state across tabs (STATE-01, STATE-02)
    const summaryTab = host.querySelectorAll<HTMLButtonElement>(".rw-subnav [role='tab']")[3]!;
    await act(async () => summaryTab.click());
    expect(host.textContent).toContain("reviewWorkspace.summary.academicGroup");
    expect(host.textContent).toContain("reviewWorkspace.summary.integrityGroup");
    expect(host.textContent).toContain("Chưa thấy mã chấp thuận hội đồng đạo đức");
    expect(mocks.readerMountCount).toBe(1);
  });

  it("jumps directly from Bottom Action Bar missing items to exact Integrity check and enforces STRONG gate on CONCERN (SUB-03..08)", async () => {
    mocks.workspace = makeIntegrityWorkspace();
    await mountWorkspace();

    // Open Bottom Action Bar missing items tray
    const missingToggle = host.querySelector<HTMLButtonElement>(".rw-missing-toggle-btn")!;
    await act(async () => missingToggle.click());
    const tray = host.querySelector(".rw-footer-missing-tray")!;
    expect(tray.textContent).toContain("reviewWorkspace.readiness.integrityIncomplete:count=8");

    // Click "Go to" on integrity incomplete issue -> switches to Integrity tab!
    const rows = [...tray.querySelectorAll(".rw-readiness-issue-row")];
    const integrityIssueRow = rows.find(r => r.textContent?.includes("reviewWorkspace.readiness.integrityIncomplete"))!;
    await act(async () => integrityIssueRow.querySelector<HTMLButtonElement>(".rw-readiness-jump-btn")!.click());
    expect(host.querySelector("#review-integrity")).not.toBeNull();

    // Readiness check: all 8 answered with 1 valid CONCERN -> blocks STRONG, allows MAJOR_REVISION (SUB-04, SUB-05)
    const allCheckedWithOneConcern = Object.fromEntries(
      scientificIntegrityChecks.map(c => [
        c.key,
        c.key === "ethics"
          ? { status: "CONCERN" as const, note: "Missing ethics committee approval code for human survey." }
          : { status: "CHECKED" as const },
      ]),
    );
    const strongCheck = computeRubricReadiness({
      criteria: [{ key: "p", title: "Problem", required: true, allowNotApplicable: false, levels: [{ id: "p5", score: 5 }] }],
      responses: { p: { comment: "Great", evidence: "", performanceLevelId: "p5", notApplicable: false } },
      reviewMode: "RUBRIC_ASSESSMENT",
      commentOnly: false,
      overallAssessment: "STRONG",
      overallComment: "Good study overall.",
      requiredRevisions: [],
      integrityChecks: allCheckedWithOneConcern,
      guidelines: [SCIENTIFIC_REVIEW_POLICY_V2],
      origin: "PEER_REVIEW",
      previousRevisionItems: [],
    });
    expect(strongCheck.isReadyToSubmit).toBe(false);
    expect(strongCheck.issues.some(i => i.id === "integrity-blocks-approval" && i.targetSection === "integrity")).toBe(
      true,
    );

    const majorRevisionCheck = computeRubricReadiness({
      criteria: [{ key: "p", title: "Problem", required: true, allowNotApplicable: false, levels: [{ id: "p5", score: 5 }] }],
      responses: { p: { comment: "Great", evidence: "", performanceLevelId: "p5", notApplicable: false } },
      reviewMode: "RUBRIC_ASSESSMENT",
      commentOnly: false,
      overallAssessment: "MAJOR_REVISION",
      overallComment: "Please provide ethics approval documentation.",
      requiredRevisions: [{ priority: "MAJOR", description: "Provide ethics approval number." }],
      integrityChecks: allCheckedWithOneConcern,
      guidelines: [SCIENTIFIC_REVIEW_POLICY_V2],
      origin: "PEER_REVIEW",
      previousRevisionItems: [],
    });
    expect(majorRevisionCheck.isReadyToSubmit).toBe(true);
    expect(majorRevisionCheck.integrityCompleteCount).toBe(8);
    expect(majorRevisionCheck.integrityConcernCount).toBe(1);
  });
});
