import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(), access: vi.fn(), view: vi.fn(), evaluate: vi.fn(), withUserAi: vi.fn(),
  prepareProject: vi.fn(), evaluateProject: vi.fn(), projectReader: vi.fn(),
  queue: { getJob: vi.fn(), add: vi.fn() },
}));
vi.mock("../quality.service.js", () => ({ qualityService: { prepareEvaluation: mocks.prepare, view: mocks.view, evaluate: mocks.evaluate, prepareProjectEvaluation: mocks.prepareProject, evaluateProject: mocks.evaluateProject, requireProjectReader: mocks.projectReader }, resolveQualityTarget: mocks.access }));
vi.mock("../../../infrastructure/queue.js", () => ({ aiJobsQueue: mocks.queue }));
vi.mock("../../user-ai/user-ai.runtime.js", () => ({ withUserAi: mocks.withUserAi }));
import { UnrecoverableError } from "bullmq";
import { AppError } from "../../../common/exceptions/app-error.js";
import { qualityError } from "../quality.errors.js";
import { decodeFailure, encodeFailure, qualityEvaluationJobId, qualityJobs } from "../quality.jobs.js";

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
    expect(mocks.queue.add).toHaveBeenCalledWith("quality-evaluation", { ...input, userId: owner }, expect.objectContaining({ attempts: 5, backoff: { type: "exponential", delay: 2000 } }));
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

