// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SubmissionListPage } from "@/pages/submissions/submission-list";
import { SubmissionNewPage } from "@/pages/submissions/submission-new";
import { SubmissionDetailPage } from "@/pages/submissions/submission-detail";
import { ProjectSubmissionsPanel } from "../components/project-submissions-panel";

const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), projects: vi.fn(), project: vi.fn(), create: vi.fn(), historyQuery: vi.fn(), preReviews: vi.fn(), addRevision: vi.fn(), user: { systemRole: "USER", emailVerifiedAt: "2026-10-01" }, history: { canManage: true, canRequestReview: true, canRunAiPreReview: true, currentRevisionNumber: 2, reviewRequests: [] as Array<{ id: string; reviewerName: string; status: string; revisionNumber: number; dueAt: string | null; canView: boolean }>, revisions: [] } }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
vi.mock("@/features/auth", () => ({ useCurrentUser: () => ({ data: { user: mocks.user }, isLoading: false }) }));
vi.mock("@/features/submissions", () => ({
  useSubmissions: mocks.list, useSubmission: mocks.detail,
  useCreateSubmission: () => ({ mutateAsync: mocks.create, isPending: false }),
  useSubmissionHistory: mocks.historyQuery,
  useAddSubmissionRevision: () => ({ mutateAsync: mocks.addRevision, isPending: false }), useAiPreReviews: mocks.preReviews, useRunAiPreReview: () => ({}),
}));
vi.mock("@/features/projects/hooks/use-projects", () => ({ useProjects: mocks.projects, useProject: mocks.project }));
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
  mocks.project.mockReturnValue({ data: { _id: "project-a", title: "Current research", researchField: "Education" } });
  mocks.detail.mockReturnValue({ data: { _id: "manuscript", title: "Project paper", status: "submitted", researchQuestions: [] } });
  mocks.create.mockResolvedValue({ submission: { _id: "new-paper" } });
  Object.assign(mocks.history, { canManage: true, canRequestReview: true, canRunAiPreReview: true, reviewRequests: [] });
  mocks.historyQuery.mockReturnValue({ data: mocks.history });
  mocks.preReviews.mockReturnValue({ data: [] });
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
  expect(container.textContent).toContain("Current research");
  expect(container.querySelector<HTMLInputElement>('input:not([type="file"])')?.value).toBe("Current research");
  expect(container.querySelector('details')?.open).toBe(false);
  expect(container.querySelector('textarea')?.parentElement?.hidden).toBe(true);
  const file = new File(["PDF"], "paper.pdf", { type: "application/pdf" });
  const input = container.querySelector('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ projectId: "project-a", title: "Current research", researchField: "Education" }), file }));
  expect(container.querySelector("output")?.textContent).toBe("/projects/project-a?tab=submissions&submission=new-paper");
});

async function chooseFile(file = new File(["PDF"], "paper.pdf", { type: "application/pdf" })) {
  const input = container.querySelector('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  return file;
}
async function submitForm() {
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
async function toggleIntroduction() {
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-controls]')!.click());
}
async function changeInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
  await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
}

it("uses the PDF as research context instead of requiring separate scientific claim fields", async () => {
  await render(<SubmissionNewPage projectId="project-a" projectTitle="Current research" />);
  expect(container.querySelectorAll('textarea')).toHaveLength(1);
  expect(container.querySelector('textarea')?.parentElement?.hidden).toBe(true);
  expect(container.querySelector('summary')?.textContent).toContain("Research paper · Education");
  expect(container.querySelector('[role="toolbar"]')).toBeNull();
  expect(container.textContent).not.toContain("Research goal");
  expect(container.textContent).not.toContain("Expected reviewer workload");
  await chooseFile();
  await submitForm();
  const input = mocks.create.mock.calls[0]![0].input;
  expect(input.researchGoal).toBeUndefined();
  expect(input.methodology).toBeUndefined();
  expect(input.expectedReviewWorkload).toBeUndefined();
});

it("does not show empty research detail cards for a PDF-only submission", async () => {
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  expect(container.textContent).not.toContain("Not specified");
  expect(container.textContent).not.toContain("Research goal");
});

