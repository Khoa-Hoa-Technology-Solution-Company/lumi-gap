// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MentorRecruitmentPlan as Plan } from "@trend/shared-types";
import { MentorRecruitmentPlan, AddMentorCandidate } from "../components/mentor-recruitment-plan";

const api = vi.hoisted(() => ({ plan: vi.fn(), changePlan: vi.fn() }));
vi.mock("../api/academic-support.api", () => ({ academicSupportApi: api }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: "owner" } }) }));
let root: Root, host: HTMLDivElement, client: QueryClient, data: Plan;
const onSend = vi.fn(), onClose = vi.fn();
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("button")];
const button = (label: string) => buttons().find(b => b.textContent === label)!;
async function tick() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); }
async function mount(add = false) {
  await act(async () => root.render(<QueryClientProvider client={client}>{add ? <AddMentorCandidate projectId="project" mentor={{ _id: "lecturer", fullName: "Giảng viên An", expertiseAreas: [], researchInterests: [], matchedTerms: [], sameInstitution: false, acceptingMentorships: true }} onClose={onClose} /> : <MentorRecruitmentPlan projectId="project" onSend={onSend} />}</QueryClientProvider>)); await tick();
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  data = { id: "plan", version: 3, parallelInvitations: false, autoSend: false, closedRoles: [], currentMentors: [], currentInvitations: [], canManage: true,
    positions: { PRIMARY: { role: "PRIMARY", status: "VACANT", pendingRequests: 0 }, SECONDARY: { role: "SECONDARY", status: "VACANT", pendingRequests: 0 } },
    candidates: [{ id: "first", mentorUserId: "an", fullName: "Giảng viên An", mentorRole: "PRIMARY", priority: 1, status: "READY", canSend: true }, { id: "backup", mentorUserId: "binh", fullName: "Giảng viên Bình", mentorRole: "PRIMARY", priority: 2, status: "PLANNED", canSend: false }] };
  api.plan.mockImplementation(async () => data); api.changePlan.mockImplementation(async () => data);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

it("distinguishes ready/backup candidates and only opens preview for the next candidate", async () => {
  await mount(); expect(host.textContent).toContain("2/4 ứng viên"); expect(host.textContent).toContain("Dự phòng — chưa gửi");
  expect(buttons().filter(b => b.textContent === "Xem trước và gửi lời mời")).toHaveLength(1);
  await act(async () => button("Xem trước và gửi lời mời").click());
  expect(onSend).toHaveBeenCalledWith(data.candidates[0], 3); expect(api.changePlan).not.toHaveBeenCalled();
});
it("saves explicit parallel invitation mode using the current server version", async () => {
  await mount(); const input = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(input.checked).toBe(false); await act(async () => input.click()); await tick();
  expect(api.changePlan).toHaveBeenCalledWith("project", { action: "configure", expectedVersion: 3, parallelInvitations: true });
});
it("reorders only planned candidates and sends the requested direction", async () => {
  await mount(); await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Ưu tiên Giảng viên Bình"]')!.click()); await tick();
  expect(api.changePlan).toHaveBeenCalledWith("project", { action: "move", candidateId: "backup", offset: -1, expectedVersion: 3 });
});
it("shows accepted and pending mentors independently of history pagination", async () => {
  data.currentMentors = [{ mentorRole: "SECONDARY", fullName: "Cô Hạnh" }]; data.positions.SECONDARY.status = "ASSIGNED";
  data.currentInvitations = [{ mentorRole: "PRIMARY", fullName: "Thầy Minh" }]; data.positions.PRIMARY.status = "INVITING";
  data.candidates = []; await mount(); expect(host.textContent).toContain("Cô Hạnh"); expect(host.textContent).toContain("Đang chờ Thầy Minh phản hồi");
});
it("explains incompatible legacy invitations and paused recruitment", async () => {
  data.positions.PRIMARY.pendingRequests = 2; data.closedRoles = ["SECONDARY"]; await mount();
  expect(host.textContent).toContain("Có 2 lời mời cũ cùng vai trò"); expect(host.textContent).toContain("Mở đợt mới để xác nhận tuyển lại");
});
it("requires a separate confirmation to start a new campaign", async () => {
  await mount(); await act(async () => button("Mở đợt mời mới").click()); await tick();
  expect(api.changePlan).not.toHaveBeenCalled(); expect(document.querySelector('[role="dialog"]')?.textContent).toContain("không liên hệ ứng viên cũ");
  await act(async () => button("Mở đợt mới").click()); await tick();
  expect(api.changePlan).toHaveBeenCalledWith("project", { action: "restart", expectedVersion: 3 });
});
it("keeps candidate role/input on server conflicts and offers a retry", async () => {
  api.changePlan.mockRejectedValue({ response: { data: { error: { message: "Kế hoạch đã thay đổi" } } } });
  await mount(true); const select = document.querySelector("select")!;
  await act(async () => { select.value = "SECONDARY"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => button("Thêm vào kế hoạch").click()); await tick();
  expect(api.changePlan).toHaveBeenCalledWith("project", { action: "add", mentorUserId: "lecturer", mentorRole: "SECONDARY", expectedVersion: 3 });
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Kế hoạch đã thay đổi"); expect(select.value).toBe("SECONDARY"); expect(onClose).not.toHaveBeenCalled();
});
it("disables mutations on read-only projects", async () => {
  data.canManage = false; await mount();
  expect(button("Mở đợt mời mới").disabled).toBe(true); expect(button("Xem trước và gửi lời mời").disabled).toBe(true);
});
it("requires choosing an open role when the primary role has already been assigned", async () => {
  data.positions.PRIMARY.status = "ASSIGNED"; await mount(true);
  expect(button("Thêm vào kế hoạch").disabled).toBe(true);
  const select = document.querySelector("select")!;
  expect(select.options[0]!.disabled).toBe(true);
  await act(async () => { select.value = "SECONDARY"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(button("Thêm vào kế hoạch").disabled).toBe(false);
});
