// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MentorProjectPreview, MentorshipRequest, ResearchTeamDossier } from "@trend/shared-types";
import { ResearchTeamDossierSheet } from "../components/research-team-dossier-sheet";
import { LecturerProposalDialog } from "../components/lecturer-proposal-dialog";
import { MemberProfileConsentCard } from "../components/member-profile-consent-card";
import { MentorRelevanceSummary } from "../components/mentor-relevance-summary";
import { MentorshipCounterProposalDialog } from "../components/mentorship-request-actions";

const apiMocks = vi.hoisted(() => ({
  opportunityDossier: vi.fn(),
  previewTeamDossier: vi.fn(),
  myProfileConsent: vi.fn(),
  updateMyProfileConsent: vi.fn(),
  propose: vi.fn(),
  counterPropose: vi.fn(),
  messages: vi.fn(),
  sendMessage: vi.fn(),
  attachment: vi.fn(),
}));

vi.mock("../api/academic-support.api", () => ({ academicSupportApi: apiMocks }));
vi.mock("@/features/academic-profile/hooks/use-academic-profile", () => ({
  useAcademicProfile: () => ({
    data: {
      displayName: "Dr. Nguyen Lan",
      positionTitle: "Senior Lecturer",
      institution: "FPT University",
      verificationStatus: "VERIFIED",
    },
    isLoading: false,
  }),
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: Object.assign(
    (select: (s: { user: { id: string; fullName: string } }) => unknown) => select({ user: { id: "lecturer-1", fullName: "Dr. Nguyen Lan" } }),
    { getState: () => ({ user: { id: "lecturer-1", fullName: "Dr. Nguyen Lan" } }) },
  ),
}));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "vi", t: (key: string) => key }) }));
vi.mock("../components/workspace-common", () => ({ useUnsavedWorkspace: () => {}, canLeaveWorkspace: async () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const sampleDossier: ResearchTeamDossier = {
  projectId: "proj-1",
  discovery: "SEEKING_MENTOR",
  discoveryVersion: 5,
  previewToken: "a".repeat(64),
  overview: {
    title: "Nghiên cứu đánh giá mô hình ngôn ngữ y sinh",
    summary: "Đề tài tập trung xây dựng bộ tiêu chí đánh giá độ tin cậy của mô hình ngôn ngữ lớn trong tóm tắt bệnh án.",
    researchField: "Natural Language Processing",
    researchAreas: ["Natural Language Processing", "Biomedical AI"],
    methodologies: ["Experimental research"],
    stage: "ACTIVE",
    researchProblem: "Mô hình ngôn ngữ lớn dễ sinh thông tin không có căn cứ.",
    researchObjectives: ["Xây dựng tập dữ liệu kiểm thử", "Đánh giá định lượng"],
    researchQuestions: ["Phương pháp kiểm chứng nào giảm ảo giác hiệu quả nhất?"],
    expectedDuration: "1_SEMESTER",
  },
  team: {
    teamMemberCount: 4,
    consentedMembers: [
      {
        userId: "student-1",
        publicHandle: "student-1",
        fullName: "Trần Minh Anh",
        projectRole: "OWNER",
        researchResponsibility: "Thiết kế thực nghiệm",
        institutionName: "ĐH FPT",
        researchInterests: ["NLP"],
        skills: ["Python", "PyTorch"],
        researchMethods: ["Experimental research"],
        featuredWorks: [],
        affiliationVerified: true,
      },
    ],
    unsharedMemberCount: 3,
  },
  progress: {
    stage: "ACTIVE",
    completed: "Đã hoàn thiện tổng quan 25 bài báo.",
    inProgress: "Đang thiết kế bộ câu hỏi thực nghiệm.",
    hasSharedProgress: true,
  },
  needs: {
    supportTypes: ["RESEARCH_METHODOLOGY", "DATA_ANALYSIS"],
    expertise: ["NLP Evaluation"],
    methodologies: ["Experimental research"],
    mentoringNeeds: "Cần góp ý thiết kế thực nghiệm và phương pháp phân tích thống kê.",
    availableRoles: ["PRIMARY", "SECONDARY"],
    recruitingRoles: ["PRIMARY", "SECONDARY"],
    expectedFrequency: "BIWEEKLY",
    workingMode: "ONLINE",
  },
  collaborationTerms: {
    sharedAttachments: [],
    prospectiveAccess: {
      preset: "ADVISOR",
      permissions: ["OVERVIEW_VIEW", "MENTOR_CHAT", "PAPERS_VIEW"],
      expiresAt: null,
      policyHash: "f".repeat(64),
    },
    canDirectPropose: true,
    confidentialityNotice: "Giữ bảo mật ý tưởng nghiên cứu.",
    beforeAcceptNotice: "Chưa mở khóa tài nguyên nội bộ trước khi chấp nhận.",
  },
  viewerState: { canPropose: true },
};

const samplePreview: MentorProjectPreview = {
  id: "proj-1",
  title: sampleDossier.overview.title,
  summary: sampleDossier.overview.summary,
  stage: "ACTIVE",
  discovery: "SEEKING_MENTOR",
  researchAreas: sampleDossier.overview.researchAreas,
  expertise: sampleDossier.needs.expertise,
  mentoringNeeds: sampleDossier.needs.mentoringNeeds,
  availableRoles: ["PRIMARY", "SECONDARY"],
  hasProspectiveAccessPolicy: true,
};

let host: HTMLDivElement, root: Root, client: QueryClient;
const tick = async () => { await act(async () => { await new Promise(r => setTimeout(r, 25)); }); };
const mount = async (node: ReactNode) => {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>{node}</MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await tick();
  await tick();
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
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

describe("Two-way Research Mentorship UI workflows", () => {
  it("renders ResearchTeamDossierSheet with consented members, Academic Profile link, and omits unconsented members", async () => {
    apiMocks.opportunityDossier.mockResolvedValue(sampleDossier);
    const onPropose = vi.fn();
    await mount(<ResearchTeamDossierSheet projectId="proj-1" mode="lecturer" onClose={vi.fn()} onPropose={onPropose} />);

    const text = document.body.textContent ?? "";
    expect(text).toContain("Nghiên cứu đánh giá mô hình ngôn ngữ y sinh");
    expect(text).toContain("Trần Minh Anh");
    expect(text).toContain("Quy mô nhóm: 4 thành viên");
    expect(text).toContain("3 thành viên khác giữ hồ sơ ở chế độ không chia sẻ");
    expect(text).toContain("Đã hoàn thiện tổng quan 25 bài báo");
    expect(document.querySelector('a[href="/academics/student-1"]')).not.toBeNull();

    const proposeBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes("Đề nghị hướng dẫn"));
    expect(proposeBtn).toBeDefined();
    await act(async () => proposeBtn!.click());
    expect(onPropose).toHaveBeenCalledWith(sampleDossier);
  });

  it("shows cross-direction invitation banner in ResearchTeamDossierSheet when project already invited lecturer", async () => {
    apiMocks.opportunityDossier.mockResolvedValue({
      ...sampleDossier,
      viewerState: {
        canPropose: false,
        blockedReason: "INCOMING_INVITATION_EXISTS",
        existingRequestId: "req-99",
        existingRequestDirection: "PROJECT_TO_LECTURER",
      },
    });
    const onOpenExisting = vi.fn();
    await mount(<ResearchTeamDossierSheet projectId="proj-1" mode="lecturer" onClose={vi.fn()} onOpenExistingRequest={onOpenExisting} />);

    expect(document.body.textContent).toContain("Nhóm này đã gửi lời mời hướng dẫn cho bạn");
    const viewBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes("Xem lời mời hiện tại"));
    await act(async () => viewBtn!.click());
    expect(onOpenExisting).toHaveBeenCalledWith("proj-1", "req-99");
  });

  it("submits formal lecturer proposal with explicit version-bound consent and never sends access permissions", async () => {
    apiMocks.opportunityDossier.mockResolvedValue(sampleDossier);
    apiMocks.propose.mockResolvedValue({ id: "prop-1", status: "PENDING" });
    const onClose = vi.fn();
    await mount(<LecturerProposalDialog project={samplePreview} initialDossier={sampleDossier} onClose={onClose} />);

    const submitBtn = () => [...document.querySelectorAll<HTMLButtonElement>("button[type='submit']")][0]!;
    expect(submitBtn().disabled).toBe(true);

    // Choose role explicitly (never auto-selected when multiple roles exist)
    const roleSelect = document.querySelector<HTMLSelectElement>("#proposal-role")!;
    expect(roleSelect.value).toBe("");
    await act(async () => {
      roleSelect.value = "SECONDARY";
      roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Type meaningful message
    const msgInput = document.querySelector<HTMLTextAreaElement>("#formal-proposal-message")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        msgInput,
        "Tôi có thể đồng hành tư vấn thiết kế thực nghiệm và đánh giá định lượng cho nhóm nghiên cứu.",
      );
      msgInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Still disabled before explicit consent checkbox
    expect(submitBtn().disabled).toBe(true);

    const consentCheckbox = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].at(-1)!;
    await act(async () => consentCheckbox.click());
    expect(submitBtn().disabled).toBe(false);

    await act(async () => {
      document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await tick();

    expect(apiMocks.propose).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({
        mentorRole: "SECONDARY",
        consentConfirmed: true,
        expectedDiscoveryVersion: 5,
        expectedPolicyHash: "f".repeat(64),
      }),
    );
    const sentPayload = apiMocks.propose.mock.calls[0]![1] as Record<string, unknown>;
    expect(sentPayload).not.toHaveProperty("access");
  });

  it("lets a member toggle contextual profile sharing consent and warns when global profile is PRIVATE", async () => {
    apiMocks.myProfileConsent.mockResolvedValue({
      projectId: "proj-1",
      userId: "lecturer-1",
      shared: true,
      profileVisibility: "PRIVATE",
      effectiveVisibleToLecturers: false,
    });
    apiMocks.updateMyProfileConsent.mockResolvedValue({
      projectId: "proj-1",
      userId: "lecturer-1",
      shared: false,
      profileVisibility: "PRIVATE",
      effectiveVisibleToLecturers: false,
    });
    await mount(<MemberProfileConsentCard projectId="proj-1" />);
    expect(document.body.textContent).toContain("chế độ Riêng tư");
    const withdrawBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes("Rút chia sẻ"))!;
    await act(async () => withdrawBtn.click());
    expect(apiMocks.updateMyProfileConsent).toHaveBeenCalledWith("proj-1", expect.objectContaining({ shared: false }));
  });

  it("renders neutral MentorRelevanceSummary with zero suitability ratings or percentages", async () => {
    await mount(
      <MentorRelevanceSummary
        match={{
          relevance: "HIGHLY_RELEVANT",
          topics: ["Natural Language Processing"],
          subfields: [],
          fields: ["Computer Science"],
          skills: ["PyTorch"],
          interests: [],
          support: [],
          gaps: [],
        }}
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("Natural Language Processing");
    expect(text).not.toContain("%");
    expect(text).not.toContain("Highly relevant");
    expect(text).not.toContain("Phù hợp cao");
    expect(text).not.toContain("Rất phù hợp");
  });

  it("prevents lecturer counter-proposal from editing access policy directly while submitting versioned changes", async () => {
    apiMocks.counterPropose.mockResolvedValue({ id: "req-v2", proposalVersion: 2, status: "PENDING" });
    const req: MentorshipRequest = {
      kind: "REQUEST",
      id: "req-v1",
      projectId: "proj-1",
      direction: "PROJECT_TO_LECTURER",
      status: "PENDING",
      proposalVersion: 1,
      mentorRole: "PRIMARY",
      mentorUser: { _id: "lecturer-1", fullName: "Dr. Nguyen Lan" },
      requestedBy: { _id: "student-1", fullName: "Trần Minh Anh" },
      actions: { accept: true, decline: true, cancel: false, end: false, openProject: false, counterPropose: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await mount(<MentorshipCounterProposalDialog item={req} onClose={vi.fn()} />);

    // Lecturer receives an optional access note field, NOT MentorPolicyFields
    expect(document.querySelector("#counter-access-note")).not.toBeNull();

    const summary = document.querySelector<HTMLInputElement>("#counter-summary")!;
    const msg = document.querySelector<HTMLTextAreaElement>("#counter-message")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(summary, "Đề xuất vai trò cố vấn phụ cho phần thực nghiệm");
      summary.dispatchEvent(new Event("input", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(msg, "Tôi có thể đồng hành vai trò cố vấn phụ và góp ý định kỳ 2 tuần/lần.");
      msg.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await tick();

    expect(apiMocks.counterPropose).toHaveBeenCalledWith(
      "proj-1",
      "req-v1",
      expect.objectContaining({
        expectedProposalVersion: 1,
        changeSummary: "Đề xuất vai trò cố vấn phụ cho phần thực nghiệm",
      }),
    );
    const payload = apiMocks.counterPropose.mock.calls[0]![2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("access");
  });
});
