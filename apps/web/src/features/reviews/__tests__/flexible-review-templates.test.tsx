// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewTemplatesPage } from "@/pages/reviews/review-templates";
import { ReviewTemplateSelectorDialog } from "../components/review-template-selector-dialog";
import { computeRubricReadiness, isCriterionAssessed, isLowRubricRating } from "../review-readiness";
import { mentorWorkspaceEn } from "@/i18n/locales/mentor-workspace";
import type { EligibleReviewTemplatesPayload, ReviewTemplateSummary } from "@trend/shared-types";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "en",
    t: (key: string, values: Record<string, string | number> = {}) => {
      let result = mentorWorkspaceEn[key as keyof typeof mentorWorkspaceEn] ?? key;
      for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{{${name}}}`, String(value));
      return result;
    },
  }),
}));

const mocks = vi.hoisted(() => ({
  templates: [] as ReviewTemplateSummary[],
  eligible: null as EligibleReviewTemplatesPayload | null,
  changeTemplate: vi.fn(),
  duplicate: vi.fn(),
  publish: vi.fn(),
  archive: vi.fn(),
}));

vi.mock("@/features/reviews", () => ({
  useReviewTemplates: () => ({ data: mocks.templates, isLoading: false, error: null }),
  useReviewTemplate: () => ({ data: undefined, isLoading: false }),
  useDuplicateReviewTemplate: () => ({ mutateAsync: mocks.duplicate, isPending: false }),
  usePublishReviewTemplate: () => ({ mutateAsync: mocks.publish, isPending: false }),
  useArchiveReviewTemplate: () => ({ mutateAsync: mocks.archive, isPending: false }),
}));

vi.mock("../hooks/use-reviews", () => ({
  useEligibleReviewTemplates: () => ({ data: mocks.eligible, isLoading: false, isError: false }),
  useChangeReviewTemplate: () => ({ mutateAsync: mocks.changeTemplate, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("Flexible Academic Review Template System (Frontend)", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("enforces scope tabs and permission-gated actions in the Template Library", async () => {
    mocks.templates = [
      {
        id: "sys-1",
        name: "LumiGap Scientific Manuscript Review Rubric v2.0 · RESEARCH_PAPER",
        source: "SYSTEM",
        artifactType: "RESEARCH_PAPER",
        status: "PUBLISHED",
        canManage: false,
        updatedAt: "2026-11-20T00:00:00Z",
        activeVersion: {
          id: "sys-v2",
          versionNumber: 2,
          reviewMode: "RUBRIC_ASSESSMENT",
          guidelines: [],
          status: "PUBLISHED",
          criteria: [{ id: "c1", key: "problem", title: "Problem", required: true, allowNotApplicable: false, order: 0, weight: 20, levels: [] }],
        },
      },
      {
        id: "proj-1",
        name: "Private Project Template",
        source: "PROJECT",
        artifactType: "RESEARCH_PAPER",
        status: "PUBLISHED",
        canManage: false, // mentor viewing project template cannot edit/archive
        updatedAt: "2026-11-20T00:00:00Z",
        activeVersion: {
          id: "proj-v1",
          versionNumber: 1,
          reviewMode: "STRUCTURED_REVIEW",
          guidelines: [],
          status: "PUBLISHED",
          criteria: [{ id: "c2", key: "arch", title: "Architecture", required: true, allowNotApplicable: false, order: 0, levels: [] }],
        },
      },
      {
        id: "my-1",
        name: "My SE Qualitative Form",
        source: "PERSONAL",
        artifactType: "SOFTWARE_RESEARCH_PROJECT",
        status: "DRAFT",
        canManage: true,
        hasDraftVersion: true,
        updatedAt: "2026-11-20T00:00:00Z",
        activeVersion: {
          id: "my-v1",
          versionNumber: 1,
          reviewMode: "STRUCTURED_REVIEW",
          guidelines: [],
          status: "DRAFT",
          criteria: [{ id: "c3", key: "bench", title: "Benchmarks", required: true, allowNotApplicable: true, order: 0, levels: [] }],
        },
      },
    ];

    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/mentor-workspace?view=templates"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ReviewTemplatesPage />
        </MemoryRouter>,
      ),
    );

    // Filter to Project Templates: unauthorized mentor sees Duplicate & Preview, NOT Edit/Archive
    const projectTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(el =>
      el.textContent?.includes("Project Templates"),
    )!;
    await act(async () => projectTab.click());
    expect(host.textContent).toContain("Private Project Template");
    expect(host.textContent).not.toContain("My SE Qualitative Form");
    expect([...host.querySelectorAll("a, button")].some(el => el.textContent === "Edit")).toBe(false);
    expect([...host.querySelectorAll("a, button")].some(el => el.textContent === "Archive")).toBe(false);

    // Filter to My Templates: owner sees Edit, Publish, Duplicate, Archive
    const myTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(el =>
      el.textContent?.includes("My Templates"),
    )!;
    await act(async () => myTab.click());
    expect(host.textContent).toContain("My SE Qualitative Form");
    expect([...host.querySelectorAll("a, button")].some(el => el.textContent === "Edit")).toBe(true);
    expect([...host.querySelectorAll("a, button")].some(el => el.textContent === "Publish")).toBe(true);
  });

  it("protects saved draft evaluations with explicit confirmation and requires a reason on Round 2+", async () => {
    mocks.changeTemplate.mockResolvedValue({});
    mocks.eligible = {
      requestId: "req-1",
      currentTemplateVersionId: "sys-v2",
      suggestedTemplateVersionId: "sys-v2",
      artifactType: "RESEARCH_PAPER",
      canChangeTemplate: true,
      mandatoryProjectTemplate: false,
      hasDraftResponses: true,
      draftResponseCount: 3,
      submittedRoundCount: 1,
      templates: [
        {
          id: "sys-1",
          name: "LumiGap Scientific Manuscript Review Rubric v2.0 · RESEARCH_PAPER",
          source: "SYSTEM",
          artifactType: "RESEARCH_PAPER",
          status: "PUBLISHED",
          updatedAt: "2026-11-20T00:00:00Z",
          activeVersion: {
            id: "sys-v2",
            versionNumber: 2,
            reviewMode: "RUBRIC_ASSESSMENT",
            guidelines: [],
            status: "PUBLISHED",
            criteria: [],
          },
        },
        {
          id: "my-2",
          name: "AI Experimental Qualitative Form",
          source: "PERSONAL",
          artifactType: "RESEARCH_PAPER",
          status: "PUBLISHED",
          updatedAt: "2026-11-21T00:00:00Z",
          activeVersion: {
            id: "my-v2",
            versionNumber: 1,
            reviewMode: "STRUCTURED_REVIEW",
            guidelines: [],
            status: "PUBLISHED",
            criteria: [{ id: "c1", key: "baselines", title: "Baseline comparisons", required: true, allowNotApplicable: false, order: 0, levels: [] }],
          },
        },
      ],
    };

    await act(async () =>
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ReviewTemplateSelectorDialog open onOpenChange={() => {}} requestId="req-1" artifactType="RESEARCH_PAPER" />
        </MemoryRouter>,
      ),
    );

    const radios = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios).toHaveLength(2);
    await act(async () => {
      radios[1]!.click();
    });

    // Draft warning and Round 2 reason appear; Apply stays disabled until both are provided
    expect(document.body.textContent).toContain("Saved draft evaluations will be affected");
    const applyBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Use Selected Template")!;
    expect(applyBtn.disabled).toBe(true);

    const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => {
      checkbox.click();
    });
    expect(applyBtn.disabled).toBe(true); // still needs reason for Round 2!

    const reasonInput = document.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        reasonInput,
        "Switching to qualitative evaluation for methodology focus.",
      );
      reasonInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(applyBtn.disabled).toBe(false);

    await act(async () => {
      applyBtn.click();
    });
    expect(mocks.changeTemplate).toHaveBeenCalledWith({
      requestId: "req-1",
      input: {
        templateVersionId: "my-v2",
        confirmDraftReset: true,
        reason: "Switching to qualitative evaluation for methodology focus.",
      },
    });
  });

  it("supports qualitative review without forcing comments on STRONG/ADEQUATE while preserving integrity checks", () => {
    const criterion = { key: "feasibility", title: "Feasibility", required: true, allowNotApplicable: false, levels: [] };
    expect(
      isCriterionAssessed(
        criterion,
        { comment: "", evidence: "", assessment: "ADEQUATE", notApplicable: false },
        "STRUCTURED_REVIEW",
      ),
    ).toBe(true);

    const readiness = computeRubricReadiness({
      criteria: [criterion],
      responses: { feasibility: { comment: "", evidence: "", assessment: "STRONG", notApplicable: false } },
      reviewMode: "STRUCTURED_REVIEW",
      commentOnly: false,
      overallAssessment: "MINOR_REVISION",
      overallComment: "Good research plan with one minor clarification needed.",
      requiredRevisions: [{ priority: "MINOR", description: "Clarify timeline milestone 2." }],
      integrityChecks: {},
      guidelines: [], // Personal template has no system guidelines
      origin: "MENTOR_GUIDANCE", // Integrity MUST still be enforced!
      previousRevisionItems: [],
    });

    expect(readiness.missingRequiredCriteria).toHaveLength(0);
    expect(readiness.integrityRequired).toBe(true);
    expect(readiness.isReadyToSubmit).toBe(false);
    expect(readiness.issues.some(i => i.category === "integrity")).toBe(true);

    // Generalized low-score detection across custom scales
    expect(isLowRubricRating(2, [1, 2, 3, 4])).toBe(true);
    expect(isLowRubricRating(3, [1, 2, 3, 4])).toBe(false);
    expect(isLowRubricRating(1, [1, 2])).toBe(true);
    expect(isLowRubricRating(2, [1, 2])).toBe(false);
  });
});
