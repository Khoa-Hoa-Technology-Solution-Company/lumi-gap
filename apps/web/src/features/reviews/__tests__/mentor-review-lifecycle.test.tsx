// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReviewRequestDetailPage } from "@/pages/reviews/review-request-detail";
import { mentorWorkspaceEn } from "@/i18n/locales/mentor-workspace";
import { mentorLifecycleEn } from "@/i18n/locales/mentor-lifecycle";
import type { ReviewRequestDetail } from "../api/reviews.api";

const mocks = vi.hoisted(() => ({ actor: "mentor", detail: vi.fn(), verify: vi.fn(), accept: vi.fn(), save: vi.fn(), submit: vi.fn(), download: vi.fn() }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (value: { user: { id: string } }) => unknown) => select({ user: { id: mocks.actor } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values: Record<string, unknown> = {}) => (({...mentorWorkspaceEn,...mentorLifecycleEn} as Record<string,string>)[key] ?? key).replace(/{{(\w+)}}/g, (_match, field: string) => String(values[field] ?? "")) }) }));
vi.mock("../api/reviews.api", () => ({ reviewsApi: { requestDetail: mocks.detail, verifyRevision: mocks.verify, acceptRequest: mocks.accept, save: mocks.save, submit: mocks.submit } }));
vi.mock("@/features/submissions", () => ({
  submissionsApi: { downloadRevision: mocks.download },
  useSubmissionRevisions: () => ({ data: [
    { _id: "v1", id: "v1", revisionNumber: 1, contentType: "MARKDOWN", contentSnapshot: "Immutable first manuscript snapshot" },
    { _id: "v2", id: "v2", revisionNumber: 2, contentType: "MARKDOWN", contentSnapshot: "Revised second manuscript snapshot" },
  ], isLoading: false, isError: false }),
}));

let root: Root, host: HTMLDivElement, client: QueryClient, detail: ReviewRequestDetail;
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
async function mount(search = "", path = "/mentor-workspace?view=review-request&requestId=request") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path + search]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ReviewRequestDetailPage /><Location /></MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); mocks.actor = "mentor";
  const template = { id: "template-v1", versionNumber: 1, reviewMode: "RUBRIC_ASSESSMENT", criteria: [], guidelines: [] };
  detail = { id: "request", origin: "MENTOR_GUIDANCE", status: "REVISION_REQUESTED", createdAt: "2026-11-20T10:00:00Z", updatedAt: "2026-11-22T10:00:00Z", respondedAt: "2026-11-20T11:00:00Z", requester: { id: "owner", fullName: "Team lead" }, reviewer: { id: "mentor", fullName: "Mentor" }, assignment: { id: "assignment", status: "accepted" }, artifact: { submissionId: "submission", title: "A reproducible study", type: "RESEARCH_PAPER", projectId: "project", projectTitle: "Research team", revisionId: "v2", revisionNumber: 2, contentType: "MARKDOWN" }, templateVersion: template, reviews: [{ id: "review-v1", assignmentId: "assignment", revisionId: "v1", roundNumber: 1, status: "SUBMITTED", submittedAt: "2026-11-22T10:00:00Z", weightedScore: null, overallComment: "Document the comparison group.", keyConcerns: "Evidence needs more detail.", artifactRevision: { id: "v1", revisionNumber: 1, contentType: "MARKDOWN" }, templateVersion: template, responses: [], requiredRevisions: [{ id: "item", priority: "MAJOR", description: "Explain the comparison group", locator: "Methods", status: "ADDRESSED", responses: [{ submissionRevisionId: "v2", responseText: "Added the comparison criteria in Methods.", status: "SUBMITTED" }] }] }] } as unknown as ReviewRequestDetail;
  mocks.detail.mockImplementation(async () => structuredClone(detail)); mocks.verify.mockResolvedValue(undefined);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

