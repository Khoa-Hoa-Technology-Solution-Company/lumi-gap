// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MentorAccessWorkspace } from "@trend/shared-types";
import { ProjectDetailPage } from "@/pages/projects/project-detail";
import { ProjectsWorkspacePage, ProjectWorkspaceStart } from "@/pages/projects/projects-workspace";

const mocks = vi.hoisted(() => ({ detail: vi.fn(), list: vi.fn(), workspace: vi.fn(), tasks: vi.fn(), feedback: vi.fn(), comment: vi.fn(), mine: vi.fn(), actor: "mentor" }));
vi.mock("../api/projects.api", () => ({ projectsApi: { detail: mocks.detail, list: mocks.list, listMyInvitations: async () => [] } }));
vi.mock("../api/academic-support.api", () => ({ academicSupportApi: { mine: mocks.mine } }));
vi.mock("../api/mentor-access.api", () => ({ mentorAccessApi: mocks }));
vi.mock("../api/screening.api", () => ({ screeningApi: { adjudicationTasks: async () => [], automaticTasks: async () => [] } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (s: (state: unknown) => unknown) => s({ user: { id: mocks.actor, systemRole: "USER", emailVerifiedAt: "2026-11-01" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "vi" }) }));
vi.mock("@/services/confirmation", () => ({ confirmUnsavedChanges: vi.fn().mockResolvedValue(true) }));

let root: Root, host: HTMLDivElement, client: QueryClient, data: MentorAccessWorkspace;
const denied = { isAxiosError: true, response: { status: 404 } };
async function tick() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); }); }
async function mount(url = "/projects/project?tab=chat&channel=mentors") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/projects" element={<ProjectsWorkspacePage />}><Route index element={<ProjectWorkspaceStart />} /><Route path=":id" element={<ProjectDetailPage />} /></Route></Routes></MemoryRouter></QueryClientProvider>));
  await tick(); await tick();
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.actor = "mentor";
  mocks.mine.mockResolvedValue({ relationships: [], relationshipMeta: { totalPages: 1 } });
  mocks.detail.mockRejectedValue(denied); mocks.list.mockResolvedValue([]);
  data = { viewerId: "mentor", projectId: "project", title: "Actual research project", canManage: false, readOnly: false, page: 1, pageSize: 20, total: 1, hasNext: false,
    basics: { summary: "Published research summary", researchField: "Education", status: "ACTIVE", team: [{ id: "owner", name: "Team owner", role: "OWNER" }, { id: "member", name: "Team member", role: "MEMBER" }] },
    policies: [{ mentorId: "mentor", mentorName: "Verified mentor", invitationState: "ACCEPTED", shares: [], policy: { id: "access", requestId: "request", relationshipId: "relationship", version: 1, preset: "ADVISOR", permissions: ["MENTOR_CHAT"], effective: true, revokedAt: null, expiresAt: null } }] };
  mocks.workspace.mockImplementation(async () => structuredClone(data));
  mocks.feedback.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, hasNext: false });
  mocks.comment.mockResolvedValue({ id: "message" });
  mocks.tasks.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, hasNext: false });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

