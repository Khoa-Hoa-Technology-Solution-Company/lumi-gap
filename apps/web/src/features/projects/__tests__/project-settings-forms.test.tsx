// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IProject } from "@trend/shared-types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectTeamSettings } from "../components/project-team-settings";

const mocks = vi.hoisted(() => ({ update: vi.fn(), retry: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string) => key }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "owner" } }) }));
vi.mock("@/features/auth/api/auth.api", () => ({ authApi: { academicOnboardingOptions: async () => ({ researchAreas: ["Education", "Computer Science", "Biology", "Medicine"] }) } }));
vi.mock("../hooks/use-projects", () => ({
  useProjectTeam: () => ({ isLoading: false, isError: true, refetch: mocks.retry }),
  useUpdateProject: () => ({ mutateAsync: mocks.update, isPending: false }),
  useArchiveProject: () => ({ isPending: false }), useRestoreProject: () => ({ isPending: false }),
  useDeleteProject: () => ({ isPending: false }), useLeaveProject: () => ({ isPending: false }),
}));
vi.mock("../components/project-mentor-summary", () => ({ ProjectMentorSummary: () => null }));
vi.mock("../components/project-members-tab", () => ({ ProjectMembersTab: () => <p>Current project members</p> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const project: IProject = { _id: "project", title: "Research idea", description: "Existing objective", visibility: "PRIVATE", status: "PLANNING", ownerId: "owner", accessRole: "OWNER", version: 3, memberCount: 1, paperCount: 0, members: [], papers: [], updatedAt: "2026-10-14T10:00:00Z", createdAt: "2026-10-14T10:00:00Z" };
let root: Root, container: HTMLDivElement, client: QueryClient;
async function render(value = project) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/projects/project?tab=members&team=settings"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ProjectTeamSettings project={value} /></MemoryRouter></QueryClientProvider>));
}
async function fill(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
const submit = async (selector = "form") => act(async () => container.querySelector(selector)!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks();
  mocks.update.mockImplementation(async patch => ({ ...project, ...patch, version: 4 }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });

it("scopes saves and hides the public editor, discovery form and advanced actions initially", async () => {
  await render();
  expect(container.querySelector("#project-public-summary")).toBeNull();
  expect(container.querySelector("[role=listbox]")).toBeNull();
  expect(container.querySelector<HTMLDetailsElement>("details")?.open).toBe(false);
  expect(container.textContent).not.toContain("Let verified lecturers discover this project");
  expect(container.querySelector('a[href="/projects/project?tab=support"]')).not.toBeNull();
  expect([...container.querySelectorAll<HTMLButtonElement>('button[type=submit]')].every(button => button.disabled)).toBe(true);
  await fill("#project-settings-title", "Renamed project"); await submit();
  expect(mocks.update).toHaveBeenCalledWith({ title: "Renamed project", expectedVersion: 3 });
});
it("retains dirty edits and their original version when refetched project data changes", async () => {
  await render(); await fill("#project-settings-title", "My draft");
  await render({ ...project, title: "Changed remotely", version: 4 });
  expect(container.querySelector<HTMLInputElement>("#project-settings-title")!.value).toBe("My draft");
  expect(container.textContent).toContain("A newer version is available");
  await submit(); expect(mocks.update).toHaveBeenCalledWith({ title: "My draft", expectedVersion: 3 });
});
it("preserves legacy privacy and objectives when only a title changes", async () => {
  await render({ ...project, visibility: "INVITE_ONLY", description: "Existing objective ".repeat(280), researchField: "Legacy area ".repeat(12) });
  await fill("#project-settings-title", "New title"); await submit();
  expect(mocks.update).toHaveBeenCalledWith({ title: "New title", expectedVersion: 3 });
});
it("requires an explicit confirmation and a scoped privacy update to publish", async () => {
  await render({ ...project, publicSummary: "Safe introduction" });
  await act(async () => container.querySelectorAll<HTMLInputElement>('input[type=radio]')[1]!.click());
  expect(container.querySelector<HTMLTextAreaElement>("#project-public-summary")?.value).toBe("Safe introduction");
  await submit('form[aria-labelledby="project-privacy-heading"]');
  expect(mocks.update).not.toHaveBeenCalled();
  expect(document.querySelector('[role=dialog]')?.textContent).toContain("Publish project introduction?");
  const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === "Confirm publication")!;
  await act(async () => confirm.click());
  expect(mocks.update).toHaveBeenCalledWith({ visibility: "PUBLIC", expectedVersion: 3 });
});
it("keeps the saved summary when privacy switches back to private", async () => {
  await render({ ...project, visibility: "PUBLIC_SUMMARY", publicSummary: "Saved introduction" });
  await act(async () => container.querySelectorAll<HTMLInputElement>('input[type=radio]')[0]!.click());
  expect(container.querySelector("#project-public-summary")).toBeNull();
  await submit('form[aria-labelledby="project-privacy-heading"]');
  expect(mocks.update).toHaveBeenCalledWith({ visibility: "PRIVATE", expectedVersion: 3 });
});
it("supports keyboard selection, custom areas, the three-item limit and Escape", async () => {
  await render(); const combo = container.querySelector<HTMLInputElement>('[role=combobox]')!;
  await act(async () => combo.focus());
  await act(async () => combo.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  await act(async () => combo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(container.querySelector('button[aria-label="Remove Computer Science"]')).not.toBeNull();
  await fill('[role=combobox]', "Custom area");
  await act(async () => combo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await fill('[role=combobox]', "Biology");
  await act(async () => combo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(container.textContent).toContain("3/3");
  expect([...container.querySelectorAll<HTMLButtonElement>('[role=option]')].every(option => option.disabled)).toBe(true);
  await act(async () => combo.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(combo.getAttribute("aria-expanded")).toBe("false");
  await submit(); expect(mocks.update).toHaveBeenCalledWith({ researchAreas: ["Computer Science", "Custom area", "Biology"], expectedVersion: 3 });
});
it("protects dirty drafts when switching tabs", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await render(); await fill("#project-settings-title", "Unsaved title");
  await act(async () => container.querySelector<HTMLButtonElement>("#project-people-tab")!.click());
  expect(container.querySelector<HTMLInputElement>("#project-settings-title")?.value).toBe("Unsaved title"); expect(confirm).toHaveBeenCalledOnce();
  confirm.mockRestore();
});
