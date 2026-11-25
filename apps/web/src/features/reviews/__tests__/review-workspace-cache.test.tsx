// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useCreateReviewRequest, useReviewWorkspace } from "../hooks/use-reviews";
import { useCreateSubmission } from "@/features/submissions/hooks/use-submissions";
const mocks = vi.hoisted(() => ({ actor: "mentor-a", detail: vi.fn(), createRequest: vi.fn(), createSubmission: vi.fn() }));
vi.mock("../api/reviews.api", () => ({ reviewsApi: { detail: mocks.detail, createRequest: mocks.createRequest } }));
vi.mock("@/features/submissions/api/submissions.api", () => ({ submissionsApi: { create: mocks.createSubmission } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { id: mocks.actor } }) }));
function Reader() { const query = useReviewWorkspace("assignment"); return <p>{query.data?.artifactContent ?? "Loading"}</p>; }
it("does not reuse another account's cached manuscript while the new account's access is checked", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host), client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  try {
    mocks.detail.mockResolvedValueOnce({ artifactContent: "Private assigned manuscript" });
    const render = () => root.render(<QueryClientProvider client={client}><Reader /></QueryClientProvider>);
    await act(async () => render()); await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(host.textContent).toContain("Private assigned manuscript");
    mocks.actor = "mentor-b"; mocks.detail.mockImplementation(() => new Promise(() => undefined));
    await act(async () => render()); expect(host.textContent).toBe("Loading");
  } finally { await act(async () => root.unmount()); client.clear(); vi.unstubAllGlobals(); }
});

it.each(["review-request", "submission"])("refreshes the visible mentor queue after sending a %s without waiting for polling", async source => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let delivered = false;
  const send = async () => { delivered = true; return {}; };
  mocks.createRequest.mockImplementation(send); mocks.createSubmission.mockImplementation(send);
  const host = document.createElement("div"), root = createRoot(host), client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } } });
  function QueueAndDelivery() {
    const queue = useQuery({ queryKey: ["mentor-workspace", "mentor-a", {}], queryFn: async () => delivered ? "Review v1" : "No review" });
    const request = useCreateReviewRequest(), submission = useCreateSubmission();
    return <><p>{queue.data}</p><button onClick={() => source === "review-request"
      ? request.mutate({ submissionId: "submission", reviewerId: "mentor-a", templateVersionId: "template" })
      : submission.mutate({ input: { projectId: "project", title: "Draft", submissionType: "RESEARCH_PAPER", mentorId: "mentor-a" } })}>Send</button></>;
  }
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><QueueAndDelivery /></QueryClientProvider>));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(host.textContent).toContain("No review");
    await act(async () => host.querySelector("button")!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(host.textContent).toContain("Review v1"); expect(host.textContent).not.toContain("No review");
  } finally { await act(async () => root.unmount()); client.clear(); vi.unstubAllGlobals(); }
});
