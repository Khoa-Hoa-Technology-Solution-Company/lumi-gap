// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCIENTIFIC_REVIEW_POLICY,
  SCIENTIFIC_REVIEW_POLICY_V2,
  SYSTEM_RUBRIC_V2_CATALOG,
  requiresScientificIntegrity,
  type SystemRubricScore,
} from "@trend/shared-types";
import {
  isLumiGapSystemRubric,
  localizeSystemCriterion,
  localizeSystemLevelDescription,
} from "@/features/reviews/system-rubric-i18n";
import { computeRubricReadiness } from "@/features/reviews/review-readiness";
import { ReviewWorkspacePage } from "@/pages/reviews/review-workspace";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  submit: vi.fn(),
  workspace: null as any,
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
  AssignedRevisionReader: () => <div data-testid="pdf-reader">PDF Reader</div>,
}));
vi.mock("@/features/reviews", () => ({
  useReviewWorkspace: () => ({ data: mocks.workspace, isLoading: false, error: null, refetch: vi.fn() }),
  useSaveReview: () => ({ mutateAsync: mocks.save, isPending: false }),
  useSubmitReview: () => ({ mutateAsync: mocks.submit, isPending: false }),
}));

function makeV2Workspace(overrides: Partial<any> = {}) {
  const paper = SYSTEM_RUBRIC_V2_CATALOG.RESEARCH_PAPER;
  return {
    assignment: {
      id: "assign-v2",
      submissionId: {
        id: "sub-v2",
        title: "Academic Rubric Refinement Paper",
        submissionType: "RESEARCH_PAPER",
        currentRevisionNumber: 1,
      },
    },
    request: { id: "req-v2", origin: "PEER_REVIEW", status: "IN_REVIEW" },
    review: null,
    responses: [],
    requiredRevisions: [],
    templateVersion: {
      versionNumber: 2,
      reviewMode: "RUBRIC_ASSESSMENT",
      guidelines: [...paper.guidelines],
    },
    criteria: paper.criteria.map((c, order) => ({
      key: c.key,
      title: c.title.en,
      description: c.description.en,
      order,
      required: c.required,
      allowNotApplicable: c.allowNotApplicable,
      weight: c.weight,
      levels: ([1, 2, 3, 4, 5] as SystemRubricScore[]).map(score => ({
        id: `${c.key}-${score}`,
        score,
        label:
          score === 1
            ? "Poor / Không đạt"
            : score === 2
              ? "Weak / Cần sửa nhiều"
              : score === 3
                ? "Adequate / Đạt cơ bản"
                : score === 4
                  ? "Good / Tốt"
                  : "Excellent / Rất tốt",
        description: c.levels[score].en,
      })),
    })),
    artifactRevision: { id: "rev-v2", revisionNumber: 1, contentType: "application/pdf" },
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
          initialEntries={["/reviews/assign-v2"]}
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

describe("Academic Rubric v2.0 Quality & Versioning (RUB-01..RUB-07)", () => {
  it("provides criterion-specific, non-generic descriptors across all 7 artifact types and 5 levels", () => {
    const templates = Object.values(SYSTEM_RUBRIC_V2_CATALOG);
    expect(templates).toHaveLength(7);

    for (const tpl of templates) {
      // Preserve total weight of 100
      const weightSum = tpl.criteria.reduce((sum, c) => sum + c.weight, 0);
      expect(weightSum).toBe(100);

      // Level 5 descriptors must be distinct across criteria within the same template
      const level5En = new Set<string>();
      const level5Vi = new Set<string>();

      for (const criterion of tpl.criteria) {
        const seenEn = new Set<string>();
        const seenVi = new Set<string>();
        for (const score of [1, 2, 3, 4, 5] as SystemRubricScore[]) {
          const en = criterion.levels[score].en.trim();
          const vi = criterion.levels[score].vi.trim();
          expect(en.length).toBeGreaterThan(30);
          expect(vi.length).toBeGreaterThan(30);
          seenEn.add(en);
          seenVi.add(vi);
        }
        // Every score level 1..5 is distinct (including 4 vs 5)
        expect(seenEn.size).toBe(5);
        expect(seenVi.size).toBe(5);
        expect(criterion.levels[4].vi).not.toBe(criterion.levels[5].vi);
        level5En.add(criterion.levels[5].en);
        level5Vi.add(criterion.levels[5].vi);
      }

      // No shared boilerplate across criteria
      expect(level5En.size).toBe(tpl.criteria.length);
      expect(level5Vi.size).toBe(tpl.criteria.length);
    }

    // Artifact-specific tailoring: LITERATURE_REVIEW evaluates Evidence Appraisal, not lab experiments
    const litReview = SYSTEM_RUBRIC_V2_CATALOG.LITERATURE_REVIEW;
    const litEvidence = litReview.criteria.find(c => c.key === "data_evaluation")!;
    expect(litEvidence.title.en).toBe("Evidence Appraisal");
    expect(litEvidence.levels[5].vi).toContain("thẩm định");

    // RESEARCH_PROPOSAL evaluates planned methodology, not completed experiments
    const proposal = SYSTEM_RUBRIC_V2_CATALOG.RESEARCH_PROPOSAL;
    const proposalMethod = proposal.criteria.find(c => c.key === "methodology")!;
    expect(proposalMethod.title.en).toBe("Proposed Methodology & Reproducibility");
  });

  it("preserves historical v1.0 rubric descriptors without re-interpreting them as v2.0", () => {
    expect(requiresScientificIntegrity([SCIENTIFIC_REVIEW_POLICY])).toBe(true);
    expect(requiresScientificIntegrity([SCIENTIFIC_REVIEW_POLICY_V2])).toBe(true);
    expect(isLumiGapSystemRubric([SCIENTIFIC_REVIEW_POLICY])).toBe(true);
    expect(isLumiGapSystemRubric([SCIENTIFIC_REVIEW_POLICY_V2])).toBe(true);

    // v1.0 stays on exact historical v1.0 Vietnamese anchor
    const v1Level5 = localizeSystemLevelDescription(
      { score: 5, description: "Clear, justified and answerable research questions. Precise, rigorous..." },
      "vi",
      true,
      {
        criterionKey: "research_problem",
        criterionTitle: "Research Problem & Research Questions",
        artifactType: "RESEARCH_PAPER",
        versionNumber: 1,
        guidelines: [SCIENTIFIC_REVIEW_POLICY],
      },
    );
    expect(v1Level5).toBe(
      "Chính xác, chặt chẽ và có minh chứng rõ ràng, phù hợp chuẩn học thuật của loại tài liệu này.",
    );

    // v2.0 resolves criterion-specific Vietnamese descriptor
    const v2Problem5 = localizeSystemLevelDescription(
      { score: 5, description: SYSTEM_RUBRIC_V2_CATALOG.RESEARCH_PAPER.criteria[0]!.levels[5].en },
      "vi",
      true,
      {
        criterionKey: "research_problem",
        criterionTitle: "Research Problem & Research Questions",
        artifactType: "RESEARCH_PAPER",
        versionNumber: 2,
        guidelines: [SCIENTIFIC_REVIEW_POLICY_V2],
      },
    );
    const v2Methods5 = localizeSystemLevelDescription(
      { score: 5, description: SYSTEM_RUBRIC_V2_CATALOG.RESEARCH_PAPER.criteria[3]!.levels[5].en },
      "vi",
      true,
      {
        criterionKey: "methodology",
        criterionTitle: "Methodology & Reproducibility",
        artifactType: "RESEARCH_PAPER",
        versionNumber: 2,
        guidelines: [SCIENTIFIC_REVIEW_POLICY_V2],
      },
    );
    expect(v2Problem5).toContain("Vấn đề nghiên cứu được xác định chặt chẽ");
    expect(v2Methods5).toContain("phương pháp luận");
    expect(v2Problem5).not.toBe(v2Methods5);

    // Artifact-specific v1 description localization no longer overwrites LITERATURE_REVIEW with RESEARCH_PAPER
    const litV1Loc = localizeSystemCriterion(
      {
        key: "data_evaluation",
        title: "Evidence Appraisal",
        description: "Quality and relevance of the reviewed sources, not laboratory experiments.",
      },
      "vi",
      true,
      { artifactType: "LITERATURE_REVIEW", versionNumber: 1, guidelines: [SCIENTIFIC_REVIEW_POLICY] },
    );
    expect(litV1Loc.title).toBe("Thẩm định chất lượng bằng chứng");
    expect(litV1Loc.description).toContain("không đòi hỏi thí nghiệm phòng lab");
  });
});

describe("Criterion Detail UI & Inline Revision Workflow (UI-01..UI-10, REV-01..REV-14)", () => {
  it("hides empty evidence behind toggle, never hides populated evidence, keeps only the selected score descriptor, and avoids repeated titles", async () => {
    mocks.workspace = makeV2Workspace({
      responses: [
        {
          criterionKey: "research_problem",
          performanceLevelId: "research_problem-5",
          comment: "Câu hỏi nghiên cứu rất rõ ràng.",
          evidence: "",
          notApplicable: false,
        },
        {
          criterionKey: "methodology",
          performanceLevelId: "methodology-4",
          comment: "Quy trình rõ ràng.",
          evidence: "Trang 5, mục 3.1",
          notApplicable: false,
        },
      ],
    });
    await mountWorkspace();

    // All criteria required -> header shows single note rather than repeating Required tag on each detail
    expect(host.textContent).toContain("reviewWorkspace.allCriteriaRequiredNote");

    // Expand Research Problem (no evidence yet -> evidence input collapsed behind + CTA)
    const expandBtns = [...host.querySelectorAll<HTMLButtonElement>(".rw-matrix-expand-btn")];
    await act(async () => expandBtns[0]!.click());

    const detail = host.querySelector("#rw-criterion-detail-research_problem")!;
    // UI-01: criterion title is NOT repeated inside detail panel when already shown on the row directly above
    expect(detail.querySelector("h3")).toBeNull();
    expect(detail.querySelector("#rw-evidence-research_problem")).toBeNull();
    expect(detail.textContent).toContain("reviewWorkspace.addEvidenceCta");

    // Selected level 5 shows criterion-specific Vietnamese descriptor
    expect(detail.textContent).toContain("Vấn đề nghiên cứu được xác định chặt chẽ");

    // The selected descriptor is sufficient; do not duplicate the full scale below it.
    expect(detail.querySelector(".rw-scale-toggle-btn")).toBeNull();
    expect(detail.querySelector(".rw-full-scale-list")).toBeNull();

    // Switch to Methodology which already has evidence -> evidence input MUST be visible (never hidden)
    await act(async () => expandBtns[3]!.click());
    const methodEvidence = host.querySelector<HTMLInputElement>("#rw-evidence-methodology");
    expect(methodEvidence).not.toBeNull();
    expect(methodEvidence!.value).toBe("Trang 5, mục 3.1");
  });

  it("supports inline revision creation, comment reuse, cancel without data loss, inline edit/delete, and summary jump-back", async () => {
    mocks.workspace = makeV2Workspace({
      responses: [
        {
          criterionKey: "research_problem",
          performanceLevelId: "research_problem-2",
          comment: "Câu hỏi nghiên cứu chưa giới hạn rõ đối tượng khảo sát.",
          evidence: "Trang 2, mục 1.2",
          notApplicable: false,
        },
      ],
    });
    await mountWorkspace();

    // Open Research Problem detail
    const expandBtns = [...host.querySelectorAll<HTMLButtonElement>(".rw-matrix-expand-btn")];
    await act(async () => expandBtns[0]!.click());
    const detail = () => host.querySelector("#rw-criterion-detail-research_problem")!;

    // Composer is hidden by default
    expect(detail().querySelector(".rw-inline-composer")).toBeNull();

    // Open inline revision composer
    const addBtn = [...detail().querySelectorAll("button")].find(b =>
      b.textContent?.includes("reviewWorkspace.matrix.createRevision"),
    )!;
    await act(async () => addBtn.click());

    const composer = () => detail().querySelector(".rw-inline-composer")!;
    expect(composer()).not.toBeNull();
    // Criterion title is NOT repeated inside composer
    expect(composer().textContent).not.toContain("Vấn đề & Câu hỏi nghiên cứu");

    // Pre-filled from existing comment
    const textarea = composer().querySelector("textarea")!;
    expect(textarea.value).toBe("Câu hỏi nghiên cứu chưa giới hạn rõ đối tượng khảo sát.");

    // Edit text and then click "Use comment" to restore from comment
    await setTextarea(textarea, "Bản nháp tạm");
    const useCommentBtn = [...composer().querySelectorAll("button")].find(b =>
      b.textContent?.includes("reviewWorkspace.useCommentDraft"),
    )!;
    await act(async () => useCommentBtn.click());
    expect(textarea.value).toBe("Câu hỏi nghiên cứu chưa giới hạn rõ đối tượng khảo sát.");

    // Cancel composer -> must NOT lose score, comment, or evidence!
    const cancelBtn = [...composer().querySelectorAll("button")].find(b =>
      b.textContent?.includes("reviewWorkspace.matrix.cancel"),
    )!;
    await act(async () => cancelBtn.click());
    expect(detail().querySelector(".rw-inline-composer")).toBeNull();
    expect(detail().querySelector<HTMLTextAreaElement>(".rw-comment-textarea")!.value).toBe(
      "Câu hỏi nghiên cứu chưa giới hạn rõ đối tượng khảo sát.",
    );
    expect(detail().querySelector<HTMLInputElement>("#rw-evidence-research_problem")!.value).toBe(
      "Trang 2, mục 1.2",
    );

    // Re-open composer, refine into actionable revision, set Minor, and submit
    const reopenBtn = [...detail().querySelectorAll("button")].find(b =>
      b.textContent?.includes("reviewWorkspace.matrix.createRevision"),
    )!;
    await act(async () => reopenBtn.click());
    await setTextarea(
      composer().querySelector("textarea")!,
      "Xác định rõ đối tượng và phạm vi khảo sát trong câu hỏi nghiên cứu.",
    );
    const minorBtn = [...composer().querySelectorAll("button")].find(b =>
      b.textContent?.includes("reviewWorkspace.feedbackFirst.severity.MINOR"),
    )!;
    await act(async () => minorBtn.click());
    const confirmBtn = [...composer().querySelectorAll("button")].find(b =>
      b.textContent?.includes("reviewWorkspace.matrix.confirmAddRevision"),
    )!;
    await act(async () => confirmBtn.click());

    // Newly created revision item appears inline inside the criterion detail
    const inlineItem = detail().querySelector(".rw-criterion-rev-item")!;
    expect(inlineItem.textContent).toContain(
      "Xác định rõ đối tượng và phạm vi khảo sát trong câu hỏi nghiên cứu.",
    );
    // Criterion title is NOT repeated inside inline revision item
    expect(inlineItem.textContent).not.toContain("Vấn đề & Câu hỏi nghiên cứu");

    // Edit inline item -> updates shared state & summary
    const editBtn = inlineItem.querySelector<HTMLButtonElement>('button[aria-label="reviewWorkspace.revisionEdit"]')!;
    await act(async () => editBtn.click());
    await setTextarea(
      composer().querySelector("textarea")!,
      "Giới hạn rõ nhóm đối tượng và thời gian khảo sát ở Mục 1.2.",
    );
    const saveEditBtn = [...composer().querySelectorAll("button")].find(b =>
      b.textContent?.includes("reviewWorkspace.revisionSaveChanges"),
    )!;
    await act(async () => saveEditBtn.click());
    expect(detail().textContent).toContain("Giới hạn rõ nhóm đối tượng và thời gian khảo sát ở Mục 1.2.");

    // Switch to Summary -> revision appears with jump-back button to criterion
    const summaryTab = [...host.querySelectorAll<HTMLButtonElement>(".rw-subnav [role='tab']")].find(b =>
      b.textContent?.includes("reviewWorkspace.subTab.summary"),
    )!;
    await act(async () => summaryTab.click());
    expect(host.textContent).toContain("Giới hạn rõ nhóm đối tượng và thời gian khảo sát ở Mục 1.2.");
    const jumpBtn = [...host.querySelectorAll("button")].find(b =>
      b.textContent?.includes("reviewWorkspace.summary.jumpToCriterion"),
    )!;
    await act(async () => jumpBtn.click());
    expect(host.querySelector("#rw-criterion-detail-research_problem")).not.toBeNull();

    // Delete inline item -> updates counter to 0
    const deleteBtn = detail().querySelector<HTMLButtonElement>('button[aria-label="reviewWorkspace.revisionDelete"]')!;
    await act(async () => deleteBtn.click());
    expect(detail().querySelector(".rw-criterion-rev-item")).toBeNull();
    const revisionsTab = [...host.querySelectorAll<HTMLButtonElement>(".rw-subnav [role='tab']")].find(b =>
      b.textContent?.includes("reviewWorkspace.subTab.revisions"),
    )!;
    expect(revisionsTab.textContent).toContain("0");
  });

  it("treats SUGGESTION as optional (does not block STRONG approval) while keeping MAJOR/MINOR mandatory (REV-11..REV-14)", () => {
    const criteria = [
      {
        key: "m",
        title: "Methods",
        required: true,
        allowNotApplicable: false,
        levels: [
          { id: "m4", score: 4 },
          { id: "m5", score: 5 },
        ],
      },
    ];
    const responses = {
      m: { comment: "Strong methodology", evidence: "", performanceLevelId: "m5", notApplicable: false },
    };

    // STRONG + optional SUGGESTION only -> READY TO SUBMIT (does NOT block approval!)
    const strongWithSuggestion = computeRubricReadiness({
      criteria,
      responses,
      reviewMode: "RUBRIC_ASSESSMENT",
      commentOnly: false,
      overallAssessment: "STRONG",
      overallComment: "Ready internally with one optional phrasing tip.",
      requiredRevisions: [{ priority: "SUGGESTION", description: "Consider adding a summary table." }],
      integrityChecks: {},
      guidelines: [],
      origin: "PEER_REVIEW",
      previousRevisionItems: [{ status: "OPEN", priority: "SUGGESTION" }],
    });
    expect(strongWithSuggestion.isReadyToSubmit).toBe(true);
    expect(strongWithSuggestion.mandatoryRevisionCount).toBe(0);
    expect(strongWithSuggestion.suggestionCount).toBe(1);
    expect(strongWithSuggestion.unresolvedPreviousCount).toBe(0);

    // MINOR_REVISION + SUGGESTION only -> STILL requires at least 1 mandatory revision (MAJOR or MINOR)
    const minorWithOnlySuggestion = computeRubricReadiness({
      criteria,
      responses,
      reviewMode: "RUBRIC_ASSESSMENT",
      commentOnly: false,
      overallAssessment: "MINOR_REVISION",
      overallComment: "Needs minor fixes.",
      requiredRevisions: [{ priority: "SUGGESTION", description: "Optional formatting polish." }],
      integrityChecks: {},
      guidelines: [],
      origin: "PEER_REVIEW",
      previousRevisionItems: [],
    });
    expect(minorWithOnlySuggestion.isReadyToSubmit).toBe(false);
    expect(minorWithOnlySuggestion.issues.some(i => i.id === "revision-item-required")).toBe(true);

    // STRONG + MINOR revision -> STILL blocked (preserves mandatory revision gate)
    const strongWithMinor = computeRubricReadiness({
      criteria,
      responses,
      reviewMode: "RUBRIC_ASSESSMENT",
      commentOnly: false,
      overallAssessment: "STRONG",
      overallComment: "Looks ready.",
      requiredRevisions: [{ priority: "MINOR", description: "Fix equation numbering." }],
      integrityChecks: {},
      guidelines: [],
      origin: "PEER_REVIEW",
      previousRevisionItems: [],
    });
    expect(strongWithMinor.isReadyToSubmit).toBe(false);
    expect(strongWithMinor.issues.some(i => i.id === "approval-has-revisions")).toBe(true);
  });
});
