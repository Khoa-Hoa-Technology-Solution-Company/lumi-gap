// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailableMentor, LecturerMatchEvidence, ResearchNeedsAnalysisResult } from "@trend/shared-types";
import { TooltipProvider } from "@/components/ui/tooltip";

const mocks = vi.hoisted(() => ({
  researchNeeds: vi.fn(),
  analyzeResearchNeeds: vi.fn(),
  saveResearchNeeds: vi.fn(),
  mentorEvidence: vi.fn(),
  explainMentor: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({ language: "vi", t: (k: string) => k }),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (s: { user: { id: string } }) => unknown) => selector({ user: { id: "user-1" } }),
}));

vi.mock("../api/academic-support.api", () => ({
  academicSupportApi: {
    researchNeeds: mocks.researchNeeds,
    analyzeResearchNeeds: mocks.analyzeResearchNeeds,
    saveResearchNeeds: mocks.saveResearchNeeds,
    mentorEvidence: mocks.mentorEvidence,
    explainMentor: mocks.explainMentor,
  },
}));

import { ResearchNeedsPanel } from "../components/research-needs-panel";
import { MentorMatchEvidenceDialog } from "../components/mentor-match-evidence-dialog";

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

describe("Explainable Mentor Recommendation UI", () => {
  let container: HTMLDivElement;
  let root: Root;
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders ResearchNeedsPanel summary and lets team analyze, confirm and save needs", async () => {
    const initial: ResearchNeedsAnalysisResult = {
      projectId: "proj-1",
      analysisVersion: "mentor-needs-v1.0",
      mode: "DETERMINISTIC_FALLBACK",
      aiPolicyAllowed: true,
      analyzedAt: "2026-11-27T00:00:00.000Z",
      selectedChallenges: [],
      needs: [
        {
          id: "need-llm",
          title: "Xử lý ngôn ngữ tự nhiên & LLM",
          description: "Phân tích văn bản khoa học bằng LLM",
          category: "DOMAIN_EXPERTISE",
          priority: "ESSENTIAL",
          taxonomyNodeIds: [],
          relatedTerms: ["LLM", "NLP"],
          rationale: "Đề xuất từ từ khóa đề tài.",
          source: "AI_SUGGESTED",
          status: "SUGGESTED",
        },
      ],
      contextSummary: {
        hasTitle: true,
        hasDescription: true,
        hasClassification: false,
        hasKeywords: true,
        hasResearchPlan: false,
        hasMethodology: false,
        hasDeclaredMentoringNeeds: false,
        stage: "DISCOVERY",
        completeness: "MINIMAL",
      },
      missingContextHints: [],
    };
    mocks.researchNeeds.mockResolvedValue(initial);
    mocks.saveResearchNeeds.mockResolvedValue({ projectId: "proj-1", version: 2, needs: initial.needs, selectedChallenges: [], updatedAt: "2026-11-27T00:01:00.000Z" });

    act(() => {
      root.render(
        <QueryClientProvider client={qc}>
          <TooltipProvider>
            <ResearchNeedsPanel
              projectId="proj-1"
              canManage
              isSeeking={false}
              discoveryMode="CLOSED"
              onOpenSettings={vi.fn()}
            />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });
    await flush();

    expect(container.textContent).toContain("Nhu cầu hướng dẫn của nhóm");
    expect(container.textContent).toContain("Xử lý ngôn ngữ tự nhiên & LLM");

    const openBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("Phân tích & xác nhận nhu cầu"));
    expect(openBtn).toBeTruthy();
    await act(async () => {
      openBtn?.click();
    });
    await flush();

    expect(document.body.textContent).toContain("Phân tích nhu cầu hướng dẫn");
    expect(document.body.textContent).toContain("Nhóm đang gặp khó khăn ở đâu?");

    const confirmBtn = Array.from(document.body.querySelectorAll("button")).find(b => b.textContent?.trim() === "Xác nhận");
    expect(confirmBtn).toBeTruthy();
    await act(async () => {
      confirmBtn?.click();
    });
    await flush();

    const saveBtn = Array.from(document.body.querySelectorAll("button")).find(b => b.textContent?.includes("Lưu nhu cầu & cập nhật đề xuất"));
    expect(saveBtn).toBeTruthy();
    await act(async () => {
      saveBtn?.click();
    });
    await flush();

    expect(mocks.saveResearchNeeds).toHaveBeenCalledTimes(1);
    const savedArg = mocks.saveResearchNeeds.mock.calls[0]?.[1];
    expect(savedArg.needs[0].status).toBe("CONFIRMED");
  });

  it("renders redesigned Recommendation Analysis dialog with need coverage, provenance, uncertainties and AI explanation", async () => {
    const mentor: AvailableMentor = {
      _id: "mentor-1",
      fullName: "TS. Synthetic Lecturer A (Demo)",
      institutionName: "LumiGap Tech (Demo)",
      positionTitle: "Associate Professor",
      verifiedLecturer: true,
      acceptingMentorships: true,
      sameInstitution: false,
      expertiseAreas: ["Natural Language Processing"],
      researchInterests: ["Information Retrieval"],
      matchedTerms: ["Natural Language Processing"],
    };

    const evidence: LecturerMatchEvidence = {
      method: "HYBRID_EVIDENCE_V2",
      profileVisible: true,
      verifiedLecturer: true,
      topics: [{ term: "NLP", source: "PROFILE_DECLARATION" }],
      methodologies: [],
      mentoringNeeds: [],
      publications: [
        {
          paperId: "p-1",
          title: "Grounded Retrieval-Augmented LLMs for Scientific Synthesis",
          year: 2025,
          authors: ["TS. Synthetic Lecturer A"],
          venue: "ACL Findings",
          source: "openalex",
          href: "https://doi.org/10.9999/demo.a1",
          matchedTerms: ["LLM", "Information Retrieval"],
          evidenceScope: "ABSTRACT",
          evidenceExcerpt: "Information Retrieval and Large Language Models improve evidence synthesis.",
          explanation: "Đối chiếu dựa trên tóm tắt (abstract) của công trình.",
          attribution: "LINKED_IDENTITY",
        },
      ],
      identities: [],
      missing: [],
      requestedTopics: ["NLP"],
      requestedMethodologies: [],
      canGenerateAiExplanation: true,
      recommendation: {
        projectId: "proj-1",
        lecturerId: "mentor-1",
        recommendationVersion: "mentor-rec-v2.0",
        rankingConfigVersion: "mentor-hybrid-v1.0-experimental",
        retrievalMode: "HYBRID_TAXONOMY_LEXICAL",
        tier: "RECOMMENDED",
        abstained: false,
        eligibility: {
          canInvite: true,
          currentAvailability: "ACCEPTING",
          remainingSlots: 3,
          maxActiveProjects: 4,
          activeProjectCount: 1,
        },
        primaryHeadline: "Nên ưu tiên tìm hiểu nếu nhóm cần hỗ trợ về NLP & LLM.",
        summary: "Nên ưu tiên tìm hiểu giảng viên này cho phần NLP và Truy xuất thông tin.",
        needs: [
          {
            needId: "need-llm",
            needTitle: "Phân tích tài liệu bằng LLM",
            category: "DOMAIN_EXPERTISE",
            priority: "ESSENTIAL",
            relationship: "RELATED_EVIDENCE",
            evidenceIds: ["ev-pub-p-1"],
            explanation: "Có công trình liên quan đối chiếu từ abstract.",
            evidenceLabel: "Công trình liên quan",
          },
          {
            needId: "need-gap",
            needTitle: "Phương pháp xác định Research Gap",
            category: "RESEARCH_METHOD",
            priority: "ESSENTIAL",
            relationship: "NEEDS_DISCUSSION",
            evidenceIds: [],
            explanation: "Chưa thấy căn cứ trực tiếp trong dữ liệu hiện có.",
            evidenceLabel: "Cần trao đổi thêm",
          },
        ],
        suggestedDiscussionTopics: ["Thầy/cô có thể góp ý về phương pháp xác định Research Gap không?"],
        uncertainties: [{ code: "PROJECT_METHODOLOGY_UNSPECIFIED", message: "Nhóm chưa xác định phương pháp nghiên cứu." }],
        evidenceCoverage: {
          availableSignals: ["Chuyên môn nghiên cứu khai báo", "Công trình liên kết qua định danh học thuật"],
          missingSignals: [],
          completenessLevel: "RICH",
        },
        generatedAt: "2026-11-27T00:00:00.000Z",
      },
    };

    mocks.mentorEvidence.mockResolvedValue(evidence);
    mocks.explainMentor.mockResolvedValue({
      summary: "Diễn giải đã kiểm định: giảng viên có công trình về LLM từ abstract và cần trao đổi thêm về Research Gap.",
      needNotes: [],
      discussionQuestions: ["Thầy/cô kỳ vọng nhóm chuẩn bị tài liệu đầu vào ở mức nào?"],
      uncertainties: [],
      validated: true,
      source: "AI_VALIDATED",
      promptVersion: "mentor-explain-v1.0",
      generatedAt: "2026-11-27T00:02:00.000Z",
    });

    act(() => {
      root.render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <MentorMatchEvidenceDialog
              projectId="proj-1"
              mentor={mentor}
              canInvite
              onInvite={vi.fn()}
              onClose={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await flush();

    expect(document.body.textContent).toContain("Phân tích đề xuất hướng dẫn");
    expect(document.body.textContent).toContain("Phân tích tài liệu bằng LLM");
    expect(document.body.textContent).toContain("Công trình liên quan");
    expect(document.body.textContent).toContain("Cần trao đổi thêm");
    expect(document.body.textContent).toContain("Grounded Retrieval-Augmented LLMs for Scientific Synthesis");
    expect(document.body.textContent).toContain("Nhóm chưa xác định phương pháp nghiên cứu.");
    expect(document.body.textContent).not.toMatch(/\b\d{1,3}%\b/);

    const aiBtn = Array.from(document.body.querySelectorAll("button")).find(b => b.textContent?.includes("Diễn giải chi tiết bằng AI"));
    expect(aiBtn).toBeTruthy();
    await act(async () => {
      aiBtn?.click();
    });
    await flush();

    expect(mocks.explainMentor).toHaveBeenCalledWith("proj-1", "mentor-1", "vi");
    expect(document.body.textContent).toContain("Diễn giải đã kiểm định");
  });
});
