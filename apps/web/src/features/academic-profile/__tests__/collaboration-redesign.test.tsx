// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcademicProfile, MentoringPreferences } from "@trend/shared-types";
import { AcademicProfileView } from "../components/academic-profile-view";

const mocks = vi.hoisted(() => ({
  saveProfile: vi.fn(),
  saveMentoring: vi.fn(),
  mentoringPref: {
    acceptingMentorships: true,
    effectiveAcceptingMentorships: true,
    capacityReached: false,
    canEnable: true,
    emailEnabled: true,
    locale: "vi" as const,
    activeProjectCount: 1,
    maxActiveProjects: 4 as number | null,
    remainingSlots: 3 as number | null,
    externalGroupCount: null as number | null,
    supportTypes: ["RESEARCH_DIRECTION", "RESEARCH_METHODOLOGY"],
    preferredTopics: ["Trí tuệ nhân tạo"],
    preferredRoles: ["PRIMARY"],
  } as MentoringPreferences,
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "vi",
    t: (key: string) => {
      const dict: Record<string, string> = {
        "profileRedesign.tab.overview": "Tổng quan",
        "profileRedesign.tab.academic": "Hồ sơ học thuật",
        "profileRedesign.tab.portfolio": "Công trình nghiên cứu",
        "profileRedesign.tab.collaboration": "Hợp tác",
        "profileRedesign.collab.researchDesc": "Cho phép các nhà nghiên cứu và nhóm dự án gửi lời mời hợp tác cùng bạn.",
        "profileRedesign.collab.researchEnabled": "Đang mở nhận lời mời hợp tác nghiên cứu",
        "profileRedesign.collab.researchDisabled": "Tạm tắt lời mời hợp tác nghiên cứu",
        "profileRedesign.collab.reviewDesc": "Nhận lời mời phản biện chính thức khi được nhóm nghiên cứu gửi yêu cầu.",
        "profileRedesign.academic.status.NOT_SUBMITTED": "Chưa xác minh",
        "profileRedesign.academic.status.PENDING": "Đang chờ duyệt",
        "profileRedesign.acceptingMentoring": "Đang nhận hướng dẫn",
        "profileRedesign.openToCollaborate": "Sẵn sàng hợp tác nghiên cứu",
        "Open for assigned academic reviews": "Đang nhận lời mời phản biện học thuật",
        "Research paper": "Bài báo khoa học",
      };
      return dict[key] ?? key;
    },
  }),
}));

vi.mock("../hooks/use-academic-profile", () => ({
  useAcademicAvatar: () => null,
  useAcademicCover: () => null,
  useUpdateAcademicProfile: () => ({ mutateAsync: mocks.saveProfile, isPending: false }),
}));

vi.mock("@/features/projects/components/mentoring-preferences", () => ({
  mentorshipError: () => "Không thể lưu thiết lập",
  useMentoringPreferences: () => ({ data: mocks.mentoringPref, isLoading: false }),
  useSaveMentoringPreferences: () => ({ mutateAsync: mocks.saveMentoring, isPending: false }),
}));

vi.mock("@/features/projects/components/invite-mentor-from-profile", () => ({
  InviteMentorFromProfile: () => <button type="button">Mời giảng viên hướng dẫn</button>,
}));

vi.mock("../components/profile-avatar-dialog", () => ({ ProfileAvatarDialog: () => null }));
vi.mock("../components/student-affiliation-panel", () => ({ StudentAffiliationPanel: () => null }));
vi.mock("../components/position-verification-panel", () => ({ PositionVerificationPanel: () => null }));
vi.mock("../components/academic-identity-manager", () => ({ AcademicIdentityManager: () => null }));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

