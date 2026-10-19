import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(), access: vi.fn(), view: vi.fn(), evaluate: vi.fn(), withUserAi: vi.fn(),
  queue: { getJob: vi.fn(), add: vi.fn() },
}));
vi.mock("../quality.service.js", () => ({ qualityService: { prepareEvaluation: mocks.prepare, view: mocks.view, evaluate: mocks.evaluate }, resolveQualityTarget: mocks.access }));
vi.mock("../../../infrastructure/queue.js", () => ({ aiJobsQueue: mocks.queue }));
vi.mock("../../user-ai/user-ai.runtime.js", () => ({ withUserAi: mocks.withUserAi }));
import { qualityEvaluationJobId, qualityJobs } from "../quality.jobs.js";

const owner = "00000000-0000-4000-8000-000000000002";
const targetId = "00000000-0000-4000-8000-000000000001";
const input = { targetKind: "paper" as const, targetId, language: "vi" as const };
const makeJob = (state: string) => ({ id: qualityEvaluationJobId(owner, "paper", targetId, "vi"), name: "quality-evaluation", data: { ...input, userId: owner }, getState: vi.fn().mockResolvedValue(state), remove: vi.fn(), returnvalue: { freshness: "current" } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prepare.mockResolvedValue({ ownerId: owner, targetId, current: undefined });
  mocks.access.mockResolvedValue({ owner: { id: owner }, row: { id: targetId } });
});
describe("queued quality evaluations", () => {
  it("returns cached results without requiring the queue", async () => {
    mocks.prepare.mockResolvedValue({ ownerId: owner, targetId, current: { freshness: "current" } });
    expect(await qualityJobs.start(owner, input)).toMatchObject({ status: "completed" });
    expect(mocks.queue.getJob).not.toHaveBeenCalled();
  });
  it("joins an existing active job even when reevaluation was requested", async () => {
    mocks.queue.getJob.mockResolvedValue(makeJob("active"));
    expect(await qualityJobs.start(owner, { ...input, force: true })).toMatchObject({ status: "running" });
    expect(mocks.queue.add).not.toHaveBeenCalled();
  });
  it("enqueues with canonical IDs and a language-scoped deterministic task ID", async () => {
    mocks.queue.getJob.mockResolvedValue(null); mocks.queue.add.mockResolvedValue(makeJob("waiting"));
    expect(await qualityJobs.start(owner, input)).toMatchObject({ status: "queued" });
    expect(mocks.queue.add).toHaveBeenCalledWith("quality-evaluation", { ...input, userId: owner }, expect.objectContaining({ attempts: 1 }));
    expect(qualityEvaluationJobId(owner, "paper", targetId, "en")).not.toBe(qualityEvaluationJobId(owner, "paper", targetId, "vi"));
  });
  it("resumes a pending task on reopening the same target", async () => {
    mocks.queue.getJob.mockResolvedValue(makeJob("waiting"));
    expect(await qualityJobs.active(owner, "paper", targetId, "vi")).toMatchObject({ status: "queued" });
  });
  it("hides task results from other users", async () => {
    const job = makeJob("completed"); job.data.userId = "other-user"; mocks.queue.getJob.mockResolvedValue(job);
    await expect(qualityJobs.get(owner, job.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.view).not.toHaveBeenCalled();
  });
  it("rechecks persisted freshness before returning a completed task", async () => {
    const job = makeJob("completed"); mocks.queue.getJob.mockResolvedValue(job);
    mocks.view.mockResolvedValue({ evaluation: { freshness: "outdated" } });
    expect(await qualityJobs.get(owner, job.id)).toMatchObject({ evaluation: { freshness: "outdated" } });
  });
  it("keeps queue connection diagnostics out of the public error", async () => {
    mocks.queue.getJob.mockRejectedValue(new Error("private redis URL"));
    await expect(qualityJobs.start(owner, input)).rejects.toMatchObject({ statusCode: 503, message: "Unable to queue AI evaluation. Please try again later." });
  });
  it("keeps saved assessments readable if Redis stops responding", async () => {
    vi.useFakeTimers();
    try {
      mocks.queue.getJob.mockImplementation(() => new Promise(() => {}));
      const result = qualityJobs.active(owner, "paper", targetId, "vi");
      await vi.advanceTimersByTimeAsync(2100);
      await expect(result).resolves.toBeUndefined();
    } finally { vi.useRealTimers(); }
  });
  it("runs the operation inside the requesting user's personal AI context", async () => {
    mocks.withUserAi.mockImplementation(async (_user, operation) => operation()); mocks.evaluate.mockResolvedValue({ overall: 3.3 });
    await qualityJobs.process({ ...input, userId: owner });
    expect(mocks.withUserAi).toHaveBeenCalledWith(owner, expect.any(Function));
    expect(mocks.evaluate).toHaveBeenCalledWith(owner, { ...input, userId: owner });
  });
});
