// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SupervisorInvitationForm } from "../components/supervisor-invitation-form";
import { supervisorInvitationEn } from "@/i18n/locales/supervisor-invitation";

const mocks = vi.hoisted(() => ({ settings: vi.fn(), list: vi.fn(), plan: vi.fn(), request: vi.fn(), close: vi.fn(), saveSettings: vi.fn(), actor: "owner" }));
vi.mock("../api/academic-support.api", () => ({ academicSupportApi: mocks }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: Object.assign((select: any) => select({ user: { id: mocks.actor } }), { getState: () => ({ user: { id: mocks.actor } }) }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => (supervisorInvitationEn as Record<string, string>)[key] ?? key }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("../components/workspace-common", () => ({ useUnsavedWorkspace: vi.fn(), canLeaveWorkspace: async () => true }));

const summary = "Our team compares reproducible medical image analysis methods, documents the baseline and studies appropriate evaluation protocols.";
const project = { id: "project", title: "Clinical research", summary: "", researchField: "Computer Science", researchAreas: ["Medical imaging"], mentoringNeeds: "", expertise: [], stage: "PLANNING" as const, discovery: "CLOSED" as const, availableRoles: ["PRIMARY" as const], teamMemberCount: 3 };
let root: Root, host: HTMLDivElement, client: QueryClient;
async function tick() { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); }
async function mount(recipient = "lecturer") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><SupervisorInvitationForm project={project} mentor={{ _id: recipient, fullName: "Dr. Lecturer", verifiedLecturer: true }} onClose={mocks.close} /></MemoryRouter></QueryClientProvider>));
  await tick(); await tick();
}
async function fill(index: number, value: string) {
  const input = document.querySelectorAll("textarea")[index]!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function click(text: string) { await act(async () => { [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text)!.click(); }); await tick(); }

async function valid() { await fill(1, "Please guide our medical imaging evaluation protocol."); }
async function submit() { await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); await tick(); }
beforeEach(() => {
  vi.resetAllMocks(); mocks.actor = "owner"; sessionStorage.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.settings.mockResolvedValue({ ...project, version: 1, previewToken: "a".repeat(64), invitationDefaults: { summary, goal: "Compare reproducible protocols", keywords: ["Imaging"] }, invitationSender: { fullName: "Student Owner" }, invitationContext: { title: project.title, researchField: project.researchField, researchAreas: project.researchAreas, senderDisplayName: "Student Owner", memberCount: 3, token: "b".repeat(64) } });
  mocks.list.mockResolvedValue({ positions: { PRIMARY: { status: "VACANT" }, SECONDARY: { status: "LOCKED" } } });
  mocks.plan.mockResolvedValue({ closedRoles: [], parallelInvitations: false }); mocks.request.mockResolvedValue({ status: "PENDING" });
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

it("autofills owner data and links to the selected academic profile without updating shared discovery", async () => {
  await mount(); expect(document.querySelector("textarea")?.value).toBe(summary);
  expect(document.body.textContent).toContain("Student Owner"); expect(document.body.textContent).not.toContain("Compare reproducible protocols");
  const profile = document.querySelector<HTMLAnchorElement>('.supervisor-recipient a')!;
  expect(profile.getAttribute("href")).toBe("/academics/lecturer"); expect(profile.target).toBe("_blank");
  expect(mocks.saveSettings).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
});
it("requires only two meaningful inputs, shares no hidden defaults and keeps support optional", async () => {
  await mount(); await fill(0, ""); await submit();
  for (const field of ["summary", "message"]) expect(document.getElementById(`invite-${field}-error`)).not.toBeNull();
  expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  await fill(0, summary); await fill(1, "Please guide our medical imaging evaluation protocol."); await submit();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(mocks.request.mock.calls[0]![4]).toMatchObject({ expectedPreviewToken: "b".repeat(64), dossier: { presentation: "BRIEF", researchSummary: summary, sharingConfirmed: true, expectations: { supportAreas: [] } } });
  expect(mocks.request.mock.calls[0]![4].dossier).not.toHaveProperty("approvedObjective");
  expect(mocks.request.mock.calls[0]![4].dossier).not.toHaveProperty("keywords");
});

it("explains the numeric-only inputs from the reported screenshot and accepts research text containing numbers", async () => {
  await mount();
  await fill(0, "12211221 122121"); await fill(1, "11212122121211221 121212"); await submit();
  expect(document.getElementById("invite-summary-error")?.textContent).toBe(supervisorInvitationEn["supervisor.summaryNumbersError"]);
  expect(document.getElementById("invite-message-error")?.textContent).toBe(supervisorInvitationEn["supervisor.reasonNumbersError"]);
  expect(document.activeElement?.id).toBe("invite-summary");
  expect(mocks.request).not.toHaveBeenCalled();
  expect(document.querySelectorAll("textarea")[0]!.value).toBe("12211221 122121");
  await fill(0, "Nhóm so sánh 2 mô hình học máy trên dữ liệu y tế.");
  await fill(1, "Nhờ thầy góp ý cách đánh giá 2 mô hình và thiết kế thực nghiệm.");
  expect(document.getElementById("invite-summary-error")).toBeNull();
  expect(document.getElementById("invite-message-error")).toBeNull();
  await submit(); expect(mocks.request).toHaveBeenCalledTimes(1);
});

it("retains every field after a lost response and reuses the same idempotency key across remount and retry", async () => {
  mocks.request.mockRejectedValueOnce(new Error("Response lost")); await mount(); await valid(); await submit();
  const first = mocks.request.mock.calls[0]!; expect(document.querySelectorAll("textarea")[1]!.value).toBe(first[2]); expect(mocks.close).not.toHaveBeenCalled();
  mocks.list.mockResolvedValue({ positions: { PRIMARY: { status: "INVITING" }, SECONDARY: { status: "LOCKED" } } });
  await act(async () => root.unmount()); root = createRoot(host); await mount();
  expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  await submit(); expect(mocks.request.mock.calls[1]).toEqual(first); expect(mocks.close).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("lumigap-supervisor-invite:owner:project:lecturer")).toBeNull();
});
it("sends once even when the submit event fires twice before React rerenders", async () => {
  let finish!: () => void; mocks.request.mockImplementation(() => new Promise<void>(r => { finish = r; }));
  await mount(); await valid();
  await act(async () => { const form = document.querySelector("form")!; for (let i = 0; i < 2; i++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(mocks.request).toHaveBeenCalledTimes(1); await act(async () => finish());
});
it("updates the message and summary immediately to match the exact send payload", async () => {
  await mount(); await valid(); await fill(0, "Study clinical AI."); await fill(1, "Please guide our comparison design.");
  await submit(); const call = mocks.request.mock.calls[0]!;
  expect(call[2]).toBe("Please guide our comparison design."); expect(call[4].dossier.researchSummary).toBe("Study clinical AI.");
});

it("separates drafts by account and recipient instead of carrying a previous sender's message", async () => {
  await mount(); await fill(1, "Private note belonging to the first owner");
  mocks.actor = "other-owner"; await mount(); expect(document.querySelectorAll("textarea")[1]!.value).toBe("");
  expect(sessionStorage.getItem("lumigap-supervisor-invite:owner:project:lecturer")).toContain("first owner");
  await fill(1, "Different recipient's invitation note"); await mount("other-lecturer"); expect(document.querySelectorAll("textarea")[1]!.value).toBe("");
});
it("blocks submission while authorization metadata fails and preserves the note for retry", async () => {
  mocks.settings.mockRejectedValueOnce(new Error("Offline")); await mount(); await fill(1, "Preserve my research invitation note");
  expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  await click("Try again"); expect(document.querySelectorAll("textarea")[1]!.value).toContain("Preserve"); expect(document.querySelector("textarea")!.value).toBe(summary);
});

it("accepts a short meaningful introduction with no support selection and only two textareas", async () => {
  await mount(); expect(document.querySelectorAll("textarea")).toHaveLength(2);
  expect(document.querySelector("select")).toBeNull(); expect(document.querySelector('input[type="date"]')).toBeNull();
  expect(document.querySelector(".supervisor-optional")).toBeNull();
  expect(document.querySelector(".supervisor-privacy")).toBeNull();
  await fill(0, "Study clinical AI."); await fill(1, "Please guide our methods."); await submit();
  expect(mocks.request).toHaveBeenCalledWith("project", "lecturer", "Please guide our methods.", expect.any(String), expect.objectContaining({ mentorRole: "UNASSIGNED", dossier: expect.objectContaining({ expectations: { supportAreas: [] } }) }));
});
it.each(["", "test", "!!!!!!!!", "aaaaaaaaaaaa", "test test test"])("rejects the placeholder summary %s without using an 80-character minimum", async value => {
  await mount(); await fill(0, value); await fill(1, "Please help our research."); await submit();
  expect(mocks.request).not.toHaveBeenCalled(); expect(document.getElementById("invite-summary-error")).not.toBeNull();
});
it("recovers the former reason and additional message into one invitation without altering existing sent history", async () => {
  sessionStorage.setItem("lumigap-supervisor-invite:owner:project:lecturer", JSON.stringify({ summary, reason: "Our team seeks your research guidance.", additional: "We would appreciate a short introductory meeting.", support: [], period: "2026-12-01", role: "PRIMARY" }));
  await mount(); expect(document.querySelectorAll("textarea")[1]!.value).toContain("introductory meeting"); expect(document.querySelectorAll("textarea")[1]!.value).toContain("research guidance");
});