function makeProfile(overrides: Partial<AcademicProfile> = {}): AcademicProfile {
  return {
    id: "ap-1",
    userId: "u-lec-1",
    points: 50,
    publicHandle: "ts-minh-anh",
    academicRole: "LECTURER",
    academicType: "lecturer",
    primaryPosition: "LECTURER",
    positionCategory: "LECTURER",
    positionSource: "PREDEFINED",
    positionTitle: "Giảng viên chính",
    displayName: "TS. Nguyễn Minh Anh (Demo)",
    profileVisibility: "PUBLIC",
    discoverability: { allowCollaborationRequests: true, showInResearcherSearch: true },
    privacy: { orcid: "PUBLIC", researchInterests: "PUBLIC", expertise: "PUBLIC" },
    affiliation: {
      institutionName: "Đại học FPT",
      department: "Khoa CNTT",
      positionTitle: "Giảng viên chính",
      isCurrent: true,
      isPrimary: true,
      affiliationVerificationStatus: "VERIFIED",
      positionVerificationStatus: "VERIFIED",
    },
    affiliationHistory: [],
    researchInterests: ["Trí tuệ nhân tạo"],
    expertiseAreas: ["Trí tuệ nhân tạo", "Kỹ nghệ phần mềm"],
    researchSpecializations: [],
    skills: ["Python"],
    researchMethods: ["Nghiên cứu thực nghiệm"],
    researchKeywords: [],
    biography: "Giảng viên CNTT.",
    academicIdentityLinks: [],
    externalIdentities: [],
    featuredWorks: [],
    portfolio: {
      projects: [],
      contributions: [],
      mentoringActivity: {
        acceptingNew: true,
        capacityReached: false,
        activeProjectCount: 1,
        maxActiveProjects: 4,
        remainingSlots: 3,
        externalGroupCount: null,
        completedMentorshipCount: 2,
        endedMentorshipCount: 0,
        privateActiveCount: 0,
        currentProjects: [
          {
            projectId: "p-1",
            title: "Phân tích lỗ hổng bằng LLM",
            researchField: "Kỹ nghệ phần mềm",
            mentorRole: "PRIMARY",
            stage: "IN_PROGRESS",
            mentorshipStatus: "ACTIVE",
            publicationStatus: "under_review",
            updatedAt: "2026-11-26T00:00:00.000Z",
          },
        ],
      },
    },
    supportAvailability: {
      enabled: true,
      types: ["RESEARCH_DIRECTION", "RESEARCH_METHODOLOGY"],
      preferredTopics: ["Trí tuệ nhân tạo"],
      maxActiveProjects: 4,
      externalGroupCount: null,
    },
    reviewAvailability: {
      enabled: true,
      types: ["RESEARCH_PAPER"],
      preferredTopics: ["Trí tuệ nhân tạo"],
      maximumActiveReviews: 3,
    },
    verificationStatus: "VERIFIED",
    academicRoleVerificationStatus: "VERIFIED",
    verificationStatuses: {
      identity: "VERIFIED",
      email: "VERIFIED",
      affiliation: "VERIFIED",
      position: "VERIFIED",
      orcid: "NOT_SUBMITTED",
    },
    verification: { status: "VERIFIED" },
    verificationEvidence: [],
    verificationRequests: [],
    profileHistory: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-11-26T00:00:00.000Z",
    ...overrides,
  };
}

async function renderView(node: ReactNode, path = "/profile?tab=collaboration") {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
      </QueryClientProvider>,
    );
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.saveProfile.mockReset().mockResolvedValue({});
  mocks.saveMentoring.mockReset().mockResolvedValue(mocks.mentoringPref);
  mocks.mentoringPref = {
    acceptingMentorships: true,
    effectiveAcceptingMentorships: true,
    capacityReached: false,
    canEnable: true,
    emailEnabled: true,
    locale: "vi",
    activeProjectCount: 1,
    maxActiveProjects: 4,
    remainingSlots: 3,
    externalGroupCount: null,
    supportTypes: ["RESEARCH_DIRECTION", "RESEARCH_METHODOLOGY"],
    preferredTopics: ["Trí tuệ nhân tạo"],
    preferredRoles: ["PRIMARY"],
  };
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});

