// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@trend/shared-types";
import { resolvePostAuthPath } from "../utils/post-auth-redirect";

const mocks = vi.hoisted(() => ({
  useCurrentUser: vi.fn(),
}));

vi.mock("@/features/auth", () => ({
  useCurrentUser: mocks.useCurrentUser,
}));

vi.mock("@/components/loading", () => ({
  RouteAwarePageSkeleton: () => <div data-testid="loading">Loading</div>,
  SectionErrorState: () => <div data-testid="error">Error</div>,
}));

import { LecturerWorkspaceRoute } from "@/components/lecturer-workspace-route";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "user@uni.edu.vn",
    fullName: "Test Academic",
    role: "user",
    systemRole: "USER",
    accountStatus: "ACTIVE",
    isActive: true,
    emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    onboarding: { completed: true },
    primaryPosition: "LECTURER",
    academicRole: "LECTURER",
    academicRoleVerificationStatus: "SELF_DECLARED",
    positionVerificationStatus: "NOT_SUBMITTED",
    lecturerWorkspaceEligible: false,
    capabilities: ["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Post-Auth Redirection & Lecturer Workspace Access Control", () => {
  it("routes unverified / pending / rejected / revoked lecturers to ordinary research home, NEVER /mentor-workspace", () => {
    for (const status of ["SELF_DECLARED", "PENDING", "NEEDS_MORE_INFORMATION", "REJECTED", "INVALIDATED"] as const) {
      const u = makeUser({
        academicRole: "LECTURER",
        academicRoleVerificationStatus: status,
        lecturerWorkspaceEligible: false,
      });
      expect(resolvePostAuthPath(u)).toBe("/home");
      expect(resolvePostAuthPath(u, "/mentor-workspace")).toBe("/home");
      expect(resolvePostAuthPath(u, "/mentor-workspace?view=work")).toBe("/home");
      expect(resolvePostAuthPath(u, "/lecturer-workspace?view=reviews")).toBe("/home");
    }
  });

  it("routes verified eligible lecturers to /mentor-workspace and preserves authorized workspace deep links", () => {
    const verified = makeUser({
      academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED",
      positionVerificationStatus: "VERIFIED",
      lecturerWorkspaceEligible: true,
      capabilities: ["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT", "MENTOR_PROJECT", "STRUCTURED_REVIEW"],
    });
    expect(resolvePostAuthPath(verified)).toBe("/mentor-workspace");
    expect(resolvePostAuthPath(verified, "/mentor-workspace?view=reviews")).toBe("/mentor-workspace?view=reviews");
  });

  it("prevents unverified admins from being redirected to /mentor-workspace", () => {
    const unverifiedAdmin = makeUser({
      role: "admin",
      systemRole: "ADMIN",
      academicRole: undefined,
      primaryPosition: undefined,
      lecturerWorkspaceEligible: false,
      capabilities: ["MANAGE_SYSTEM"],
    });
    expect(resolvePostAuthPath(unverifiedAdmin)).toBe("/admin");
    expect(resolvePostAuthPath(unverifiedAdmin, "/mentor-workspace")).toBe("/admin");
  });

  it("allows an independently verified admin-lecturer to follow requested /mentor-workspace deep link", () => {
    const verifiedAdminLecturer = makeUser({
      role: "admin",
      systemRole: "ADMIN",
      academicRole: "LECTURER",
      academicRoleVerificationStatus: "VERIFIED",
      positionVerificationStatus: "VERIFIED",
      lecturerWorkspaceEligible: true,
      capabilities: ["MANAGE_SYSTEM", "MENTOR_PROJECT", "STRUCTURED_REVIEW"],
    });
    expect(resolvePostAuthPath(verifiedAdminLecturer, "/mentor-workspace?view=projects")).toBe("/mentor-workspace?view=projects");
  });
});

describe("<LecturerWorkspaceRoute /> route guard", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderAt(initialPath: string, user: User) {
    mocks.useCurrentUser.mockReturnValue({
      data: { user },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialPath]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route element={<LecturerWorkspaceRoute />}>
              <Route path="/mentor-workspace" element={<div data-testid="lecturer-shell">Lecturer Workspace Mounted</div>} />
            </Route>
            <Route path="/settings/verification/lecturer" element={<div data-testid="verify-page">Verification Required Page</div>} />
            <Route path="/home" element={<div data-testid="home-page">Member Home</div>} />
            <Route path="/admin" element={<div data-testid="admin-page">Admin Home</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  it("redirects self-declared/unverified lecturers to /settings/verification/lecturer without mounting workspace shell", async () => {
    await renderAt("/mentor-workspace", makeUser({ academicRole: "LECTURER", lecturerWorkspaceEligible: false }));
    expect(document.querySelector('[data-testid="lecturer-shell"]')).toBeNull();
    expect(document.querySelector('[data-testid="verify-page"]')).not.toBeNull();
  });

  it("redirects students and researchers to /home without mounting workspace shell", async () => {
    await renderAt("/mentor-workspace", makeUser({ academicRole: "STUDENT", primaryPosition: "STUDENT", lecturerWorkspaceEligible: false }));
    expect(document.querySelector('[data-testid="lecturer-shell"]')).toBeNull();
    expect(document.querySelector('[data-testid="home-page"]')).not.toBeNull();
  });

  it("redirects unverified admins to /admin without mounting workspace shell", async () => {
    await renderAt(
      "/mentor-workspace",
      makeUser({ role: "admin", systemRole: "ADMIN", academicRole: undefined, lecturerWorkspaceEligible: false }),
    );
    expect(document.querySelector('[data-testid="lecturer-shell"]')).toBeNull();
    expect(document.querySelector('[data-testid="admin-page"]')).not.toBeNull();
  });

  it("mounts Lecturer Workspace for eligible verified lecturers", async () => {
    await renderAt(
      "/mentor-workspace",
      makeUser({
        academicRole: "LECTURER",
        academicRoleVerificationStatus: "VERIFIED",
        positionVerificationStatus: "VERIFIED",
        lecturerWorkspaceEligible: true,
      }),
    );
    expect(document.querySelector('[data-testid="lecturer-shell"]')).not.toBeNull();
  });
});
