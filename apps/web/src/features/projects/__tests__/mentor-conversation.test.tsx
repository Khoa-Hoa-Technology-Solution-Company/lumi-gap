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
const automaticTasks = vi.hoisted(() => vi.fn());
vi.mock("../api/screening.api", () => ({ screeningApi: { adjudicationTasks, automaticTasks } }));
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
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter></QueryClientProvider>)); await tick(); await tick();
}
async function fill(value: string) {
  const input = host.querySelector<HTMLTextAreaElement>(".mentor-collab-composer textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); confirmLeave.mockResolvedValue(false);
  adjudicationTasks.mockResolvedValue([]); automaticTasks.mockResolvedValue([]);
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

it("keeps completed mentor obligations in history with a scoped return link", async () => {
  automaticTasks.mockResolvedValue([{ id: "completed-task", roundId: "r1", actionType: "ADJUDICATION", title: "Hồ sơ đã kết luận", status: "DONE", endedAt: "2026-11-03T00:00:00Z", reason: "Đã lưu quyết định phân xử" }]);
  await mount(<MentorAdjudicationTasks projectId="p" />);
  expect(host.textContent).toContain("Công việc đã kết thúc (1)");
  expect(host.textContent).toContain("Hoàn thành · Đã lưu quyết định phân xử");
  expect(host.querySelector('details a')?.getAttribute('href')).toBe('/academic-support/projects/p/screening/r1?automaticTask=completed-task&taskReturn=%2Facademic-support%2Fprojects%2Fp');
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
  expect(host.textContent).toContain("Giảng viên An");
  expect(host.textContent).not.toContain("Ứng viên Bình");
  expect(host.querySelector('[aria-label="Chọn cố vấn để trao đổi"]')).toBeNull();
  expect(host.textContent).not.toContain("Cấu hình quyền và chia sẻ");
});
it("opens participants in a popup without expanding the chat layout", async () => {
  data.basics = { status: "ACTIVE", summary: null, researchField: null, team: [{ id: "owner", name: "Owner", role: "OWNER" }, { id: "member", name: "Member", role: "MEMBER" }] };
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />);
  const trigger = buttons().find(button => button.textContent?.includes("3 người tham gia"))!;
  expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
  expect(host.querySelector(".mentor-conversation-workspace details")).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => trigger.click());
  const popup = document.querySelector('[role="dialog"]')!;
  expect(popup.textContent).toContain("Người tham gia (3)");
  expect(popup.textContent).toContain("Giảng viên An");
  expect(popup.textContent).toContain("Chủ dự án");
  expect(popup.querySelectorAll("li")).toHaveLength(3);
  const links = [...popup.querySelectorAll("a")];
  expect(links.map(link => link.getAttribute("href"))).toEqual(["/academics/an", "/academics/owner", "/academics/member"]);
  for (const link of links) {
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.getAttribute("aria-label")).toContain("tab mới");
  }
  await act(async () => popup.querySelector<HTMLButtonElement>('button')!.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector(".mentor-collab-composer textarea")).not.toBeNull();
});
it("does not silently send to a different mentor when a deep link is unavailable", async () => {
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />, "/?mentorAccess=missing&mentorPage=2");
  expect(api.workspace).toHaveBeenCalledWith("p", 2);
  expect(api.feedback).not.toHaveBeenCalled();
  expect(host.querySelector(".mentor-collab-composer")).toBeNull();
  expect(host.textContent).toContain("không còn ở trang hiện tại");
});
it("uses a message composer without feedback or contribution controls", async () => {
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />);
  expect(host.querySelector(".mentor-credit-options")).toBeNull();
  expect(host.querySelectorAll(".mentor-credit-options input:checked")).toHaveLength(0);
  expect(host.querySelectorAll("select[multiple]")).toHaveLength(0);
  await fill("Nhờ thầy góp ý phương pháp"); await act(async () => button("Gửi").click()); await tick();
  expect(api.comment).toHaveBeenCalledWith("p", "access-an", expect.objectContaining({ body: "Nhờ thầy góp ý phương pháp", kind: "MESSAGE", creditRoles: [] }));
});
it("preserves a failed message so it can be retried", async () => {
  api.comment.mockRejectedValue(new Error("offline"));
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />); await fill("Câu hỏi cần giữ");
  await act(async () => button("Gửi").click()); await tick();
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
  await mount(<MentorAccessWorkspace projectId="p" mode="all" />);
  await act(async () => host.querySelector<HTMLInputElement>(".mentor-credit-options input")!.click());
  const note = [...host.querySelectorAll("label")].find(label => label.textContent?.startsWith("Nội dung ghi nhận đề xuất"))!.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note, "Ghi nhận hướng dẫn nghiên cứu"); note.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => button("Đề xuất thỏa thuận").click()); await tick();
  expect(api.propose).toHaveBeenCalledWith("p", "access-an", expect.objectContaining({ creditRoles: ["SUPERVISION"], acknowledgement: "Ghi nhận hướng dẫn nghiên cứu" }));
});
it("does not label normal messages as unresolved scientific feedback", async () => {
  api.feedback.mockResolvedValue({ items: [{ id: "m", authorId: "an", authorName: "An", mentor: true, shareId: null, kind: "MESSAGE", body: "Chào nhóm", creditRoles: [], status: "PENDING", createdAt: "2026-11-01T00:00:00Z" }], total: 1, hasNext: false });
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />);
  expect(host.querySelector('[role="log"]')?.textContent).not.toContain("Chờ xử lý");
  expect(host.querySelector('[role="log"]')?.textContent).not.toContain("Xử lý phản hồi");
});
it("renders both sides chronologically in chat bubbles and replies using the existing message API", async () => {
  const first = { id: "mentor-message", authorId: "an", authorName: "An", mentor: true, shareId: null, kind: "MESSAGE", body: "Chào nhóm", creditRoles: [], createdAt: "2026-11-05T08:00:00Z" };
  const second = { ...first, id: "team-message", authorId: "owner", authorName: "Owner", mentor: false, body: "Nhóm chào cô", createdAt: "2026-11-05T08:01:00Z" };
  api.feedback.mockResolvedValue({ items: [second, first], total: 2, page: 1, hasNext: false });
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />);
  expect([...host.querySelectorAll("[data-message-id]")].map(node => node.getAttribute("data-message-id"))).toEqual(["mentor-message", "team-message"]);
  expect(host.querySelector('[data-own="true"]')?.textContent).toContain("Owner (Bạn)");
  expect(host.querySelector('[data-own="false"]')?.textContent).toContain("An · Cố vấn");
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Trả lời An"]')!.click());
  await fill("ok");
  await act(async () => button("Gửi").click()); await tick();
  expect(api.comment).toHaveBeenCalledWith("p", "access-an", expect.objectContaining({ body: "ok", replyToId: "mentor-message", kind: "MESSAGE", shareId: null, creditRoles: [] }));
  expect(host.querySelector(".mentor-message-reply")).toBeNull();
});
it("loads older messages without duplicating records and refreshes incoming messages", async () => {
  const item = { id: "new", authorId: "an", authorName: "An", mentor: true, shareId: null, kind: "MESSAGE", body: "Tin mới", creditRoles: [], createdAt: "2026-11-05T08:01:00Z" };
  const older = { ...item, id: "old", body: "Tin trước", createdAt: "2026-11-04T08:01:00Z" };
  api.feedback.mockImplementation(async (_project: string, _access: string, page: number) => ({ items: page === 1 ? [item] : [item, older], total: 2, page, hasNext: page === 1 }));
  await mount(<MentorAccessWorkspace projectId="p" mode="conversation" />);
  await act(async () => button("Xem tin nhắn trước").click()); await tick();
  expect([...host.querySelectorAll("[data-message-id]")].map(node => node.getAttribute("data-message-id"))).toEqual(["old", "new"]);
  api.feedback.mockResolvedValue({ items: [{ ...item, id: "incoming", body: "Cô đã đọc", createdAt: "2026-11-05T08:02:00Z" }, item, older], total: 3, page: 1, hasNext: false });
  await act(async () => { await client.invalidateQueries({ queryKey: ["mentor-access"] }); }); await tick();
  expect(host.querySelector('[role="log"]')?.textContent).toContain("Cô đã đọc");
  expect(host.querySelectorAll('[data-message-id="new"]')).toHaveLength(1);
});
it("keeps the same chat UI for mentors and does not send while an input method composition is active", async () => {
  data.viewerId = "an"; data.canManage = false;
  await mount(<MentorAccessWorkspace projectId="p" mentorView mode="conversation" />);
  await fill("Xin chào");
  const textarea = host.querySelector("textarea")!;
  await act(async () => textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })));
  expect(api.comment).not.toHaveBeenCalled();
  await act(async () => textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await tick();
  expect(api.comment).toHaveBeenCalledWith("p", "access-an", expect.objectContaining({ body: "Xin chào" }));
});
it("shows the same relationship message thread through the member and mentor chat entry points", async () => {
  const item = { id: "shared-message", authorId: "owner", authorName: "Owner", mentor: false, shareId: null, kind: "MESSAGE", body: "Tin nhắn chung của nhóm", creditRoles: [], createdAt: "2026-11-05T08:00:00Z" };
  api.feedback.mockResolvedValue({ items: [item], total: 1, page: 1, hasNext: false });
  await mount(<ProjectDiscussionPanel projectId="p" paperCount={3} />); await tick();
  expect(host.querySelector('.project-conversation [data-message-id="shared-message"]')?.textContent).toContain(item.body);
  expect(host.querySelector('[data-own="true"]')?.textContent).toContain("Owner (Bạn)");
  await act(async () => root.unmount()); client.clear(); root = createRoot(host);
  data.viewerId = "an"; data.canManage = false;
  await mount(<ProjectDiscussionPanel projectId="p" paperCount={0} mentorView />); await tick();
  expect(host.querySelector('.project-conversation [data-message-id="shared-message"]')?.textContent).toContain(item.body);
  expect(host.querySelector('[data-own="false"]')?.textContent).toContain("Owner");
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(1);
  expect(host.textContent).not.toContain("Internal team chat");
  expect(host.textContent).not.toContain("Internal AI chat");
  expect(api.feedback.mock.calls.every(call => call[0] === "p" && call[1] === "access-an")).toBe(true);
});