describe("Academic Profile Collaboration Tab Redesign", () => {
  it("renders three independent accessible switches, zero raw checkboxes, clean tab labels, and no operational project dump or giant privacy card", async () => {
    const p = makeProfile();
    await renderView(<AcademicProfileView profile={p} editableProfile={p} />);

    const switches = container.querySelectorAll<HTMLButtonElement>('button[role="switch"]');
    expect(switches).toHaveLength(3);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);

    // Tab terminology clarity
    const tabs = Array.from(container.querySelectorAll('[role="tab"]')).map(el => el.textContent);
    expect(tabs.some(label => label?.includes("Công trình nghiên cứu"))).toBe(true);
    expect(tabs.some(label => label?.includes("Đóng góp nghiên cứu"))).toBe(true);

    // No operational mentored project list or giant privacy card inside owner Collaboration settings
    expect(container.textContent).not.toContain("Phân tích lỗ hổng bằng LLM");
    expect(container.textContent).not.toContain("Quyền riêng tư & cài đặt tài khoản");
    expect(container.textContent).toContain("Quản lý nhóm hướng dẫn");

    // Independent switch mutations
    await act(async () => switches[0]!.click());
    expect(mocks.saveProfile).toHaveBeenCalledWith({ discoverability: { allowCollaborationRequests: false } });

    await act(async () => switches[1]!.click());
    expect(mocks.saveMentoring).toHaveBeenCalledWith({ acceptingMentorships: false });

    await act(async () => switches[2]!.click());
    expect(mocks.saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewAvailability: expect.objectContaining({ enabled: false }),
      }),
    );
  });

  it("shows configured-vs-effective availability when mentoring capacity is reached and hides false active header badge", async () => {
    mocks.mentoringPref = {
      ...mocks.mentoringPref,
      acceptingMentorships: true,
      effectiveAcceptingMentorships: false,
      capacityReached: true,
      activeProjectCount: 2,
      maxActiveProjects: 2,
      remainingSlots: 0,
    };
    const p = makeProfile({
      portfolio: {
        projects: [],
        contributions: [],
        mentoringActivity: {
          acceptingNew: false,
          capacityReached: true,
          activeProjectCount: 2,
          maxActiveProjects: 2,
          remainingSlots: 0,
          externalGroupCount: null,
          completedMentorshipCount: 0,
          endedMentorshipCount: 0,
          privateActiveCount: 0,
          currentProjects: [],
        },
      },
    });
    await renderView(<AcademicProfileView profile={p} editableProfile={p} />);

    expect(container.textContent).toContain("Đã bật nhận hướng dẫn · Hiện đã đạt giới hạn tiếp nhận");
    const header = container.querySelector("header")!;
    expect(header.textContent).not.toContain("Đang nhận hướng dẫn");
  });

  it("displays 'Chưa cung cấp giới hạn' when maxActiveProjects is unset and distinguishes null vs 0 external groups", async () => {
    mocks.mentoringPref = {
      ...mocks.mentoringPref,
      maxActiveProjects: null,
      remainingSlots: null,
      externalGroupCount: null,
    };
    const p = makeProfile();
    await renderView(<AcademicProfileView profile={p} editableProfile={p} />);
    expect(container.textContent).toContain("Chưa cung cấp giới hạn");
    expect(container.textContent).not.toContain("Nhóm bên ngoài");

    mocks.mentoringPref = { ...mocks.mentoringPref, externalGroupCount: 0 };
    await renderView(<AcademicProfileView profile={p} editableProfile={p} />);
    expect(container.textContent).toContain("Nhóm bên ngoài (tự khai báo): 0");
  });

  it("renders only Research collaboration for Student role and verification gate for Unverified Lecturer", async () => {
    const student = makeProfile({
      academicRole: "STUDENT",
      academicType: "student",
      primaryPosition: "STUDENT",
      positionCategory: "STUDENT",
      academicRoleVerificationStatus: "SELF_DECLARED",
      verificationStatuses: { identity: "NOT_SUBMITTED", email: "NOT_SUBMITTED", affiliation: "NOT_SUBMITTED", position: "NOT_SUBMITTED", orcid: "NOT_SUBMITTED" },
    });
    await renderView(<AcademicProfileView profile={student} editableProfile={student} />);
    expect(container.querySelectorAll('button[role="switch"]')).toHaveLength(1);
    expect(container.textContent).not.toContain("Hướng dẫn nghiên cứu");
    expect(container.textContent).not.toContain("Phản biện học thuật");

    const unverifiedLecturer = makeProfile({
      academicRoleVerificationStatus: "SELF_DECLARED",
      verificationStatuses: { identity: "NOT_SUBMITTED", email: "VERIFIED", affiliation: "NOT_SUBMITTED", position: "NOT_SUBMITTED", orcid: "NOT_SUBMITTED" },
    });
    await renderView(<AcademicProfileView profile={unverifiedLecturer} editableProfile={unverifiedLecturer} />);
    expect(container.querySelectorAll('button[role="switch"]')).toHaveLength(1);
    expect(container.textContent).toContain("Xác minh vị trí giảng viên");
    expect(container.textContent).toContain("Xác minh giảng viên");
    expect(container.textContent).not.toContain("Thiết lập hướng dẫn");
  });

  it("shows discreet privacy notice only when profile visibility or search restricts discovery", async () => {
    const restricted = makeProfile({
      profileVisibility: "PRIVATE",
      discoverability: { allowCollaborationRequests: true, showInResearcherSearch: false },
    });
    await renderView(<AcademicProfileView profile={restricted} editableProfile={restricted} />);
    expect(container.textContent).toContain("Cài đặt quyền riêng tư");
    expect(container.querySelector('a[href="/settings/profile"]')).not.toBeNull();
  });

  it("renders public visitor view without switches, settings links, external groups, or internal review workflow badges", async () => {
    const p = makeProfile({
      portfolio: {
        projects: [],
        contributions: [],
        mentoringActivity: {
          acceptingNew: true,
          capacityReached: false,
          activeProjectCount: 1,
          maxActiveProjects: 4,
          remainingSlots: 3,
          externalGroupCount: null,
          completedMentorshipCount: 2,
          endedMentorshipCount: 0,
          privateActiveCount: 0,
          currentProjects: [
            {
              projectId: "p-1",
              title: "Dự án công khai AI",
              researchField: "AI",
              mentorRole: "PRIMARY",
              stage: "IN_PROGRESS",
              mentorshipStatus: "ACTIVE",
              publicationStatus: "under_review",
              updatedAt: "2026-11-26T00:00:00.000Z",
            },
          ],
        },
      },
    });
    await renderView(<AcademicProfileView profile={p} />);
    expect(container.querySelectorAll('button[role="switch"]')).toHaveLength(0);
    expect(container.textContent).not.toContain("Thiết lập hướng dẫn");
    expect(container.textContent).not.toContain("Thiết lập phản biện");
    expect(container.textContent).not.toContain("Đang trong quy trình xét duyệt");
    expect(container.textContent).toContain("Mời giảng viên hướng dẫn");
    expect(container.textContent).toContain("Dự án công khai AI");

    // When capacity is reached, hide Invite button on public profile
    const fullLecturer = makeProfile({
      portfolio: {
        projects: [],
        contributions: [],
        mentoringActivity: {
          acceptingNew: false,
          capacityReached: true,
          activeProjectCount: 2,
          maxActiveProjects: 2,
          remainingSlots: 0,
          externalGroupCount: null,
          completedMentorshipCount: 0,
          endedMentorshipCount: 0,
          privateActiveCount: 0,
          currentProjects: [],
        },
      },
    });
    await renderView(<AcademicProfileView profile={fullLecturer} />);
    expect(container.textContent).toContain("Hiện đã đạt giới hạn tiếp nhận nhóm mới");
    expect(container.textContent).not.toContain("Mời giảng viên hướng dẫn");
  });

  it("opens Peer review settings drawer and persists review types", async () => {
    const p = makeProfile();
    await renderView(<AcademicProfileView profile={p} editableProfile={p} />);
    const openReviewBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("Thiết lập phản biện"),
    )!;
    await act(async () => openReviewBtn.click());
    expect(document.body.textContent).toContain("Thiết lập phản biện học thuật");
    const saveBtn = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b =>
      b.textContent?.includes("Lưu thiết lập"),
    )!;
    await act(async () => saveBtn.click());
    expect(mocks.saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewAvailability: expect.objectContaining({
          enabled: true,
          types: ["RESEARCH_PAPER"],
        }),
      }),
    );
  });
});
