// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MentorAccessWorkspace, MentorAgreement } from "@trend/shared-types";
import { MentorProjectPage } from "../mentor-project";

const mocks = vi.hoisted(() => ({ workspace: vi.fn(), resource: vi.fn(), feedback: vi.fn(), history: vi.fn(), agreements: vi.fn(), comment: vi.fn(), propose: vi.fn(), respond: vi.fn(), configure: vi.fn(), catalog: vi.fn(), revoke: vi.fn(), unshare: vi.fn(), canLeave: vi.fn(), actorId: "mentor" }));
vi.mock("@/features/projects/api/mentor-access.api", () => ({ mentorAccessApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: mocks.actorId } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "vi", t: (key: string) => key }) }));
vi.mock("@/features/projects/components/workspace-common", async original => ({ ...await original<typeof import("@/features/projects/components/workspace-common")>(), canLeaveWorkspace: () => mocks.canLeave() }));
const base: MentorAccessWorkspace = {
  viewerId: "mentor", projectId: "project", title: "Nhóm nghiên cứu", canManage: false, readOnly: false, page: 1, pageSize: 20, total: 1, hasNext: false,
  policies: [{ mentorId: "mentor", mentorName: "Giảng viên", invitationState: "ACCEPTED", policy: { id: "access", requestId: "request", relationshipId: "relationship", version: 2, preset: "ADVISOR", permissions: ["MANUSCRIPTS_VIEW", "MANUSCRIPTS_COMMENT"], expiresAt: null, revokedAt: null, effective: true }, shares: [{ id: "abstract", kind: "MANUSCRIPT", resourceId: "manuscript", sectionKey: "abstract", title: "Tóm tắt được duyệt", createdAt: "2026-10-28T08:00:00Z", revokedAt: null }] }],
};
const emptyPage = { items: [], page: 1, pageSize: 20, total: 0, hasNext: false };
let host: HTMLDivElement, root: Root, client: QueryClient;
async function tick() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); }
async function mount() { await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/academic-support/projects/project"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/academic-support/projects/:projectId" element={<MentorProjectPage />} /></Routes></MemoryRouter></QueryClientProvider>)); await tick(); await tick(); }
function button(label: string) { return [...document.querySelectorAll<HTMLButtonElement>("button")].find(value => value.textContent?.trim() === label)!; }
async function click(label: string) { expect(button(label), label).toBeDefined(); await act(async () => button(label).click()); await tick(); }
async function fill(label: string, value: string) {
  const input = [...document.querySelectorAll("label")].find(l => l.textContent?.startsWith(label))?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input,textarea"); expect(input, label).toBeDefined();
  await act(async () => { Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value); input!.dispatchEvent(new Event("input", { bubbles: true })); }); await tick();
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.actorId = "mentor"; vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); mocks.canLeave.mockResolvedValue(true);
  mocks.workspace.mockResolvedValue(structuredClone(base)); mocks.resource.mockResolvedValue({ ...base.policies[0]!.shares[0], content: "Nội dung đã được duyệt <script>private()</script>" }); mocks.feedback.mockResolvedValue(emptyPage); mocks.history.mockResolvedValue(emptyPage); mocks.agreements.mockResolvedValue(emptyPage); mocks.catalog.mockResolvedValue(emptyPage);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

