import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { aiJobsQueue } from "../../../infrastructure/queue.js";
import { auditService } from "../../audit/audit.service.js";
import { aiReviewerClient, type AiPreReviewResponse } from "../../papers/ai-reviewer.client.js";
import { AI_PRE_REVIEW_JOB, aiPreReviewJobId, submissionService } from "../submission.service.js";

// Never enqueue real jobs from tests: a running dev worker would call the AI reviewer.
vi.mock("../../../infrastructure/queue.js", () => ({ aiJobsQueue: { add: vi.fn().mockResolvedValue(undefined) } }));

const aiResponse: AiPreReviewResponse = {
  status: "completed",
  provider: "test-provider",
  model: "test-model",
  analysis: {
    summary: "Pre-review summary for the test.",
    goal_alignment: { assessment: "Aligned", evidence_ids: [] },
    rq_coverage: [],
    unsupported_claims: [],
    citation_issues: [],
    contribution_comparison: "Comparable to prior work.",
    review_focus_areas: ["Methodology"],
    limitations: [],
  },
};

describe.sequential("AI pre-review run by the ai-jobs worker (PostgreSQL)", () => {
  const marker = crypto.randomUUID();
  const prisma = getPrisma();
  const submissionIds: string[] = [];
  let userId = "";
  let projectId = "";

  async function createSubmission(status: string) {
    const submission = await prisma.submission.create({ data: { projectId, createdById: userId, title: `Pre-review ${marker.slice(0, 8)}`, status } });
    submissionIds.push(submission.id);
    return submission;
  }
  const queuedRecord = async (submissionId: string, status = "QUEUED") => prisma.aiPreReview.create({ data: { submissionId, requestedById: userId, status } });

  beforeAll(async () => {
    vi.spyOn(auditService, "log").mockResolvedValue(undefined);
    vi.spyOn(aiReviewerClient, "preReview").mockResolvedValue(aiResponse);
    const user = await prisma.user.create({ data: { fullName: "Pre-review user", email: `pre-review-${marker}@example.test` } });
    userId = user.id;
    projectId = (await prisma.project.create({ data: { title: `Pre-review ${marker.slice(0, 8)}`, ownerId: userId } })).id;
  });

  afterAll(async () => {
    await prisma.aiPreReview.deleteMany({ where: { submissionId: { in: submissionIds } } });
    await prisma.submission.deleteMany({ where: { id: { in: submissionIds } } });
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    vi.restoreAllMocks();
  });

  it("queues a QUEUED record and a job keyed by that record", async () => {
    const submission = await createSubmission("submitted");

    const result = await submissionService.runAiPreReview(submission.id, userId, "admin");

    const record = await prisma.aiPreReview.findFirstOrThrow({ where: { submissionId: submission.id } });
    expect(record.status).toBe("QUEUED");
    expect(result).toMatchObject({ status: "QUEUED" });
    expect(aiJobsQueue.add).toHaveBeenCalledWith(AI_PRE_REVIEW_JOB, { preReviewId: record.id }, expect.objectContaining({ jobId: aiPreReviewJobId(record.id) }));
    // The AI call itself belongs to the worker, never to the request.
    expect(aiReviewerClient.preReview).not.toHaveBeenCalled();
  });

  it("stores the result and moves a fresh submission to ready_for_review", async () => {
    const submission = await createSubmission("submitted");
    const record = await queuedRecord(submission.id);

    await submissionService.processAiPreReview({ preReviewId: record.id });

    const done = await prisma.aiPreReview.findUniqueOrThrow({ where: { id: record.id } });
    expect(done).toMatchObject({ status: "COMPLETED", summary: aiResponse.analysis.summary, provider: "test-provider", model: "test-model" });
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } })).status).toBe("ready_for_review");
  });

  it("never moves a submission that is already under review back to ready_for_review", async () => {
    const submission = await createSubmission("under_review");
    const record = await queuedRecord(submission.id);

    await submissionService.processAiPreReview({ preReviewId: record.id });

    expect((await prisma.aiPreReview.findUniqueOrThrow({ where: { id: record.id } })).status).toBe("COMPLETED");
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } })).status).toBe("under_review");
  });

  it("marks a pre-review as FAILED with a safe message after the last attempt", async () => {
    const submission = await createSubmission("submitted");
    const record = await queuedRecord(submission.id, "PROCESSING");

    await submissionService.failAiPreReview(record.id);

    const failed = await prisma.aiPreReview.findUniqueOrThrow({ where: { id: record.id } });
    expect(failed.status).toBe("FAILED");
    expect(failed.errorMessage).toBe("AI pre-review failed. Please try again later.");
  });

  it("does not overwrite a pre-review that already completed", async () => {
    const submission = await createSubmission("submitted");
    const record = await queuedRecord(submission.id, "COMPLETED");

    await submissionService.failAiPreReview(record.id);

    expect((await prisma.aiPreReview.findUniqueOrThrow({ where: { id: record.id } })).status).toBe("COMPLETED");
  });
});
