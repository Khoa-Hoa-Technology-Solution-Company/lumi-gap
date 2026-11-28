// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlobalPersonalContributionsView, PersonalContributionHistoryExport } from "@trend/shared-types";
import { PersonalContributionProfile } from "../components/personal-contribution-profile";

const mocks = vi.hoisted(() => ({
  myHistory: vi.fn(),
  myGlobal: vi.fn(),
  exportMyHistory: vi.fn(),
  exportMyGlobal: vi.fn(),
  save: vi.fn(),
  review: vi.fn(),
  createIntegrityCase: vi.fn(),
  respondIntegrityCase: vi.fn(),
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "vi",
    t: (key: string) => key,
  }),
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

const sampleGlobalView: GlobalPersonalContributionsView = {
  userId: "00000000-0000-4000-8000-000000000001",
  userName: "Nguyễn Minh Anh",
  accountRestricted: false,
  summary: {
    recordedWorkCount: 3,
    acknowledgedCount: 1,
    needsMyResponseCount: 1,
    projectCount: 2,
  },
  projects: [
    {
      projectId: "proj-1",
      title: "AI trong giáo dục đại học",
      membershipStatus: "ACTIVE",
      projectStatus: "ACTIVE",
      projectDeleted: false,
      canViewWorkspace: true,
      canDeclareContribution: true,
      recordCount: 2,
      pendingCount: 1,
      publicationStatus: "under_review",
    },
    {
      projectId: "proj-2",
      title: "Phân tích dữ liệu y tế MRI",
      membershipStatus: "LEFT",
      projectStatus: "ARCHIVED",
      projectDeleted: false,
      canViewWorkspace: false,
      canDeclareContribution: false,
      recordCount: 1,
      pendingCount: 0,
      publicationStatus: null,
    },
  ],
  items: [
    {
      id: "work:w1",
      sourceRecordId: "w1",
      projectId: "proj-1",
      projectTitle: "AI trong giáo dục đại học",
      projectStatus: "ACTIVE",
      projectDeleted: false,
      membershipStatus: "ACTIVE",
      recordKind: "WORK_CONTRIBUTION",
      title: "Xây dựng phương pháp đánh giá học tập thích ứng",
      summary: "Thiết kế mô hình đánh giá và bộ tiêu chí thực nghiệm.",
      category: "CONCEPTUALIZATION_METHODOLOGY",
      workDate: "2026-10-12T00:00:00.000Z",
      roles: ["METHODOLOGY"],
      sourceKind: "TEAM_DECLARED",
      reconciliationState: "PENDING_RESPONSE",
      version: 1,
      evidenceCount: 2,
      evidenceSources: [
        { kind: "TASK", id: "t1", label: "Task thực nghiệm", accessible: true },
        { kind: "MANUSCRIPT", id: "m1", label: "Bản thảo chính", accessible: true },
      ],
      evidenceAccessRestricted: false,
      acknowledgements: [],
      manuscriptContext: { title: "AI trong giáo dục đại học", publicationStatus: "under_review" },
      needsMyAction: true,
      actionKind: "ACKNOWLEDGE_CONTRIBUTION",
      canViewWorkspace: true,
      canRequestEdit: true,
      canOpenReviewRequest: true,
      privacyRedacted: false,
    },
    {
      id: "advisor:feedback:f1",
      sourceRecordId: "f1",
      projectId: "proj-1",
      projectTitle: "AI trong giáo dục đại học",
      projectStatus: "ACTIVE",
      projectDeleted: false,
      membershipStatus: "ADVISOR",
      recordKind: "ADVISOR_FEEDBACK",
      title: "Góp ý hướng dẫn (review)",
      summary: "Đề xuất bổ sung ablation study và kiểm định thống kê.",
      category: "WRITING_REVISION",
      workDate: "2026-10-18T00:00:00.000Z",
      roles: ["SUPERVISION"],
      sourceKind: "MENTOR_RECORDED",
      reconciliationState: "ACKNOWLEDGED",
      version: 1,
      evidenceCount: 1,
      evidenceSources: [{ kind: "MENTOR_FEEDBACK", id: "f1", label: "Góp ý hướng dẫn", accessible: true }],
      evidenceAccessRestricted: false,
      acknowledgements: [],
      needsMyAction: false,
      canViewWorkspace: true,
      canRequestEdit: false,
      canOpenReviewRequest: true,
      privacyRedacted: false,
    },
    {
      id: "work:w2",
      sourceRecordId: "w2",
      projectId: "proj-2",
      projectTitle: "Phân tích dữ liệu y tế MRI",
      projectStatus: "ARCHIVED",
      projectDeleted: false,
      membershipStatus: "LEFT",
      recordKind: "WORK_CONTRIBUTION",
      title: "Tiền xử lý tập dữ liệu ảnh MRI",
      summary: "Chuẩn hóa dữ liệu đầu vào và loại nhiễu ảnh.",
      category: "LITERATURE_DATA",
      workDate: "2026-09-01T00:00:00.000Z",
      roles: ["DATA_CURATION"],
      sourceKind: "SELF_DECLARED",
      reconciliationState: "HISTORICAL",
      version: 1,
      evidenceCount: 1,
      evidenceSources: [{ kind: "TASK", id: "t2", label: "Task dữ liệu", accessible: false }],
      evidenceAccessRestricted: true,
      acknowledgements: [],
      needsMyAction: false,
      canViewWorkspace: false,
      canRequestEdit: false,
      canOpenReviewRequest: true,
      privacyRedacted: true,
    },
  ],
  cases: [
    {
      id: "case-1",
      projectId: "proj-2",
      projectTitle: "Phân tích dữ liệu y tế MRI",
      kind: "CONTRIBUTION_DISPUTE",
      status: "UNDER_REVIEW",
      title: "Làm rõ vai trò xử lý dữ liệu trước khi rời nhóm",
      myRole: "REPORTER",
      targetKind: "WORK_CONTRIBUTION",
      targetId: "w2",
      resolutionSummary: null,
      createdAt: "2026-10-20T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
    },
  ],
  attributionLimitations: [
    "Các công việc thực hiện ngoài LumiGap chỉ xuất hiện khi được khai báo kèm minh chứng.",
  ],
  meta: { page: 1, pageSize: 50, total: 3, totalPages: 1, hasNext: false },
  generatedAt: "2026-11-25T10:00:00.000Z",
};

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

async function renderProfile(props: { scope: "project" | "global"; projectId?: string }) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PersonalContributionProfile {...props} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.myGlobal.mockResolvedValue(sampleGlobalView);
  mocks.review.mockResolvedValue({});
  mocks.createIntegrityCase.mockResolvedValue({});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  vi.unstubAllGlobals();
});

