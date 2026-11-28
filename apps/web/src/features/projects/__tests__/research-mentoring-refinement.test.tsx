// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MentorProjectPanel } from "@/pages/academics/academic-support";
import { projectSections } from "../components/project-section-nav";

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  list: vi.fn(),
  mentors: vi.fn(),
  settings: vi.fn(),
  suggestions: vi.fn(),
  myProfileConsent: vi.fn(),
  previewTeamDossier: vi.fn(),
  requestDetail: vi.fn(),
  respond: vi.fn(),
  plan: vi.fn(),
  roles: vi.fn(),
  mentorEvidence: vi.fn(),
}));
const applicationsMocks = vi.hoisted(() => ({
  list: vi.fn(),
  mine: vi.fn(),
}));
const accessMocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  feedback: vi.fn(),
  history: vi.fn(),
  agreements: vi.fn(),
}));

vi.mock("@/features/projects/api/academic-support.api", () => ({ academicSupportApi: mocks }));
vi.mock("@/features/projects/api/mentorship-applications.api", () => ({ mentorshipApplicationsApi: applicationsMocks }));
vi.mock("@/features/projects/api/mentor-access.api", () => ({ mentorAccessApi: accessMocks }));
vi.mock("@/features/auth/api/auth.api", () => ({ authApi: { academicOnboardingOptions: async () => ({ researchAreas: ["Artificial Intelligence", "Education"] }) } }));
vi.mock("@/features/projects/components/mentor-discovery-settings", () => ({
  MentorDiscoverySettings: () => <div data-testid="mock-discovery-settings">Discovery Settings Editor</div>,
}));
vi.mock("@/features/projects/components/member-profile-consent-card", () => ({
  MemberProfileConsentCard: () => <div data-testid="mock-member-consent">Personal Consent Card</div>,
}));
vi.mock("@/features/projects/components/research-team-dossier-sheet", () => ({
  ResearchTeamDossierSheet: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" data-testid="mock-dossier-sheet">
      Team Dossier Preview
      <button type="button" onClick={onClose}>Close dossier</button>
    </div>
  ),
  formatSupportLabel: (v: string) => v,
}));
vi.mock("@/features/projects/components/mentor-recruitment-plan", () => ({
  MentorRecruitmentPlan: () => <div data-testid="mock-recruitment-plan">Recruitment Plan Body</div>,
}));
vi.mock("@/features/projects/components/mentor-role-assignments", () => ({
  MentorRoleAssignments: () => <div data-testid="mock-role-assignments">Role Assignments Body</div>,
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: Object.assign(
    (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: "owner-1" } }),
    { getState: () => ({ user: { id: "owner-1" } }) },
  ),
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "vi",
    t: (key: string) => {
      const dict: Record<string, string> = {
        "Research Mentoring": "Hướng dẫn nghiên cứu",
        "Research mentoring subtitle": "Tìm kiếm giảng viên và quản lý hoạt động hướng dẫn của nhóm.",
        "Discover Lecturers": "Khám phá giảng viên",
        "Invitations & Proposals": "Lời mời & đề nghị",
        "Team Mentors": "Cố vấn của nhóm",
        "Mentoring Settings": "Thiết lập tìm cố vấn",
        "Recruitment Plan": "Kế hoạch tìm cố vấn",
        "Manage sharing": "Quản lý chia sẻ",
        "Lecturers for your project": "Giảng viên đang nhận hướng dẫn",
        "View matching evidence": "Chuyên môn & hỗ trợ",
        "View profile": "Xem hồ sơ",
        "supervisor.accepting": "Đang nhận nhóm mới",
        "supervisor.invite": "Mời giảng viên hướng dẫn",
        "supervisor.chat": "Trao đổi",
        "supervisor.sentOn": "Ngày gửi",
        "supervisor.viewSent": "Xem lời mời đã gửi",
        "supervisor.withdraw": "Thu hồi",
        "supervisor.manageMentor": "Quản lý cố vấn",
        "End mentorship": "Kết thúc hướng dẫn",
        "Primary mentor": "Cố vấn chính",
        "Secondary mentor": "Cố vấn phụ",
        "Unassigned": "Chưa phân vai",
        "Try again": "Thử lại",
        "Unable to load mentorship requests.": "Không thể tải danh sách lời mời.",
      };
      return dict[key] ?? key;
    },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const baseMeta = { page: 1, pageSize: 10, total: 1, totalPages: 1 };
const baseProject = {
  id: "proj-1",
  title: "Nghiên cứu LLM trong giáo dục",
  summary: "Tóm tắt đề tài nghiên cứu.",
  researchAreas: ["Artificial Intelligence", "Education"],
  expertise: ["LLM Evaluation"],
  stage: "PLANNING" as const,
  mentoringNeeds: "Góp ý thiết kế thực nghiệm và đánh giá mô hình",
  discovery: "SEEKING_MENTOR" as const,
};

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;

async function tick() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
  });
}

