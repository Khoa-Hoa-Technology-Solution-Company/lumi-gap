// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IProject, IncomingProjectInvitation } from "@trend/shared-types";
import { ProjectsListPage } from "@/pages/projects/projects-list";
import { readProjectDirectoryFilters, selectDirectoryProjects } from "../utils/project-directory";

const mocks = vi.hoisted(() => ({
  projects: vi.fn(), create: vi.fn(), respond: vi.fn(), refetch: vi.fn(), refetchInvitations: vi.fn(),
  invitations: [] as IncomingProjectInvitation[],
}));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: { user: { id: string } }) => unknown) => selector({ user: { id: "me" } }) }));
vi.mock("../hooks/use-projects", () => ({
  useProjects: mocks.projects,
  useCreateProject: () => ({ mutateAsync: mocks.create, isPending: false }),
  useMyProjectInvitations: () => ({ data: mocks.invitations, refetch: mocks.refetchInvitations }),
  useRespondToProjectInvitation: () => ({ mutateAsync: mocks.respond }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/auth/api/auth.api", () => ({ authApi: { academicOnboardingOptions: async () => ({ researchAreas: [] }) } }));

const project: IProject = {
  _id: "owned", title: "Evidence 2", description: "", researchField: "Giáo dục", status: "ACTIVE", visibility: "PRIVATE",
  ownerId: "migrated-id", accessRole: "OWNER", members: [], papers: [], paperCount: 3, memberCount: 1,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-10T00:00:00Z",
};
const shared: IProject = { ...project, _id: "shared", title: "Đổi mới giáo dục", ownerId: "other", accessRole: "MEMBER", updatedAt: "2026-10-12T00:00:00Z" };
const archived: IProject = { ...project, _id: "archived", title: "Evidence 10", status: "ARCHIVED", updatedAt: "2026-09-01T00:00:00Z" };

let root: Root, container: HTMLDivElement, client: QueryClient;
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
function Detail() { const navigate = useNavigate(); return <button onClick={() => navigate(-1)}>Back to projects</button>; }
async function render(path = "/projects") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/projects" element={<ProjectsListPage />} /><Route path="/projects/:id" element={<Detail />} /></Routes><Location /></MemoryRouter></QueryClientProvider>));
}
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim().replace(/\d+$/, "").trim() === text);
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
}
async function fill(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const prototype = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const visibleProjects = () => [...container.querySelectorAll(".project-directory-title")].map(link => link.textContent);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  sessionStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.invitations = [];
  mocks.projects.mockReturnValue({ data: [project, shared, archived], isLoading: false, isError: false, refetch: mocks.refetch });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });

it("combines URL search, status and ownership, including Vietnamese without accents and migrated IDs", async () => {
  await render("/projects?q=doi+moi&scope=SHARED&status=ACTIVE");
  expect(visibleProjects()).toEqual([shared.title]);
  expect(container.querySelector('a[href="/projects/shared?tab=papers"]')).not.toBeNull();
  expect(container.querySelector('a[href="/projects/shared?tab=members"]')).not.toBeNull();
  await click("Owned by me");
  expect(visibleProjects()).toEqual([]);
  await click("View all projects");
  expect(visibleProjects()).toEqual([shared.title, project.title, archived.title]);
  expect(container.querySelector("output")?.textContent).toBe("/projects");
});

it("sorts by update or natural name without mutating cached records and puts missing dates last", () => {
  const records = [archived, { ...project, _id: "bad-date", title: "A", updatedAt: "invalid" }, project, shared];
  const before = records.map(item => item._id);
  for (const sort of ["UPDATED", "OLDEST"] as const) {
    const result = selectDirectoryProjects(records, { search: "", status: "ALL", scope: "ALL", sort }, "me", "en");
    expect(result.at(-1)?._id).toBe("bad-date");
    expect(result[0]?._id).toBe(sort === "UPDATED" ? "shared" : "archived");
  }
  const named = selectDirectoryProjects([archived, project], { search: "", status: "ALL", scope: "OWNED", sort: "NAME" }, "me", "en");
  expect(named.map(item => item.title)).toEqual(["Evidence 2", "Evidence 10"]);
  expect(records.map(item => item._id)).toEqual(before);
  expect(readProjectDirectoryFilters(new URLSearchParams("scope=invalid&status=invalid&sort=invalid"))).toEqual({ search: "", status: "ALL", scope: "ALL", sort: "UPDATED" });
});

it("finds words across project name and field in any order, ignoring Vietnamese accents and extra spaces", () => {
  const filters = { search: "  DUC  evidence   GIAO ", status: "ALL", scope: "ALL", sort: "UPDATED" } as const;
  expect(selectDirectoryProjects([shared, archived, project], filters, "me", "vi").map(item => item._id)).toEqual(["owned", "archived"]);
  expect(selectDirectoryProjects([project, shared], { ...filters, search: "doi science" }, "me", "vi")).toEqual([]);
});

