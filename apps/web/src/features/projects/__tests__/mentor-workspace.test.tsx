// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MentorWorkspaceData } from "@trend/shared-types";
import { MentorWorkQueue, MentorWorkRows } from "../components/mentor-work-queue";
import { MentorProjectTasks } from "../components/mentor-project-tasks";
import { MentorWorkspacePage } from "@/pages/academics/mentor-workspace";
import { mentorWorkspaceEn } from "@/i18n/locales/mentor-workspace";
import { vi as vietnameseDictionary } from "@/i18n/locales/vi";
import { mentorWorkspaceDestination } from "../utils/mentor-workspace-navigation";

const mocks = vi.hoisted(() => ({ actor: "mentor", read: vi.fn(), profile: { data: { academicRole: "LECTURER", academicRoleVerificationStatus: "VERIFIED", verificationStatuses: { position: "VERIFIED" } }, isLoading: false, isError: false, refetch: vi.fn() } }));
vi.mock("../api/mentor-workspace.api", () => ({ mentorWorkspaceApi: { read: mocks.read } }));
vi.mock("@/features/academic-profile/hooks/use-academic-profile", () => ({ useAcademicProfile: () => mocks.profile }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (v: unknown) => unknown) => select({ user: { id: mocks.actor } }) }));
vi.mock("@/i18n", () => ({ LanguageSwitcher: () => null, useI18n: () => ({ language: "en", t: (key: string, values: Record<string, string | number> = {}) => {
  let result = mentorWorkspaceEn[key as keyof typeof mentorWorkspaceEn] ?? key;
  for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{{${name}}}`, String(value));
  return result;
} }) }));
vi.mock("../components/workspace-discussions", () => ({ DiscussionDetail: ({ selected }: { selected: string }) => <p>Shared question: {selected}</p> }));
vi.mock("@/pages/academics/academic-support", () => ({ AcademicSupportPage: ({ embedded }: { embedded: boolean }) => <p>Existing support screen: {String(embedded)}</p> }));
vi.mock("@/pages/notifications", () => ({ NotificationsPage: ({ embedded }: { embedded: boolean }) => <p>Existing notification screen: {String(embedded)}</p> }));
vi.mock("@/pages/academics/mentor-project", () => ({ MentorProjectPage: ({ embedded }: { embedded: boolean }) => <p>Existing project screen: {String(embedded)}</p> }));
vi.mock("@/pages/reviews/review-dashboard", () => ({ ReviewDashboardPage: () => <p>Existing Review Center</p> }));
vi.mock("@/pages/reviews/review-templates", () => ({ ReviewTemplatesPage: () => <p>Existing Review Templates</p> }));

let root: Root, host: HTMLDivElement, client: QueryClient, data: MentorWorkspaceData;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.removeItem("lumigap.sidebar.collapsed");
  mocks.actor = "mentor";
  mocks.profile.data = { academicRole: "LECTURER", academicRoleVerificationStatus: "VERIFIED", verificationStatuses: { position: "VERIFIED" } };
  data = {
    items: [{ id: "REVIEW:request", sourceId: "request", kind: "MANUSCRIPT_REVIEW", title: "Actual pinned manuscript", description: "Please assess our methods", projectId: "project", projectTitle: "Actual research team", sender: "Student sender", status: "IN_PROGRESS", priority: "HIGH", dueAt: "2026-11-10T12:00:00Z", updatedAt: "2026-11-09T12:00:00Z", needsAction: true, overdue: true, blocked: false, version: 3, href: "/reviews/assignment", action: "REVIEW" }],
    meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 }, projectMeta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    projects: [{ id: "project", title: "Actual research team", researchField: "Education", status: "ACTIVE", teamLead: "Team owner", teamSize: 3, researchStage: "DESIGN", pendingCount: 1, updatedAt: "2026-11-09T12:00:00Z" }], projectOptions: [{ id: "project", title: "Actual research team" }],
    summary: { projects: 1, needsResponse: 1, overdue: 1, blocked: 0, manuscripts: 1, invitations: 2 }, generatedAt: "2026-11-14T00:00:00Z",
  };
  mocks.read.mockImplementation(async () => structuredClone(data));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
async function mount(node: ReactNode, url = "/mentor-workspace") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}
const queue = (change = vi.fn(), extra = {}) => <MentorWorkQueue data={data} query={{ page: 1, status: "ACTIONABLE" }} onChange={change} loading={false} fetching={false} error={null} retry={vi.fn()} {...extra} />;

it("keeps Vietnamese workspace translations after the English dictionary fallback", () => {
  expect(vietnameseDictionary["mentorWorkspace.title"]).toBe("Không gian cố vấn");
  expect(vietnameseDictionary["mentorWorkspace.action.RESPOND"]).toBe("Phản hồi");
  for (const key of Object.keys(mentorWorkspaceEn) as (keyof typeof mentorWorkspaceEn)[]) {
    expect(vietnameseDictionary[key]).toBeTruthy();
    expect([...vietnameseDictionary[key].matchAll(/{{([^}]+)}}/g)].map(m => m[1]).sort())
      .toEqual([...mentorWorkspaceEn[key].matchAll(/{{([^}]+)}}/g)].map(m => m[1]).sort());
  }
});

it("shows the real sender, project, exact revision, overdue state and canonical review route", async () => {
  await mount(<MentorWorkRows items={data.items} />);
  expect(host.textContent).toContain("Actual pinned manuscript"); expect(host.textContent).toContain("Student sender");
  expect(host.textContent).toContain("Version 3"); expect(host.textContent).toContain("Overdue");
  expect(host.querySelector('a[href="/mentor-workspace?view=review&assignmentId=assignment"]')).not.toBeNull();
  expect(host.textContent).not.toContain("AI decision");
});
it("resets server pagination on filters and never accepts another assignee as a filter", async () => {
  const change = vi.fn(); await mount(queue(change));
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="Status"]')!;
  await act(async () => { select.value = "WAITING"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(change).toHaveBeenCalledWith({ page: 1, status: "WAITING" });
  expect(host.querySelector('[name="assigneeId"]')).toBeNull();
});
it("groups only the current server page and exposes next-page navigation", async () => {
  data.meta = { page: 1, pageSize: 20, total: 21, totalPages: 2 };
  const change = vi.fn(); await mount(queue(change));
  const group = host.querySelector<HTMLSelectElement>('select[aria-label="Group by"]')!;
  await act(async () => { group.value = "project"; group.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(host.textContent).toContain("Groups apply to the current page");
  await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "Next")!.click());
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
});
it("hides stale private rows when a refetch is denied", async () => {
  await mount(queue(vi.fn(), { error: new Error("403") }));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Actual pinned manuscript");
});
it("keeps invitations and notifications separate from work and opens the aggregate dashboard", async () => {
  await mount(<MentorWorkspacePage />);
  expect(host.textContent).toContain("Needs your attention");
  expect(host.querySelector('a[href="/mentor-workspace?view=incoming"]')).not.toBeNull();
  expect(host.querySelector('a[href="/mentor-workspace?view=notifications"]')).not.toBeNull();
  expect(host.querySelector('a[href="/mentor-workspace?view=review&assignmentId=assignment"]')).not.toBeNull();
});
it("shows actionable work beside real research teams and keeps review tools inside the mentor shell", async () => {
  await mount(<MentorWorkspacePage />);
  expect(host.querySelector("h1")?.textContent).toBe("Research guidance overview");
  expect(host.querySelector(".mentor-overview-priorities")?.textContent).toContain("Actual pinned manuscript");
  expect(host.querySelector(".mentor-overview-teams")?.textContent).toContain("Team owner");
  expect(host.querySelector(".mentor-overview-teams")?.textContent).toContain("Study design");
  expect(host.querySelector('.mentor-overview-resources a[href="/mentor-workspace?view=reviews"]')).not.toBeNull();
  expect(host.querySelector('.mentor-overview-resources a[href="/mentor-workspace?view=templates"]')).not.toBeNull();
  expect(host.querySelector(".mentor-kpi-card")).toBeNull();
});
it.each([
  ["overdue requests", { status: "OVERDUE", sort: "deadline" }],
  ["blocked items", { status: "BLOCKED" }],
])("opens an actual server filter for %s", async (label, filter) => {
  data.summary.blocked = 1;
  await mount(<MentorWorkspacePage />);
  const button = [...host.querySelectorAll<HTMLButtonElement>(".mentor-overview-alerts button")].find(b => b.textContent?.includes(label))!;
  await act(async () => button.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining(filter));
  expect(host.querySelector<HTMLSelectElement>('select[aria-label="Status"]')?.value).toBe(filter.status);
});
it("uses the same review scope as its summary count, including proposal reviews", async () => {
  await mount(<MentorWorkspacePage />);
  const button = [...host.querySelectorAll<HTMLButtonElement>(".mentor-overview-statistics button")].find(b => b.textContent?.includes("Reviews waiting"))!;
  await act(async () => button.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "REVIEW", status: "ACTIONABLE" }));
  expect(host.querySelector<HTMLSelectElement>('select[aria-label="Work type"]')?.value).toBe("REVIEW");
});
it("scopes a team's pending action to that project without leaving the mentor shell", async () => {
  await mount(<MentorWorkspacePage />);
  await act(async () => host.querySelector<HTMLButtonElement>(".mentor-overview-team-footer button")!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: "project", status: "ACTIONABLE" }));
  expect(host.querySelector(".mentor-shell-sidebar")).not.toBeNull();
});
it("shows honest empty states and a route to earlier work when nothing needs action", async () => {
  data.items = []; data.projects = []; data.projectOptions = [];
  data.summary = { projects: 0, needsResponse: 0, overdue: 0, blocked: 0, manuscripts: 0, invitations: 0 };
  data.meta.total = 0; data.projectMeta.total = 0;
  await mount(<MentorWorkspacePage />);
  expect(host.querySelector(".mentor-overview-alerts")).toBeNull();
  expect(host.textContent).toContain("No requests waiting for you");
  expect(host.textContent).toContain("No mentored projects found");
  const history = [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "View all statuses")!;
  await act(async () => history.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ status: "ALL" }));
});
it("refreshes real dashboard data and hides stale private work if access fails", async () => {
  await mount(<MentorWorkspacePage />);
  mocks.read.mockRejectedValue(new Error("Access ended"));
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Refresh overview"]')!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not load this workspace");
  expect(host.textContent).not.toContain("Actual pinned manuscript");
  expect(host.textContent).not.toContain("Actual research team");
});
it("loads the first recent-project page when returning from a later project page", async () => {
  data.projectMeta.totalPages = 2;
  await mount(<MentorWorkspacePage />, "/mentor-workspace?view=projects");
  const next = [...host.querySelectorAll<HTMLButtonElement>(".mentor-pagination button")].find(button => button.textContent === "Next")!;
  await act(async () => next.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ projectPage: 2 }));
  await act(async () => host.querySelector<HTMLButtonElement>('.mentor-shell-sidebar button[aria-label="Overview"]')!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ projectPage: 1 }));
});
it("does not present a previous filtered queue as the overview while its own request is loading", async () => {
  await mount(<MentorWorkspacePage />, "/mentor-workspace?view=work");
  expect(host.querySelector(".mentor-shell-content")?.textContent).toContain("Actual pinned manuscript");
  mocks.read.mockImplementation(() => new Promise(() => undefined));
  await act(async () => host.querySelector<HTMLButtonElement>('.mentor-shell-sidebar button[aria-label="Overview"]')!.click());
  expect(host.querySelector(".mentor-shell-content")?.textContent).not.toContain("Actual pinned manuscript");
  expect(host.querySelector('.mentor-queue-loading[role="status"]')).not.toBeNull();
});
it.each([
  ["incoming", "Existing support screen: true"],
  ["discover", "Existing support screen: true"],
  ["notifications", "Existing notification screen: true"],
  ["project&projectId=project&tab=tasks", "Existing project screen: true"],
  ["reviews", "Existing Review Center"],
  ["templates", "Existing Review Templates"],
])("renders %s within the persistent mentor shell", async (view, content) => {
  await mount(<MentorWorkspacePage />, `/mentor-workspace?view=${view}`);
  expect(host.querySelector('.mentor-shell-sidebar')).not.toBeNull();
  expect(host.querySelector('.mentor-shell-content')?.textContent).toContain(content);
  expect(host.querySelector('.mentor-global-header')).toBeNull();
});
it("keeps the same sidebar when opening invitations and notifications", async () => {
  await mount(<MentorWorkspacePage />);
  const sidebar = host.querySelector('.mentor-shell-sidebar');
  await act(async () => host.querySelector<HTMLAnchorElement>('.mentor-shell-sidebar a[href="/mentor-workspace?view=incoming"]')!.click());
  expect(host.querySelector('.mentor-shell-sidebar')).toBe(sidebar);
  expect(host.querySelector('.mentor-shell-content')?.textContent).toContain('Existing support screen: true');
  await act(async () => host.querySelector<HTMLAnchorElement>('.mentor-shell-sidebar a[href="/mentor-workspace?view=notifications"]')!.click());
  expect(host.querySelector('.mentor-shell-sidebar')).toBe(sidebar);
  expect(host.querySelector('.mentor-shell-content')?.textContent).toContain('Existing notification screen: true');
});
it("places shared mentor navigation beside the content with a compact toolbar and working collapse control", async () => {
  await mount(<MentorWorkspacePage />);
  const shell = host.querySelector(".mentor-workspace-shell")!;
  expect(shell.querySelector(".mentor-shell-sidebar .app-single-sidebar")).not.toBeNull();
  expect(shell.querySelector(".mentor-shell-main .mentor-shell-toolbar")).not.toBeNull();
  expect(shell.querySelector('.mentor-toolbar-actions a[href="/home"][aria-label]')).not.toBeNull();
  const toggle = host.querySelector<HTMLButtonElement>('button[aria-label="Collapse sidebar"]')!;
  await act(async () => toggle.click());
  expect(shell.classList.contains("mentor-shell-collapsed")).toBe(true);
  expect(host.querySelector('button[aria-label="Work queue"]')).not.toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Expand sidebar"]')!.click());
  expect(shell.classList.contains("mentor-shell-collapsed")).toBe(false);
});
it("opens accessible mobile navigation and closes it after selecting a mentor view", async () => {
  await mount(<MentorWorkspacePage />);
  const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')!;
  await act(async () => trigger.click());
  const drawer = document.querySelector('[role="dialog"]')!;
  expect(drawer).not.toBeNull();
  expect(drawer.getAttribute("aria-labelledby")).toBeTruthy();
  const projects = drawer.querySelector<HTMLButtonElement>('button[aria-label="Mentored projects"]')!;
  await act(async () => projects.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('.mentor-shell-breadcrumb [aria-current="page"]')?.textContent).toBe("Mentored projects");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});
it("requires verification before fetching mentor work", async () => {
  mocks.profile.data.verificationStatuses.position = "PENDING";
  await mount(<MentorWorkspacePage />);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(host.querySelector('a[href="/settings/verification/lecturer"]')).not.toBeNull();
});
it("never uses another account's work as placeholder data while the new account loads", async () => {
  await mount(<MentorWorkspacePage />);
  expect(host.textContent).toContain("Actual pinned manuscript");
  mocks.actor = "another-mentor";
  mocks.read.mockImplementation(() => new Promise(() => undefined));
  await mount(<MentorWorkspacePage />);
  expect(host.textContent).not.toContain("Actual pinned manuscript");
  expect(host.textContent).not.toContain("Actual research team");
});
it("keeps students in the existing support flow without issuing a mentor API request", async () => {
  mocks.profile.data.academicRole = "STUDENT";
  await mount(<Routes><Route path="/mentor-workspace" element={<MentorWorkspacePage />} /><Route path="/academic-support" element={<p>Existing student support</p>} /></Routes>);
  expect(host.textContent).toContain("Existing student support"); expect(mocks.read).not.toHaveBeenCalled();
});
it("scopes project tasks to the current project, ignores assignee URL tampering and removes the adjudication section", async () => {
  await mount(<MentorProjectTasks projectId="project" />, "/projects/project?tab=tasks&taskAssignee=someone-else");
  expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project", status: "ACTIONABLE" }));
  expect(mocks.read.mock.calls[0]?.[0]).not.toHaveProperty("assigneeId");
  expect(host.textContent).not.toContain("Cần tôi phân xử");
  expect(host.querySelector('select[aria-label="Project"]')).toBeNull();
});
it("opens the selected shared discussion rather than an unrelated task page", async () => {
  await mount(<MentorProjectTasks projectId="project" />, "/projects/project?tab=tasks&discussion=question-id");
  expect(host.textContent).toContain("Shared question: question-id"); expect(mocks.read).not.toHaveBeenCalled();
});
it("opens a selected manual task with its original description and only its scoped selector", async () => {
  data.items[0]!.kind = "TASK"; data.items[0]!.id = "TASK:task-id";
  await mount(<MentorProjectTasks projectId="project" />, "/projects/project?tab=tasks&workItem=TASK:task-id");
  expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ item: "TASK:task-id", status: "ALL", projectId: "project" }));
  expect(host.textContent).toContain("Please assess our methods");
});
it("explains blocked manuscript access on the queue and offers only the allowed team conversation", async () => {
  Object.assign(data.items[0]!, { kind: "TASK", status: "BLOCKED", blocked: true, accessIssue: "MANUSCRIPT_NOT_SHARED", canContactTeam: true, href: "/projects/project?tab=chat&channel=mentors", action: "RESPOND" });
  await mount(queue());
  expect(host.textContent).toContain("the team has not enabled access");
  expect([...host.querySelectorAll('a')].some(link => link.getAttribute('href') === mentorWorkspaceDestination('/projects/project?tab=chat&channel=mentors') && link.textContent === "Contact the team")).toBe(true);
  expect(host.querySelector('a[href^="/submissions/"]')).toBeNull();
});
it("keeps old task detail links useful with a sharing explanation and contact action", async () => {
  Object.assign(data.items[0]!, { id: "TASK:task-id", kind: "TASK", status: "BLOCKED", accessIssue: "MANUSCRIPT_NOT_SHARED", canContactTeam: true, href: "/projects/project?tab=chat&channel=mentors" });
  await mount(<MentorProjectTasks projectId="project" />, "/projects/project?tab=tasks&workItem=TASK:task-id");
  expect(host.textContent).toContain("Waiting for manuscript access");
  expect(host.textContent).toContain("The project owner must enable");
  expect(host.querySelector('a[href="/projects/project?tab=chat&channel=mentors"]')).not.toBeNull();
});
it("opens a shared manuscript from old task links", async () => {
  Object.assign(data.items[0]!, { id: "TASK:task-id", kind: "TASK", href: "/submissions/shared-manuscript" });
  await mount(<MentorProjectTasks projectId="project" />, "/projects/project?tab=tasks&workItem=TASK:task-id");
  expect(host.querySelector('a[href="/submissions/shared-manuscript"]')?.textContent).toBe("Open manuscript");
});
it("does not offer a conversation when the mentor has no chat permission", async () => {
  Object.assign(data.items[0]!, { id: "TASK:task-id", kind: "TASK", status: "BLOCKED", accessIssue: "MANUSCRIPT_NOT_SHARED", canContactTeam: false, href: "/projects/project?tab=tasks&workItem=TASK:task-id" });
  await mount(<MentorProjectTasks projectId="project" />, "/projects/project?tab=tasks&workItem=TASK:task-id");
  expect(host.textContent).toContain("Waiting for manuscript access");
  expect(host.querySelector('a[href*="tab=chat"]')).toBeNull();
  expect(host.querySelector('a[href^="/submissions/"]')).toBeNull();
});
it("renders interactive project cards, quick attention filters, KPI jumps, and team chat/overview shortcuts", async () => {
  data.projects = [
    { id: "project", title: "Actual research team", researchField: "Education", status: "ACTIVE", teamLead: "Team owner", teamSize: 3, researchStage: "DESIGN", pendingCount: 1, updatedAt: "2026-11-09T12:00:00Z" },
    { id: "project-2", title: "Calm finished team", researchField: "Cybersecurity", status: "PLANNING", teamLead: "Student B", teamSize: 2, researchStage: null, pendingCount: 0, updatedAt: "2026-10-18T12:00:00Z" },
  ];
  await mount(<MentorWorkspacePage />, "/mentor-workspace?view=projects");
  expect(host.textContent).toContain("Actual research team");
  expect(host.textContent).toContain("Calm finished team");
  expect(host.textContent).toContain("1 waiting for you");
  expect(host.textContent).toContain("All caught up");
  expect([...host.querySelectorAll('a')].some(link => link.getAttribute('href') === mentorWorkspaceDestination('/projects/project?tab=chat&channel=mentors'))).toBe(true);

  const needsAttentionBtn = [...host.querySelectorAll<HTMLButtonElement>("button.mentor-filter-chip")].find(b => b.textContent?.includes("Needs response"))!;
  await act(async () => needsAttentionBtn.click());
  const filteredListText = host.querySelector(".mentor-project-list")?.textContent ?? "";
  expect(filteredListText).toContain("Actual research team");
  expect(filteredListText).not.toContain("Calm finished team");

  const handleRequestsBtn = [...host.querySelectorAll("button")].find(b => b.textContent?.includes("Handle requests (1)"))!;
  await act(async () => handleRequestsBtn.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: "project", status: "ACTIONABLE" }));
});
