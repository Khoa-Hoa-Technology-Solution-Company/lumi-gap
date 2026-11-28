// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSettingsPage } from "@/pages/profile";

const mockState = vi.hoisted(() => ({
  user: {
    id: "u1",
    email: "lecturer@lumigap.test",
    fullName: "TS. Minh An",
    role: "lecturer",
    systemRole: "USER",
    academicRole: "LECTURER",
    institution: "FPT University",
    points: 10,
    credits: 50,
    emailVerifiedAt: "2026-01-01T00:00:00Z",
    authProviders: { password: true, google: true },
    onboarding: { completed: true },
  },
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: "en",
    languages: [{ code: "en", label: "English", nativeLabel: "English" }],
    setLanguage: vi.fn(),
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/features/auth", () => ({
  useCurrentUser: () => ({ data: { user: mockState.user }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useUpdateProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useChangePassword: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/features/academic-profile/hooks/use-academic-profile", () => ({
  useAcademicProfile: () => ({
    data: {
      userId: "u1",
      displayName: "TS. Minh An",
      academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED",
      verificationStatuses: { position: "VERIFIED" },
      positionTitle: "Senior Lecturer",
      biography: "Security researcher",
      publicHandle: "minh.an",
      profileVisibility: "PUBLIC",
      discoverability: { showInResearcherSearch: true, allowCollaborationRequests: true },
      affiliation: { institutionName: "FPT University", department: "Software Engineering" },
      researchAreas: ["Cybersecurity"],
      researchInterests: [],
      skills: ["Static Analysis"],
      researchMethods: ["Experimental Design"],
      academicIdentityLinks: [],
      externalIdentities: [],
      portfolio: { projects: [{ id: "p1" }], contributions: [] },
    },
    isLoading: false,
  }),
  useUpdateAcademicProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadAcademicAvatar: () => ({ mutateAsync: vi.fn(), isPending: false, isSuccess: false }),
  useRemoveAcademicAvatar: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/features/user-ai/user-ai-settings", () => ({ UserAiSettings: () => <div>AI Connections Panel</div> }));
vi.mock("@/features/personalization", () => ({ InterestsCard: () => <div>Interests Panel</div> }));
vi.mock("@/features/credits", () => ({ CreditHistory: () => <div>Credits Panel</div> }));
vi.mock("@/pages/papers/my-papers", () => ({ MyPapersPage: () => <div>My Works Panel</div> }));
vi.mock("@/pages/papers/submit-paper", () => ({ SubmitPaperPage: () => <div>Submit Paper Panel</div> }));

let container: HTMLDivElement;
let root: Root;

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="loc">{location.pathname}</output>;
}

async function renderAt(path: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/settings/:section" element={<><AccountSettingsPage /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("AccountSettingsPage Redesign", () => {
  it("renders Security & Privacy (never Profile) at /settings/security with synchronized active nav", async () => {
    await renderAt("/settings/security");
    expect(container.querySelector("h1")?.textContent).toBe("settings.security.title");
    const activeLink = container.querySelector('aside a[aria-current="page"]');
    expect(activeLink?.getAttribute("href")).toBe("/settings/security");
  });

  it("navigates via real links and keeps URL synchronized when clicking My Profile from Security", async () => {
    await renderAt("/settings/security");
    const profileLink = container.querySelector<HTMLAnchorElement>('aside a[href="/settings/profile"]')!;
    await act(async () => profileLink.click());
    expect(container.querySelector('[data-testid="loc"]')?.textContent).toBe("/settings/profile");
    expect(container.querySelector("h1")?.textContent).toBe("settings.profile.title");
    expect(container.querySelector('aside a[aria-current="page"]')?.getAttribute("href")).toBe("/settings/profile");
  });

  it("merges Submit Paper and My Papers under My Works and highlights My Works on /settings/submit-paper", async () => {
    await renderAt("/settings/submit-paper");
    expect(container.textContent).toContain("Submit Paper Panel");
    expect(container.querySelector('aside a[href="/settings/submit-paper"]')).toBeNull();
    expect(container.querySelector('aside a[aria-current="page"]')?.getAttribute("href")).toBe("/settings/my-papers");
  });

  it("renders grouped IA sections: Account, Research, and Services & Integrations", async () => {
    await renderAt("/settings/profile");
    const sidebarText = container.querySelector("aside")?.textContent ?? "";
    expect(sidebarText).toContain("settings.group.account");
    expect(sidebarText).toContain("settings.group.research");
    expect(sidebarText).toContain("settings.group.services");
  });
});
