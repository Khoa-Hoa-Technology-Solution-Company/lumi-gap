// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManuscriptReference, ScreeningBoard } from "@trend/shared-types";
import {
  ManuscriptCitationPicker,
  detectBibliographySetup,
  extractCitedKeysFromTex,
  extractKeysFromBib,
} from "../manuscript-citation-picker";
import { CollaborativeLibrary } from "@/features/projects/components/collaborative-library";
import { EvidenceEditor } from "@/features/projects/components/research-evidence-detail";

const screeningMocks = vi.hoisted(() => ({
  board: vi.fn(),
  assess: vi.fn(),
  createSet: vi.fn(),
  sets: vi.fn(),
  rounds: vi.fn(),
  detail: vi.fn(),
}));
const researchMocks = vi.hoisted(() => ({
  evidenceWorkspace: vi.fn(),
  matrixCriteria: vi.fn(),
  suggestions: vi.fn(),
  paperAnalysis: vi.fn(),
  createEvidence: vi.fn(),
  editEvidence: vi.fn(),
}));

vi.mock("@/features/projects/api/screening.api", () => ({ screeningApi: screeningMocks }));
vi.mock("@/features/projects/api/project-research.api", () => ({ researchApi: researchMocks }));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "user-1" } }),
}));
vi.mock("@/services/confirmation", () => ({ confirmUnsavedChanges: vi.fn().mockResolvedValue(true) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "vi" }) }));

