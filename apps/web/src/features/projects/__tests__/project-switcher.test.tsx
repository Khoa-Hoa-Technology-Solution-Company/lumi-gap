// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { IProject } from "@trend/shared-types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectSwitcher } from "../components/project-switcher";
import { useUnsavedWorkspace } from "../components/workspace-common";

const mocks = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock("@/services/confirmation", () => ({ confirmUnsavedChanges: mocks.confirm }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string) => key }) }));
const first: IProject = { _id: "first", title: "First project", visibility: "PRIVATE", status: "ACTIVE", ownerId: "owner", accessRole: "OWNER", memberCount: 1, paperCount: 0, members: [], papers: [], createdAt: "2026-10-01", updatedAt: "2026-10-01" };
const second = { ...first, _id: "second", title: "Second project" };
let root: Root, container: HTMLDivElement;
function Draft() { useUnsavedWorkspace(true); return <textarea defaultValue="Unsynced project introduction" />; }
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
async function render(dirty = true) {
  await act(async () => root.render(<MemoryRouter initialEntries={["/projects/first?tab=plan&revision=first-version&q=research"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <ProjectSwitcher projects={[first, second]} allProjects={[first, second]} selectedId="first" />{dirty && <Draft />}<Location />
  </MemoryRouter>));
}
async function choose(id: string) {
  await act(async () => { const select = container.querySelector<HTMLSelectElement>("#project-switcher-select")!; select.value = id; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); mocks.confirm.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("keeps the current project and its draft when mobile switching is declined", async () => {
  mocks.confirm.mockResolvedValue(false); await render(); await choose("second");
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(container.querySelector("output")?.textContent).toBe("/projects/first?tab=plan&revision=first-version&q=research");
  expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Unsynced project introduction");
  expect(container.querySelector<HTMLSelectElement>("#project-switcher-select")?.value).toBe("first");
});
it("switches after confirmation and strips another project's record identifiers", async () => {
  mocks.confirm.mockResolvedValue(true); await render(); await choose("second");
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(container.querySelector("output")?.textContent).toBe("/projects/second?q=research&tab=plan");
});
it("switches a clean project without prompting", async () => {
  await render(false); await choose("second");
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(container.querySelector("output")?.textContent).toBe("/projects/second?q=research&tab=plan");
});
it("keeps a dirty project selected without prompting when the selection is unchanged", async () => {
  await render(); await choose("first");
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(container.querySelector("output")?.textContent).toBe("/projects/first?tab=plan&revision=first-version&q=research");
});
