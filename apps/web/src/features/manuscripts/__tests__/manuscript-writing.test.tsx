// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManuscriptContributionsSummary, ManuscriptWritingReport } from "@trend/shared-types";
import { WritingReportResult, ManuscriptWriting } from "../manuscript-writing";
import { WritingParticipationSuggestions } from "@/features/projects/components/contribution-evaluation";

const api = vi.hoisted(() => ({
  contributions: vi.fn(),
  writingReports: vi.fn(),
  requestWritingReport: vi.fn(),
  writingReport: vi.fn(),
  writingContribution: vi.fn(),
}));
const contribApi = vi.hoisted(() => ({
  review: vi.fn(),
  submit: vi.fn(),
  save: vi.fn(),
  people: vi.fn(),
  research: vi.fn(),
}));
const evaluations = vi.hoisted(() => ({ writingSuggestions: vi.fn() }));
vi.mock("../manuscripts.api", () => ({ manuscriptsApi: api }));
vi.mock("@/features/projects/api/contributions.api", () => ({ contributionsApi: contribApi }));
vi.mock("@/features/projects/api/contribution-evaluation.api", () => ({ contributionEvaluationApi: evaluations }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: "writer" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));

let host: HTMLDivElement, root: ReturnType<typeof createRoot>, client: QueryClient;

const report = (): ManuscriptWritingReport => ({
  id: "report",
  manuscriptId: "manuscript",
  snapshotId: "snapshot",
  snapshotLabel: "Writing v1",
  title: "Research paper",
  sourceVersion: 2,
  status: "COMPLETED",
  createdAt: "2026-10-28T00:00:00Z",
  calculatedAt: "2026-10-28T00:01:00Z",
  inputHash: "a".repeat(64),
  isStale: true,
  result: {
    algorithmVersion: "RETAINED_WRITING_V1",
    totalWords: 10,
    attributedWordUnits: 6000,
    unknownWordUnits: 4000,
    coverageBasisPoints: 6000,
    members: [
      { userId: "a", name: "Alice", retainedWordUnits: 4000, overallBasisPoints: 4000, suggestedBasisPoints: 6667 },
      { userId: "b", name: "Bob", retainedWordUnits: 2000, overallBasisPoints: 2000, suggestedBasisPoints: 3333 },
    ],
    files: [],
  },
});

