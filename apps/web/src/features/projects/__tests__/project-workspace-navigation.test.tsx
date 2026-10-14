// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { IProject } from "@trend/shared-types";
import { ProjectsWorkspacePage, ProjectWorkspaceStart } from "@/pages/projects/projects-workspace";
import { projectWorkspaceHref } from "../utils/project-workspace-navigation";

const mocks = vi.hoisted(() => ({ projects: vi.fn(), user: { id: "me", systemRole: "USER", emailVerifiedAt: "2026-01-01" } as { id: string; systemRole: string; emailVerifiedAt: string } | null }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: { user: typeof mocks.user }) => unknown) => selector({ user: mocks.user }) }));
vi.mock("../hooks/use-projects", () => ({
  useProjects: mocks.projects,
  useCreateProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMyProjectInvitations: () => ({ data: [], refetch: vi.fn() }),
  useRespondToProjectInvitation: () => ({ mutateAsync: vi.fn() }),
}));

const owned: IProject = { _id: "owned", title: "Evidence study", status: "ACTIVE", visibility: "PRIVATE", ownerId: "me", accessRole: "OWNER", papers: [], members: [], paperCount: 0, memberCount: 1, createdAt: "2026-10-01", updatedAt: "2026-10-08" };
const shared: IProject = { ...owned, _id: "shared", title: "Team study", accessRole: "MEMBER", ownerId: "other", updatedAt: "2026-10-12" };
const archived: IProject = { ...owned, _id: "archived", title: "Archived study", status: "ARCHIVED", updatedAt: "2026-10-13" };
let root: Root, container: HTMLDivElement;
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
function ProjectContent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  return <><h1>Project {id}</h1><input aria-label="Project draft" value={draft} onChange={event => setDraft(event.target.value)} /><button onClick={() => navigate(-1)}>Back</button></>;
}
async function render(path = "/projects") {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route path="/projects" element={<ProjectsWorkspacePage />}><Route index element={<ProjectWorkspaceStart />} /><Route path=":id" element={<ProjectContent />} /></Route>
  </Routes><Location /></MemoryRouter>));
}
async function clickProject(id: string) { await act(async () => container.querySelector<HTMLAnchorElement>(`.project-switcher-list a[href^="/projects/${id}"]`)!.click()); }
async function fillSearch(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.user = { id: "me", systemRole: "USER", emailVerifiedAt: "2026-01-01" };
  mocks.projects.mockReturnValue({ data: [owned, shared, archived], isLoading: false, isFetching: false, isError: false });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("opens the most recently updated non-archived project without a directory click, then switches in place", async () => {
  await render("/projects?scope=OWNED&status=ARCHIVED&sort=NAME");
  expect(container.querySelector("output")?.textContent).toBe("/projects/shared");
  expect(container.querySelector('[aria-current="page"]')?.textContent).toContain(shared.title);
  const sidebar = container.querySelector("aside");
  await clickProject("owned");
  expect(container.querySelector("h1")?.textContent).toBe("Project owned");
  expect(container.querySelector("aside")).toBe(sidebar);
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Back")!.click());
  expect(container.querySelector("output")?.textContent).toBe("/projects/shared");
});

it("keeps filters and the selected section when switching, removes project-specific IDs, and resets project drafts", async () => {
  await render("/projects/shared?tab=submissions&submission=old-submission&screening=INCLUDED&sort=NAME");
  const input = container.querySelector<HTMLInputElement>('[aria-label="Project draft"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Old draft"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await fillSearch("study");
  await clickProject("owned");
  expect(container.querySelector("output")?.textContent).toBe("/projects/owned?q=study&tab=submissions");
  expect(container.querySelector<HTMLInputElement>('[aria-label="Project draft"]')?.value).toBe("");
  expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("study");
});

it("keeps the open project when a filter hides it and mobile still offers the full library", async () => {
  await render("/projects/shared");
  await fillSearch("Evidence");
  expect(container.querySelector("output")?.textContent).toBe("/projects/shared?q=Evidence");
  expect(container.querySelectorAll(".project-switcher-list a")).toHaveLength(1);
  const selector = container.querySelector<HTMLSelectElement>("#project-switcher-select")!;
  expect(selector.value).toBe("shared");
  expect([...selector.options].filter(option => option.value).map(option => option.value)).toEqual(["owned", "shared", "archived"]);
  await act(async () => { selector.value = "owned"; selector.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.querySelector("h1")?.textContent).toBe("Project owned");
});

it("preserves direct links even when the project is not in the user's own library", async () => {
  await render("/projects/public-summary?tab=members");
  expect(container.querySelector("h1")?.textContent).toBe("Project public-summary");
  expect(container.querySelector('[aria-current="page"]')).toBeNull();
});

it("does not request the personal library for a guest viewing a public detail link", async () => {
  mocks.user = null;
  await render("/projects/public-summary");
  expect(container.querySelector("h1")?.textContent).toBe("Project public-summary");
  expect(container.querySelector("aside")).toBeNull();
  expect(mocks.projects).not.toHaveBeenCalled();
});

it("uses only search and clears obsolete ownership, status and sort parameters without changing the project or section", async () => {
  await render("/projects/shared?tab=papers&q=study&scope=OWNED&status=PLANNING&sort=NAME");
  expect(container.querySelector("output")?.textContent).toBe("/projects/shared?tab=papers&q=study");
  expect(container.querySelector("h1")?.textContent).toBe("Project shared");
  expect([...container.querySelectorAll(".project-switcher-copy strong")].map(item => item.textContent)).toEqual([archived.title, shared.title, owned.title]);
  expect(container.querySelector('input[type="search"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Filter and sort projects"]')).toBeNull();
  expect(container.querySelector(".project-switcher [role='dialog']")).toBeNull();
});

it("clears an unmatched search and restores the project list while retaining the open project and section", async () => {
  await render("/projects/shared?q=missing&scope=OWNED&status=ACTIVE&sort=NAME&tab=papers");
  expect(container.querySelectorAll(".project-switcher-list a")).toHaveLength(0);
  const clearSearch = container.querySelector<HTMLButtonElement>(".project-switcher-no-matches button")!;
  expect(clearSearch.textContent).toBe("Clear search");
  await act(async () => clearSearch.click());
  expect(container.querySelector("output")?.textContent).toBe("/projects/shared?tab=papers");
  expect([...container.querySelectorAll(".project-switcher-copy strong")].map(item => item.textContent)).toEqual([archived.title, shared.title, owned.title]);
  expect(container.querySelector("h1")?.textContent).toBe("Project shared");
});

it("waits for invalidated project data before auto-opening, including after leaving or deleting a project", async () => {
  mocks.projects.mockReturnValue({ data: [owned, shared], isLoading: false, isFetching: true, isError: false });
  await render();
  expect(container.querySelector("output")?.textContent).toBe("/projects");
  mocks.projects.mockReturnValue({ data: [owned], isLoading: false, isFetching: false, isError: false });
  await render();
  expect(container.querySelector("output")?.textContent).toBe("/projects/owned");
});

it("shows an empty workspace without inventing a selected project", async () => {
  mocks.projects.mockReturnValue({ data: [], isLoading: false, isFetching: false, isError: false });
  await render();
  expect(container.querySelector("h1")?.textContent).toBe("Your research workspace");
  expect(container.querySelector("output")?.textContent).toBe("/projects");
  expect(container.textContent).toContain("Create your first project");
});

it("escapes project IDs and strips creation and record-specific parameters from switch links", () => {
  expect(projectWorkspaceHref("a/b?c", new URLSearchParams("create=1&tab=papers&submission=other&screening=EXCLUDED&q=hello&scope=SHARED&status=ARCHIVED&sort=NAME"))).toBe("/projects/a%2Fb%3Fc?q=hello&tab=papers");
});
