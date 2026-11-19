// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SubmissionListPage } from "@/pages/submissions/submission-list";
import { SubmissionNewPage } from "@/pages/submissions/submission-new";
import { SubmissionDetailPage } from "@/pages/submissions/submission-detail";
import { ProjectSubmissionsPanel } from "../components/project-submissions-panel";
vi.mock("@/features/submissions/components/mentor-manuscript-dialog", () => ({ MentorManuscriptDialog: (props: {open:boolean; projectId:string; onSent:(result:unknown)=>void}) => props.open ? <div data-send-project={props.projectId}><button onClick={() => props.onSent({submissionId:"new-paper"})}>Send fixture</button></div> : null }));
const createVersion = vi.hoisted(() => vi.fn());

const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), projects: vi.fn(), project: vi.fn(), create: vi.fn(), historyQuery: vi.fn(), preReviews: vi.fn(), addRevision: vi.fn(), activeMentors: vi.fn(), user: { systemRole: "USER", emailVerifiedAt: "2026-10-01" }, history: { canManage: true, canRequestReview: true, canRunAiPreReview: true, currentRevisionNumber: 2, reviewRequests: [] as Array<{ id: string; reviewerName: string; status: string; revisionNumber: number; dueAt: string | null; canView: boolean }>, revisions: [] } }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? "")), language: "en" }) }));
vi.mock("@/features/auth", () => ({ useCurrentUser: () => ({ data: { user: mocks.user }, isLoading: false }) }));
vi.mock("@/features/submissions", () => ({
  useSubmissions: mocks.list, useSubmission: mocks.detail,
  useCreateSubmission: () => ({ mutateAsync: mocks.create, isPending: false }),
  useSubmissionHistory: mocks.historyQuery,
  useCreateSubmissionVersion: () => ({ mutateAsync: createVersion, isPending: false }),
  useAddSubmissionRevision: () => ({ mutateAsync: mocks.addRevision, isPending: false }), useSubmitFeedback: () => ({ mutateAsync: vi.fn(), isPending: false }), useActiveMentors: mocks.activeMentors, useAiPreReviews: mocks.preReviews, useRunAiPreReview: () => ({}),
}));
vi.mock("@/features/projects/hooks/use-projects", () => ({ useProjects: mocks.projects, useProject: mocks.project }));
vi.mock("@/features/submissions/components/version-history", () => ({ VersionHistory: ({ readOnly }: { readOnly: boolean }) => <div data-readonly={readOnly}>Version history</div> }));
vi.mock("@/features/reviews/components/submit-review-dialog", () => ({ SubmitReviewDialog: () => <button>Request review</button> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let root: Root, container: HTMLDivElement;
async function chooseFile(file = new File(["PDF"], "paper.pdf", { type: "application/pdf" })) {
  const input = container.querySelector('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  return file;
}
async function changeInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
  await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
}
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
  mocks.activeMentors.mockReturnValue({ data: [], isLoading: false });
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
it("does not show empty research detail cards for a PDF-only submission", async () => {
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  expect(container.textContent).not.toContain("Not specified");
  expect(container.textContent).not.toContain("Research goal");
});

it("opens detail after an uncached load without changing hook order", async () => {
  mocks.detail.mockReturnValue({ isLoading: true });
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  mocks.detail.mockReturnValue({ data: { _id: "manuscript", title: "Loaded manuscript", status: "submitted", currentRevisionId: "v2" } });
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  expect(container.textContent).toContain("Loaded manuscript");
});

it("does not claim a mentor task exists for an unassigned submission", async () => {
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  expect(container.textContent).not.toContain("Chờ Mentor góp ý");
  expect(container.textContent).not.toContain("Bản thảo đã được gửi vào danh sách nhiệm vụ của Mentor");
});

it("waits for revision metadata before offering a PDF download", async () => {
  mocks.historyQuery.mockReturnValue({ isLoading: true });
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  expect(container.textContent).not.toContain("Tải PDF");
  expect(container.textContent).not.toContain("Tải tệp PDF");
});
it("can recover from an unavailable detail without changing hook order", async () => {
  mocks.detail.mockReturnValue({ error: new Error("offline"), refetch: vi.fn() });
  await render(<SubmissionDetailPage submissionId="manuscript" />);
  mocks.detail.mockReturnValue({ data: { _id: "manuscript", title: "Recovered manuscript", status: "submitted" } });
  await render(<SubmissionDetailPage submissionId="manuscript" />);
  expect(container.textContent).toContain("Recovered manuscript");
});

it("opens the current revision when the API returns versions newest first", async () => {
  mocks.detail.mockReturnValue({ data: { _id: "manuscript", title: "Current paper", status: "revised", currentRevisionId: "v2", currentRevisionNumber: 2 } });
  mocks.historyQuery.mockReturnValue({ data: { ...mocks.history, versions: [
    { id: "v2", revisionNumber: 2, contentSnapshot: "Latest revision content", reviews: [] },
    { id: "v1", revisionNumber: 1, contentSnapshot: "Outdated revision content", reviews: [] },
  ] } });
  await render(<SubmissionDetailPage submissionId="manuscript" />);
  expect(container.textContent).toContain("Latest revision content");
  expect(container.textContent).not.toContain("Outdated revision content");
});

it("saves a text revision through the version API without sending a previously selected PDF", async () => {
  mocks.detail.mockReturnValue({ data: { _id: "manuscript", title: "Current paper", status: "revised", currentRevisionNumber: 2 } });
  await render(<SubmissionDetailPage submissionId="manuscript" />);
  await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("Gửi giảng viên góp ý"))!.click());
  await chooseFile();
  await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent?.trim() === "Cập nhật văn bản")!.click());
  const upload = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Upload version")!;
  expect(upload.disabled).toBe(true);
  await changeInput(container.querySelector('textarea[placeholder="Dán nội dung bản thảo đã chỉnh sửa..."]')!, " Revised manuscript ");
  expect(upload.disabled).toBe(true);
  await changeInput(container.querySelector('textarea[placeholder^="Tóm tắt ngắn gọn"]')!, " Updated evidence ");
  await act(async () => upload.click());
  expect(createVersion).toHaveBeenCalledWith({ content: "Revised manuscript", summary: "Updated evidence", expectedRevisionNumber: 2 });
  expect(mocks.addRevision).not.toHaveBeenCalled();
});