it("returns to the same filtered directory after opening a project", async () => {
  await render("/projects?scope=OWNED&status=ACTIVE&sort=NAME");
  expect(visibleProjects()).toEqual([project.title]);
  await act(async () => container.querySelector<HTMLAnchorElement>(".project-directory-title")!.click());
  expect(container.querySelector("output")?.textContent).toBe("/projects/owned");
  await click("Back to projects");
  expect(container.querySelector("output")?.textContent).toBe("/projects?scope=OWNED&status=ACTIVE&sort=NAME");
  expect(visibleProjects()).toEqual([project.title]);
});

it("opens a project from row metadata while retaining separate literature and team links", async () => {
  await render("/projects?scope=OWNED&status=ACTIVE");
  await act(async () => container.querySelector<HTMLTableCellElement>(".project-directory-status")!.click());
  expect(container.querySelector("output")?.textContent).toBe("/projects/owned");
  await click("Back to projects");
  expect(container.querySelector("output")?.textContent).toBe("/projects?scope=OWNED&status=ACTIVE");
  for (const tab of ["papers", "members"]) {
    await act(async () => container.querySelector<HTMLAnchorElement>(`a[href="/projects/owned?tab=${tab}"]`)!.click());
    expect(container.querySelector("output")?.textContent).toBe(`/projects/owned?tab=${tab}`);
    await click("Back to projects");
    expect(visibleProjects()).toEqual([project.title]);
  }
});

it("does not hijack text selection or modified clicks on row metadata", async () => {
  await render("/projects?scope=OWNED&status=ACTIVE");
  const cell = container.querySelector<HTMLTableCellElement>(".project-directory-status")!;
  for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
    await act(async () => cell.dispatchEvent(new MouseEvent("click", { bubbles: true, [modifier]: true })));
    expect(container.querySelector("output")?.textContent).toBe("/projects?scope=OWNED&status=ACTIVE");
  }
  const range = document.createRange(); range.selectNodeContents(cell);
  window.getSelection()!.addRange(range);
  await act(async () => cell.click());
  expect(container.querySelector("output")?.textContent).toBe("/projects?scope=OWNED&status=ACTIVE");
  window.getSelection()!.removeAllRanges();
  expect(container.querySelector<HTMLAnchorElement>(".project-directory-title")?.getAttribute("href")).toBe("/projects/owned");
});

it("clears only filters, preserves sorting, and explains an empty shared collection", async () => {
  mocks.projects.mockReturnValue({ data: [project], isLoading: false, isError: false });
  await render("/projects?scope=SHARED&sort=NAME");
  expect(container.textContent).toContain("No shared projects yet");
  await click("View all projects");
  expect(container.querySelector("output")?.textContent).toBe("/projects?sort=NAME");
  expect(visibleProjects()).toEqual([project.title]);
});

it("shows a recoverable fetch failure without fabricating project counts", async () => {
  mocks.projects.mockReturnValue({ data: undefined, isLoading: false, isError: true, isFetching: false, refetch: mocks.refetch });
  await render();
  expect(container.textContent).toContain("Could not load projects");
  expect(container.querySelector(".project-directory-heading-title > span")).toBeNull();
  expect(container.querySelector(".project-directory-scopes button > span")).toBeNull();
  expect(container.querySelector(".project-directory-results")).toBeNull();
  await click("Try again"); expect(mocks.refetch).toHaveBeenCalledOnce();
});

it("retains creation details on failure and opens the newly created project after retry", async () => {
  mocks.create.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ _id: "new-project" });
  await render("/projects?create=1&sort=NAME");
  await fill("#project-create-title", "  Education study  ");
  await fill("#project-create-description", "  Compare the evidence  ");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("safely recover the same project");
  expect(document.querySelector<HTMLInputElement>("#project-create-title")?.value).toBe("  Education study  ");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Education study", description: "Compare the evidence", researchAreas: [], researchApproach: "UNDECIDED", visibility: "PRIVATE", idempotencyKey: expect.any(String) }));
  expect(mocks.create.mock.calls[0]![0].idempotencyKey).toBe(mocks.create.mock.calls[1]![0].idempotencyKey);
  expect(container.querySelector("output")?.textContent).toBe("/projects/new-project?tab=papers&welcome=1");
});

it("keeps invitation responses explicit and opens the accepted workspace", async () => {
  mocks.invitations = [{ id: "invite", projectId: "invited", projectTitle: "New team", role: "MEMBER", status: "PENDING", expiresAt: "2099-10-15T00:00:00Z", createdAt: "2026-10-01T00:00:00Z", inviterName: "Colleague" }];
  mocks.respond.mockResolvedValue(undefined);
  await render();
  expect(mocks.respond).not.toHaveBeenCalled();
  await click("Decline");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Decline project invitation?");
  await click("Keep invitation");
  expect(mocks.respond).not.toHaveBeenCalled();
  await click("Accept and open");
  expect(mocks.respond).toHaveBeenCalledWith({ projectId: "invited", invitationId: "invite", decision: "accept" });
  expect(container.querySelector("output")?.textContent).toBe("/projects/invited");
});
