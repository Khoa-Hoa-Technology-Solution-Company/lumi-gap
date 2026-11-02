// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MentorAccessWorkspace as Workspace } from "@trend/shared-types";
import { MentorAccessWorkspace } from "../components/mentor-access-workspace";
import { MentorAdjudicationTasks } from "../components/mentor-access-workspace";
import { ProjectDiscussionPanel } from "../components/project-discussion-panel";

const api = vi.hoisted(() => ({ workspace: vi.fn(), feedback: vi.fn(), history: vi.fn(), agreements: vi.fn(), comment: vi.fn(), propose: vi.fn() }));
const confirmLeave = vi.hoisted(() => vi.fn());
const adjudicationTasks = vi.hoisted(() => vi.fn());
vi.mock("../api/screening.api", () => ({ screeningApi: { adjudicationTasks } }));
vi.mock("../api/mentor-access.api", () => ({ mentorAccessApi: api }));
vi.mock("@/services/confirmation", () => ({ confirmUnsavedChanges: confirmLeave }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: "owner" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../components/project-team-chat-panel", () => ({ ProjectTeamChatPanel: () => <p>Internal team chat</p> }));
vi.mock("../components/project-chat-panel", () => ({ ProjectChatPanel: () => <p>Internal AI chat</p> }));
let root: Root, host: HTMLDivElement, client: QueryClient, data: Workspace;
const buttons = () => [...host.querySelectorAll<HTMLButtonElement>("button")];
const button = (label: string) => buttons().find(b => b.textContent === label)!;
async function tick() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); }
async function mount(node: ReactNode, url = "/projects/p?tab=chat&channel=mentors") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>)); await tick();
}
async function fill(value: string) {
  const input = host.querySelector<HTMLTextAreaElement>(".mentor-collab-composer textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); confirmLeave.mockResolvedValue(false);
  adjudicationTasks.mockResolvedValue([]);
  const policy = { id: "access-an", requestId: "request", relationshipId: "relationship", version: 1, preset: "ADVISOR" as const, permissions: ["MENTOR_CHAT" as const], expiresAt: null, revokedAt: null, effective: true };
  data = { viewerId: "owner", projectId: "p", title: "Research", canManage: true, readOnly: false, page: 1, pageSize: 10, total: 2, hasNext: false, policies: [
    { policy, mentorId: "an", mentorName: "Giảng viên An", invitationState: "ACCEPTED", shares: [] },
    { policy: { ...policy, id: "access-pending", relationshipId: null, effective: false }, mentorId: "binh", mentorName: "Ứng viên Bình", invitationState: "PENDING", shares: [] },
  ] };
  api.workspace.mockImplementation(async () => structuredClone(data));
  for (const method of [api.feedback, api.history, api.agreements]) method.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, hasNext: false });
  api.comment.mockResolvedValue({ id: "message" }); api.propose.mockResolvedValue({ id: "agreement" });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

it("links only assigned adjudication tasks and removes a task after permission refresh", async () => {
  adjudicationTasks.mockResolvedValue([{ roundId: "r1", paperId: "paper1", title: "Bài được giao", phase: "FULL_TEXT" }]);
  await mount(<MentorAdjudicationTasks projectId="p" />);
  expect(host.textContent).toContain("Cần phân xử · Toàn văn");
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/academic-support/projects/p/screening/r1");
  adjudicationTasks.mockResolvedValue([]);
  await act(async () => { await client.invalidateQueries({ queryKey: ["mentor-access"] }); }); await tick();
  expect(host.textContent).not.toContain("Bài được giao"); expect(host.textContent).toContain("Chưa có bài cần bạn phân xử.");
});

