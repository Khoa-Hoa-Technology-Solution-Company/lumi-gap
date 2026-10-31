// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectMembersTab } from "../components/project-members-tab";

const mocks = vi.hoisted(() => ({ invite: vi.fn(), cancel: vi.fn(), resend: vi.fn(), remove: vi.fn(), transfer: vi.fn(), search: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, string>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => values?.[name] ?? "") }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: "owner", fullName: "Project Owner" } }) }));
vi.mock("@/services/api-client", () => ({ api: { get: mocks.search } }));
vi.mock("../hooks/use-projects", () => ({
  useInviteProjectMember: () => ({ mutateAsync: mocks.invite, isPending: false }),
  useCancelProjectInvitation: () => ({ mutateAsync: mocks.cancel, isPending: false }),
  useResendProjectInvitation: () => ({ mutateAsync: mocks.resend, isPending: false }),
  useRemoveMemberFromProject: () => ({ mutateAsync: mocks.remove, isPending: false }),
  useTransferProjectOwnership: () => ({ mutateAsync: mocks.transfer, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let root: Root, container: HTMLDivElement, client: QueryClient;
function Location() { return <output data-location>{useLocation().search}</output>; }
async function render(currentUserId = "owner", readOnly = false) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/projects/project?tab=members"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ProjectMembersTab projectId="project" projectTitle="Research evidence" readOnly={readOnly} members={[{ targetKind: "User", targetId: { _id: "owner", fullName: "Project Owner", email: "owner@example.test" }, role: "OWNER" }]} pendingInvitations={[]} ownerId="owner" currentUserId={currentUserId} /><Location /></MemoryRouter></QueryClientProvider>));
}
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
async function fill(email: string) {
  const input = document.querySelector<HTMLInputElement>("#project-invite-email")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, email);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.invite.mockResolvedValue(undefined);
  mocks.search.mockResolvedValue({ data: { data: [] } });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("shows one owner badge and uses a system invitation without a message field", async () => {
  await render();
  expect(container.textContent).toContain("Project owner");
  expect(container.textContent).not.toContain("Creator");
  expect(mocks.search).not.toHaveBeenCalled();
  await click("Invite member");
  expect(document.querySelector("textarea")).toBeNull();
  expect(document.querySelector('[aria-label="Invitation email"]')?.textContent).toContain("Project Owner invites you to collaborate on Research evidence.");
  await fill("external@example.test");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(mocks.invite).toHaveBeenCalledWith({ email: "external@example.test" });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("debounces user lookup and invites the chosen user without allowing a changed account email", async () => {
  mocks.search.mockResolvedValue({ data: { data: [{ id: "person", fullName: "Research Collaborator", email: "person@example.test" }] } });
  await render(); await click("Invite member");
  await fill("per"); await fill("person@example.test");
  expect(mocks.search).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(mocks.search).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  const userButton = document.querySelector<HTMLButtonElement>('ul[aria-label="Matching users"] button');
  expect(userButton).not.toBeNull();
  await act(async () => userButton!.click());
  expect(document.querySelector("#project-invite-email")).toBeNull();
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(mocks.invite).toHaveBeenCalledWith({ userId: "person" });
});

it("routes mentor collaboration through the consent workflow without sending a member invitation", async () => {
  await render(); await click("Invite member");
  expect(document.querySelector('input[type="radio"]')).toBeNull();
  const next = document.querySelector<HTMLAnchorElement>('a[href="/projects/project?tab=support"]')!;
  expect(next.textContent).toBe("Continue to Academic Support");
  await act(async () => next.click());
  expect(container.querySelector("[data-location]")?.textContent).toBe("?tab=support");
  expect(mocks.invite).not.toHaveBeenCalled();
});

it("does not expose invitation or ownership controls to a regular member", async () => {
  await render("member");
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "Invite member")).toBeUndefined();
  expect(container.querySelector('[aria-label="Transfer ownership"]')).toBeNull();
  expect(mocks.search).not.toHaveBeenCalled();
});

it("keeps the chosen recipient when invitation delivery fails", async () => {
  mocks.invite.mockRejectedValue(new Error("Offline"));
  await render(); await click("Invite member"); await fill("external@example.test");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(document.querySelector<HTMLInputElement>("#project-invite-email")?.value).toBe("external@example.test");
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});
it("does not expose member management for an archived project owner", async () => {
  await render("owner", true);
  expect(container.textContent).toContain("Project owner");
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "Invite member")).toBeUndefined();
  expect(container.querySelector('[aria-label="Transfer ownership"]')).toBeNull();
  expect(mocks.invite).not.toHaveBeenCalled();
});

it("prevents repeated submission and navigation away while the invitation is being sent", async () => {
  let finish!: () => void;
  mocks.invite.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await render(); await click("Invite member"); await fill("external@example.test");
  await act(async () => {
    const form = document.querySelector("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    document.querySelector<HTMLAnchorElement>('a[href="/projects/project?tab=support"]')!.click();
  });
  expect(mocks.invite).toHaveBeenCalledTimes(1);
  expect(container.querySelector("[data-location]")?.textContent).toBe("?tab=members");
  await act(async () => finish());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("clears the previous error when the invitation form is closed and reopened", async () => {
  mocks.invite.mockRejectedValue({ response: { status: 409 } });
  await render(); await click("Invite member"); await fill("external@example.test");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("pending invitation");
  await click("Cancel"); await click("Invite member");
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.querySelector<HTMLInputElement>("#project-invite-email")?.value).toBe("");
});
