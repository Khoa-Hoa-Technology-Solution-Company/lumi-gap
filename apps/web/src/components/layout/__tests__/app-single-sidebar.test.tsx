// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppSingleSidebar } from "../app-single-sidebar";
import { WorkspaceBreadcrumb } from "../workspace-breadcrumb";
import { ProjectHorizontalTabs } from "@/features/projects/components/project-horizontal-tabs";

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (s: { user: { id: string; systemRole: string; academicRole?: string } }) => unknown) =>
    selector({ user: { id: "user-1", systemRole: "USER", academicRole: "STUDENT" } }),
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "vi",
    t: (key: string, values: Record<string, string | number> = {}) => {
      const dict: Record<string, string> = {
        "mentorWorkspace.title": "Không gian cố vấn",
        "mentorWorkspace.overview": "Tổng quan",
        "mentorWorkspace.work": "Việc cần xử lý",
        "mentorWorkspace.projects": "Dự án hướng dẫn",
        "mentorWorkspace.invitations": "Lời mời hướng dẫn",
        "mentorWorkspace.notifications": "Thông báo",
        "mentorWorkspace.navigation": "Điều hướng cố vấn",
        "mentorWorkspace.recent": "Dự án gần đây",
        "mentorWorkspace.discovery": "Tìm nhóm & cài đặt hướng dẫn",
        "Research workspace": "Không gian nghiên cứu",
        "All projects": "Tất cả dự án",
        "Invitations": "Lời mời tham gia",
        "Trash": "Thùng rác",
        "Recent projects": "Dự án gần đây",
        "Switch workspace": "Chuyển không gian",
        "Collapse sidebar": "Thu gọn",
        "Expand sidebar": "Mở rộng",
        "Project sections": "Mục dự án",
        "Overview": "Tổng quan",
        "Literature": "Tài liệu nghiên cứu",
        "Research Gaps": "Cơ hội nghiên cứu",
        "Team tasks": "Công việc nhóm",
        "Team Chat": "Trò chuyện nhóm",
        "Find Mentors": "Tìm cố vấn",
        "Manuscripts": "Bản thảo",
        "Submissions": "Bản thảo & góp ý",
        "Team & settings": "Nhóm & cài đặt",
        "Contributions": "Đóng góp",
        "About project": "Giới thiệu dự án",
      };
      let result = dict[key] ?? key;
      for (const [name, val] of Object.entries(values)) {
        result = result.replaceAll(`{{${name}}}`, String(val));
      }
      return result;
    },
  }),
}));

let root: Root, host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function mount(node: ReactNode, url = "/projects") {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {node}
      </MemoryRouter>
    );
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
  });
}

it("renders student view without mentor workspace switcher option", async () => {
  await mount(
    <AppSingleSidebar
      activeWorkspace="research"
      canAccessMentor={false}
    />
  );

  expect(host.textContent).toContain("Không gian nghiên cứu");
  expect(host.textContent).toContain("Tất cả dự án");
  expect(host.textContent).toContain("Lời mời tham gia");
  expect(host.textContent).toContain("Thùng rác");
  // Student should not have the switcher dropdown trigger
  expect(host.querySelector(".workspace-switcher-static")).not.toBeNull();
  expect(host.querySelector(".workspace-switcher-trigger")).toBeNull();
});

it("renders mentor switcher for authorized accounts and shows dropdown options", async () => {
  await mount(
    <AppSingleSidebar
      activeWorkspace="research"
      canAccessMentor={true}
      mentorMetrics={{ projects: 2, needsResponse: 3, overdue: 0, blocked: 0, manuscripts: 1, invitations: 1 }}
    />
  );

  const trigger = host.querySelector<HTMLButtonElement>(".workspace-switcher-trigger");
  expect(trigger).not.toBeNull();
  expect(trigger?.getAttribute("aria-label")).toContain("Chuyển không gian");
});