it("preserves a failed text revision and permits retry", async () => {
  createVersion.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
  await render(<SubmissionDetailPage submissionId="manuscript" />);
  await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("Gửi giảng viên góp ý"))!.click());
  await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent?.trim() === "Cập nhật văn bản")!.click());
  const content = container.querySelector<HTMLTextAreaElement>('textarea[placeholder="Dán nội dung bản thảo đã chỉnh sửa..."]')!;
  await changeInput(content, "Retained manuscript");
  await changeInput(container.querySelector('textarea[placeholder^="Tóm tắt ngắn gọn"]')!, "Reviewed sources");
  const upload = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Upload version")!;
  await act(async () => upload.click());
  expect(content.value).toBe("Retained manuscript");
  await act(async () => upload.click());
  expect(createVersion).toHaveBeenCalledTimes(2);
});

it("preserves structured research details on older submissions", async () => {
  mocks.detail.mockReturnValue({ data: { _id: "manuscript", title: "Project paper", status: "submitted", researchQuestions: ["What improves feedback?"], methodology: "A controlled study" } });
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  expect(container.textContent).toContain("What improves feedback?");
  expect(container.textContent).toContain("A controlled study");
  expect(container.textContent).not.toContain("Not specified");
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
  expect(container.textContent).not.toContain("Gửi phiên bản mới để góp ý");
  expect(container.textContent).not.toContain("Gửi giảng viên góp ý");
  expect(container.textContent).not.toContain("Submit for Review");
  expect(container.textContent).not.toContain("Chạy AI Pre-review");
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
  expect(container.textContent).toContain("Gửi giảng viên góp ý");
  expect(container.textContent).not.toContain("Request review");
  expect(container.textContent).not.toContain("Chạy AI Pre-review");
});
it("hides AI actions on completed submissions even with stale permissions", async () => {
  mocks.detail.mockReturnValue({ data: { title: "Completed", status: "completed" } });
  await render(<SubmissionDetailPage submissionId="manuscript" />);
  expect(container.textContent).not.toContain("Chạy AI Pre-review");
});
it("shows reviewer progress, older revision guidance and only authorized request links", async () => {
  mocks.history.reviewRequests = [
    { id: "own-request", reviewerName: "Lecturer A", status: "REVISION_REQUESTED", revisionNumber: 1, dueAt: "2026-11-01", canView: true },
    { id: "team-request", reviewerName: "Lecturer B", status: "ACCEPTED", revisionNumber: 2, dueAt: null, canView: false },
  ];
  await render(<SubmissionDetailPage submissionId="manuscript" projectId="project-a" />);
  expect(container.textContent).toContain("Lecturer A");
  expect(container.textContent).toContain("Cần chỉnh sửa");
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
  await render(<SubmissionDetailPage submissionId="manuscript" />);
  const versionButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes("Gửi giảng viên góp ý"))!;
  await act(async () => versionButton.click());
  await chooseFile();
  const upload = Array.from(container.querySelectorAll('button')).find(button => button.textContent === "Upload version")!;
  await act(async () => { upload.click(); upload.click(); });
  expect(mocks.addRevision).toHaveBeenCalledOnce();
  await act(async () => resolve());
});
it("does not show an older AI result as feedback for the current version", async () => {
  mocks.detail.mockReturnValue({ data: { title: "Updated paper", status: "revised", currentRevisionId: "v2" } });
  mocks.preReviews.mockReturnValue({ data: [{ id: "analysis", status: "COMPLETED", sourceRevisionId: "v1", sourceRevisionNumber: 1, summary: "Earlier analysis", reviewFocusAreas: [], limitations: [], unsupportedClaims: [], citationIssues: [] }] });
  await render(<SubmissionDetailPage submissionId="manuscript" />);
  expect(container.textContent).not.toContain("Earlier analysis");
  expect(container.querySelector('[data-testid="ai-prereview-panel"]')).toBeNull();
});
it("refreshes both the request progress and the submission status", async () => {
  const historyRefresh = vi.fn(), detailRefresh = vi.fn();
  mocks.historyQuery.mockReturnValue({ data: mocks.history, refetch: historyRefresh });
  mocks.detail.mockReturnValue({ data: { title: "Paper", status: "under_review" }, refetch: detailRefresh });
  await render(<SubmissionDetailPage submissionId="manuscript" />);
  const refresh = container.querySelector<HTMLButtonElement>('button[aria-label="Làm mới trạng thái"]')!;
  await act(async () => refresh.click());
  expect(historyRefresh).toHaveBeenCalledOnce();
  expect(detailRefresh).toHaveBeenCalledOnce();
});

it("opens the short mentor dialog within the project and returns to its submitted version", async () => {
  await render(<SubmissionNewPage projectId="project-a" projectTitle="Current research" />);
  expect(container.querySelector('[data-send-project]')?.getAttribute('data-send-project')).toBe('project-a');
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Send fixture')!.click());
  expect(container.querySelector('output')?.textContent).toBe('/projects/project-a?tab=submissions&submission=new-paper');
});
