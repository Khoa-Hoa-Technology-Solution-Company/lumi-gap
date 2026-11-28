// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GlobalPersonalContributionsView,
  MentorshipRequest,
  ResearchTeamDossier,
} from "@trend/shared-types";
import { PersonalContributionProfile } from "../components/personal-contribution-profile";
import { ResearchTeamDossierSheet } from "../components/research-team-dossier-sheet";
import { MentorshipInvitationViewer } from "../components/mentorship-invitation-viewer";

const mocks = vi.hoisted(() => ({
  myHistory: vi.fn(),
  myGlobal: vi.fn(),
  exportMyHistory: vi.fn(),
  exportMyGlobal: vi.fn(),
  save: vi.fn(),
  review: vi.fn(),
  createIntegrityCase: vi.fn(),
  respondIntegrityCase: vi.fn(),
  opportunityDossier: vi.fn(),
  previewTeamDossier: vi.fn(),
  requestDetail: vi.fn(),
  respond: vi.fn(),
  messages: vi.fn(),
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "vi",
    t: (key: string) => key,
  }),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: Object.assign(
    (select: (s: { user: { id: string; fullName: string } }) => unknown) =>
      select({ user: { id: "lecturer-1", fullName: "TS. Nguyễn Quang Minh" } }),
    { getState: () => ({ user: { id: "lecturer-1", fullName: "TS. Nguyễn Quang Minh" } }) },
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("../api/contributions.api", () => ({
  contributionsApi: {
    myHistory: mocks.myHistory,
    myGlobal: mocks.myGlobal,
    exportMyHistory: mocks.exportMyHistory,
    exportMyGlobal: mocks.exportMyGlobal,
    save: mocks.save,
    review: mocks.review,
    createIntegrityCase: mocks.createIntegrityCase,
    respondIntegrityCase: mocks.respondIntegrityCase,
  },
}));

vi.mock("../api/academic-support.api", () => ({
  academicSupportApi: {
    opportunityDossier: mocks.opportunityDossier,
    previewTeamDossier: mocks.previewTeamDossier,
    requestDetail: mocks.requestDetail,
    respond: mocks.respond,
    messages: mocks.messages,
  },
}));

describe("Lecturer Workspace UX, Contributions & Mentorship Refinement", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    mocks.messages.mockResolvedValue({ items: [], total: 0 });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  });

  const render = async (ui: ReactNode) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 25));
    });
  };

  it("keeps contribution counters strictly aligned with row badges, avoids prominent dispute CTA on system-recorded reviews, and renders review context", async () => {
    const view: GlobalPersonalContributionsView = {
      userId: "lecturer-1",
      userName: "TS. Nguyễn Quang Minh",
      accountRestricted: false,
      generatedAt: "2026-11-26T00:00:00Z",
      meta: { page: 1, pageSize: 20, total: 2, totalPages: 1, hasNext: false },
      summary: {
        recordedWorkCount: 2,
        acknowledgedCount: 0,
        needsMyResponseCount: 0,
        projectCount: 1,
      },
      projects: [
        {
          projectId: "proj-1",
          title: "Trợ lý AI học tập",
          membershipStatus: "ADVISOR",
          projectStatus: "ACTIVE",
          projectDeleted: false,
          canViewWorkspace: true,
          canDeclareContribution: false,
          recordCount: 2,
          pendingCount: 0,
          publicationStatus: "under_review",
        },
      ],
      items: [
        {
          id: "rev-1",
          sourceRecordId: "rev-1",
          recordKind: "ACADEMIC_REVIEW",
          category: "WRITING_REVISION",
          projectId: "proj-1",
          projectTitle: "Trợ lý AI học tập",
          projectStatus: "ACTIVE",
          projectDeleted: false,
          membershipStatus: "ADVISOR",
          title: "Phản biện học thuật: Bản thảo AI học tập",
          summary: "Đã nộp phản biện Vòng 1 cho phiên bản bản thảo v1.",
          roles: [],
          suggestedRoles: ["WRITING_REVIEW_EDITING"],
          workDate: "2026-11-15T10:00:00.000Z",
          sourceKind: "SYSTEM_RECORDED",
          reconciliationState: "RECORDED",
          version: 1,
          evidenceCount: 1,
          evidenceSources: [
            {
              kind: "HUMAN_REVIEW",
              id: "rev-1",
              label: "Bản phản biện Vòng 1 — Bản thảo v1",
              versionLabel: "Vòng 1 · v1",
              accessible: true,
              href: "/mentor-workspace?view=review-request&requestId=rreq-1&round=1",
            },
          ],
          evidenceAccessRestricted: false,
          acknowledgements: [],
          reviewContext: {
            assignmentId: "assign-1",
            reviewRequestId: "rreq-1",
            submissionId: "sub-1",
            revisionId: "rev-v1",
            revisionNumber: 1,
            roundNumber: 1,
            overallAssessment: "MAJOR_REVISION",
            reviewStatus: "SUBMITTED",
            commentExcerpt: "Cần bổ sung phân tích Threats to Validity.",
            submittedAt: "2026-11-15T10:00:00.000Z",
          },
          waitingOnOthers: false,
          needsMyAction: false,
          canViewWorkspace: true,
          canRequestEdit: false,
          canOpenReviewRequest: true,
          privacyRedacted: false,
        },
        {
          id: "fb-1",
          sourceRecordId: "fb-1",
          recordKind: "ADVISOR_FEEDBACK",
          category: "CONCEPTUALIZATION_METHODOLOGY",
          projectId: "proj-1",
          projectTitle: "Trợ lý AI học tập",
          projectStatus: "ACTIVE",
          projectDeleted: false,
          membershipStatus: "ADVISOR",
          title: "Đề xuất chỉnh sửa hướng dẫn",
          summary: "Gợi ý bổ sung chỉ số kiểm chứng nguồn.",
          roles: ["SUPERVISION"],
          workDate: "2026-11-20T10:00:00.000Z",
          sourceKind: "MENTOR_RECORDED",
          reconciliationState: "RECORDED",
          version: 1,
          evidenceCount: 1,
          evidenceSources: [
            { kind: "MENTOR_FEEDBACK", id: "fb-1", label: "Đề xuất hướng dẫn", accessible: true },
          ],
          evidenceAccessRestricted: false,
          acknowledgements: [],
          waitingOnOthers: true,
          needsMyAction: false,
          canViewWorkspace: true,
          canRequestEdit: false,
          canOpenReviewRequest: true,
          privacyRedacted: false,
        },
      ],
      cases: [],
      attributionLimitations: [],
    };
    mocks.myGlobal.mockResolvedValue(view);

    await render(<PersonalContributionProfile scope="global" />);

    const text = host.textContent ?? "";
    expect(text).toContain("Mục cần bạn phản hồi");
    expect(text).toContain("Đang chờ nhóm xác nhận");
    expect(text).toContain("Hệ thống ghi nhận");
    expect(text).not.toContain("Cần bạn xem xét");
    expect(text).not.toContain("Đã ghi nhận · Chưa đối soát");

    // Search input uses dedicated non-overlapping class
    const searchInput = host.querySelector<HTMLInputElement>("input.pcp-search-input");
    expect(searchInput).not.toBeNull();

    // Open detail drawer for the system-recorded academic review
    const titleBtn = Array.from(host.querySelectorAll("button")).find(b =>
      b.textContent?.includes("Phản biện học thuật: Bản thảo AI học tập"),
    );
    expect(titleBtn).toBeDefined();
    await act(async () => {
      titleBtn!.click();
    });

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("Chi tiết vòng phản biện học thuật");
    expect(bodyText).toContain("Vòng 1");
    expect(bodyText).toContain("Cần chỉnh sửa lớn");
    expect(bodyText).toContain("Xem phản biện");
    // No prominent generic "Yêu cầu xem xét" button shown directly in the drawer
    const directReviewReqButtons = Array.from(document.body.querySelectorAll("button")).filter(
      b => b.textContent?.trim() === "Yêu cầu xem xét",
    );
    expect(directReviewReqButtons).toHaveLength(0);
    // Discreet overflow menu reveals error/correction reporting option
    const overflowBtn = Array.from(document.body.querySelectorAll("button")).find(b =>
      b.textContent?.includes("Tùy chọn khác"),
    );
    expect(overflowBtn).toBeDefined();
    await act(async () => {
      overflowBtn!.click();
    });
    expect(document.body.textContent).toContain("Báo sai sót hoặc đề nghị điều chỉnh");
  });

  it("renders Research Team Dossier without numbering gaps when progress is absent and avoids duplicate unshared-member notices", async () => {
    const sparseDossier: ResearchTeamDossier = {
      projectId: "proj-sparse",
      discovery: "SEEKING_MENTOR",
      discoveryVersion: 1,
      previewToken: "b".repeat(64),
      overview: {
        title: "Nghiên cứu tiếp cận dịch vụ công",
        summary: "Đề cương khảo sát trải nghiệm người cao tuổi.",
        researchField: "Human-Computer Interaction",
        researchAreas: ["Human-Computer Interaction"],
        methodologies: [],
        stage: "PLANNING",
        researchObjectives: [],
        researchQuestions: [],
      },
      team: {
        teamMemberCount: 2,
        consentedMembers: [],
        unsharedMemberCount: 2,
      },
      progress: {
        stage: "PLANNING",
        hasSharedProgress: false,
      },
      needs: {
        supportTypes: ["RESEARCH_DIRECTION"],
        expertise: [],
        methodologies: [],
        mentoringNeeds: "",
        recruitingRoles: ["PRIMARY"],
        availableRoles: ["PRIMARY"],
      },
      collaborationTerms: {
        sharedAttachments: [],
        prospectiveAccess: null,
        canDirectPropose: false,
        beforeAcceptNotice: "Chỉ chia sẻ thông tin giới thiệu trước khi chấp nhận.",
        confidentialityNotice: "Tài liệu nội bộ được bảo vệ.",
      },
      viewerState: {
        canPropose: false,
        blockedReason: "PROSPECTIVE_ACCESS_NOT_CONFIGURED",
      },
    };
    mocks.opportunityDossier.mockResolvedValue(sparseDossier);

    await render(
      <ResearchTeamDossierSheet
        projectId="proj-sparse"
        mode="lecturer"
        onClose={() => {}}
      />,
    );

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("Tổng quan nghiên cứu");
    expect(bodyText).toContain("Thành viên nghiên cứu");
    expect(bodyText).toContain("Nhu cầu hướng dẫn và kỳ vọng hợp tác");
    expect(bodyText).toContain("Tài liệu giới thiệu & Quyền truy cập dự kiến");
    // No broken numbering jumps like "1.", "2.", "4.", "5."
    expect(bodyText).not.toContain("4. Nhu cầu hướng dẫn");
    expect(bodyText).not.toContain("5. Tài liệu giới thiệu");
    // Single consolidated unshared-member message (no duplicate second notice)
    expect(bodyText).toContain("Nhóm gồm 2 thành viên. Hồ sơ học thuật cá nhân chưa được chia sẻ trong ngữ cảnh tìm cố vấn.");
    expect(bodyText).not.toContain("2 thành viên khác giữ hồ sơ ở chế độ không chia sẻ");
  });

  it("separates historical accepted invitation from ended mentoring relationship and hides Open project when access is revoked", async () => {
    const endedAcceptedRequest: MentorshipRequest = {
      id: "req-ended",
      kind: "REQUEST",
      projectId: "proj-fin",
      direction: "PROJECT_TO_LECTURER",
      mentorRole: "PRIMARY",
      status: "ACCEPTED",
      message: "Kính mời Thầy hướng dẫn đề tài tín dụng vi mô.",
      createdAt: "2026-07-01T08:00:00.000Z",
      respondedAt: "2026-07-02T09:00:00.000Z",
      updatedAt: "2026-07-02T09:00:00.000Z",
      project: {
        _id: "proj-fin",
        title: "Tín dụng vi mô XAI",
        status: "COMPLETED",
        researchAreas: ["Machine Learning"],
        expertise: ["Explainable AI"],
        summary: "Đánh giá rủi ro tín dụng vi mô.",
        mentoringNeeds: "Tư vấn phương pháp giải thích mô hình.",
      } as unknown as MentorshipRequest["project"],
      mentorUser: { _id: "lecturer-1", fullName: "TS. Nguyễn Quang Minh" },
      requestedBy: { _id: "student-fin", fullName: "Ngô Thanh Tú" },
      currentRelationship: {
        id: "rel-ended",
        status: "ENDED",
        mentorRole: "PRIMARY",
        startedAt: "2026-07-02T09:00:00.000Z",
        endedAt: "2026-10-15T12:00:00.000Z",
        endReason: "Dự án đã hoàn tất học kỳ.",
        accessEffective: false,
        accessRevokedAt: "2026-10-15T12:00:00.000Z",
      },
      actions: {
        accept: false,
        decline: false,
        cancel: false,
        openProject: true,
        end: false,
      },
    };
    mocks.requestDetail.mockResolvedValue(endedAcceptedRequest);

    await render(
      <MentorshipInvitationViewer
        projectId="proj-fin"
        requestId="req-ended"
        onClose={() => {}}
      />,
    );

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("Thỏa thuận ban đầu khi chấp nhận");
    expect(bodyText).toContain("Quan hệ hướng dẫn hiện tại: Đã kết thúc");
    expect(bodyText).toContain("Dự án đã hoàn tất học kỳ.");
    // Must not render an active "Open project" link when accessEffective is false
    const openLinks = Array.from(document.body.querySelectorAll("a")).filter(a =>
      a.textContent?.includes("Open project"),
    );
    expect(openLinks).toHaveLength(0);
  });
});
