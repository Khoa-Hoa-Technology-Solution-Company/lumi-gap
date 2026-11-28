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
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter key={path + search} initialEntries={[path + search]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ReviewRequestDetailPage /><Location /></MemoryRouter></QueryClientProvider>));
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
it("shows the focused latest submitted feedback without inventing a score for unscored rounds", async () => {
  await mount("&detailTab=feedback");
  expect(host.textContent).toContain("Document the comparison group");
  expect(host.textContent).not.toMatch(/0\s*\/\s*5/);
  const v1Link = host.querySelector<HTMLAnchorElement>('a[href*="reviewId=review-v1"]')!;
  expect(v1Link).not.toBeNull();
  expect(v1Link.getAttribute("href")).toContain("detailTab=feedback");

  // Transition live into Read-Only Viewer and back without hook-order crashes
  await act(async () => v1Link.click());
  expect(host.textContent).toContain("Immutable first manuscript snapshot");
  const backLink = host.querySelector<HTMLAnchorElement>('a[href*="detailTab=feedback"]')!;
  expect(backLink).not.toBeNull();
  await act(async () => backLink.click());
  expect(host.textContent).toContain("Document the comparison group");
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
it("selects the requested submitted review without rendering editable inputs and flags invalid reviewId", async () => {
  await mount("&detailTab=feedback&reviewId=review-v1");
  expect(host.textContent).toContain("Feedback saved · round 1 · manuscript v1");
  expect(host.querySelectorAll("textarea, input")).toHaveLength(0);

  await mount("&detailTab=feedback&reviewId=nonexistent-review");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("could not be found");
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
  expect(host.textContent).not.toMatch(/0[.,]00\s*\/\s*5/);
});
it("renders compact rubric table with expandable details, independent integrity summary, and revision filters", async () => {
  const tpl = {
    id: "tpl-v1",
    versionNumber: 1,
    reviewMode: "RUBRIC_ASSESSMENT",
    guidelines: [],
    criteria: [
      { id: "c1", key: "methods", title: "Research methodology", order: 1, required: true, allowNotApplicable: false, weight: 50, levels: [{ id: "l4", label: "Strong", score: 5, position: 1 }] },
    ],
  };
  detail.status = "RESUBMITTED";
  detail.templateVersion = tpl as unknown as ReviewRequestDetail["templateVersion"];
  detail.reviews[0]!.templateVersion = tpl as unknown as ReviewRequestDetail["templateVersion"];
  detail.reviews[0]!.weightedScore = 4.0;
  detail.reviews[0]!.responses = [{ criterionKey: "methods", score: 4, comment: "Clear experimental protocol.", evidence: "Section 3.2", notApplicable: false }];
  detail.reviews[0]!.integrityChecks = {
    authorship_credit: { status: "CHECKED" },
    data_evidence: { status: "CONCERN", note: "Clarify dataset provenance." },
  };
  await mount("&detailTab=feedback");
  expect(host.textContent).toContain("Template v1 · 1 criteria");
  expect(host.textContent).toContain("4.00");
  expect(host.querySelector("table")?.textContent).toContain("Research methodology");
  expect(host.textContent).not.toContain("Clear experimental protocol.");
  // Expand criterion detail
  const viewBtn = [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes("View"))!;
  await act(async () => viewBtn.click());
  expect(host.textContent).toContain("Clear experimental protocol.");
  expect(host.textContent).toContain("Section 3.2");
  // Concern is visible immediately in independent integrity summary
  expect(host.textContent).toContain("Clarify dataset provenance.");
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

it("opens dedicated view=manuscript read-only mode via forceReader without mutating review state", async () => {
  detail.status = "RESUBMITTED";
  const back = encodeURIComponent("/mentor-workspace?view=work&workPage=1&workStatus=ACTIONABLE&workSort=priority");
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[`/mentor-workspace?view=manuscript&requestId=request&revisionId=v2&returnTo=${back}`]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <ReviewRequestDetailPage forceReader />
          <Location />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(host.textContent).toContain("Revised second manuscript snapshot");
  expect(host.textContent).toContain("Read-only manuscript");
  expect(host.querySelector('a[href^="/projects/"]')).toBeNull();
  const backLink = host.querySelector<HTMLAnchorElement>('a[href*="view=review-request"]')!;
  expect(backLink).not.toBeNull();
  expect(backLink.getAttribute("href")).toContain("returnTo=");
  expect(mocks.accept).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.submit).not.toHaveBeenCalled();
});

it("blocks unaccepted REQUESTED manuscript view without weakening authorization and offers accept CTA", async () => {
  detail.status = "REQUESTED";
  detail.assignment.status = "assigned";
  await mount("&reader=1&revisionId=v2");
  expect(host.textContent).toContain("Accept this review invitation");
  expect(host.textContent).not.toContain("Revised second manuscript snapshot");
  expect(mocks.accept).not.toHaveBeenCalled();
});

it("shows error without silently falling back to latest revision when revisionId is unknown", async () => {
  detail.status = "RESUBMITTED";
  await mount("&reader=1&revisionId=nonexistent-v99");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("no longer shared");
  expect(host.textContent).not.toContain("Revised second manuscript snapshot");
});

it("preserves work queue returnTo URL on the back button of review request detail", async () => {
  const back = "/mentor-workspace?view=work&workPage=2&workStatus=ACTIONABLE&workSort=priority";
  await mount(`&returnTo=${encodeURIComponent(back)}`);
  const backLink = host.querySelector<HTMLAnchorElement>(`a[href*="workPage=2"]`);
  expect(backLink).not.toBeNull();
  expect(backLink?.getAttribute("href")).toContain("workStatus=ACTIONABLE");
  expect(backLink?.getAttribute("href")).toContain("workSort=priority");
});