function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="loc">{loc.search}</output>;
}

async function mountPanel(initialUrl = "/projects/proj-1?tab=support&view=find") {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialUrl]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <MentorProjectPanel projectId="proj-1" />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await tick();
  await tick();
}

function findButton(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes(label));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.workspace.mockResolvedValue({
    project: baseProject,
    accessRole: "TEAM",
    canManage: true,
    canProvideFeedback: true,
    guidance: [],
  });
  mocks.settings.mockResolvedValue({ ...baseProject, version: 1 });
  mocks.list.mockResolvedValue({
    relationships: [],
    requests: [],
    counts: { active: 0, pending: 0 },
    requestMeta: baseMeta,
    relationshipMeta: baseMeta,
  });
  mocks.mentors.mockResolvedValue({
    items: [
      {
        _id: "lect-1",
        fullName: "TS. Nguyễn Quang Minh",
        positionTitle: "Giảng viên chính",
        institutionName: "ĐH Công nghệ LumiGap",
        verifiedLecturer: true,
        acceptingMentorships: true,
        expertiseAreas: ["Artificial Intelligence", "NLP"],
        researchInterests: ["Education"],
        matchedTerms: ["Artificial Intelligence"],
        sameInstitution: true,
      },
    ],
    meta: { page: 1, pageSize: 6, total: 1, totalPages: 1 },
  });
  mocks.suggestions.mockResolvedValue({
    items: [],
    meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    counts: { pending: 0, total: 0, mine: 0, minePending: 0 },
  });
  applicationsMocks.list.mockResolvedValue({ items: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 } });
  accessMocks.workspace.mockResolvedValue({
    viewerId: "owner-1",
    projectId: "proj-1",
    title: baseProject.title,
    canManage: true,
    readOnly: false,
    page: 1,
    pageSize: 20,
    total: 1,
    hasNext: false,
    policies: [
      {
        mentorId: "lect-active",
        mentorName: "TS. Phạm Bảo Ngọc",
        invitationState: "ACCEPTED",
        policy: { id: "pol-1", requestId: "req-a", relationshipId: "rel-1", version: 1, preset: "ADVISOR", permissions: ["OVERVIEW_VIEW"], expiresAt: null, revokedAt: null, effective: true },
        shares: [],
        reviewResources: [],
      },
    ],
  });
  for (const m of ["feedback", "history", "agreements"] as const) {
    accessMocks[m].mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, hasNext: false });
  }
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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