it("opens the mentor conversation at the original project link despite member detail returning 404", async () => {
  await mount();
  expect(host.querySelector(".coord-heading h2")?.textContent).toBe("Trò chuyện nhóm");
  expect(host.textContent).toContain(data.title);
  expect(host.querySelector('aside [aria-current="page"]')?.textContent).toContain("Team Chat");
  expect(host.querySelector('.project-conversation [role="tabpanel"] .mentor-message-chat')).not.toBeNull();
  expect(host.querySelectorAll('.project-chat-channels [role="tab"]')).toHaveLength(1);
  expect(host.querySelector(".mentor-conversation-workspace ul")).toBeNull();
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent?.includes("3 người tham gia"))!.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Team owner");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Team member");
  await act(async () => document.querySelector<HTMLButtonElement>('[role="dialog"] button')!.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector(".mentor-collab-composer")).not.toBeNull();
  expect(host.textContent).not.toContain("Project not found");
  expect(host.textContent).not.toContain("Thỏa thuận ghi nhận và đóng góp");
  expect(host.querySelector("aside")?.textContent).not.toContain("Team chat & AI");
  expect(mocks.workspace).toHaveBeenCalledWith("project", 1);
  const input = host.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Please compare the study methods"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "Gửi")!.click()); await tick();
  expect(mocks.comment).toHaveBeenCalledWith("project", "access", expect.objectContaining({ kind: "MESSAGE", shareId: null, body: "Please compare the study methods" }));
});
it("keeps mentor chat visible when an internal team or AI channel is requested", async () => {
  await mount("/projects/project?tab=chat&channel=team-ai");
  expect(host.querySelector('.project-chat-channels [role="tab"][aria-selected="true"]')?.textContent).toBe("With mentors");
  expect(host.querySelector('.mentor-collab-composer textarea')).not.toBeNull();
  expect(host.querySelectorAll('.project-chat-channels [role="tab"]')).toHaveLength(1);
});
it("opens the mentor's own tasks at tab=tasks using the shared project navigation", async () => {
  data.policies[0]!.policy.permissions.push("TASKS_VIEW");
  mocks.tasks.mockResolvedValue({ items: [
    { id: "own-task", title: "Read my assigned manuscript", description: "Review the study design", status: "IN_PROGRESS", dueAt: null, blockedReason: "", submissionId: "submission" },
  ], total: 1, page: 1, pageSize: 20, hasNext: false });
  await mount("/projects/project?tab=tasks&taskAssignee=another-user&taskMine=0");
  for (let attempt = 0; attempt < 10 && !host.textContent?.includes("Read my assigned manuscript"); attempt++) await tick();
  expect(host.querySelector("aside .coord-workspace-nav")).not.toBeNull();
  expect(host.querySelector('aside [aria-current="page"]')?.textContent).toContain("Tasks & milestones");
  expect(host.querySelectorAll('aside [role="tab"]')).toHaveLength(3);
  expect(host.textContent).toContain("Công việc của tôi");
  expect(host.textContent).toContain("Read my assigned manuscript");
  expect(mocks.tasks).toHaveBeenCalledWith("project", 1);
  expect(host.querySelector('a[href="/submissions/submission"]')).not.toBeNull();
  expect(host.querySelector(".project-conversation")).toBeNull();
  expect(host.textContent).not.toContain("Create task");
});
it("loads only personal tasks even when the mentor cannot view shared project tasks", async () => {
  await mount("/projects/project?tab=tasks");
  for (let attempt = 0; attempt < 10 && !mocks.tasks.mock.calls.length; attempt++) await tick();
  expect(mocks.tasks).toHaveBeenCalledWith("project", 1);
  expect(host.textContent).toContain("Cần tôi phân xử");
});
it("lists accepted mentorship projects at /projects even without any team membership", async () => {
  mocks.mine.mockResolvedValue({ relationships: [
    { projectId: "project", mentorUser: { _id: "mentor" }, status: "ACTIVE", mentorRole: "PRIMARY", actions: { openProject: true }, project: { title: "Actual research project", stage: "ACTIVE" } },
    { projectId: "other-project", mentorUser: { _id: "mentor" }, status: "ACTIVE", mentorRole: "SECONDARY", actions: { openProject: true }, project: { title: "Second guidance project", stage: "PLANNING" } },
    { projectId: "revoked", mentorUser: { _id: "mentor" }, status: "ACTIVE", actions: { openProject: false }, project: { title: "Revoked access" } },
  ], relationshipMeta: { totalPages: 1 } });
  await mount("/projects");
  const panel = host.querySelector(".project-browser-panel")!;
  expect(panel.textContent).toContain("Actual research project");
  expect(panel.textContent).toContain("Second guidance project");
  expect(panel.textContent).not.toContain("No projects yet");
  expect(panel.textContent).not.toContain("Revoked access");
  expect(mocks.mine).toHaveBeenCalledWith({ view: "active", page: 1, pageSize: 30 });
  const link = panel.querySelector<HTMLAnchorElement>('a[href="/projects/project?tab=overview"]')!;
  expect(link).not.toBeNull();
  await act(async () => link.click()); await tick(); await tick();
  expect(host.querySelector("h1")?.textContent).toBe("Actual research project");
  expect(host.textContent).toContain("Thông tin dự án");
});
it("shows a retry instead of claiming there are no projects when mentorship loading fails", async () => {
  mocks.mine.mockRejectedValue(new Error("offline"));
  await mount("/projects");
  const panel = host.querySelector(".project-browser-panel")!;
  expect(panel.querySelector('[role="alert"]')?.textContent).toContain("Unable to load mentorship requests.");
  expect(panel.textContent).not.toContain("No projects yet");
});
it("shows only basic project information and the group roster by default", async () => {
  await mount("/projects/project");
  expect(host.textContent).toContain("Published research summary");
  expect(host.textContent).toContain("Team owner");
  expect(host.textContent).toContain("Team member");
  expect(host.querySelector('a[href="/projects/project?tab=chat&channel=mentors"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Cấu hình quyền và chia sẻ");
});
it("keeps outsiders on the unavailable screen without leaking cached mentor content", async () => {
  mocks.workspace.mockRejectedValue(denied);
  await mount();
  expect(host.textContent).toContain("Project not found or you do not have access.");
  expect(host.textContent).not.toContain(data.title);
  expect(host.querySelector("textarea")).toBeNull();
});
it("removes mentor content and the composer after access revocation", async () => {
  await mount();
  mocks.workspace.mockRejectedValue(denied);
  await act(async () => { await client.invalidateQueries({ queryKey: ["mentor-access"] }); }); await tick();
  expect(host.querySelector("textarea")).toBeNull();
  expect(host.textContent).not.toContain(data.title);
});
it("does not allow a chat composer without the existing chat permission", async () => {
  data.policies[0]!.policy.permissions = [];
  await mount();
  expect(host.querySelector("textarea")).toBeNull();
  expect(host.textContent).toContain("Nhóm chưa cấp quyền chat");
  expect(mocks.comment).not.toHaveBeenCalled();
});
