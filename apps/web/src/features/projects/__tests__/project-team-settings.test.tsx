// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IProject } from "@trend/shared-types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectTeamSettings } from "../components/project-team-settings";

const mocks = vi.hoisted(() => ({ update: vi.fn(), team: vi.fn(), retry: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string) => key }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "owner" } }) }));
vi.mock("@/features/auth/api/auth.api", () => ({ authApi: { academicOnboardingOptions: async () => ({ researchAreas: [] }) } }));
vi.mock("../api/academic-support.api", () => ({ academicSupportApi: { settings: async () => ({ discovery: "CLOSED", summary: "", expertise: [] }) } }));
vi.mock("../hooks/use-projects", () => ({
  useProjectTeam: mocks.team,
  useUpdateProject: () => ({ mutateAsync: mocks.update, isPending: false }),
  useArchiveProject: () => ({ isPending: false }), useRestoreProject: () => ({ isPending: false }),
  useDeleteProject: () => ({ isPending: false }), useLeaveProject: () => ({ isPending: false }),
}));
vi.mock("../components/project-mentor-summary", () => ({ ProjectMentorSummary: () => <p>Academic mentorship is separate</p> }));
vi.mock("../components/project-members-tab", () => ({ ProjectMembersTab: () => <p>Current project members</p> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const project: IProject = { _id: "project", title: "Research idea", visibility: "PRIVATE", status: "PLANNING", ownerId: "owner", accessRole: "OWNER", version: 3, memberCount: 1, paperCount: 0, members: [], papers: [], updatedAt: "2026-10-14T10:00:00Z", createdAt: "2026-10-14T10:00:00Z" };
let root: Root, container: HTMLDivElement, client: QueryClient;
async function render(value = project, path = "/projects/project?tab=members&team=settings") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ProjectTeamSettings project={value} /></MemoryRouter></QueryClientProvider>));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks();
  mocks.team.mockReturnValue({ isLoading: false, isError: true, refetch: mocks.retry });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });

it("keeps edits on a version conflict and asks for a refresh", async () => {
  mocks.update.mockRejectedValue({ response: { status: 409 } }); await render();
  const title = container.querySelector<HTMLInputElement>("#project-settings-title")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Changed locally"); title.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ title: "Changed locally", expectedVersion: 3 }));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Refresh before saving");
  expect(title.value).toBe("Changed locally");
});

it("makes project settings read-only for members and hides discovery management", async () => {
  await render({ ...project, accessRole: "MEMBER", ownerId: "other" });
  expect(container.querySelector<HTMLFieldSetElement>("form fieldset")?.disabled).toBe(true);
  expect(container.textContent).toContain("Only the owner can change project settings");
  expect(container.textContent).not.toContain("Save project settings");
  expect(container.textContent).not.toContain("Save discovery settings");
});

it("preserves archive read access while preventing settings and discovery writes", async () => {
  await render({ ...project, status: "ARCHIVED" });
  expect(container.querySelector<HTMLFieldSetElement>("form fieldset")?.disabled).toBe(true);
  expect(container.textContent).not.toContain("Save project settings");
  expect(container.textContent).not.toContain("Save discovery settings");
  expect(container.textContent).toContain("Archiving preserves research and history");
});

it("supports keyboard section switching and recovers a failed team load", async () => {
  await render();
  const settings = container.querySelector<HTMLButtonElement>("#project-settings-tab")!;
  await act(async () => settings.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
  expect(container.querySelector("#project-people-tab")?.getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement?.id).toBe("project-people-tab");
  expect(container.textContent).toContain("Could not load the team");
  const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Try again")!;
  await act(async () => retry.click());
  expect(mocks.retry).toHaveBeenCalledOnce();
});

it.each(["Member pages", "Invitation pages"])("returns to an available page when %s shrink after a team update", async label => {
  let totalPages = 2;
  mocks.team.mockImplementation((_id: string, page: number, invitationPage: number) => ({
    isLoading: false, isError: false,
    data: { members: [], invitations: [], memberMeta: { page, totalPages: label === "Member pages" ? totalPages : 1 }, invitationMeta: { page: invitationPage, totalPages: label === "Invitation pages" ? totalPages : 1 } },
  }));
  await render(project, "/projects/project?tab=members");
  await act(async () => container.querySelector<HTMLButtonElement>(`nav[aria-label="${label}"] button:last-child`)!.click());
  expect(mocks.team).toHaveBeenLastCalledWith("project", label === "Member pages" ? 2 : 1, label === "Invitation pages" ? 2 : 1);
  totalPages = 1;
  await render(project, "/projects/project?tab=members");
  expect(mocks.team).toHaveBeenLastCalledWith("project", 1, 1);
});
