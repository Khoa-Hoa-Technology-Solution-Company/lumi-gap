import { beforeEach, expect, it, vi } from "vitest";
import { API_ROUTES } from "@/constants";
import { submissionsApi } from "../api/submissions.api";

const requests = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api-client", () => ({ api: requests }));

beforeEach(() => {
  vi.clearAllMocks();
  requests.get.mockResolvedValue({ data: { data: [] } });
  requests.post.mockResolvedValue({ data: { data: {} } });
});

it("keeps project scope, cancellation and a finite timeout on submission reads", async () => {
  const { signal } = new AbortController();
  await submissionsApi.list("project-a", signal);
  await submissionsApi.detail("paper-a", "project-a", signal);
  expect(requests.get).toHaveBeenCalledWith(API_ROUTES.submissions.list, { params: { projectId: "project-a" }, signal, timeout: 20000 });
  expect(requests.get).toHaveBeenCalledWith(API_ROUTES.submissions.detail("paper-a"), { params: { projectId: "project-a" }, signal, timeout: 20000 });
});

it("allows history, revisions and AI reads to be cancelled when leaving detail", async () => {
  const { signal } = new AbortController();
  await submissionsApi.history("paper-a", signal);
  await submissionsApi.revisions("paper-a", signal);
  await submissionsApi.aiPreReviews("paper-a", signal);
  for (const [, options] of requests.get.mock.calls) expect(options).toEqual({ signal, timeout: 20000 });
});

it("sends text versions as JSON to the version endpoint with concurrency protection", async () => {
  const input = { content: "Revised research", summary: "Updated evidence", expectedRevisionNumber: 2 };
  await submissionsApi.createVersion("paper-a", input);
  expect(requests.post).toHaveBeenCalledWith(API_ROUTES.submissions.versions("paper-a"), input);
});

it("propagates read failures so the workspace can offer retry", async () => {
  const failure = new Error("timeout");
  requests.get.mockRejectedValueOnce(failure);
  await expect(submissionsApi.list("project-a")).rejects.toBe(failure);
});