it("shows the mentor's next step and keeps manuscript viewing in the mentor shell", async () => {
  await mount();
  expect(host.textContent).toContain("The team is addressing your revision requests");
  const viewer = host.querySelector<HTMLAnchorElement>('a[href*="reader=1"]')!;
  expect(viewer.getAttribute("href")).toContain("/mentor-workspace?");
  expect(viewer.getAttribute("href")).toContain("revisionId=v2");
  expect(host.querySelector('a[href^="/projects/"]')).toBeNull();
  expect(host.textContent).not.toMatch(/0\s*\/\s*5/);
});
it("opens the submitted round's exact v1 after the request moved to v2, without starting review", async () => {
  detail.status = "RESUBMITTED";
  await mount("&reader=1&reviewId=review-v1&revisionId=v1");
  expect(host.textContent).toContain("Immutable first manuscript snapshot");
  expect(host.textContent).not.toContain("Revised second manuscript snapshot");
  expect(host.textContent).toContain("Read-only manuscript");
  expect(mocks.accept).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
});
it("rejects a revision that does not belong to the selected historical review", async () => {
  await mount("&reader=1&reviewId=review-v1&revisionId=v2");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("no longer shared");
  expect(host.textContent).not.toContain("manuscript snapshot");
});
it("keeps history collapsed and does not invent a score for feedback without scoring", async () => {
  await mount("&detailTab=feedback");
  const history = host.querySelector("article details")!;
  expect(history.hasAttribute("open")).toBe(false);
  expect(host.textContent).toContain("Document the comparison group");
  expect(host.textContent).not.toMatch(/0\s*\/\s*5/);
  expect(host.querySelector('a[href*="reviewId=review-v1"]')).not.toBeNull();
});
it("keeps author responses awaiting verification and submits the exact current revision", async () => {
  detail.status = "RESUBMITTED";
  await mount("&detailTab=revisions");
  expect(host.textContent).toContain("Waiting for your verification");
  expect(host.textContent).toContain("Added the comparison criteria in Methods");
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Accept this revision")!;
  await act(async () => button.click());
  expect(mocks.verify).toHaveBeenCalledWith("request", "item", "ACCEPTED", "v2");
});
it("preserves the requester's project manuscript link", async () => {
  mocks.actor = "owner";
  await mount();
  expect(host.querySelector('a[href="/projects/project?tab=submissions&submission=submission"]')).not.toBeNull();
  expect(host.textContent).not.toContain("The team is addressing your revision requests");
});
it("opens only the submitted round selected after submission and shows its saved version", async () => {
  await mount("&detailTab=feedback&reviewId=review-v1");
  expect(host.querySelector("article details")?.hasAttribute("open")).toBe(true);
  expect(host.textContent).toContain("Feedback saved · round 1 · manuscript v1");
  expect(host.querySelectorAll("textarea, input")).toHaveLength(0);
});
it("does not present an ordinary feedback round as internal approval", async () => {
  detail.status = "COMPLETED";
  detail.reviews[0]!.recommendation = "SELF_REVISION";
  await mount();
  expect(host.textContent).toContain("Your feedback round is complete");
  expect(host.textContent).toContain("This does not grant internal approval");
  expect(host.textContent).not.toContain("Internal review completed");
});
it("hides an obsolete zero score on an unscored feedback round", async () => {
  detail.reviews[0]!.weightedScore = 0;
  await mount("&detailTab=feedback");
  expect(host.querySelector("article summary")?.textContent).not.toMatch(/·\s*0/);
});
it("removes the reader and feedback if request access is revoked during refetch", async () => {
  await mount("&reader=1&reviewId=review-v1&revisionId=v1");
  expect(host.textContent).toContain("Immutable first manuscript snapshot");
  mocks.detail.mockRejectedValue(new Error("Access revoked"));
  await act(async () => { await client.refetchQueries({ queryKey: ["review-requests"] }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Immutable first manuscript snapshot");
  expect(host.textContent).not.toContain("Document the comparison group");
});