it("preserves structured research details on older submissions", async () => {
  mocks.detail.mockReturnValue({ data: { _id: "manuscript", title: "Project paper", status: "submitted", researchQuestions: ["What improves feedback?"], methodology: "A controlled study" } });
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  expect(container.textContent).toContain("What improves feedback?");
  expect(container.textContent).toContain("A controlled study");
  expect(container.textContent).not.toContain("Not specified");
});

it("saves the introduction as formatted content and displays it as a document on detail", async () => {
  const introduction = "## Research overview\n\nA **team** study.\n\n- Review evidence\n- Discuss findings";
  await render(<SubmissionNewPage projectId="project-a" />);
  await toggleIntroduction();
  await changeInput(container.querySelector<HTMLTextAreaElement>('textarea')!, introduction);
  await chooseFile();
  await submitForm();
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ abstract: introduction }) }));
  mocks.detail.mockReturnValue({ data: { _id: "manuscript", title: "Project paper", status: "submitted", researchQuestions: [], abstract: introduction } });
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  expect([...container.querySelectorAll('h2')].some(heading => heading.textContent === "Research overview")).toBe(true);
  expect(container.querySelector('strong')?.textContent).toBe("team");
  expect(container.textContent).not.toContain("## Research overview");
});

it("retains the edited title, summary and PDF after a failure and prevents simultaneous submissions", async () => {
  mocks.create.mockRejectedValueOnce(new Error("network"));
  await render(<SubmissionNewPage projectId="project-a" projectTitle="Current research" />);
  await changeInput(container.querySelector<HTMLInputElement>('input:not([type="file"])')!, "My manuscript title");
  await toggleIntroduction();
  await changeInput(container.querySelector<HTMLTextAreaElement>('textarea')!, "A short summary");
  const file = await chooseFile();
  await submitForm();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("retained");
  expect(container.querySelector<HTMLInputElement>('input:not([type="file"])')?.value).toBe("My manuscript title");
  expect(container.querySelector('textarea')?.value).toBe("A short summary");
  await toggleIntroduction();
  expect(container.querySelector('textarea')?.parentElement?.hidden).toBe(true);
  await toggleIntroduction();
  expect(container.querySelector('textarea')?.value).toBe("A short summary");
  expect(container.textContent).toContain("paper.pdf");
  let finish!: (value: unknown) => void;
  mocks.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => {
    const form = container.querySelector('form')!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(mocks.create).toHaveBeenCalledTimes(2);
  expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ file, input: expect.objectContaining({ title: "My manuscript title", abstract: "A short summary" }) }));
  await act(async () => finish({ submission: { _id: "new-paper" } }));
});

it("rejects empty, oversized and non-PDF files before calling the API", async () => {
  await render(<SubmissionNewPage projectId="project-a" projectTitle="Current research" />);
  const huge = new File(["PDF"], "large.pdf", { type: "application/pdf" });
  Object.defineProperty(huge, "size", { value: 10 * 1024 * 1024 + 1 });
  for (const file of [new File([], "empty.pdf", { type: "application/pdf" }), huge, new File(["text"], "paper.txt", { type: "text/plain" })]) {
    await chooseFile(file);
    await submitForm();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("10 MB");
  }
  expect(mocks.create).not.toHaveBeenCalled();
});