describe("Research Mentoring & Academic Support UI/UX Refinement", () => {
  it("renames the sidebar section label to Research Mentoring while preserving the support route key", () => {
    const section = projectSections.find(s => s.key === "support");
    expect(section).toBeDefined();
    expect(section?.label).toBe("Research Mentoring");
  });

  it("renders persistent 3-tab shell, focused discovery list without consent/applicant clutter, neutral heading, and profile-first card", async () => {
    await mountPanel();

    expect(host.querySelector("h2")?.textContent).toBe("Hướng dẫn nghiên cứu");
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="Project mentorship"] [role="tab"]')];
    expect(tabs.map(t => t.textContent?.trim())).toEqual([
      "Khám phá giảng viên",
      "Lời mời & đề nghị",
      "Cố vấn của nhóm",
    ]);
    // Zero counts are suppressed
    expect(host.querySelectorAll(".mentor-tab-count")).toHaveLength(0);

    // Header actions
    expect(findButton("Thiết lập tìm cố vấn")).toBeDefined();
    expect(findButton("Kế hoạch tìm cố vấn")).toBeDefined();

    // No applicant pool or personal consent banner interrupting discovery
    expect(host.querySelector('[data-testid="mock-member-consent"]')).toBeNull();
    expect(host.textContent).not.toContain("Support offers from lecturers");

    // Compact mentoring needs strip + neutral heading + natural availability wording
    expect(host.textContent).toContain("Đang mở tìm cố vấn");
    expect(host.textContent).toContain("Chưa xác định nhu cầu hướng dẫn cụ thể");
    expect(findButton("Phân tích & xác nhận nhu cầu")).toBeDefined();
    expect(host.textContent).toContain("Giảng viên đang nhận hướng dẫn");
    expect(host.textContent).not.toContain("Giảng viên dành cho nhóm bạn");
    expect(host.textContent).toContain("Đang nhận nhóm mới");
    expect(host.textContent).not.toContain("Tự công bố đang nhận hướng dẫn");

    // Profile-first action hierarchy
    const card = host.querySelector(".mentor-result")!;
    expect(card.className).not.toContain("has-topic-match");
    expect(card.querySelector(".mentor-profile-primary")?.textContent).toContain("Chuyên môn & hỗ trợ");
    const profileLink = card.querySelector<HTMLAnchorElement>('a[href="/academics/lect-1"]');
    expect(profileLink?.textContent).toContain("Xem hồ sơ");
    expect(profileLink?.getAttribute("href")).toBe("/academics/lect-1");
    expect(card.textContent).toContain("Chuyên môn & hỗ trợ");
  });

  it("opens unified Mentoring Settings dialog with personal consent for owners and scopes non-owners to personal consent only", async () => {
    await mountPanel();
    await act(async () => findButton("Thiết lập tìm cố vấn")!.click());
    await tick();
    expect(document.querySelector('[data-testid="mock-discovery-settings"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="mock-member-consent"]')).not.toBeNull();

    // Remount as ordinary team member (canManage: false)
    await act(async () => root.unmount());
    root = createRoot(host);
    mocks.workspace.mockResolvedValue({
      project: baseProject,
      accessRole: "TEAM",
      canManage: false,
      canProvideFeedback: true,
      guidance: [],
    });
    await mountPanel();
    expect(findButton("Kế hoạch tìm cố vấn")).toBeUndefined();
    await act(async () => findButton("Thiết lập tìm cố vấn")!.click());
    await tick();
    expect(document.querySelector('[data-testid="mock-discovery-settings"]')).toBeNull();
    expect(document.querySelector('[data-testid="mock-member-consent"]')).not.toBeNull();
  });

  it("separates incoming proposals, sent invitations, internal suggestions, and paginated history in Tab 2 with contextual statuses", async () => {
    const incomingProposal = {
      kind: "REQUEST",
      id: "req-in",
      projectId: "proj-1",
      mentorUser: { _id: "lect-in", fullName: "TS. Trần Mai Phương", positionTitle: "Giảng viên", institutionName: "ĐH Y khoa" },
      requestedBy: { _id: "lect-in", fullName: "TS. Trần Mai Phương" },
      mentorRole: "UNASSIGNED",
      direction: "LECTURER_TO_PROJECT",
      status: "PENDING",
      message: "Tôi có thể hướng dẫn nhóm phần tổng quan hệ thống.",
      createdAt: "2026-11-20T08:00:00Z",
      actions: { accept: true, decline: true, cancel: false, end: false, openProject: false },
    };
    const outgoingInvitation = {
      kind: "REQUEST",
      id: "req-out",
      projectId: "proj-1",
      mentorUser: { _id: "lect-out", fullName: "TS. Lê Đức Hưng", positionTitle: "PGS.TS", institutionName: "ĐH Bách Khoa" },
      requestedBy: { _id: "owner-1", fullName: "Chủ dự án" },
      mentorRole: "UNASSIGNED",
      direction: "PROJECT_TO_LECTURER",
      status: "PENDING",
      message: "Kính mời thầy hướng dẫn đề tài.",
      createdAt: "2026-11-21T08:00:00Z",
      actions: { accept: false, decline: false, cancel: true, end: false, openProject: false },
    };
    const historicalDeclined = {
      ...outgoingInvitation,
      id: "req-hist",
      mentorUser: { _id: "lect-hist", fullName: "TS. Võ Thanh Hà" },
      status: "DECLINED",
      actions: { accept: false, decline: false, cancel: false, end: false, openProject: false },
    };

    mocks.list.mockImplementation(async (_pid: string, params: { view?: string }) => {
      if (params?.view === "history") {
        return {
          relationships: [],
          requests: [historicalDeclined],
          counts: { active: 0, pending: 2 },
          requestMeta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
          relationshipMeta: baseMeta,
        };
      }
      return {
        relationships: [],
        requests: [incomingProposal, outgoingInvitation],
        counts: { active: 0, pending: 2 },
        requestMeta: baseMeta,
        relationshipMeta: baseMeta,
      };
    });

    await mountPanel("/projects/proj-1?tab=support&view=requests");

    // Incoming sub-tab active by default
    expect(host.textContent).toContain("TS. Trần Mai Phương");
    expect(host.textContent).toContain("Chờ chủ dự án phản hồi");
    expect(host.textContent).not.toContain("TS. Lê Đức Hưng");

    // Switch to Outgoing sub-tab
    await act(async () => findButton("Lời mời đã gửi")!.click());
    await tick();
    expect(host.textContent).toContain("TS. Lê Đức Hưng");
    expect(host.textContent).toContain("Chờ giảng viên phản hồi");
    expect(host.textContent).not.toContain("TS. Trần Mai Phương");

    // Switch to History sub-tab -> calls independent history query
    await act(async () => findButton("Lịch sử")!.click());
    await tick();
    expect(mocks.list).toHaveBeenCalledWith("proj-1", { page: 1, view: "history" });
    expect(host.textContent).toContain("TS. Võ Thanh Hà");
    expect(host.textContent).toContain("Đã từ chối");
  });

  it("renders Team Mentors with single card per mentor, focused resource sharing dialog, and legacy view=access compatibility", async () => {
    const activeMentor = {
      kind: "RELATIONSHIP",
      id: "rel-1",
      projectId: "proj-1",
      mentorUser: { _id: "lect-active", fullName: "TS. Phạm Bảo Ngọc", positionTitle: "Giảng viên", institutionName: "ĐH Công nghệ", verifiedLecturer: true },
      mentorRole: "PRIMARY",
      status: "ACTIVE",
      startedAt: "2026-10-01T08:00:00Z",
      actions: { accept: false, decline: false, cancel: false, end: true, openProject: true },
    };
    const endedMentor = {
      ...activeMentor,
      id: "rel-ended",
      mentorUser: { _id: "lect-old", fullName: "TS. Cố vấn cũ" },
      status: "ENDED",
      endedAt: "2026-09-15T08:00:00Z",
      endReason: "Hoàn thành giai đoạn hướng dẫn",
      actions: { accept: false, decline: false, cancel: false, end: false, openProject: false },
    };

    mocks.list.mockResolvedValue({
      relationships: [activeMentor, endedMentor],
      requests: [],
      counts: { active: 1, pending: 0 },
      requestMeta: baseMeta,
      relationshipMeta: baseMeta,
    });

    await mountPanel("/projects/proj-1?tab=support&view=mentors");

    // Single active mentor card — not duplicated in a bottom access block
    const panel = host.querySelector("#mentor-mentors-panel-proj-1")!;
    expect(panel.textContent).toContain("TS. Phạm Bảo Ngọc");
    expect(panel.textContent).toContain("Cố vấn chính");
    expect(panel.textContent).toContain("Trao đổi");
    expect(panel.textContent).toContain("Quản lý chia sẻ");
    // Destructive End mentorship is inside the menu, NOT an exposed top-level button
    expect([...panel.querySelectorAll("button")].some(b => b.textContent?.includes("Kết thúc hướng dẫn"))).toBe(false);
    // Ended mentoring history separated in collapsible section
    expect(panel.textContent).toContain("Lịch sử hướng dẫn");
    expect(panel.textContent).toContain("TS. Cố vấn cũ");

    // Clicking Quản lý chia sẻ opens focused dialog without duplicating mentor header
    await act(async () => findButton("Quản lý chia sẻ")!.click());
    await tick();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain("Tài liệu & quyền chia sẻ · TS. Phạm Bảo Ngọc");
    expect(dialog.textContent).toContain("Tài liệu đã chia sẻ");

    // Legacy ?view=access opens Team Mentors + Sharing Dialog automatically
    await act(async () => root.unmount());
    root = createRoot(host);
    await mountPanel("/projects/proj-1?tab=support&view=access");
    expect(host.querySelector("#mentor-mentors-tab-proj-1")?.getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Tài liệu & quyền chia sẻ");
  });

  it("shows a retriable error alert instead of a false empty state when mentorship list fails", async () => {
    mocks.list.mockRejectedValue(new Error("Network error"));
    await mountPanel("/projects/proj-1?tab=support&view=mentors");
    const panel = host.querySelector("#mentor-mentors-panel-proj-1")!;
    expect(panel.querySelector('[role="alert"]')?.textContent).toContain("Không thể tải danh sách lời mời.");
    expect(panel.textContent).not.toContain("Chưa có cố vấn đang hướng dẫn");
  });
});
