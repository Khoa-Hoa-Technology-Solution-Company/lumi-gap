// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MentorAccessWorkspace } from "@trend/shared-types";
import { MentorProjectWorkspace } from "../components/mentor-project-workspace";

const canLeave = vi.hoisted(() => vi.fn());
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../components/workspace-common", () => ({ canLeaveWorkspace: canLeave, WorkspaceHeading: () => <h2>Group chat</h2> }));
vi.mock("../components/mentor-access-workspace", () => ({ MentorAccessWorkspace: () => <p>Shared resources</p> }));
vi.mock("../components/project-discussion-panel", () => ({ ProjectDiscussionPanel: () => <p>Mentor conversation</p> }));
vi.mock("../components/mentor-project-tasks", () => ({ MentorProjectTasks: () => <p>Personal project tasks</p> }));
vi.mock("../components/mentor-role-assignments", () => ({ MentorRoleAssignments: () => null }));
vi.mock("../components/research-contributions-panel", () => ({ ResearchContributionsPanel: () => <p>Research contributions</p> }));
vi.mock("../components/work-contributions", () => ({ WorkContributionsPanel: () => <p>Existing contribution tracking</p> }));

const data: MentorAccessWorkspace = {
  viewerId: "mentor", projectId: "project", title: "Research team", canManage: false, readOnly: false,
  page: 1, pageSize: 20, total: 0, hasNext: false,
  basics: { summary: "Our research objectives", researchField: "Education", status: "ACTIVE", team: [{ id: "owner", name: "Team owner", role: "OWNER" }] },
  policies: [{ mentorId: "mentor", mentorName: "Mentor", invitationState: "ACCEPTED", shares: [], policy: { id: "access", requestId: "request", relationshipId: "relationship", version: 1, preset: "ADVISOR", permissions: ["MENTOR_CHAT"], effective: true, revokedAt: null, expiresAt: null } }],
};
let host: HTMLDivElement, root: Root;
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
async function mount(workspace = data, tab = "overview") {
  await act(async () => root.render(<MemoryRouter initialEntries={[`/mentor-workspace?view=project&projectId=project&tab=${tab}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MentorProjectWorkspace data={workspace} standalone embedded /><Location /></MemoryRouter>));
}
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); canLeave.mockResolvedValue(true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("uses one horizontal navigation with a labelled panel and clear project/team information", async () => {
  await mount();
  expect(host.querySelectorAll('[role="tablist"]')).toHaveLength(1);
  expect(host.querySelector('[role="tablist"]')?.getAttribute("aria-orientation")).toBe("horizontal");
  expect(host.querySelectorAll("h1")).toHaveLength(1);
  expect(host.querySelector("h1")?.textContent).toBe("Research team");
  expect(host.querySelector("#project-panel-overview")?.getAttribute("aria-labelledby")).toBe("project-content-tab-overview");
  expect(host.querySelector(".mentor-project-summary")?.textContent).toContain("Our research objectives");
  expect(host.querySelector(".mentor-project-roster")?.textContent).toContain("Team owner");
  expect(host.querySelector(".mentor-project-actions")?.textContent).toContain("Xem công việc của tôi");
  expect(host.querySelector('a[href="/mentor-workspace?tab=chat&channel=mentors&view=project&projectId=project"]')).not.toBeNull();
  expect(host.querySelector('a[href="/mentor-workspace?tab=tasks&view=project&projectId=project"]')).not.toBeNull();
  expect(host.querySelector(".mentor-project-contributions")?.hasAttribute("open")).toBe(false);
});

it("changes tabs by keyboard while retaining the project and existing scoped chat channel", async () => {
  await mount();
  await act(async () => host.querySelector<HTMLButtonElement>("#project-content-tab-overview")!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(host.querySelector("output")?.textContent).toBe("/mentor-workspace?view=project&projectId=project&tab=chat&channel=mentors");
  expect(host.querySelector('#project-content-tab-chat[aria-selected="true"]')).not.toBeNull();
  expect(host.querySelector("#project-panel-chat")?.textContent).toContain("Mentor conversation");
});

it("honours the existing unsaved-work guard before changing a tab", async () => {
  canLeave.mockResolvedValue(false);
  await mount();
  await act(async () => host.querySelector<HTMLButtonElement>("#project-content-tab-tasks")!.click());
  expect(host.querySelector("output")?.textContent).toContain("tab=overview");
  expect(host.querySelector("#project-panel-tasks")).toBeNull();
});

it("preserves the existing permission-dependent contributions tab", async () => {
  await mount();
  expect(host.querySelector("#project-content-tab-contributions")).toBeNull();
  const permitted = structuredClone(data);
  permitted.policies[0]!.policy.permissions.push("CONTRIBUTIONS_VIEW");
  await mount(permitted);
  expect(host.querySelector("#project-content-tab-contributions")).not.toBeNull();
});

it("keeps long/user supplied text escaped and shows useful empty states", async () => {
  const empty = structuredClone(data);
  empty.title = "<script>private()</script>";
  empty.basics!.summary = "";
  empty.basics!.team = [];
  await mount(empty);
  expect(host.querySelector("h1")?.textContent).toBe(empty.title);
  expect(host.querySelector("script")).toBeNull();
  expect(host.textContent).toContain("Nhóm chưa thêm giới thiệu");
  expect(host.querySelector(".mentor-project-roster")?.textContent).toContain("Chưa có thông tin thành viên");
});
