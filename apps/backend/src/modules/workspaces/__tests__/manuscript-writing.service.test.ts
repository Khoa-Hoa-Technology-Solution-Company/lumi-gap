import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueWritingReport, MANUSCRIPT_WRITING_JOB, manuscriptWritingService } from "../manuscript-writing.service.js";
import { withWorkspace, type WorkspaceContext } from "../../projects/workspace-access.js";

const queue = vi.hoisted(() => ({ getJob: vi.fn(), add: vi.fn() }));
vi.mock("../../../infrastructure/queue.js", () => ({ aiJobsQueue: queue }));
vi.mock("../../projects/workspace-access.js", async importOriginal => ({
  ...await importOriginal<typeof import("../../projects/workspace-access.js")>(), withWorkspace: vi.fn(),
}));

beforeEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });

describe("durable writing report retries", () => {
  it.each(["completed", "failed"])("replaces a stale %s job so a queued report can run", async state => {
    const previous = { getState: vi.fn().mockResolvedValue(state), remove: vi.fn().mockResolvedValue(undefined) };
    queue.getJob.mockResolvedValue(previous);
    await enqueueWritingReport("report");
    expect(previous.remove).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledWith(MANUSCRIPT_WRITING_JOB, { runId: "report" }, expect.objectContaining({ jobId: "writing-report", attempts: 5 }));
    expect(previous.remove.mock.invocationCallOrder[0]).toBeLessThan(queue.add.mock.invocationCallOrder[0]!);
  });

  it.each(["active", "waiting", "delayed"])("keeps a live %s job", async state => {
    const previous = { getState: vi.fn().mockResolvedValue(state), remove: vi.fn() };
    queue.getJob.mockResolvedValue(previous);
    await enqueueWritingReport("report");
    expect(previous.remove).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(MANUSCRIPT_WRITING_JOB, { runId: "report" }, expect.objectContaining({ jobId: "writing-report" }));
  });

  it("runs a failed report under the current authorized requester rather than a former member", async () => {
    const previous = { id: "report", status: "FAILED", actorId: "former-member" };
    const update = vi.fn().mockResolvedValue({ ...previous, status: "QUEUED", actorId: "current-member" });
    const context = { actorId: "current-member", project: { id: "project" }, tx: {
      draftWorkspace: { findFirst: vi.fn().mockResolvedValue({ id: "manuscript", archivedAt: null }) },
      manuscriptSnapshot: { findFirst: vi.fn().mockResolvedValue({ manifest: { files: [] }, collaborationState: { format: 1, states: {} }, writingState: null }) },
      manuscriptWritingReport: { findUnique: vi.fn().mockResolvedValue(previous), update },
    } } as unknown as WorkspaceContext;
    vi.mocked(withWorkspace).mockImplementation(async (_project, _actor, _options, run) => run(context));
    const get = vi.spyOn(manuscriptWritingService, "get").mockResolvedValue({ id: "report" } as Awaited<ReturnType<typeof manuscriptWritingService.get>>);
    await manuscriptWritingService.request("project", "current-member", "manuscript", "snapshot");
    expect(update).toHaveBeenCalledWith({ where: { id: "report" }, data: { status: "QUEUED", actorId: "current-member" } });
    expect(get).toHaveBeenCalledWith("project", "current-member", "manuscript", "report");
  });
});