describe("Research Paper Workflow — Selected Papers, Evidence Extraction & LaTeX Citations", () => {
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;

  async function settle() {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
    });
  }

  async function render(node: ReactNode, initialEntry = "/projects/p1?tab=papers&view=library") {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            {node}
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await settle();
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
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

  it("detects BibTeX, natbib, biblatex, and manual bibliography setups without modifying user preamble", () => {
    const bibtexSetup = detectBibliographySetup(["\\documentclass{article}\n\\bibliographystyle{plain}\n\\bibliography{references}"], ["references.bib"]);
    expect(bibtexSetup.mode).toBe("bibtex");
    expect(bibtexSetup.supportedCommands).toEqual(["\\cite"]);
    expect(bibtexSetup.warning).toBeNull();

    const natbibSetup = detectBibliographySetup(["\\usepackage[numbers]{natbib}\n\\bibliography{references}"], ["references.bib"]);
    expect(natbibSetup.mode).toBe("natbib");
    expect(natbibSetup.supportedCommands).toEqual(["\\cite", "\\citep", "\\citet"]);

    const biblatexSetup = detectBibliographySetup(["\\usepackage[backend=biber]{biblatex}\n\\addbibresource{references.bib}\n\\printbibliography"], ["references.bib"]);
    expect(biblatexSetup.mode).toBe("biblatex");
    expect(biblatexSetup.supportedCommands).toEqual(["\\cite", "\\autocite", "\\parencite", "\\textcite"]);

    const manualSetup = detectBibliographySetup(["\\begin{thebibliography}{9}\n\\bibitem{k1} Ref\n\\end{thebibliography}"], []);
    expect(manualSetup.mode).toBe("manual");
    expect(manualSetup.warning).toContain("thebibliography");
  });

  it("extracts cited keys from LaTeX commands and defined keys from BibTeX accurately", () => {
    const cited = extractCitedKeysFromTex([
      "See \\cite{vaswani2017attention, devlin2019bert} and \\parencite[p.~4]{brown2020gpt3}.",
      "Also \\citet*{smith2024rag}.",
    ]);
    expect([...cited]).toEqual(["vaswani2017attention", "devlin2019bert", "brown2020gpt3", "smith2024rag"]);

    const bib = extractKeysFromBib("@article{vaswani2017attention,\n title={Attention}\n}\n@inproceedings{devlin2019bert,\n title={BERT}\n}");
    expect([...bib]).toEqual(["vaswani2017attention", "devlin2019bert"]);
  });

  it("renders Selected Papers filters, Evidence Progress badges, Manuscript Citation counts, and context-aware actions", async () => {
    const settings = {
      reviewMode: "INDEPENDENT" as const,
      blindReview: true,
      resolutionPolicy: "CONSENSUS" as const,
      requiredReviewers: 2,
      version: 1,
      consensusPolicy: "UNANIMOUS" as const,
      aiAssisted: false,
      inclusionCriteria: [],
      exclusionCriteria: [],
      researchQuestions: [],
    };
    const board: ScreeningBoard = {
      settings,
      canManage: true,
      progress: { total: 3, reviewed: 2, finalized: 2, legacy: 0 },
      librarySummary: { selected: 2, attention: 1, discussion: 0, excluded: 0 },
      filters: { proposers: [], reviewers: [] },
      people: [],
      myProgress: { assigned: 0, completed: 0, pending: 0, overdue: 0 },
      page: 1,
      pageSize: 12,
      total: 3,
      hasNext: false,
      items: [
        {
          paperId: "p-unextracted",
          title: "Selected Study Awaiting Extraction",
          abstractText: "Study abstract A",
          doi: "10.1000/study-a",
          publicationYear: 2025,
          journalName: "Nature Machine Intelligence",
          authors: ["Alice Nguyen", "Bao Tran"],
          proposer: { id: "u1", name: "Alice" },
          proposedAt: "2026-11-01T00:00:00Z",
          proposalReason: "Core baseline",
          updatedAt: "2026-11-01T00:00:00Z",
          canEditProposal: false,
          legacyStatus: "INCLUDED",
          legacyProvenance: false,
          fullTextAvailable: true,
          paperLink: "https://example.org/study-a.pdf",
          round: {
            id: "r1",
            paperId: "p-unextracted",
            number: 1,
            phase: "FULL_TEXT",
            version: 1,
            status: "INCLUDED",
            active: true,
            settings,
            unblindedAt: "2026-11-01T00:00:00Z",
            independenceCompromised: false,
            assignments: [],
            reviews: [],
            myReview: null,
            myAssignmentId: null,
            hiddenReviews: false,
            completed: 2,
            assigned: 2,
            extractionReady: true,
            finalizer: { id: "u1", name: "Alice" },
            canFinalize: false,
            finalDecision: { id: "fd1", version: 1, decision: "INCLUDED", source: "CONSENSUS", reason: "Agreed", resolverId: null, createdAt: "2026-11-01T00:00:00Z" },
            canReview: false,
            canManage: true,
            aiVisible: false,
          },
          evidenceSummary: { status: "NOT_STARTED", extractionCount: 0, verifiedCount: 0, eligible: true },
          manuscriptCitationCount: 2,
          citedInManuscripts: [
            { id: "m1", title: "Main Paper", citationKey: "alice2025_p1" },
            { id: "m2", title: "Review Draft", citationKey: "alice2025_p1" },
          ],
        },
        {
          paperId: "p-completed",
          title: "Selected Study With Verified Evidence",
          abstractText: "Study abstract B",
          doi: "10.1000/study-b",
          publicationYear: 2024,
          journalName: "IEEE TPAMI",
          authors: ["Minh Le"],
          proposer: { id: "u1", name: "Alice" },
          proposedAt: "2026-11-01T00:00:00Z",
          proposalReason: "Benchmark comparison",
          updatedAt: "2026-11-01T00:00:00Z",
          canEditProposal: false,
          legacyStatus: "INCLUDED",
          legacyProvenance: false,
          round: null,
          evidenceSummary: { status: "COMPLETED", extractionCount: 2, verifiedCount: 2, eligible: true },
          manuscriptCitationCount: 0,
          citedInManuscripts: [],
        },
      ],
    };
    screeningMocks.board.mockResolvedValue(board);

    function LocationProbe() {
      const location = useLocation();
      return <output data-testid="loc">{location.search}</output>;
    }

    await render(
      <>
        <CollaborativeLibrary projectId="p1" readOnly={false} />
        <LocationProbe />
      </>,
    );

    // Filter pills follow terminology: Tất cả, Đã chọn, Chưa quyết định, Đã loại, Cần thống nhất
    const pillTexts = [...container.querySelectorAll(".library-pill")].map(el => el.textContent);
    expect(pillTexts.some(t => t?.includes("Đã chọn"))).toBe(true);
    expect(pillTexts.some(t => t?.includes("Chưa quyết định"))).toBe(true);
    expect(pillTexts.some(t => t?.includes("Đã loại"))).toBe(true);
    expect(pillTexts.some(t => t?.includes("Cần thống nhất"))).toBe(true);
    expect(container.textContent).not.toContain("Bài được chấp nhận");

    // Evidence progress badges and manuscript citation count
    expect(container.textContent).toContain("Bằng chứng: Chưa phân tích");
    expect(container.textContent).toContain("Bằng chứng: Đã đối chiếu (2/2)");
    expect(container.textContent).toContain("Đã trích dẫn trong 2 bản thảo");

    // Contextual primary action for unextracted selected paper: "Phân tích bằng chứng"
    const analyzeBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Phân tích bằng chứng");
    expect(analyzeBtn).toBeDefined();
    // Contextual primary action for completed evidence paper: "Xem bằng chứng"
    const viewBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Xem bằng chứng");
    expect(viewBtn).toBeDefined();

    await act(async () => analyzeBtn!.click());
    await settle();
    expect(container.querySelector('[data-testid="loc"]')?.textContent).toContain("view=evidence");
    expect(container.querySelector('[data-testid="loc"]')?.textContent).toContain("extract=p-unextracted");
  });

  it("renders side-by-side EvidenceEditor with pre-populated paper metadata and 7 structured fields", async () => {
    researchMocks.matrixCriteria.mockResolvedValue([]);
    researchMocks.evidenceWorkspace.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      hasNext: false,
      questions: [{ id: "rq1", text: "How does retrieval grounding reduce hallucination?" }],
      themes: ["rag"],
      items: [
        {
          paperId: "paper-1",
          title: "Retrieval-Augmented Generation for Academic Writing",
          doi: "10.1145/1234567",
          publicationYear: 2025,
          authors: ["Nguyen Dinh Thanh", "Tran Minh"],
          journalName: "ACM Computing Surveys",
          fullTextAvailable: false,
          eligible: true,
          screeningStatus: "INCLUDED",
          eligibilityReason: null,
          extractionCount: 0,
          verifiedCount: 0,
          entries: [],
          questions: [],
          themes: [],
        },
      ],
    });
    researchMocks.paperAnalysis.mockResolvedValue({
      paperId: "paper-1",
      title: "Retrieval-Augmented Generation for Academic Writing",
      screeningStatus: "INCLUDED",
      abstractText: "We evaluate retrieval grounding on 450 student manuscripts.",
      analysis: null,
      knowledge: { status: "ready", sourceKind: "abstract", passages: [], warnings: [], errorMessage: null },
    });

    await render(<EvidenceEditor projectId="p1" initialPaperId="paper-1" onClose={vi.fn()} />);

    // Pre-populated paper metadata from Library without re-typing
    expect(container.textContent).toContain("Retrieval-Augmented Generation for Academic Writing");
    expect(container.textContent).toContain("Nguyen Dinh Thanh, Tran Minh");
    expect(container.textContent).toContain("ACM Computing Surveys");
    expect(container.textContent).toContain("Phân tích dựa trên Abstract");

    // All 7 structured extraction fields are present
    expect(container.textContent).toContain("Mục tiêu & bối cảnh nghiên cứu (Research Objective)");
    expect(container.textContent).toContain("Phương pháp nghiên cứu (Methodology)");
    expect(container.textContent).toContain("Dữ liệu, đối tượng hoặc mẫu (Dataset / Study Data)");
    expect(container.textContent).toContain("Phát hiện chính (Key Findings — bắt buộc)");
    expect(container.textContent).toContain("Kết quả bổ sung & chỉ số (Results / Findings)");
    expect(container.textContent).toContain("Hạn chế (Limitations)");
    expect(container.textContent).toContain("Trang, mục hoặc vị trí nguồn (Source Location)");
  });

  it("allows citing any project paper in ManuscriptCitationPicker, filters by Selected and Cited, and warns on incomplete metadata", async () => {
    const references: ManuscriptReference[] = [
      {
        id: "p-selected",
        title: "Selected Deep Learning Paper",
        authors: ["LeCun", "Bengio"],
        year: 2015,
        doi: "10.1038/nature14539",
        journalName: "Nature",
        citationKey: "lecun2015_p1",
        bibtex: "@article{lecun2015_p1, title={Selected Deep Learning Paper}}",
        screeningStatus: "INCLUDED",
        evidenceStatus: "COMPLETED",
        extractionCount: 1,
        verifiedCount: 1,
        inBib: true,
        metadataWarnings: [],
      },
      {
        id: "p-undecided",
        title: "Unscreened Preprint Without Year",
        authors: [],
        year: null,
        doi: null,
        journalName: null,
        citationKey: "reference_nd_p2",
        bibtex: "@article{reference_nd_p2, title={Unscreened Preprint Without Year}}",
        screeningStatus: "NOT_REVIEWED",
        evidenceStatus: "NOT_STARTED",
        extractionCount: 0,
        verifiedCount: 0,
        inBib: false,
        metadataWarnings: ["Thiếu thông tin tác giả", "Thiếu năm xuất bản"],
      },
    ];
    const onInsert = vi.fn().mockResolvedValue(true);

    await render(
      <ManuscriptCitationPicker
        open
        onOpenChange={vi.fn()}
        projectId="p1"
        references={references}
        isLoading={false}
        citedKeys={new Set(["lecun2015_p1"])}
        bibKeys={new Set(["lecun2015_p1"])}
        compiledSuccess
        bibSetup={detectBibliographySetup(["\\usepackage{natbib}\n\\bibliography{references}"], ["references.bib"])}
        canInsert
        busy={false}
        onInsert={onInsert}
      />,
    );

    const dialog = document.body;
    expect(dialog.textContent).toContain("Trích dẫn tài liệu");
    expect(dialog.textContent).toContain("Selected Deep Learning Paper");
    expect(dialog.textContent).toContain("Unscreened Preprint Without Year");
    expect(dialog.textContent).toContain("Có trong .bib");
    expect(dialog.textContent).toContain("Đã trích dẫn trong .tex");
    expect(dialog.textContent).toContain("Đã biên dịch thành công");
    expect(dialog.textContent).toContain("Cảnh báo metadata: Thiếu thông tin tác giả, Thiếu năm xuất bản");

    // Filter to "Bài đã chọn"
    const selectedTab = [...dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b => b.textContent?.includes("Bài đã chọn"))!;
    await act(async () => selectedTab.click());
    expect(dialog.textContent).toContain("Selected Deep Learning Paper");
    expect(dialog.textContent).not.toContain("Unscreened Preprint Without Year");

    // Switch back to "Tất cả tài liệu" and cite the unscreened paper (not blocked by screening or evidence status)
    const allTab = [...dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b => b.textContent?.includes("Tất cả tài liệu"))!;
    await act(async () => allTab.click());
    const unscreenedCard = dialog.querySelector<HTMLElement>('[data-paper-id="p-undecided"]')!;
    const citeBtn = unscreenedCard.querySelector<HTMLButtonElement>("button")!;
    expect(citeBtn.disabled).toBe(false);
    await act(async () => citeBtn.click());
    expect(onInsert).toHaveBeenCalledWith("p-undecided", "\\cite");
  });
});
