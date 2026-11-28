// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcademicProfile } from "@trend/shared-types";
import { AcademicProfileView } from "../components/academic-profile-view";
import { AcademicProfileInlineEditor } from "../components/academic-profile-inline-editor";
import { ProfilePage } from "@/pages/profile-overview";

const mocks = vi.hoisted(() => ({ save: vi.fn(), saveMentoring: vi.fn(), close: vi.fn(), options: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
vi.mock("../hooks/use-academic-profile", () => ({
  useAcademicAvatar: (url?: string) => url ?? null,
  useAcademicCover: () => null,
  useUpdateAcademicProfile: () => ({ mutateAsync: mocks.save, isPending: false }),
  useSetPublicHandle: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadAcademicCover: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveAcademicCover: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../components/profile-avatar-dialog", () => ({ ProfileAvatarDialog: () => null }));
vi.mock("../components/student-affiliation-panel", () => ({ StudentAffiliationPanel: () => <p>Optional affiliation verification</p> }));
vi.mock("../components/position-verification-panel", () => ({
  PositionVerificationPanel: ({ open }: { open?: boolean }) => (
    <div>
      <p>Separate position verification</p>
      {open && <p>Position verification form open</p>}
    </div>
  ),
}));
vi.mock("../components/academic-identity-manager", () => ({
  AcademicIdentityManager: ({ profile }: { profile: AcademicProfile }) => (
    <div>
      {profile.academicIdentityLinks.map(link => (
        <p key={link.id}>{link.provider}</p>
      ))}
    </div>
  ),
}));
const defaultMentoringPref = {
  acceptingMentorships: true,
  canEnable: true,
  emailEnabled: true,
  locale: "en" as const,
  activeProjectCount: 0,
  maxActiveProjects: null,
  remainingSlots: null,
  externalGroupCount: null,
  supportTypes: [],
  preferredTopics: [],
  preferredRoles: [],
};
vi.mock("@/features/projects/components/mentoring-preferences", () => ({
  MentoringPreferencesPanel: () => <p>Synced mentoring preferences panel</p>,
  mentorshipError: () => "Could not complete this action. Please try again.",
  useMentoringPreferences: () => ({
    data: defaultMentoringPref,
    isLoading: false,
  }),
  useSaveMentoringPreferences: () => ({
    mutateAsync: mocks.saveMentoring,
    isPending: false,
  }),
}));
vi.mock("@/features/auth/api/auth.api", () => ({
  authApi: {
    academicOnboardingOptions: async () => ({
      institutions: [{ id: "11111111-1111-4111-8111-111111111111", name: "University of Melbourne" }],
      researchAreas: ["Education", "Software Engineering", "Artificial Intelligence"],
      programs: [],
    }),
  },
}));
vi.mock("../api/academic-profile.api", () => ({ academicProfileApi: { featuredWorkOptions: mocks.options } }));
vi.mock("@/features/auth", () => ({ useCurrentUser: () => ({ data: { user: { primaryPosition: "STUDENT" } } }) }));
vi.mock("@/features/academic-profile", async () => ({
  AcademicProfileView: (await import("../components/academic-profile-view")).AcademicProfileView,
  useAcademicProfile: () => ({ data: profile() }),
}));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

function profile(overrides: Partial<AcademicProfile> = {}): AcademicProfile {
  return {
    id: "profile",
    userId: "student",
    displayName: "Academic Student",
    points: 0,
    academicRole: "STUDENT",
    academicType: "student",
    primaryPosition: "STUDENT",
    positionCategory: "STUDENT",
    positionSource: "PREDEFINED",
    positionTitle: "Student",
    affiliation: {
      institutionName: "University of Melbourne",
      institutionId: "11111111-1111-4111-8111-111111111111",
      hostInstitution: false,
      programName: "Software Engineering",
      isCurrent: true,
      affiliationVerificationStatus: "NOT_SUBMITTED",
    },
    affiliationHistory: [],
    profileVisibility: "PUBLIC",
    discoverability: { allowCollaborationRequests: true, showInResearcherSearch: true },
    researchInterests: ["Automated Testing"],
    expertiseAreas: ["Software Engineering"],
    skills: [],
    researchMethods: [],
    researchKeywords: [],
    biography: "Researching reliable software.",
    academicIdentityLinks: [
      {
        id: "link",
        provider: "ORCID",
        verificationStatus: "UNVERIFIED",
        visibility: "PUBLIC",
        status: "SELF_DECLARED",
        connectionMethod: "MANUAL",
        createdAt: "2026-10-01",
        updatedAt: "2026-10-01",
      },
    ],
    externalIdentities: [],
    featuredWorks: [
      {
        kind: "PROJECT",
        source: "LUMIGAP",
        projectId: "project",
        canonical: true,
        title: "Research project contribution",
        href: "/projects/project",
      },
    ],
    portfolio: { projects: [], contributions: [] },
    supportAvailability: { enabled: false, types: [], preferredTopics: [] },
    reviewAvailability: { enabled: false, types: [], preferredTopics: [] },
    verificationStatus: "SELF_DECLARED",
    academicRoleVerificationStatus: "SELF_DECLARED",
    verification: { status: "SELF_DECLARED" },
    verificationEvidence: [],
    verificationRequests: [],
    profileHistory: [],
    privacy: { expertise: "PUBLIC", researchInterests: "PUBLIC", orcid: "PUBLIC" },
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
    ...overrides,
  };
}

function RouteLocation() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

async function render(element: React.ReactNode, initialEntry = "/profile") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {element}
          <RouteLocation />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function fill(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(text: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    item => item.textContent?.trim() === text,
  );
  expect(button, `Expected button "${text}"`).toBeDefined();
  await act(async () => button!.click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.save.mockResolvedValue(profile());
  mocks.options.mockResolvedValue([
    { kind: "PROJECT", projectId: "project-2", source: "LUMIGAP", canonical: true, title: "Permitted project", visibility: "RESTRICTED" },
  ]);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe("shared academic profile presentation and editing", () => {
  it("renders 4 main tabs, removes vanity counters, and shows normalized expertise without duplicates", async () => {
    await render(
      <AcademicProfileView
        profile={profile({
          academicRole: "LECTURER",
          positionTitle: "Lecturer",
          expertiseAreas: ["An ninh mạng", "Kỹ nghệ phần mềm", "Secure Coding", "Thiết kế thí nghiệm", "Research Methods"],
          researchInterests: ["An ninh mạng", "Kỹ nghệ phần mềm"],
          skills: ["Secure Coding", "Thiết kế thí nghiệm", "Research Methods"],
          researchKeywords: ["An ninh mạng", "Kỹ nghệ phần mềm"],
        })}
      />,
    );

    const tabs = Array.from(container.querySelectorAll("[role='tab']")).map(el => el.textContent?.trim());
    expect(tabs).toHaveLength(4);
    expect(container.querySelector("header")?.textContent).not.toContain("Scholarly IDs");
    expect(container.textContent).not.toMatch(/h-index|Citations|Reputation Score/);

    // Each expertise term appears ONCE in the research section (zero cross-section duplication!)
    const expertiseSection = Array.from(container.querySelectorAll("section")).find(s =>
      s.textContent?.includes("profileRedesign.expertiseTitle"),
    )!;
    expect((expertiseSection.textContent?.match(/An ninh mạng/g) ?? []).length).toBe(1);
    expect((expertiseSection.textContent?.match(/Secure Coding/g) ?? []).length).toBe(1);
    expect((expertiseSection.textContent?.match(/Thiết kế thí nghiệm/g) ?? []).length).toBe(1);
  });

  it("omits empty optional sections on another user's public profile", async () => {
    await render(
      <AcademicProfileView
        profile={profile({
          biography: "",
          expertiseAreas: [],
          researchInterests: [],
          featuredWorks: [],
          academicIdentityLinks: [],
        })}
      />,
    );
    expect(container.querySelectorAll("h2")).toHaveLength(0);
    expect(container.textContent).not.toContain("Add work");
  });

  it.each(["RESEARCHER", "LECTURER"] as const)("shows current position rather than student major for %s", async role => {
    await render(
      <AcademicProfileView
        profile={profile({
          academicRole: role,
          academicType: role === "LECTURER" ? "lecturer" : "researcher",
          positionTitle: role === "LECTURER" ? "Senior Lecturer" : "Research Engineer",
        })}
      />,
    );
    expect(container.querySelector("header")?.textContent).toContain(role === "LECTURER" ? "Senior Lecturer" : "Research Engineer");
    expect(container.querySelector("header")?.textContent).not.toContain("Software Engineering");
    if (role === "LECTURER") expect(container.textContent).toContain("Lecturer position is self-declared");
  });

  it.each([
    [false, "VERIFIED", false],
    [true, "PENDING", false],
    [true, "VERIFIED", true],
  ] as const)("renders precise FPT badge only for host=%s and status=%s", async (host, status, expected) => {
    await render(
      <AcademicProfileView
        profile={profile({
          affiliation: {
            institutionName: host ? "FPT University" : "Other university",
            hostInstitution: host,
            isCurrent: true,
            affiliationVerificationStatus: status,
          },
        })}
      />,
    );
    expect(Boolean(container.querySelector('[aria-label="FPT Education affiliation verified"]'))).toBe(expected);
  });

  it("displays Lecturer position verification separately from affiliation and marks Demo accounts clearly", async () => {
    await render(
      <AcademicProfileView
        profile={profile({
          displayName: "TS. Phạm Bảo Ngọc (Demo)",
          publicHandle: "demo.mentor.security",
          academicRole: "LECTURER",
          academicRoleVerificationStatus: "VERIFIED",
          verificationStatuses: {
            position: "VERIFIED",
            affiliation: "NOT_SUBMITTED",
            identity: "NOT_SUBMITTED",
            email: "NOT_SUBMITTED",
            orcid: "NOT_SUBMITTED",
          },
        })}
      />,
    );
    expect(container.textContent).toContain("Lecturer position verified");
    expect(container.textContent).toContain("profileRedesign.demoBadge");
    expect(container.querySelector('[aria-label="FPT Education affiliation verified"]')).toBeNull();
  });

  it("preserves legacy deep links (?tab=affiliation, ?tab=identities) by mapping to Academic Profile tab", async () => {
    await render(<ProfilePage />, "/profile?tab=affiliation&from=directory");
    expect(container.textContent).toContain("Optional affiliation verification");
    expect(container.textContent).toContain("ORCID");
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("profileRedesign.tab.academic");
  });

  it("switches embedded profile tabs without changing the account settings URL", async () => {
    const own = profile();
    await render(<AcademicProfileView profile={own} editableProfile={own} embedded />, "/settings/profile?tab=academic");
    await click("profileRedesign.tab.academic");
    expect(container.textContent).toContain("ORCID");
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/settings/profile?tab=academic");
  });

  it("hides private settings and academic review availability for a self-declared Lecturer", async () => {
    await render(
      <AcademicProfileView
        profile={profile({
          academicRole: "LECTURER",
          reviewAvailability: { enabled: true, types: ["RESEARCH_PAPER"], preferredTopics: [] },
        })}
      />,
      "/u/lecturer?tab=collaboration",
    );
    expect(container.textContent).not.toContain("profileRedesign.collab.privacyCardTitle");
    expect(container.textContent).not.toContain("Verify your Lecturer status");
    expect(container.textContent).not.toContain("Open for assigned academic reviews");
  });

  it.each([
    ["NOT_SUBMITTED", "Verify Lecturer Status"],
    ["NEEDS_MORE_INFORMATION", "Update verification"],
    ["REJECTED", "Submit new verification"],
  ] as const)("opens the existing verification flow from the reminder for %s", async (status, action) => {
    const own = profile({
      academicRole: "LECTURER",
      verificationStatuses: { position: status, affiliation: "VERIFIED", email: "VERIFIED", identity: "NOT_SUBMITTED", orcid: "NOT_SUBMITTED" },
    });
    await render(<AcademicProfileView profile={own} editableProfile={own} />);
    await click(action);
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("profileRedesign.tab.academic");
    expect(container.textContent).toContain("Position verification form open");
  });

  it("shows separated Publications, Projects, and Contributions in Tab 3 (Portfolio)", async () => {
    const own = profile({
      portfolio: {
        projects: [
          {
            projectId: "proj-1",
            title: "Secure Static Analysis Study",
            role: "MENTOR",
            status: "ACTIVE",
            visibility: "PUBLIC",
            href: "/projects/proj-1",
          },
        ],
        contributions: [
          {
            id: "c-1",
            projectId: "proj-1",
            projectTitle: "Secure Static Analysis Study",
            title: "Methodology guidance",
            description: "Reviewed experimental protocol",
            roles: ["Methodology", "Supervision"],
            category: "EXECUTION_VALIDATION",
            workDate: "2026-10-15T00:00:00Z",
            visibility: "PUBLIC",
          },
        ],
      },
    });
    await render(<AcademicProfileView profile={own} editableProfile={own} />, "/profile?tab=portfolio");
    expect(container.textContent).toContain("Secure Static Analysis Study");
    expect(container.textContent).toContain("profileRedesign.portfolio.role.MENTOR");
    expect(container.textContent).toContain("Methodology guidance");
  });

  it("lets a mentor pick support areas directly from Academic Profile expertise inside the Mentoring settings drawer", async () => {
    const own = profile({
      academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED",
      verificationStatuses: { position: "VERIFIED", affiliation: "VERIFIED", email: "VERIFIED", identity: "NOT_SUBMITTED", orcid: "NOT_SUBMITTED" },
      expertiseAreas: ["An ninh mạng"],
      skills: ["Secure Coding"],
      researchMethods: ["Thiết kế thí nghiệm"],
      supportAvailability: { enabled: true, types: [], preferredTopics: [] },
    });
    await render(<AcademicProfileView profile={own} editableProfile={own} />, "/profile?tab=collaboration");
    expect(container.textContent).toContain("Mentoring settings");
    await click("Mentoring settings");
    const clickInDoc = async (label: string) => {
      const btn = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent?.includes(label));
      expect(btn).toBeTruthy();
      await act(async () => btn!.click());
    };
    await clickInDoc("An ninh mạng");
    await clickInDoc("Secure Coding");
    await clickInDoc("Save settings");
    expect(mocks.saveMentoring).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredTopics: ["An ninh mạng", "Secure Coding"],
      }),
    );
  });

  it("edits Student program without a Current Position input", async () => {
    await render(<AcademicProfileInlineEditor section="academic" profile={profile()} onClose={mocks.close} />);
    const label = Array.from(container.querySelectorAll("label")).find(item => item.textContent?.includes("Program / Major"))!;
    expect(label.querySelector<HTMLInputElement>("input")?.value).toBe("Software Engineering");
    expect(container.textContent).not.toContain("Current Position");
    await fill(label.querySelector("input")!, "Computer Science");
    await click("Save changes");
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ academicRole: "STUDENT", affiliation: expect.objectContaining({ programName: "Computer Science" }) }),
    );
    expect(mocks.save.mock.calls[0]![0]).not.toHaveProperty("positionTitle");
  });

  it("uses normalized 3-group tag inputs and auto-derives keywords without CSV inputs", async () => {
    await render(<AcademicProfileInlineEditor section="research" profile={profile()} onClose={mocks.close} />);
    await click("Education");
    await click("Save changes");
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        expertiseAreas: ["Software Engineering", "Automated Testing", "Education"],
        researchInterests: ["Software Engineering", "Automated Testing", "Education"],
        researchKeywords: ["Software Engineering", "Automated Testing", "Education"],
      }),
    );
    expect(container.textContent).not.toContain("Separate topics with commas.");
  });

  it("selects accessible project references without manually entering database IDs", async () => {
    await render(<AcademicProfileInlineEditor section="works" profile={profile({ featuredWorks: [] })} onClose={mocks.close} />);
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(item =>
      item.textContent?.startsWith("Permitted project"),
    )!;
    await act(async () => option.click());
    await click("Save changes");
    expect(mocks.save).toHaveBeenCalledWith({
      featuredWorks: [{ kind: "PROJECT", projectId: "project-2", source: "LUMIGAP" }],
    });
  });
});
