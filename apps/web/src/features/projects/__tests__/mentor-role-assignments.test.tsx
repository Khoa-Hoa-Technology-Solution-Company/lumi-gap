// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MentorRoleAssignments } from "../components/mentor-role-assignments";
import { supervisorInvitationEn } from "@/i18n/locales/supervisor-invitation";
const mocks = vi.hoisted(() => ({ roles: vi.fn(), proposeRoles: vi.fn(), respondRoles: vi.fn() }));
vi.mock("../api/academic-support.api", () => ({ academicSupportApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: any) => select({ user: { id: "viewer" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => (supervisorInvitationEn as Record<string, string>)[key] ?? key }) }));
const mentors = [{ relationshipId: "a", mentorId: "ma", fullName: "Lecturer An", role: "UNASSIGNED" }, { relationshipId: "b", mentorId: "mb", fullName: "Lecturer Binh", role: "UNASSIGNED" }];
let root: Root, host: HTMLDivElement, client: QueryClient;
async function tick() { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); }
async function mount() { await act(async () => root.render(<QueryClientProvider client={client}><MentorRoleAssignments projectId="project" /></QueryClientProvider>)); await tick(); }
async function click(label: string) { await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label)!.click()); await tick(); }
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); mocks.roles.mockResolvedValue({ canPropose: true, mentors, proposals: [] }); mocks.proposeRoles.mockResolvedValue({}); mocks.respondRoles.mockResolvedValue({}); client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
it("keeps role allocation optional and does not treat the first accepted mentor as primary", async () => {
  await mount(); expect(host.querySelector("details")!.open).toBe(false);
  expect([...host.querySelectorAll("select")].map(s => s.value)).toEqual(["UNASSIGNED", "UNASSIGNED"]);
  expect(mocks.proposeRoles).not.toHaveBeenCalled();
});
it("retains proposed choices and the request key after an API failure", async () => {
  mocks.proposeRoles.mockRejectedValueOnce(new Error("Offline")); await mount();
  await act(async () => { const select = host.querySelector("select")!; select.value = "PRIMARY"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await click("Propose roles"); expect(host.querySelector("select")!.value).toBe("PRIMARY"); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  const first = mocks.proposeRoles.mock.calls[0]; await click("Propose roles"); expect(mocks.proposeRoles.mock.calls[1]).toEqual(first);
});
it("shows the affected mentor explicit accept/decline actions rather than changing duties automatically", async () => {
  mocks.roles.mockResolvedValue({ canPropose: false, mentors, proposals: [{ id: "proposal", status: "PENDING", assignments: [{ relationshipId: "a", mentorId: "ma", fullName: "Lecturer An", from: "UNASSIGNED", to: "PRIMARY" }], confirmedBy: [], canConfirm: true, canCancel: false }] });
  await mount(); expect(host.querySelector("form")).toBeNull(); expect(host.querySelector("details")!.open).toBe(true);
  expect(mocks.respondRoles).not.toHaveBeenCalled(); await click("Agree to proposed role"); expect(mocks.respondRoles).toHaveBeenCalledWith("project", "proposal", "ACCEPT");
});
it("does not offer consent actions to unaffected viewers", async () => {
  mocks.roles.mockResolvedValue({ canPropose: false, mentors, proposals: [{ id: "proposal", status: "PENDING", assignments: [], confirmedBy: [], canConfirm: false, canCancel: false }] });
  await mount(); expect(host.querySelector("button")).toBeNull(); expect(host.querySelector("select")).toBeNull();
});
it("provides a real retry when role information cannot be loaded", async () => {
  mocks.roles.mockRejectedValueOnce(new Error("Offline")); await mount(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await click("Try again"); expect(host.querySelector("select")).not.toBeNull();
});
