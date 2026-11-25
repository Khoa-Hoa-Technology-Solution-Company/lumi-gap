// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), actor: "mentor" }));
vi.mock("@/features/submissions/api/submissions.api", () => ({ submissionsApi: { aiPreReviews: mocks.read } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { id: mocks.actor } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import { AssignedReviewAdvisory } from "../components/assigned-review-advisory";
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); mocks.read.mockReset(); mocks.actor = "mentor";
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
async function render(revisionId = "v1") {
  await act(async () => {
    root.render(<QueryClientProvider client={client}><AssignedReviewAdvisory submissionId="study" revisionId={revisionId} /></QueryClientProvider>);
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}
it("shows only existing completed advisory output for the pinned version and offers no AI action", async () => {
  mocks.read.mockResolvedValue([
    { sourceRevisionId: "v2", status: "COMPLETED", summary: "Private newer draft" },
    { sourceRevisionId: "v1", status: "COMPLETED", summary: "Source-bound advice", reviewFocusAreas: ["Inspect comparison group"], limitations: ["Advice only"] },
  ]);
  await render();
  expect(host.textContent).toContain("Source-bound advice"); expect(host.textContent).not.toContain("Private newer draft");
  expect(host.querySelector("button")).toBeNull();
  expect(host.textContent).toContain("mentorWorkspace.aiAdvisoryHint");
});
it("hides old output after changing revision or signed-in user", async () => {
  mocks.read.mockResolvedValue([{ sourceRevisionId: "v1", status: "COMPLETED", summary: "First user's output" }]);
  await render(); expect(host.textContent).toContain("First user's output");
  mocks.actor = "other-mentor"; mocks.read.mockImplementation(() => new Promise(() => undefined));
  await render(); expect(host.textContent).not.toContain("First user's output");
});
it("offers retry on denied access and does not expose cached advice", async () => {
  mocks.read.mockRejectedValue(new Error("403"));
  await render();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.querySelector("details")).toBeNull();
});
