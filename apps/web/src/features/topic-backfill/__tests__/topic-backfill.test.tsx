// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TopicBackfillRun } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/services/api-client", () => ({ api: http }));

import { API_ROUTES } from "@/constants";
import { backfillErrorCode, backfillErrorStatus, topicBackfillApi } from "../api/topic-backfill.api";
import { isLiveRun, useTopicBackfillRun, useTopicBackfillRuns } from "../hooks/use-topic-backfill";

const run = (overrides: Partial<TopicBackfillRun> = {}): TopicBackfillRun => ({
  id: "run-1", targetKind: "tag", targetId: "tag-1", targetName: "ML", state: "queued", trigger: "admin",
  maxNewPapers: 100, paperCountBefore: 0, fetchedCount: 0, insertedCount: 0, skippedCount: 0, rejectedCount: 0, pagesFetched: 0,
  errorMessage: null, startedAt: null, finishedAt: null, createdAt: "2026-10-30T00:00:00Z", ...overrides,
});
const meta = { page: 1, pageSize: 5, total: 1, totalPages: 1 };
const envelope = (data: unknown, withMeta = false) => ({ data: { success: true, data, ...(withMeta ? { meta } : {}) } });

describe("topicBackfillApi", () => {
  beforeEach(() => vi.resetAllMocks());

  it("posts a search request and unwraps the envelope", async () => {
    http.post.mockResolvedValue(envelope({ run: run(), created: true }));
    const result = await topicBackfillApi.request({ targetKind: "topic", targetId: "t1" });
    expect(http.post).toHaveBeenCalledWith("/topic-backfill", { targetKind: "topic", targetId: "t1" });
    expect(result).toEqual({ run: run(), created: true });
  });

  it("reads one run from its own path", async () => {
    http.get.mockResolvedValue(envelope(run({ state: "running" })));
    expect((await topicBackfillApi.getRun("run 1")).state).toBe("running");
    expect(http.get).toHaveBeenCalledWith("/topic-backfill/runs/run%201", { signal: undefined });
  });

  it("posts the admin request with the budget and drops an unset one", async () => {
    http.post.mockResolvedValue(envelope({ run: run(), created: true }));
    await topicBackfillApi.adminRequest({ targetKind: "tag", targetId: "tag-1", maxNewPapers: 250 });
    expect(http.post).toHaveBeenCalledWith("/admin/topic-backfill", { targetKind: "tag", targetId: "tag-1", maxNewPapers: 250 });
    await topicBackfillApi.adminRequest({ targetKind: "keyword", targetId: "k1" });
    expect(http.post).toHaveBeenLastCalledWith("/admin/topic-backfill", { targetKind: "keyword", targetId: "k1" });
  });

  it("lists admin runs with filters and returns the page meta", async () => {
    http.get.mockResolvedValue(envelope([run()], true));
    const result = await topicBackfillApi.adminRuns({ targetKind: "tag", targetId: "tag-1", state: undefined, page: 1, pageSize: 5 });
    expect(http.get).toHaveBeenCalledWith("/admin/topic-backfill/runs", {
      params: { targetKind: "tag", targetId: "tag-1", page: 1, pageSize: 5 },
      signal: undefined,
    });
    expect(result).toEqual({ data: [run()], meta });
  });

  it("keeps every path in API_ROUTES", () => {
    expect(API_ROUTES.topicBackfill.request).toBe("/topic-backfill");
    expect(API_ROUTES.topicBackfill.run("x")).toBe("/topic-backfill/runs/x");
    expect(API_ROUTES.admin.topicBackfill).toEqual({ request: "/admin/topic-backfill", runs: "/admin/topic-backfill/runs" });
  });

  it("reads the error code and status off a failed request", () => {
    const error = { response: { status: 409, data: { error: { code: "TOPIC_NOT_THIN" } } } };
    expect(backfillErrorCode(error)).toBe("TOPIC_NOT_THIN");
    expect(backfillErrorStatus(error)).toBe(409);
    expect(backfillErrorCode(new Error("network"))).toBeUndefined();
    expect(backfillErrorStatus(null)).toBeUndefined();
  });
});

describe("polling", () => {
  let root: Root, container: HTMLDivElement, client: QueryClient;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.resetAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    vi.useRealTimers();
  });
  const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const mount = (element: React.ReactNode) => act(async () => root.render(<QueryClientProvider client={client}>{element}</QueryClientProvider>));

  it("classifies live runs", () => {
    expect([isLiveRun(run({ state: "queued" })), isLiveRun(run({ state: "running" })), isLiveRun(run({ state: "completed" })), isLiveRun(run({ state: "failed" })), isLiveRun(undefined)])
      .toEqual([true, true, false, false, false]);
  });

  it("refetches a run every 3 s while live and stops on a terminal state", async () => {
    http.get
      .mockResolvedValueOnce(envelope(run({ state: "running" })))
      .mockResolvedValue(envelope(run({ state: "completed", insertedCount: 3 })));
    function Probe() {
      const query = useTopicBackfillRun("run-1", run());
      return <output>{query.data?.state}</output>;
    }
    await mount(<Probe />);
    expect(container.textContent).toBe("queued");
    expect(http.get).not.toHaveBeenCalled();
    await tick(3000);
    await tick(10);
    expect(container.textContent).toBe("running");
    await tick(3000);
    await tick(10);
    expect(container.textContent).toBe("completed");
    expect(http.get).toHaveBeenCalledTimes(2);
    await tick(60_000);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it("does not request a run that already finished", async () => {
    function Probe() {
      return <output>{useTopicBackfillRun("run-1", run({ state: "failed" })).data?.state}</output>;
    }
    await mount(<Probe />);
    await tick(20_000);
    expect(http.get).not.toHaveBeenCalled();
    expect(container.textContent).toBe("failed");
  });

  it("polls the run list every 5 s only while a listed run is live", async () => {
    http.get
      .mockResolvedValueOnce(envelope([run({ state: "running" })], true))
      .mockResolvedValue(envelope([run({ state: "completed" })], true));
    function Probe() {
      return <output>{useTopicBackfillRuns({ targetKind: "tag", targetId: "tag-1" }).data?.data[0]?.state}</output>;
    }
    await mount(<Probe />);
    await tick(10);
    expect(container.textContent).toBe("running");
    expect(http.get).toHaveBeenCalledTimes(1);
    await tick(4000);
    expect(http.get).toHaveBeenCalledTimes(1);
    await tick(1000);
    await tick(10);
    expect(http.get).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe("completed");
    await tick(60_000);
    expect(http.get).toHaveBeenCalledTimes(2);
  });
});
