// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MainLayout } from "../MainLayout";

const auth = vi.hoisted(() => ({
  user: undefined as { id: string; fullName: string; email: string; academicRole: string; systemRole: string } | undefined,
}));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }), LanguageSwitcher: () => null }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ tokens: { accessToken: "isolated-test-token" }, user: auth.user }) }));
vi.mock("@/features/auth", () => ({ resolvePostAuthPath: (_user: unknown, path: string) => path, useCurrentUser: () => ({ data: auth.user ? { user: auth.user } : undefined, isFetching: false }), useLogout: () => ({ mutate: vi.fn() }) }));
vi.mock("@/features/credits", () => ({ useCreditBalance: () => ({ data: undefined }) }));
vi.mock("@/features/bookmarks", () => ({ useBookmarks: () => ({ data: [] }) }));
vi.mock("@/features/notifications", () => ({ useNotifications: () => ({ data: [], isLoading: false }) }));
vi.mock("@/features/notifications/components/notification-menu", () => ({ default: () => null }));
vi.mock("@/components/route-transition", () => ({ RouteTransition: ({ children }: { children: React.ReactNode }) => children }));

let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function MentorDestination() { const location = useLocation(); return <><h1>Mentor workspace</h1><output data-destination={`${location.pathname}${location.search}${location.hash}`} /></>; }
async function render(path = "/") {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route element={<MainLayout />}><Route path="/" element={<h1>Home content</h1>} /><Route path="/projects" element={<h1>Original projects</h1>} /><Route path="/projects/:id" element={<h1>Full team project</h1>} /><Route path="/reviews/:assignmentId" element={<h1>Original review</h1>} /><Route path="/review-requests/:requestId" element={<h1>Original request</h1>} /><Route path="/review-templates/:templateId/edit" element={<h1>Original template</h1>} /></Route><Route path="/mentor-workspace" element={<MentorDestination />} /></Routes></MemoryRouter>));
}
it.each(["", "?view=trash", "?view=invitations", "?scope=OWNED&status=ACTIVE&sort=NAME&q=study&create=1#list"])("keeps a lecturer's personal projects outside the mentor shell: %s", async suffix => {
  auth.user = { id: "lecturer", email: "lecturer@example.test", fullName: "Lecturer", academicRole: "LECTURER", systemRole: "USER" };
  await render(`/projects${suffix}`);
  expect(host.textContent).toContain("Original projects");
  expect(host.querySelector("[data-destination]")).toBeNull();
});
it.each(["STUDENT", "RESEARCHER"])("keeps the existing project directory for %s", async academicRole => {
  auth.user = { id: "member", email: "member@example.test", fullName: "Member", academicRole, systemRole: "USER" };
  await render("/projects?view=trash");
  expect(host.textContent).toContain("Original projects");
  expect(host.querySelector("[data-destination]")).toBeNull();
});
it("preserves full project access for a lecturer who is an owner or member", async () => {
  auth.user = { id: "lecturer", email: "lecturer@example.test", fullName: "Lecturer", academicRole: "LECTURER", systemRole: "USER" };
  await render("/projects/owned?tab=members");
  expect(host.textContent).toContain("Full team project");
  expect(host.querySelector("[data-destination]")).toBeNull();
});
it.each([
  ["/reviews/assigned", "review", "assignmentId", "assigned"],
  ["/review-requests/request", "review-request", "requestId", "request"],
  ["/review-templates/template/edit", "template-builder", "templateId", "template"],
])("opens a lecturer's saved %s URL inside the mentor shell with the original selector", async (path, view, key, id) => {
  auth.user = { id: "lecturer", email: "lecturer@example.test", fullName: "Lecturer", academicRole: "LECTURER", systemRole: "USER" };
  await render(`${path}?view=wrong&${key}=wrong&section=feedback#evidence`);
  const destination = new URL(host.querySelector('[data-destination]')!.getAttribute('data-destination')!, 'http://localhost');
  expect(destination.pathname).toBe('/mentor-workspace');
  expect(destination.searchParams.get('view')).toBe(view);
  expect(destination.searchParams.get(key)).toBe(id);
  expect(destination.searchParams.get('section')).toBe('feedback');
  expect(destination.hash).toBe('#evidence');
  expect(host.querySelector('.lumi-app-header')).toBeNull();
});
it.each(['STUDENT', 'RESEARCHER'])("preserves the original review page for %s accounts", async academicRole => {
  auth.user = { id: "author", email: "author@example.test", fullName: "Author", academicRole, systemRole: "USER" };
  await render('/reviews/assigned');
  expect(host.textContent).toContain('Original review');
  expect(host.querySelector('[data-destination]')).toBeNull();
});
it.each([["STUDENT", "USER", false], ["LECTURER", "USER", true], ["STUDENT", "ADMIN", true]] as const)("renders the signed-in %s/%s home and its correct mentor action", async (academicRole, systemRole, mentorAccess) => {
  auth.user = { id: "actor", email: "actor@example.test", fullName: "Signed-in user", academicRole, systemRole };
  await render();
  expect(host.textContent).toContain("Home content");
  const account = host.querySelector<HTMLButtonElement>('button[aria-label="Account"]')!;
  expect(account).not.toBeNull();
  await act(async () => { account.focus(); account.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  const mentorItem = [...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === "mentorWorkspace.title");
  expect(Boolean(mentorItem)).toBe(mentorAccess);
  expect(document.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0);
  expect([...document.querySelectorAll('[role="menuitem"]')].filter(item => item.textContent === "mentorWorkspace.title")).toHaveLength(mentorAccess ? 1 : 0);
});
it("places the lecturer workspace only in the avatar menu and opens it", async () => {
  auth.user = { id: "lecturer", email: "lecturer@example.test", fullName: "Lecturer", academicRole: "LECTURER", systemRole: "USER" };
  await render();
  const workspace = [...host.querySelectorAll<HTMLButtonElement>('nav[aria-label="Primary navigation"] button')].find(button => button.textContent === "Workspace")!;
  await act(async () => { workspace.focus(); workspace.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  expect(document.querySelector('[role="menu"] a[href="/mentor-workspace"]')).toBeNull();
  expect(document.querySelector('[role="menu"] a[href="/academic-support"]')).toBeNull();
  expect(document.querySelector('[role="menu"] a[href="/mentor-workspace?view=reviews"]')).not.toBeNull();
  expect(document.querySelector('[role="menu"] a[href="/mentor-workspace?view=templates"]')).not.toBeNull();
  expect(document.querySelector('[role="menu"] a[href="/mentor-workspace?view=research-projects"]')).toBeNull();
  expect(document.querySelector('[role="menu"] a[href="/projects"]')).not.toBeNull();
  // Close the Workspace menu from inside it (Radix listens on the open content), then open the avatar menu.
  await act(async () => { document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  expect(document.querySelector('[role="menu"]')).toBeNull();
  const account = host.querySelector<HTMLButtonElement>('button[aria-label="Account"]')!;
  await act(async () => { account.focus(); account.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  const mentorItem = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent === "mentorWorkspace.title")!;
  await act(async () => mentorItem.click());
  expect(host.textContent).toBe("Mentor workspace");
});
it("keeps signed-in home visible while the current-user response is loading", async () => {
  auth.user = undefined; await render();
  expect(host.textContent).toContain("Home content"); expect(host.querySelector('button[aria-label="Account"]')).not.toBeNull();
});