it("renders full mentor workspace navigation with badges and recent projects", async () => {
  const onSelect = vi.fn();
  await mount(
    <AppSingleSidebar
      activeWorkspace="mentor"
      canAccessMentor={true}
      activeMentorView="work"
      onSelectMentorView={onSelect}
      mentorMetrics={{ projects: 5, needsResponse: 2, overdue: 0, blocked: 0, manuscripts: 1, invitations: 3 }}
      recentProjects={[
        { id: "proj-1", title: "Nghiên cứu AI y tế", pendingCount: 2 },
        { id: "proj-2", title: "Xử lý ngôn ngữ tự nhiên", pendingCount: 0 },
      ]}
    />,
    "/mentor-workspace?view=work"
  );

  expect(host.textContent).toContain("Không gian cố vấn");
  expect(host.textContent).toContain("Tổng quan");
  expect(host.textContent).toContain("Việc cần xử lý");
  expect(host.textContent).toContain("Dự án hướng dẫn");
  expect(host.textContent).toContain("Lời mời hướng dẫn");
  expect(host.textContent).toContain("Thông báo");
  expect(host.textContent).toContain("Nghiên cứu AI y tế");
  expect(host.textContent).toContain("Xử lý ngôn ngữ tự nhiên");

  // Check badges
  const workBadge = host.querySelector('.sidebar-nav-item[data-active="true"] .sidebar-nav-badge');
  expect(workBadge?.textContent).toBe("2");

  // Clicking an item calls onSelectMentorView
  const overviewBtn = [...host.querySelectorAll<HTMLButtonElement>("button.sidebar-nav-item")].find(
    b => b.textContent?.includes("Tổng quan")
  );
  await act(async () => overviewBtn?.click());
  expect(onSelect).toHaveBeenCalledWith("overview");
});

it("handles collapse and expand toggle", async () => {
  const onToggle = vi.fn();
  await mount(
    <AppSingleSidebar
      activeWorkspace="research"
      canAccessMentor={false}
      collapsed={false}
      onToggleCollapse={onToggle}
    />
  );

  const collapseBtn = host.querySelector<HTMLButtonElement>(".sidebar-collapse-button");
  expect(collapseBtn).not.toBeNull();
  expect(collapseBtn?.textContent).toContain("Thu gọn");

  await act(async () => collapseBtn?.click());
  expect(onToggle).toHaveBeenCalledWith(true);
});

it("renders collapsed mode with data-collapsed attribute and icon-only representation", async () => {
  await mount(
    <AppSingleSidebar
      activeWorkspace="research"
      canAccessMentor={false}
      collapsed={true}
      onToggleCollapse={vi.fn()}
    />
  );

  const sidebar = host.querySelector(".app-single-sidebar");
  expect(sidebar?.getAttribute("data-collapsed")).toBe("true");
  // Labels should be hidden in collapsed mode
  expect(host.querySelector(".workspace-switcher-text")).toBeNull();
});

it("renders WorkspaceBreadcrumb correctly", async () => {
  await mount(
    <WorkspaceBreadcrumb
      items={[
        { label: "Không gian nghiên cứu", href: "/projects" },
        { label: "LumiGap Research", href: "/projects/123" },
        { label: "Tài liệu nghiên cứu", active: true },
      ]}
    />
  );

  expect(host.querySelector('[aria-label="Breadcrumb"]')).not.toBeNull();
  expect(host.textContent).toContain("Không gian nghiên cứu");
  expect(host.textContent).toContain("LumiGap Research");
  expect(host.textContent).toContain("Tài liệu nghiên cứu");

  const links = host.querySelectorAll("a");
  expect(links).toHaveLength(2);
  expect(links[0]?.getAttribute("href")).toBe("/projects");
  expect(links[1]?.getAttribute("href")).toBe("/projects/123");
  expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("Tài liệu nghiên cứu");
});

it("renders ProjectHorizontalTabs with counts and responds to tab change", async () => {
  const onChange = vi.fn();
  await mount(
    <ProjectHorizontalTabs
      activeTab="papers"
      onChange={onChange}
      paperCount={19}
      memberCount={4}
    />
  );

  const tablist = host.querySelector('[role="tablist"]');
  expect(tablist).not.toBeNull();
  expect(tablist?.getAttribute("aria-orientation")).toBe("horizontal");

  // Selected tab is literature (papers)
  const activeTab = host.querySelector('[role="tab"][aria-selected="true"]');
  expect(activeTab?.textContent).toContain("Tài liệu nghiên cứu");
  expect(activeTab?.textContent).toContain("19");

  // Members tab count
  const membersTab = host.querySelector("#project-content-tab-members");
  expect(membersTab?.textContent).toContain("4");

  // Click another tab
  const gapsTab = host.querySelector<HTMLButtonElement>("#project-content-tab-gaps");
  await act(async () => gapsTab?.click());
  expect(onChange).toHaveBeenCalledWith("gaps");
});
