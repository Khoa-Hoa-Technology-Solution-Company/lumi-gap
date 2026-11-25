// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useSearchParams } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReviewDashboardPage } from "@/pages/reviews/review-dashboard";
import { ReviewTemplatesPage } from "@/pages/reviews/review-templates";
import { ReviewTemplateBuilderPage } from "@/pages/reviews/review-template-builder";
import { useReviewPageNavigation } from "../hooks/use-review-page-navigation";
import { mentorWorkspaceEn } from "@/i18n/locales/mentor-workspace";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "en",
    t: (key: string, values: Record<string, string | number> = {}) => {
      let result = mentorWorkspaceEn[key as keyof typeof mentorWorkspaceEn] ?? key;
      for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{{${name}}}`, String(value));
      return result;
    },
  }),
}));

const mocks = vi.hoisted(() => ({ create: vi.fn(), save: vi.fn(), publish: vi.fn(), detail: vi.fn(), denied: false }));
const template = {
  id: "rubric", name: "Research design rubric", source: "PERSONAL", status: "PUBLISHED", artifactType: "MANUSCRIPT", projectId: null,
  versions: [], activeVersion: { versionNumber: 1, reviewMode: "STRUCTURED_REVIEW", description: "Evidence-based criteria", guidelines: ["Check evidence"], criteria: [{ id: "criterion", key: "methods", order: 1, title: "Methods", description: "Check methodology", required: true, allowNotApplicable: false, levels: [] }] },
};
vi.mock("@/features/academic-profile/hooks/use-verified-lecturer", () => ({ useVerifiedLecturer: () => true }));
vi.mock("@/features/projects/hooks/use-projects", () => ({ useProjects: () => ({ data: [] }) }));
vi.mock("@/features/reviews", () => ({
  useReviewCenter: () => ({ error: mocks.denied ? new Error("403") : null, data: { incoming: [{ id: "request", status: "IN_REVIEW", artifact: { title: "Assigned research paper", type: "MANUSCRIPT", revisionNumber: 2 }, reviewer: { fullName: "Mentor" }, requester: { fullName: "Student" }, assignment: { id: "assignment" } }], sent: [] } }),
  useReviewRequestAction: () => ({ accept: { mutateAsync: vi.fn() }, decline: { mutateAsync: vi.fn() } }),
  useReviewTemplates: () => ({ error: mocks.denied ? new Error("403") : null, data: [template] }),
  useDuplicateReviewTemplate: () => ({ mutateAsync: vi.fn() }),
  useArchiveReviewTemplate: () => ({ mutateAsync: vi.fn() }),
  useReviewTemplate: (id: string) => { mocks.detail(id); return { data: id ? template : undefined }; },
  useCreateReviewTemplate: () => ({ mutateAsync: mocks.create }),
  useSaveReviewTemplateVersion: () => ({ mutateAsync: mocks.save }),
  usePublishReviewTemplate: () => ({ mutateAsync: mocks.publish }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let host: HTMLDivElement, root: Root;
function Assignment() { const { param, href } = useReviewPageNavigation(); return <p>Assigned review: {param("assignmentId")}<a href={href("/reviews")}>Back</a></p>; }
function Screen() {
  const [params] = useSearchParams();
  const location = useLocation();
  const view = params.get("view");
  return <><output>{location.pathname}{location.search}</output>{view === "templates" ? <ReviewTemplatesPage /> : view === "template-builder" ? <ReviewTemplateBuilderPage key={params.get("templateId") ?? "new"} /> : view === "review" ? <Assignment /> : <ReviewDashboardPage />}</>;
}
async function mount(view = "reviews") { await act(async () => root.render(<MemoryRouter initialEntries={[`/mentor-workspace?view=${view}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Screen /></MemoryRouter>)); }
async function click(text: string) { await act(async () => [...host.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>('button,a')].find(el => el.textContent === text)!.click()); }
async function fill(placeholder: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); mocks.denied = false; mocks.create.mockResolvedValue({ id: "created" }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("opens the exact assigned review from Review Center while retaining the mentor URL", async () => {
  await mount();
  await act(async () => [...host.querySelectorAll('button')].find(el => el.textContent?.startsWith('In Progress'))!.click());
  await click('Start Review');
  expect(host.querySelector('output')?.textContent).toBe('/mentor-workspace?view=review&assignmentId=assignment');
  expect(host.textContent).toContain('Assigned review: assignment');
  expect(host.querySelector('a[href="/mentor-workspace?view=reviews"]')).not.toBeNull();
});
it("creates a template with the existing API then opens its edit screen in the mentor shell", async () => {
  await mount('templates'); await click('Create Review Template');
  expect(host.querySelector('output')?.textContent).toBe('/mentor-workspace?view=template-builder');
  await fill('FPT SE Research Proposal Review', 'New methods rubric');
  await fill('Criterion title', 'Study methodology'); await click('Save Draft');
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'New methods rubric', publish: false, criteria: [expect.objectContaining({ title: 'Study methodology' })] }));
  expect(host.querySelector('output')?.textContent).toBe('/mentor-workspace?view=template-builder&templateId=created');
  expect(mocks.detail).toHaveBeenLastCalledWith('created');
  await click('Back to templates');
  expect(host.querySelector('output')?.textContent).toBe('/mentor-workspace?view=templates');
});
it("loads the selected template and hides cached review/template content after access errors", async () => {
  await mount('template-builder&templateId=rubric');
  expect(mocks.detail).toHaveBeenLastCalledWith('rubric');
  expect(host.querySelector<HTMLInputElement>('input[placeholder="FPT SE Research Proposal Review"]')?.value).toBe('Research design rubric');
  await click('Back to templates');
  mocks.denied = true; await mount('templates');
  expect(host.textContent).not.toContain('Research design rubric');
  expect(host.textContent).toContain('Review templates could not be loaded');
});