const summaryFixture = (): ManuscriptContributionsSummary => ({
  projectId: "project",
  manuscriptId: "manuscript",
  manuscriptTitle: "Research paper",
  currentVersion: 4,
  viewerId: "writer",
  canWrite: true,
  latestSnapshot: {
    id: "snapshot",
    label: "Writing v1",
    sourceVersion: 2,
    createdAt: "2026-10-28T00:00:00Z",
    isStale: true,
  },
  latestWritingReport: report(),
  existingWritingDraftId: null,
  attributionCheck: {
    snapshotId: "snapshot",
    checkId: "check-1",
    status: "PENDING_CONFIRMATION",
    readyForInternalSubmission: false,
    viewerCanDecide: true,
    pendingDecisionsCount: 1,
    disputedCount: 0,
  },
  statement: {
    scopeKey: "DRAFT:manuscript",
    ready: false,
    pendingCount: 1,
    contributorCount: 1,
    statement: null,
  },
  contributors: [
    {
      userId: "a",
      name: "Alice",
      participantKind: "MEMBER",
      membershipStatus: "ACTIVE",
      declaredRoles: ["METHODOLOGY", "WRITING_ORIGINAL_DRAFT"],
      acknowledgedRoles: ["METHODOLOGY"],
      declarationCount: 1,
      pendingAcknowledgementCount: 1,
      disputedCount: 0,
      acknowledgementState: "PENDING",
      activity: {
        fileEditsCount: 4,
        editedFilePaths: ["main.tex"],
        suggestionsProposed: 1,
        suggestionsAcceptedAsAuthor: 1,
        suggestionsResolvedAsReviewer: 0,
        commentsCount: 2,
        snapshotsCreated: 1,
        formalReviewsCount: 0,
        mentorFeedbackCount: 0,
        lastActivityAt: "2026-10-28T00:00:00Z",
      },
      retainedWriting: null,
    },
    {
      userId: "writer",
      name: "Writer User",
      participantKind: "MEMBER",
      membershipStatus: "ACTIVE",
      declaredRoles: ["FORMAL_ANALYSIS"],
      acknowledgedRoles: [],
      declarationCount: 1,
      pendingAcknowledgementCount: 0,
      disputedCount: 0,
      acknowledgementState: "DRAFT_ONLY",
      activity: {
        fileEditsCount: 0,
        editedFilePaths: [],
        suggestionsProposed: 0,
        suggestionsAcceptedAsAuthor: 0,
        suggestionsResolvedAsReviewer: 1,
        commentsCount: 0,
        snapshotsCreated: 0,
        formalReviewsCount: 0,
        mentorFeedbackCount: 0,
        lastActivityAt: "2026-10-28T00:00:00Z",
      },
      retainedWriting: null,
    },
  ],
  declarations: [
    {
      id: "decl-1",
      projectId: "project",
      title: "Experimental protocol design",
      description: "Designed controlled benchmarks and validation scripts.",
      category: "CONCEPTUALIZATION_METHODOLOGY",
      source: "MANUAL",
      workDate: "2026-10-27T00:00:00Z",
      version: 1,
      status: "SUBMITTED",
      createdBy: { id: "a", name: "Alice" },
      participants: [
        { userId: "a", name: "Alice", roles: ["METHODOLOGY"] },
        { userId: "writer", name: "Writer User", roles: ["FORMAL_ANALYSIS"] },
      ],
      evidence: "Benchmark notebook",
      evidenceRefs: [{ kind: "MANUSCRIPT", id: "manuscript" }],
      reviews: [],
      history: [],
      viewerId: "writer",
      reviewActions: ["ACKNOWLEDGE", "NEEDS_CHANGES", "DISPUTE", "INSUFFICIENT_INFORMATION"],
      canManage: false,
      readOnly: false,
      createdAt: "2026-10-27T00:00:00Z",
      updatedAt: "2026-10-27T00:00:00Z",
    },
  ],
  viewerActionableDeclarations: [
    {
      id: "decl-1",
      projectId: "project",
      title: "Experimental protocol design",
      description: "Designed controlled benchmarks and validation scripts.",
      category: "CONCEPTUALIZATION_METHODOLOGY",
      source: "MANUAL",
      workDate: "2026-10-27T00:00:00Z",
      version: 1,
      status: "SUBMITTED",
      createdBy: { id: "a", name: "Alice" },
      participants: [
        { userId: "a", name: "Alice", roles: ["METHODOLOGY"] },
        { userId: "writer", name: "Writer User", roles: ["FORMAL_ANALYSIS"] },
      ],
      evidence: "Benchmark notebook",
      evidenceRefs: [{ kind: "MANUSCRIPT", id: "manuscript" }],
      reviews: [],
      history: [],
      viewerId: "writer",
      reviewActions: ["ACKNOWLEDGE", "NEEDS_CHANGES", "DISPUTE", "INSUFFICIENT_INFORMATION"],
      canManage: false,
      readOnly: false,
      createdAt: "2026-10-27T00:00:00Z",
      updatedAt: "2026-10-27T00:00:00Z",
    },
  ],
  viewerOwnDeclarations: [
    {
      id: "decl-draft",
      projectId: "project",
      title: "Statistical error analysis",
      description: "Computed confidence intervals for all tables.",
      category: "EXECUTION_VALIDATION",
      source: "WORKSPACE",
      workDate: "2026-10-28T00:00:00Z",
      version: 1,
      status: "DRAFT",
      createdBy: { id: "writer", name: "Writer User" },
      participants: [{ userId: "writer", name: "Writer User", roles: ["FORMAL_ANALYSIS"] }],
      evidence: "",
      evidenceRefs: [{ kind: "MANUSCRIPT", id: "manuscript" }],
      reviews: [],
      history: [],
      viewerId: "writer",
      reviewActions: [],
      canManage: true,
      readOnly: false,
      createdAt: "2026-10-28T00:00:00Z",
      updatedAt: "2026-10-28T00:00:00Z",
    },
  ],
  disputedOrClarificationDeclarations: [],
  files: [
    {
      fileId: "file-main",
      path: "main.tex",
      kind: "TEXT",
      isMain: true,
      totalWords: 10,
      unknownWordUnits: 4000,
      editors: [{ userId: "a", name: "Alice", updateCount: 4, lastEditedAt: "2026-10-28T00:00:00Z" }],
      suggestions: {
        total: 1,
        pending: 0,
        accepted: 1,
        rejected: 0,
        proposers: [{ id: "a", name: "Alice" }],
        resolvers: [{ id: "writer", name: "Writer User" }],
      },
      comments: { total: 2, open: 1, resolved: 1, authors: [{ id: "a", name: "Alice" }] },
      aiAcceptedEdits: 1,
      granularity: "FILE_LEVEL",
    },
  ],
  aiReceipts: {
    totalRuns: 3,
    acceptedEditsCount: 1,
    acceptedByFiles: [{ fileId: "file-main", path: "main.tex", count: 1 }],
    externalDeclarationsCount: 0,
    notice: "AI assistance receipts record tool generation and accepted insertions separately from human contributors. AI is never a contributor or author; human authors remain responsible for all manuscript content.",
  },
  granularityNotice: "Recorded editing, suggestion, comment, and retained-writing evidence is tracked at the manuscript or file level. Section-level attribution is not fabricated when underlying records are file- or manuscript-scoped.",
});

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  api.contributions.mockResolvedValue(summaryFixture());
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