it("renders only approved section text with no source, exports or team navigation", async () => {
  await mount(); expect(host.querySelector("h2")?.textContent).toBe("Nhóm nghiên cứu"); expect(host.textContent).toContain("Tóm tắt được duyệt"); expect(mocks.resource).not.toHaveBeenCalled();
  const summary = [...host.querySelectorAll("summary")].find(s => s.textContent?.includes("Tóm tắt được duyệt"))!;
  await act(async () => { const detail = summary.parentElement as HTMLDetailsElement; detail.open = true; detail.dispatchEvent(new Event("toggle")); }); await tick(); await tick();
  expect(mocks.resource).toHaveBeenCalledWith("project", "access", "abstract"); expect(host.textContent).toContain("Nội dung đã được duyệt"); expect(host.querySelector("script")).toBeNull();
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/academic-support?view=active"); expect(mocks.workspace).toHaveBeenCalledWith("project", 1);
  for (const label of ["Cấu hình quyền và chia sẻ", "Thu hồi truy cập", "Chia sẻ mã nguồn", "Shared research plan", "Team questions", "Download ZIP"]) expect(host.textContent).not.toContain(label);
  expect(mocks.comment).not.toHaveBeenCalled();
});
it("offers only the granted comment action and no dedicated chat when chat permission is absent", async () => {
  await mount(); const select = [...host.querySelectorAll("label")].find(l => l.textContent?.startsWith("Loại phản hồi"))?.querySelector("select");
  expect([...select!.options].map(o => o.value)).toEqual(["COMMENT"]); expect(host.textContent).not.toContain("Cuộc trao đổi riêng");
  await fill("Nội dung phản hồi", "So sánh với baseline rõ hơn"); await click("Gửi phản hồi");
  expect(mocks.comment).toHaveBeenCalledWith("project", "access", expect.objectContaining({ shareId: "abstract", kind: "COMMENT", body: "So sánh với baseline rõ hơn" }));
});
it("keeps failed drafts and retries with the same idempotency key", async () => {
  mocks.comment.mockRejectedValue(new Error("Offline")); await mount(); await fill("Nội dung phản hồi", "Không làm mất ý kiến này"); await click("Gửi phản hồi");
  expect(host.querySelector("textarea")?.value).toBe("Không làm mất ý kiến này"); expect(host.querySelector('[role="alert"]')).not.toBeNull(); const key = mocks.comment.mock.calls[0]![2].clientKey;
  await click("Gửi phản hồi"); expect(mocks.comment.mock.calls[1]![2].clientKey).toBe(key);
});
it("hides feedback posting for observers while keeping published content readable", async () => {
  const view = structuredClone(base); view.policies[0]!.policy = { ...view.policies[0]!.policy, preset: "OBSERVER", permissions: ["MANUSCRIPTS_VIEW"] }; mocks.workspace.mockResolvedValue(view); await mount();
  expect(host.textContent).toContain("Tóm tắt được duyệt"); expect(button("Gửi phản hồi")).toBeUndefined(); expect(mocks.comment).not.toHaveBeenCalled();
});
it("chooses suggestions for tasks rather than submitting an invalid comment", async () => {
  const view = structuredClone(base); view.policies[0]!.policy.permissions = ["TASKS_VIEW", "TASKS_SUGGEST"]; view.policies[0]!.shares[0] = { ...view.policies[0]!.shares[0]!, kind: "TASK", sectionKey: "", title: "Thí nghiệm" }; mocks.workspace.mockResolvedValue(view);
  await mount(); await fill("Nội dung phản hồi", "Thêm kiểm tra đối chứng"); await click("Gửi phản hồi"); expect(mocks.comment.mock.calls[0]![2].kind).toBe("SUGGESTION");
});
it("clears previously permitted UI on policy refresh without losing a pending text draft", async () => {
  await mount(); await fill("Nội dung phản hồi", "Bản nháp đang viết"); const next = structuredClone(base); next.policies[0]!.policy.version++; next.policies[0]!.policy.permissions = []; next.policies[0]!.shares = [];
  mocks.workspace.mockResolvedValue(next); await act(async () => { await client.invalidateQueries({ queryKey: ["mentor-access", "mentor", "project", "workspace"] }); }); await tick();
  expect(host.textContent).not.toContain("Tóm tắt được duyệt"); expect(button("Gửi phản hồi")).toBeUndefined();
  mocks.workspace.mockResolvedValue({ ...base, policies: [{ ...base.policies[0]!, policy: { ...base.policies[0]!.policy, version: 4 } }] });
  await act(async () => { await client.invalidateQueries({ queryKey: ["mentor-access", "mentor", "project", "workspace"] }); }); await tick(); expect(host.querySelector("textarea")?.value).toBe("Bản nháp đang viết");
});
it("hides cached resources and comments after an access-denied refetch", async () => {
  await mount(); mocks.workspace.mockRejectedValue({ isAxiosError: true, response: { status: 403 } });
  await act(async () => { await client.invalidateQueries({ queryKey: ["mentor-access", "mentor", "project", "workspace"] }); }); await tick();
  expect(host.textContent).toContain("Không gian cố vấn chưa khả dụng"); expect(host.textContent).not.toContain("Tóm tắt được duyệt"); expect(button("Gửi phản hồi")).toBeUndefined();
});
it("requires explicit reading confirmation before accepting a contribution agreement", async () => {
  const agreement: MentorAgreement = { id: "agreement", proposedById: "owner", creditRoles: ["SUPERVISION"], acknowledgement: "Cảm ơn góp ý thiết kế nghiên cứu", note: "", status: "PROPOSED", respondedById: null, createdAt: "2026-10-28T08:00:00Z" };
  mocks.agreements.mockResolvedValue({ ...emptyPage, total: 1, items: [agreement] }); await mount();
  expect(button("Chấp nhận thỏa thuận").disabled).toBe(true); const consentLabel = [...host.querySelectorAll("label")].find(l => l.textContent?.startsWith("Tôi đã đọc"))!; const checkbox = consentLabel.querySelector<HTMLInputElement>("input")!;
  await act(async () => checkbox.click()); await click("Chấp nhận thỏa thuận"); expect(mocks.respond).toHaveBeenCalledWith("project", "access", "agreement", "ACCEPTED");
});
it("does not let a nonowner teammate propose or accept agreements", async () => {
  mocks.actorId = "member"; mocks.workspace.mockResolvedValue({ ...base, viewerId: "member" }); mocks.agreements.mockResolvedValue({ ...emptyPage, total: 1, items: [{ id: "agreement", proposedById: "mentor", creditRoles: ["SUPERVISION"], acknowledgement: "Đề nghị ghi nhận", status: "PROPOSED" }] }); await mount();
  expect(button("Đề xuất thỏa thuận")).toBeUndefined(); expect(button("Chấp nhận thỏa thuận")).toBeUndefined(); expect(button("Gửi phản hồi")).toBeDefined();
});
it("keeps completed projects readable and disables new collaboration", async () => {
  mocks.workspace.mockResolvedValue({ ...base, readOnly: true }); await mount(); expect(host.textContent).toContain("Tóm tắt được duyệt"); expect(button("Gửi phản hồi")).toBeUndefined(); expect(button("Đề xuất thỏa thuận")).toBeUndefined();
});
it("paginates mentor feedback independently", async () => {
  mocks.feedback.mockResolvedValue({ ...emptyPage, total: 21, hasNext: true }); await mount(); await click("Trang sau"); expect(mocks.feedback).toHaveBeenLastCalledWith("project", "access", 2);
});
it("retains a stale permission draft until the owner explicitly reloads", async () => {
  mocks.actorId = "owner"; const view = { ...structuredClone(base), viewerId: "owner", canManage: true }; mocks.workspace.mockResolvedValue(view); await mount(); await click("Cấu hình quyền và chia sẻ"); await fill("Lý do thay đổi", "Cập nhật theo trao đổi");
  const newer = structuredClone(view); newer.policies[0]!.policy.version++; mocks.workspace.mockResolvedValue(newer);
  await act(async () => { await client.invalidateQueries({ queryKey: ["mentor-access", "owner", "project", "workspace"] }); }); await tick();
  expect(button("Lưu quyền và nội dung đã duyệt").disabled).toBe(true); expect(document.body.textContent).toContain("Bản nháp vẫn được giữ"); expect(mocks.configure).not.toHaveBeenCalled();
});