it("lets the author edit or clear automatic defaults without a background refresh overwriting them", async () => {
  await render(<SubmissionNewPage projectId="project-a" />);
  const title = container.querySelector<HTMLInputElement>('input:not([type="file"])')!;
  await changeInput(title, "An edited title");
  mocks.project.mockReturnValue({ data: { title: "Changed project", researchField: "Medicine" } });
  await render(<SubmissionNewPage projectId="project-a" />);
  expect(title.value).toBe("An edited title");
  await changeInput(title, "");
  expect(title.value).toBe("");
  await chooseFile();
  await submitForm();
  expect(mocks.create).not.toHaveBeenCalled();
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
  expect(container.textContent).not.toContain("New PDF version");
  expect(container.textContent).not.toContain("Request review");
  expect(container.textContent).not.toContain("Run pre-review");
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

it("separates revision, invitation and AI permissions", async () => {
  mocks.history.canRequestReview = false;
  mocks.history.canRunAiPreReview = false;
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  expect(container.textContent).toContain("New PDF version");
  expect(container.textContent).not.toContain("Request review");
  expect(container.textContent).not.toContain("Run pre-review");
});
it("hides AI actions on completed submissions even with stale permissions", async () => {
  mocks.detail.mockReturnValue({ data: { title: "Completed", status: "completed" } });
  await render(<SubmissionDetailPage submissionId="manuscript" />);
  expect(container.textContent).not.toContain("Run pre-review");
});
it("shows reviewer progress, older revision guidance and only authorized request links", async () => {
  mocks.history.reviewRequests = [
    { id: "own-request", reviewerName: "Lecturer A", status: "REVISION_REQUESTED", revisionNumber: 1, dueAt: "2026-11-01", canView: true },
    { id: "team-request", reviewerName: "Lecturer B", status: "ACCEPTED", revisionNumber: 2, dueAt: null, canView: false },
  ];
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  expect(container.textContent).toContain("Lecturer A");
  expect(container.textContent).toContain("Revision requested");
  expect(container.textContent).toContain("Uploading a version does not resend it");
  expect(container.querySelector('a[href="/review-requests/own-request"]')).not.toBeNull();
  expect(container.querySelector('a[href="/review-requests/team-request"]')).toBeNull();
});
it("retries history and AI loads independently", async () => {
  const historyRetry = vi.fn(), aiRetry = vi.fn();
  mocks.historyQuery.mockReturnValue({ error: new Error("offline"), refetch: historyRetry });
  mocks.preReviews.mockReturnValue({ error: new Error("offline"), refetch: aiRetry });
  await render(<SubmissionDetailPage submissionId="manuscript" />);
  const retries = Array.from(container.querySelectorAll('button')).filter(button => button.textContent === "Retry");
  await act(async () => retries.forEach(button => button.click()));
  expect(historyRetry).toHaveBeenCalledOnce();
  expect(aiRetry).toHaveBeenCalledOnce();
});
it("ignores a second PDF upload while the first request is pending", async () => {
  let resolve!: () => void;
  mocks.addRevision.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  const versionButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent === "New PDF version")!;
  await act(async () => versionButton.click());
  await chooseFile();
  const upload = Array.from(container.querySelectorAll('button')).find(button => button.textContent === "Upload version")!;
  await act(async () => { upload.click(); upload.click(); });
  expect(mocks.addRevision).toHaveBeenCalledOnce();
  await act(async () => resolve());
});
it("identifies an AI result for an older revision instead of presenting it as current", async () => {
  mocks.detail.mockReturnValue({ data: { title: "Updated paper", status: "revised", currentRevisionId: "v2" } });
  mocks.preReviews.mockReturnValue({ data: [{ id: "analysis", status: "COMPLETED", sourceRevisionId: "v1", sourceRevisionNumber: 1, summary: "Earlier analysis", reviewFocusAreas: [], limitations: [], unsupportedClaims: [], citationIssues: [] }] });
  await render(<SubmissionDetailPage submissionId="manuscript" />);
  expect(container.textContent).toContain("Analyzed revision 1");
  expect(container.textContent).toContain("This AI pre-review targets an earlier version");
});
it("refreshes both the request progress and the submission status", async () => {
  const historyRefresh = vi.fn(), detailRefresh = vi.fn();
  mocks.historyQuery.mockReturnValue({ data: mocks.history, refetch: historyRefresh });
  mocks.detail.mockReturnValue({ data: { title: "Paper", status: "under_review" }, refetch: detailRefresh });
  await render(<SubmissionDetailPage submissionId="manuscript" />);
  const refresh = Array.from(container.querySelectorAll('button')).find(button => button.textContent === "Refresh review status")!;
  await act(async () => refresh.click());
  expect(historyRefresh).toHaveBeenCalledOnce();
  expect(detailRefresh).toHaveBeenCalledOnce();
});