describe("queued project-mode evaluations", () => {
  const projectId = "00000000-0000-4000-8000-0000000000aa";
  const projectInput = { ...input, projectId };
  const projectJob = (state: string) => ({ ...makeJob(state), id: qualityEvaluationJobId(owner, "paper", targetId, "vi", projectId), data: { ...projectInput, userId: owner }, returnvalue: { projectId, freshness: "current" } });
  beforeEach(() => { mocks.prepareProject.mockResolvedValue({ ownerId: owner, targetId, projectId, current: undefined }); });

  it("uses a task ID distinct from the reference task and from other projects", () => {
    const reference = qualityEvaluationJobId(owner, "paper", targetId, "vi");
    const project = qualityEvaluationJobId(owner, "paper", targetId, "vi", projectId);
    expect(project).toMatch(/^quality-[a-f0-9]{40}$/);
    expect(project).not.toBe(reference);
    expect(project).not.toBe(qualityEvaluationJobId(owner, "paper", targetId, "vi", "00000000-0000-4000-8000-0000000000cc"));
  });
  it("returns a current project assessment without the queue", async () => {
    mocks.prepareProject.mockResolvedValue({ ownerId: owner, targetId, projectId, current: { freshness: "current", projectId } });
    expect(await qualityJobs.start(owner, projectInput)).toEqual({ status: "completed", projectEvaluation: { freshness: "current", projectId } });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.queue.getJob).not.toHaveBeenCalled();
  });
  it("enqueues project work with the project in the payload and task ID", async () => {
    mocks.queue.getJob.mockResolvedValue(null); mocks.queue.add.mockResolvedValue(projectJob("waiting"));
    expect(await qualityJobs.start(owner, projectInput)).toMatchObject({ status: "queued" });
    expect(mocks.queue.add).toHaveBeenCalledWith("quality-evaluation", { ...projectInput, userId: owner }, expect.objectContaining({ jobId: qualityEvaluationJobId(owner, "paper", targetId, "vi", projectId) }));
  });
  it("rechecks membership before showing a project task", async () => {
    mocks.queue.getJob.mockResolvedValue(projectJob("active"));
    mocks.projectReader.mockRejectedValue(Object.assign(new Error("Project not found"), { statusCode: 404 }));
    await expect(qualityJobs.get(owner, projectJob("active").id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("returns the refreshed project assessment for a completed project task", async () => {
    mocks.queue.getJob.mockResolvedValue(projectJob("completed"));
    mocks.view.mockResolvedValue({ projectEvaluation: { projectId, freshness: "outdated" } });
    expect(await qualityJobs.get(owner, projectJob("completed").id)).toMatchObject({ status: "completed", projectEvaluation: { freshness: "outdated" } });
    expect(mocks.view).toHaveBeenCalledWith(owner, "paper", targetId, { projectId, language: "vi" });
  });
  it("finds the pending project task for the view", async () => {
    mocks.queue.getJob.mockImplementation(async (id: string) => (id === projectJob("waiting").id ? projectJob("waiting") : null));
    expect(await qualityJobs.active(owner, "paper", targetId, "vi", projectId)).toMatchObject({ status: "queued" });
    expect(await qualityJobs.active(owner, "paper", targetId, "vi")).toBeUndefined();
  });
  it("runs project work in the requesting user's personal AI context", async () => {
    mocks.withUserAi.mockImplementation(async (_user, operation) => operation()); mocks.evaluateProject.mockResolvedValue({ projectId });
    await qualityJobs.process({ ...projectInput, userId: owner });
    expect(mocks.withUserAi).toHaveBeenCalledWith(owner, expect.any(Function));
    expect(mocks.evaluateProject).toHaveBeenCalledWith(owner, { ...projectInput, userId: owner });
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
});

describe("quality job failures", () => {
  const run = (error: unknown) => {
    mocks.withUserAi.mockImplementation(async (_user, operation) => operation());
    mocks.evaluate.mockRejectedValue(error);
    return qualityJobs.process({ ...input, userId: owner });
  };
  it("lets BullMQ retry provider overload, with the code in the reason", async () => {
    const failure = await run(qualityError("AI_EVALUATION_BUSY")).catch((error: Error) => error);
    expect(failure).not.toBeInstanceOf(UnrecoverableError);
    expect((failure as Error).message).toMatch(/^\[AI_EVALUATION_BUSY\] /);
  });
  it.each([
    ["invalid output", qualityError("AI_EVALUATION_INVALID_OUTPUT"), "[AI_EVALUATION_INVALID_OUTPUT]"],
    ["quota", qualityError("AI_EVALUATION_QUOTA"), "[AI_EVALUATION_QUOTA]"],
    ["not found", AppError.notFound("Paper not found"), "[NOT_FOUND] Paper not found"],
    ["unknown error", new Error("boom"), "[AI_EVALUATION_UNAVAILABLE]"],
  ])("fails at once for %s", async (_label, error, prefix) => {
    const failure = await run(error).catch((caught: Error) => caught);
    expect(failure).toBeInstanceOf(UnrecoverableError);
    expect((failure as Error).message.startsWith(prefix)).toBe(true);
  });
  it("returns the failure code with a failed task", async () => {
    const job = { ...makeJob("failed"), failedReason: encodeFailure("AI_EVALUATION_INVALID_OUTPUT", "The AI model returned an unusable answer.") };
    mocks.queue.getJob.mockResolvedValue(job);
    expect(await qualityJobs.get(owner, job.id)).toEqual({ jobId: job.id, status: "failed", error: "The AI model returned an unusable answer.", errorCode: "AI_EVALUATION_INVALID_OUTPUT" });
  });
  it("keeps non-quality codes out of errorCode and handles empty reasons", () => {
    expect(decodeFailure("[NOT_FOUND] Paper not found")).toEqual({ error: "Paper not found" });
    expect(decodeFailure("plain")).toEqual({ error: "plain" });
    expect(decodeFailure(undefined)).toMatchObject({ errorCode: "AI_EVALUATION_UNAVAILABLE" });
  });
  it("shows a task waiting for a retry as queued and joins it", async () => {
    mocks.queue.getJob.mockResolvedValue(makeJob("delayed"));
    expect(await qualityJobs.start(owner, { ...input, force: true })).toMatchObject({ status: "queued" });
    expect(mocks.queue.add).not.toHaveBeenCalled();
  });
});
