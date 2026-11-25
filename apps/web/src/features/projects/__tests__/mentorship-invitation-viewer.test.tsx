// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MentorshipRequest } from "@trend/shared-types";
import { supervisorInvitationEn } from "@/i18n/locales/supervisor-invitation";
import { MentorshipInvitationViewer } from "../components/mentorship-invitation-viewer";
const mocks = vi.hoisted(() => ({ detail: vi.fn(), respond: vi.fn(), actor: "owner" }));
vi.mock("../api/academic-support.api", () => ({ academicSupportApi: { requestDetail: mocks.detail, respond: mocks.respond } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: Object.assign((select: any) => select({ user: { id: mocks.actor } }), { getState: () => ({ user: { id: mocks.actor } }) }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => (supervisorInvitationEn as Record<string, string>)[key] ?? key }) }));
const item: MentorshipRequest = {
  kind: "REQUEST", id: "request", projectId: "project", viewer: "SENDER", direction: "PROJECT_TO_LECTURER", status: "PENDING", mentorRole: "UNASSIGNED", createdAt: "2026-11-18T10:00:00Z", updatedAt: "2026-11-18T10:00:00Z",
  mentorUser: { _id: "mentor", fullName: "Lecturer recipient" }, requestedBy: { _id: "owner", fullName: "Frozen sender" },
  message: "Please guide our experimental design.", actions: { accept: false, decline: false, cancel: true, openProject: false, end: false },
  dossier: { version: 1, presentation: "BRIEF", senderDisplayName: "Frozen sender", generatedAt: "2026-11-18T10:00:00Z",
    project: { id: "project", title: "Frozen research project", abstract: "We compare two clinical models.", abstractApproved: true, researchAreas: ["Computer Science"], keywords: [], stage: "ACTIVE", teamMemberCount: 3 },
    team: { teamMemberCount: 3, representative: null, sharedMembers: [], sharedMembersCount: 0, privacyRedactedCount: 2 }, competencies: { researchMethods: [], technicalSkills: [], researchTools: [], experienceHighlights: [], integrityNotice: "" },
    whyThisLecturer: { message: "Please guide our experimental design." }, expectations: { supportAreas: [] },
    accessPreview: { mentorRole: "UNASSIGNED", preset: "ADVISOR", permissions: [], permissionCount: 0, sharedResourceSummary: [], beforeAcceptNotice: "", afterAcceptNotice: "" },
  },
};
let root: Root, host: HTMLDivElement, client: QueryClient;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label);
async function tick() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
async function mount() { await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><MentorshipInvitationViewer projectId="project" requestId="request" onClose={vi.fn()} /></MemoryRouter></QueryClientProvider>)); await tick(); await tick(); }
beforeEach(() => { vi.resetAllMocks(); mocks.actor = "owner"; mocks.detail.mockResolvedValue(structuredClone(item)); mocks.respond.mockResolvedValue(item); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

it("shows only the sender's status and withdrawal actions without mentor-oriented access text", async () => {
  await mount(); expect(document.body.textContent).toContain("Sent invitation"); expect(document.body.textContent).toContain("Lecturer recipient"); expect(document.body.textContent).toContain("Waiting for the lecturer's response");
  expect(document.body.textContent).not.toContain("If you accept"); expect(document.body.textContent).not.toContain("You will join");
  expect(button("Accept supervision")).toBeUndefined(); expect(button("Decline")).toBeUndefined(); expect(button("Withdraw")).toBeDefined(); expect(button("Open project")).toBeUndefined();
  expect(document.querySelector('[data-testid="invitation-summary-preview"]')?.textContent).toBe(item.dossier!.project.abstract);
  expect(document.querySelector('[data-testid="invitation-message-preview"]')?.textContent).toBe(item.message);
});
it("gives the recipient the snapshot and explicit acceptance actions while keeping duplicate clicks single-flight", async () => {
  mocks.actor = "mentor"; const recipient = { ...item, viewer: "RECIPIENT", actions: { ...item.actions, accept: true, decline: true, cancel: false } };
  mocks.detail.mockResolvedValue(recipient); await mount(); expect(document.body.textContent).toContain("Supervision invitation"); expect(document.body.textContent).toContain("If you accept"); expect(button("Withdraw")).toBeUndefined();
  let finish!: (value: unknown) => void; mocks.respond.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { button("Accept supervision")!.click(); button("Accept supervision")!.click(); }); expect(mocks.respond).toHaveBeenCalledTimes(1);
  const accepted = { ...recipient, status: "ACCEPTED", actions: { ...recipient.actions, accept: false, decline: false, openProject: true } }; mocks.detail.mockResolvedValue(accepted);
  await act(async () => finish(accepted)); await tick(); expect(document.body.textContent).toContain("You are now supervising this project"); expect(button("Accept supervision")).toBeUndefined();
});
it("keeps project members read-only even when they can read the same snapshot", async () => {
  mocks.actor = "member"; mocks.detail.mockResolvedValue({ ...item, viewer: "TEAM", actions: { ...item.actions, cancel: false } }); await mount();
  expect(document.body.textContent).not.toContain("If you accept"); expect(button("Withdraw")).toBeUndefined(); expect(button("Accept supervision")).toBeUndefined(); expect(button("Decline")).toBeUndefined();
});
it.each(["ACCEPTED", "DECLINED", "CANCELED_BY_PROJECT"])("shows %s after reload without offering another action", async status => {
  mocks.detail.mockResolvedValue({ ...item, status }); await mount(); expect(document.body.textContent).toContain(status); expect(button("Withdraw")).toBeUndefined(); expect(button("Accept supervision")).toBeUndefined();
});
it("refuses an unauthorized detail response without showing cached snapshot text or action controls", async () => {
  mocks.actor = "outsider"; mocks.detail.mockRejectedValue({ response: { data: { error: { message: "Not authorized" } } } }); await mount();
  expect(document.body.textContent).toContain("Not authorized"); expect(document.body.textContent).not.toContain("Frozen research project"); expect(button("Withdraw")).toBeUndefined();
});
it("requires explicit confirmation before withdrawing a sender's pending request and displays the returned terminal status", async () => {
  const cancelled = { ...item, status: "CANCELED_BY_PROJECT", actions: { ...item.actions, cancel: false } }; mocks.respond.mockResolvedValue(cancelled); await mount(); mocks.detail.mockResolvedValue(cancelled);
  await act(async () => button("Withdraw")!.click()); await tick();
  expect(mocks.respond).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Confirm withdrawing this invitation?");
  await act(async () => button("Confirm withdraw")!.click()); await tick();
  expect(mocks.respond).toHaveBeenCalledWith(expect.objectContaining({ id: "request" }), "cancel", ""); expect(document.body.textContent).toContain("CANCELED_BY_PROJECT");
});