async function render(node: ReactNode) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
  });
}

async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(b => b.textContent?.trim() === label);
  expect(button, `Expected button "${label}"`).toBeTruthy();
  await act(async () => button!.click());
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
  });
}

describe("writing evidence and manuscript contributions panel", () => {
  it("shows all-prose shares separately from unknown coverage and explains stale versions", async () => {
    await render(<WritingReportResult report={report()} />);
    expect(host.textContent).toContain("40.00% of all prose");
    expect(host.textContent).toContain("Unattributed words: 4");
    expect(host.textContent).toContain("60.00% with recorded attribution");
    expect(host.textContent).toContain("This report still describes the saved version");
    expect(host.textContent).toContain("pasted or AI text may be included");
  });

  it("does not manufacture shares when all writing is unknown", async () => {
    const data = report();
    data.result = { ...data.result!, attributedWordUnits: 0, coverageBasisPoints: 0, unknownWordUnits: 10000, members: [] };
    await render(<WritingReportResult report={data} />);
    expect(host.textContent).toContain("No attributable writing yet");
    expect(host.querySelector(".writing-contributor-list")).toBeNull();
  });

  it("does not mutate participation until the user explicitly applies the suggestion", async () => {
    evaluations.writingSuggestions.mockResolvedValue([report()]);
    const use = vi.fn();
    await render(<WritingParticipationSuggestions projectId="project" sourceIds={["source"]} participants={["a", "b"]} onUse={use} onRemove={vi.fn()} />);
    expect(use).not.toHaveBeenCalled();
    expect(host.textContent).toContain("66.67%");
    expect(host.textContent).toContain("Unattributed words: 4");
    await click("Replace participation inputs with this writing suggestion");
    expect(use).toHaveBeenCalledWith(expect.objectContaining({ id: "report" }));
  });

  it("blocks applying a suggestion if a measured writer is missing from the work record", async () => {
    evaluations.writingSuggestions.mockResolvedValue([report()]);
    const use = vi.fn();
    await render(<WritingParticipationSuggestions projectId="project" sourceIds={["source"]} participants={["a"]} onUse={use} onRemove={vi.fn()} />);
    const button = [...host.querySelectorAll("button")].find(b => b.textContent === "Replace participation inputs with this writing suggestion");
    expect(button?.disabled).toBe(true);
    expect(use).not.toHaveBeenCalled();
  });

  it("renders 3 tabs with technical evidence collapsed by default, separates AI receipts, and reviews roles before creating draft", async () => {
    api.writingReports.mockResolvedValue({ items: [], page: 1, total: 0, hasNext: false });
    api.requestWritingReport.mockResolvedValue(report());
    api.writingReport.mockResolvedValue(report());
    api.writingContribution.mockResolvedValue({ id: "contribution" });
    const prepare = vi.fn().mockResolvedValue("snapshot");

    await render(<ManuscriptWriting projectId="project" manuscriptId="manuscript" canWrite prepare={prepare} />);

    // Overview shows contributors, CRediT roles, AI receipt separated, and technical evidence collapsed by default
    expect(host.textContent).toContain("Manuscript contributions");
    expect(host.textContent).toContain("Alice");
    expect(host.textContent).toContain("AI assistance receipts");
    expect(host.textContent).toContain("Not a contributor");
    expect(host.querySelector("#mc-technical-evidence")).toBeNull();
    expect(api.requestWritingReport).not.toHaveBeenCalled();

    // Expand technical evidence
    await click("View technical evidence");
    expect(host.querySelector("#mc-technical-evidence")).not.toBeNull();
    expect(host.textContent).toContain("Technical evidence — Text provenance");

    await click("Save version and calculate writing");
    expect(prepare).toHaveBeenCalledOnce();
    expect(api.requestWritingReport).toHaveBeenCalledWith("project", "manuscript", "snapshot");
    expect(api.writingContribution).not.toHaveBeenCalled();

    // Role review step opens first — no auto WRITING_ORIGINAL_DRAFT
    await click("Create contribution draft from this report");
    expect(host.textContent).toContain("Review CRediT roles before creating draft");
    expect(api.writingContribution).not.toHaveBeenCalled();

    await click("Confirm and save draft");
    expect(api.writingContribution).toHaveBeenCalledWith(
      "project",
      "manuscript",
      "report",
      expect.objectContaining({
        participants: expect.arrayContaining([
          { userId: "a", roles: [] },
          { userId: "b", roles: [] },
        ]),
      }),
    );
    expect(host.textContent).toContain("Open contributions to review and submit");
  });

  it("offers read-only inspection without write actions when canWrite is false", async () => {
    api.writingReports.mockResolvedValue({ items: [report()], page: 1, total: 1, hasNext: false });
    api.writingReport.mockResolvedValue(report());
    await render(<ManuscriptWriting projectId="project" manuscriptId="manuscript" canWrite={false} prepare={vi.fn()} />);

    expect(host.textContent).toContain("Manuscript contributions");
    expect(host.textContent).toContain("Read-only view");
    expect(host.textContent).not.toContain("Declare contribution");

    await click("View technical evidence");
    expect(host.textContent).not.toContain("Save version and calculate writing");
    expect(host.textContent).not.toContain("Create contribution draft from this report");
  });

  it("navigates By Content files and outline honestly without fabricating section attribution", async () => {
    const onNavigateSource = vi.fn();
    await render(
      <ManuscriptWriting
        projectId="project"
        manuscriptId="manuscript"
        canWrite
        prepare={vi.fn()}
        selectedFileId="file-main"
        selectedFilePath="main.tex"
        activeOutline={[{ line: 12, depth: 1, title: "Introduction" }]}
        onNavigateSource={onNavigateSource}
      />,
    );

    await click("By Content");
    expect(host.textContent).toContain("Section-level attribution is not fabricated");

    const fileOption = [...host.querySelectorAll<HTMLButtonElement>("button[role='option']")].find(b => b.textContent?.includes("main.tex"));
    expect(fileOption).toBeTruthy();
    await act(async () => fileOption!.click());

    expect(host.textContent).toContain("File-level");
    expect(host.textContent).toContain("Proposed by");
    expect(host.textContent).toContain("Reviewed by");
    expect(host.textContent).toContain("Navigation only");

    const jumpBtn = [...host.querySelectorAll("button")].find(b => b.textContent?.includes("Introduction"));
    expect(jumpBtn).toBeTruthy();
    await act(async () => jumpBtn!.click());
    expect(onNavigateSource).toHaveBeenCalledWith("file-main", 12);
  });

  it("prioritizes viewer-actionable acknowledgements and submits review/draft actions in Acknowledgement tab", async () => {
    contribApi.review.mockResolvedValue({ id: "decl-1" });
    contribApi.submit.mockResolvedValue({ id: "decl-draft" });

    await render(<ManuscriptWriting projectId="project" manuscriptId="manuscript" canWrite prepare={vi.fn()} />);

    const ackTab = host.querySelector<HTMLButtonElement>("#mc-tab-ack");
    expect(ackTab).toBeTruthy();
    await act(async () => ackTab!.click());

    expect(host.textContent).toContain("Needs my review");
    expect(host.textContent).toContain("Experimental protocol design");
    expect(host.textContent).toContain("Project Contributions");
    expect(host.textContent).toContain("Research Integrity Center");

    await click("Acknowledge my roles");
    expect(contribApi.review).toHaveBeenCalledWith("project", "decl-1", {
      expectedVersion: 1,
      decision: "ACKNOWLEDGE",
      note: "",
    });

    await click("Submit for acknowledgement");
    expect(contribApi.submit).toHaveBeenCalledWith("project", "decl-draft", 1);
  });

  it("shows recoverable error state when summary loading fails", async () => {
    api.contributions.mockRejectedValueOnce(new Error("Network error"));
    await render(<ManuscriptWriting projectId="project" manuscriptId="manuscript" canWrite prepare={vi.fn()} />);
    expect(host.textContent).toContain("Could not load manuscript contributions");
    expect(host.textContent).toContain("Try again");
  });
});