describe("PersonalContributionProfile", () => {
  it("renders unified personal contributions across projects including mentor feedback and departed projects", async () => {
    await renderProfile({ scope: "global" });

    expect(host.textContent).toContain("Đóng góp của tôi");
    expect(host.textContent).toContain("Xây dựng phương pháp đánh giá học tập thích ứng");
    expect(host.textContent).toContain("Góp ý hướng dẫn (review)");
    expect(host.textContent).toContain("Tiền xử lý tập dữ liệu ảnh MRI");
    expect(host.textContent).toContain("Đã kết thúc tham gia dự án");
    expect(host.textContent).toContain("Methodology — Xây dựng phương pháp");
    expect(host.textContent).toContain("Yêu cầu xem xét liên quan đến bạn");
  });

  it("filters to 'Cần tôi phản hồi' and allows acknowledging attributed work in detail drawer", async () => {
    await renderProfile({ scope: "global" });

    const pendingTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(btn =>
      btn.textContent?.includes("Cần tôi phản hồi"),
    )!;
    await act(async () => pendingTab.click());

    // Only the 1 item needing action is shown
    expect(host.querySelectorAll(".pcp-row")).toHaveLength(1);
    expect(host.textContent).toContain("Xây dựng phương pháp đánh giá học tập thích ứng");

    // Open detail drawer and click Confirm my roles
    const reviewBtn = [...host.querySelectorAll<HTMLButtonElement>("button")].find(btn =>
      btn.textContent?.includes("Xem xét & phản hồi"),
    )!;
    await act(async () => reviewBtn.click());

    const confirmBtn = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(btn =>
      btn.textContent?.includes("Xác nhận thông tin về tôi"),
    )!;
    await act(async () => confirmBtn.click());

    expect(mocks.review).toHaveBeenCalledWith("proj-1", "w1", {
      expectedVersion: 1,
      decision: "ACKNOWLEDGE",
      note: "",
    });
  });

  it("displays calm restricted-evidence explanation for departed member records without leaking files", async () => {
    await renderProfile({ scope: "global" });

    const mriBtn = [...host.querySelectorAll<HTMLButtonElement>(".pcp-row-title-btn")].find(btn =>
      btn.textContent?.includes("Tiền xử lý tập dữ liệu ảnh MRI"),
    )!;
    await act(async () => mriBtn.click());

    expect(document.body.textContent).toContain(
      "Minh chứng gốc không còn thuộc phạm vi truy cập của bạn. Hồ sơ ghi nhận công việc vẫn được bảo toàn.",
    );
  });

  it("renders honest error state with retry instead of fake zeros when API fails", async () => {
    mocks.myGlobal.mockRejectedValueOnce(new Error("Network error"));
    await renderProfile({ scope: "global" });

    expect(host.textContent).toContain("Chưa thể tải hồ sơ đóng góp. Vui lòng thử lại.");
    expect(host.querySelector(".pcp-summary-strip")).toBeNull();
  });

  it("displays preserved historical banner for soft-deleted projects in project scope", async () => {
    const deletedProjectHistory: PersonalContributionHistoryExport = {
      schemaVersion: "LUMIGAP_CONTRIBUTION_EVIDENCE_V1",
      projectId: "proj-del",
      projectTitle: "Dự án đã lưu trữ và gỡ bỏ",
      projectStatus: "DELETED",
      projectDeleted: true,
      canViewWorkspace: false,
      canDeclareInProject: false,
      canFileReviewRequest: true,
      userId: "user-1",
      userName: "Trần An",
      membershipStatus: "REMOVED",
      membershipIntervals: [{ joinedAt: "2026-01-01T00:00:00Z", leftAt: "2026-06-01T00:00:00Z" }],
      workContributions: [],
      allocations: [],
      advisorContributions: [],
      unifiedRecords: [],
      integrityCases: [],
      privacyRedacted: true,
      generatedAt: "2026-11-25T10:00:00.000Z",
      integrityDigestSha256: "abc123",
    };
    mocks.myHistory.mockResolvedValue(deletedProjectHistory);
    await renderProfile({ scope: "project", projectId: "proj-del" });

    expect(host.textContent).toContain("hồ sơ ghi nhận công lao cá nhân của bạn vẫn được bảo toàn");
  });
});