it("keeps communication out of access management and links the exact mentor", async () => {
  await mount(<MentorAccessWorkspace projectId="p" />);
  expect(host.querySelector(".mentor-collab-composer")).toBeNull();
  expect(api.feedback).not.toHaveBeenCalled();
  expect(host.querySelector('a[href*="channel=mentors"]')?.getAttribute("href")).toBe("/projects/p?tab=chat&channel=mentors&mentorAccess=access-an&mentorPage=1");
});
it("opens the mentor channel directly without rendering internal team or AI chat", async () => {
  await mount(<ProjectDiscussionPanel projectId="p" paperCount={3} />);
  expect(host.textContent).toContain("Giảng viên An");
  expect(host.textContent).not.toContain("Internal team chat");
  expect(host.textContent).not.toContain("Internal AI chat");
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("With mentors");
  expect(host.querySelector('button')?.textContent).toBe("Team Chat");
});
it("shows only accepted relationships in conversation selection", async () => {
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />);
  expect(host.querySelector('[aria-label="Chọn cố vấn để trao đổi"]')?.textContent).not.toContain("Ứng viên Bình");
  expect(host.textContent).not.toContain("Cấu hình quyền và chia sẻ");
});
it("does not silently send to a different mentor when a deep link is unavailable", async () => {
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />, "/?mentorAccess=missing&mentorPage=2");
  expect(api.workspace).toHaveBeenCalledWith("p", 2);
  expect(api.feedback).not.toHaveBeenCalled();
  expect(host.querySelector(".mentor-collab-composer")).toBeNull();
  expect(host.textContent).toContain("không còn ở trang hiện tại");
});
it("keeps CRediT optional, collapsed, and unselected for a normal message", async () => {
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />);
  expect(host.querySelector(".mentor-credit-options")?.hasAttribute("open")).toBe(false);
  expect(host.querySelectorAll(".mentor-credit-options input:checked")).toHaveLength(0);
  expect(host.querySelectorAll("select[multiple]")).toHaveLength(0);
  await fill("Nhờ thầy góp ý phương pháp"); await act(async () => button("Gửi phản hồi").click()); await tick();
  expect(api.comment).toHaveBeenCalledWith("p", "access-an", expect.objectContaining({ body: "Nhờ thầy góp ý phương pháp", kind: "MESSAGE", creditRoles: [] }));
});
it("preserves a failed message so it can be retried", async () => {
  api.comment.mockRejectedValue(new Error("offline"));
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />); await fill("Câu hỏi cần giữ");
  await act(async () => button("Gửi phản hồi").click()); await tick();
  expect(host.querySelector<HTMLTextAreaElement>(".mentor-collab-composer textarea")?.value).toBe("Câu hỏi cần giữ");
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it("blocks leaving a drafted mentor conversation when the user cancels", async () => {
  await mount(<ProjectDiscussionPanel projectId="p" paperCount={3} />); await fill("Chưa gửi");
  await act(async () => button("Team Chat").click());
  expect(confirmLeave).toHaveBeenCalled();
  expect(host.querySelector<HTMLTextAreaElement>(".mentor-collab-composer textarea")?.value).toBe("Chưa gửi");
  expect(host.textContent).not.toContain("Internal team chat");
});
it("removes the composer when access is revoked during polling", async () => {
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />);
  data.policies[0]!.policy.effective = false; data.policies[0]!.policy.version = 2; data.policies[0]!.policy.revokedAt = new Date().toISOString();
  await act(async () => { await client.invalidateQueries({ queryKey: ["mentor-access"] }); }); await tick();
  expect(host.querySelector(".mentor-collab-composer")).toBeNull();
  expect(host.textContent).toContain("chế độ chỉ đọc");
});
it("preserves the mentor's scoped project view with shared content", async () => {
  data.viewerId = "an"; data.canManage = false;
  await mount(<MentorAccessWorkspace projectId="p" mentorView />);
  expect(host.textContent).toContain("Nội dung đã chia sẻ");
  expect(host.querySelector(".mentor-collab-composer")).not.toBeNull();
  expect(host.textContent).not.toContain("Cấu hình quyền và chia sẻ");
});
it("does not use message role tags to change a formal contribution agreement", async () => {
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />);
  await act(async () => host.querySelector<HTMLInputElement>(".mentor-credit-options input")!.click());
  const note = [...host.querySelectorAll("label")].find(label => label.textContent?.startsWith("Nội dung ghi nhận đề xuất"))!.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note, "Ghi nhận hướng dẫn nghiên cứu"); note.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => button("Đề xuất thỏa thuận").click()); await tick();
  expect(api.propose).toHaveBeenCalledWith("p", "access-an", expect.objectContaining({ creditRoles: ["SUPERVISION"], acknowledgement: "Ghi nhận hướng dẫn nghiên cứu" }));
});
it("does not label normal messages as unresolved scientific feedback", async () => {
  api.feedback.mockResolvedValue({ items: [{ id: "m", authorId: "an", authorName: "An", mentor: true, shareId: null, kind: "MESSAGE", body: "Chào nhóm", creditRoles: [], status: "PENDING", createdAt: "2026-11-01T00:00:00Z" }], total: 1, hasNext: false });
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />);
  expect(host.querySelector(".mentor-feedback-list")?.textContent).not.toContain("Chờ xử lý");
  expect(host.querySelector(".mentor-feedback-list")?.textContent).not.toContain("Xử lý phản hồi");
});
