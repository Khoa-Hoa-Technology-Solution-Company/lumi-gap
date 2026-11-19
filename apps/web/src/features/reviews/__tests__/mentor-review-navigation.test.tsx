// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MentorReviewEntryPage } from "@/pages/reviews/mentor-review-entry";
import { NextMentorReview } from "../components/next-mentor-review";
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), queue: vi.fn() }));
vi.mock("@/features/submissions", () => ({ submissionsApi: { prepareMentorReview: mocks.prepare } }));
vi.mock("@/features/projects/hooks/use-mentor-workspace", () => ({ useMentorWorkspace: mocks.queue }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
let root: Root, host: HTMLDivElement, client: QueryClient;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient(); mocks.queue.mockReturnValue({ data: { items: [] }, error: null }); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); client.clear(); vi.unstubAllGlobals(); });
async function entry() {
  await act(async () => root.render(<StrictMode><QueryClientProvider client={client}><MemoryRouter initialEntries={["/reviews/mentor-entry/manuscript"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/reviews/mentor-entry/:submissionId" element={<MentorReviewEntryPage />} /><Route path="/reviews/:id" element={<p>Exact assigned review</p>} /></Routes></MemoryRouter></QueryClientProvider></StrictMode>));
}
it("upgrades a retained delivery once under StrictMode and opens the assigned workspace", async () => {
  mocks.prepare.mockResolvedValue({ assignmentId: "assigned", requestId: "request" }); await entry();
  expect(mocks.prepare).toHaveBeenCalledTimes(1); expect(mocks.prepare).toHaveBeenCalledWith("manuscript"); expect(host.textContent).toBe("Exact assigned review");
});
it("keeps unauthorized deliveries on a retryable error screen without navigating or inventing access", async () => {
  mocks.prepare.mockRejectedValueOnce(new Error("403")); await entry();
  expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(host.textContent).not.toContain("Exact assigned review");
  mocks.prepare.mockResolvedValue({ assignmentId: "assigned", requestId: "request" });
  await act(async () => host.querySelector("button")!.click()); expect(mocks.prepare).toHaveBeenCalledTimes(2); expect(host.textContent).toBe("Exact assigned review");
});
it("finds the next actionable review using a server review filter and preserves its exact route", async () => {
  mocks.queue.mockReturnValue({ data: { items: [{ sourceId: "next", kind: "PROPOSAL_REVIEW", href: "/review-requests/next" }] }, error: null });
  await act(async () => root.render(<MemoryRouter><NextMentorReview requestId="done" /></MemoryRouter>));
  expect(mocks.queue).toHaveBeenCalledWith({ status: "ACTIONABLE", kind: "REVIEW", pageSize: 2 });
  expect(host.querySelector('a[href="/review-requests/next"]')).not.toBeNull();
});
it("hides a stale next-review link after access is denied and still offers the work queue", async () => {
  mocks.queue.mockReturnValue({ data: { items: [{ sourceId: "next", kind: "MANUSCRIPT_REVIEW", href: "/reviews/private" }] }, error: new Error("403"), refetch: vi.fn() });
  await act(async () => root.render(<MemoryRouter><NextMentorReview requestId="done" /></MemoryRouter>));
  expect(host.querySelector('a[href="/reviews/private"]')).toBeNull(); expect(host.querySelector('a[href="/mentor-workspace?view=work"]')).not.toBeNull();
});
