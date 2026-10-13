// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SubmissionListPage } from "@/pages/submissions/submission-list";
import { SubmissionNewPage } from "@/pages/submissions/submission-new";
import { SubmissionDetailPage } from "@/pages/submissions/submission-detail";
import { ProjectSubmissionsPanel } from "../components/project-submissions-panel";

const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), projects: vi.fn(), create: vi.fn(), user: { systemRole: "USER", emailVerifiedAt: "2026-10-01" }, history: { canManage: true, revisions: [] } }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
vi.mock("@/features/auth", () => ({ useCurrentUser: () => ({ data: { user: mocks.user }, isLoading: false }) }));
vi.mock("@/features/submissions", () => ({
  useSubmissions: mocks.list, useSubmission: mocks.detail,
  useCreateSubmission: () => ({ mutateAsync: mocks.create, isPending: false }),
  useSubmissionHistory: () => ({ data: mocks.history }),
  useAddSubmissionRevision: () => ({}), useAiPreReviews: () => ({ data: [] }), useRunAiPreReview: () => ({}),
}));
vi.mock("@/features/projects/hooks/use-projects", () => ({ useProjects: mocks.projects }));
vi.mock("@/features/submissions/components/version-history", () => ({ VersionHistory: ({ readOnly }: { readOnly: boolean }) => <div data-readonly={readOnly}>Version history</div> }));
vi.mock("@/features/reviews/components/submit-review-dialog", () => ({ SubmitReviewDialog: () => <button>Request review</button> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let root: Root, container: HTMLDivElement;
function Location() { return <output>{useLocation().pathname}{useLocation().search}</output>; }
async function render(node: ReactNode, path = "/projects/project-a?tab=submissions") {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}<Location /></MemoryRouter>));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks(); mocks.user.emailVerifiedAt = "2026-10-01";
  mocks.list.mockReturnValue({ data: [], isLoading: false });
  mocks.projects.mockReturnValue({ data: [] });
  mocks.detail.mockReturnValue({ data: { _id: "manuscript", title: "Project paper", status: "submitted", researchQuestions: [] } });
  mocks.create.mockResolvedValue({ submission: { _id: "new-paper" } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("requests submissions for the current project and keeps creation inside its workspace", async () => {
  await render(<SubmissionListPage projectId="project-a" />);
  expect(mocks.list).toHaveBeenCalledWith("project-a");
  expect(container.querySelector("a")?.getAttribute("href")).toBe("/projects/project-a?tab=submissions&submission=new");
  expect(container.querySelector("h1")).toBeNull();
});
it("keeps manuscript links in the project despite an internal UUID in the response", async () => {
  mocks.list.mockReturnValue({ data: [{ _id: "paper", projectId: "internal-uuid", title: "Team paper", status: "submitted", updatedAt: "2026-10-13", currentRevisionNumber: 1 }] });
  await render(<SubmissionListPage projectId="legacy-id" />);
  expect(container.querySelector('a[href*="submission=paper"]')?.getAttribute("href")).toBe("/projects/legacy-id?tab=submissions&submission=paper");
});
it("fixes the project on creation and submits its ID, then opens the new detail in context", async () => {
  await render(<SubmissionNewPage projectId="project-a" projectTitle="Current research" />);
  expect(mocks.projects).toHaveBeenCalledWith({ enabled: false });
  expect(container.querySelector<HTMLInputElement>('input[readonly]')?.value).toBe("Current research");
  const file = new File(["PDF"], "paper.pdf", { type: "application/pdf" });
  const input = container.querySelector('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ projectId: "project-a" }), file }));
  expect(container.querySelector("output")?.textContent).toBe("/projects/project-a?tab=submissions&submission=new-paper");
});
it("uses the selected submission ID instead of the project's route ID and returns to its list", async () => {
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  expect(mocks.detail).toHaveBeenCalledWith("manuscript", "project-a");
  expect(container.querySelector("a")?.getAttribute("href")).toBe("/projects/project-a?tab=submissions");
  expect(container.querySelector("h1")).toBeNull();
});
it("hides creation and all revision/review actions in a read-only project", async () => {
  await render(<SubmissionListPage projectId="project-a" readOnly />);
  expect(container.querySelector("a")).toBeNull();
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" readOnly />);
  expect(container.querySelector("button")).toBeNull();
  expect(container.querySelector('[data-readonly="true"]')).not.toBeNull();
});
it("blocks a direct creation URL for an archived project without mounting the form", async () => {
  await render(<ProjectSubmissionsPanel projectId="project-a" projectTitle="Research" readOnly />, "/projects/project-a?tab=submissions&submission=new");
  expect(container.textContent).toContain("Archived projects are read-only.");
  expect(container.querySelector("form")).toBeNull();
  expect(mocks.projects).not.toHaveBeenCalled();
});
it("retains email verification for the embedded research workflow", async () => {
  mocks.user.emailVerifiedAt = "";
  await render(<ProjectSubmissionsPanel projectId="project-a" projectTitle="Research" readOnly={false} />);
  expect(container.querySelector("output")?.textContent).toBe("/verify-email");
  expect(mocks.list).not.toHaveBeenCalled();
});
