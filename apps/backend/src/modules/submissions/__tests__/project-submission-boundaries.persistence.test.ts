import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { pdfStorageService } from "../../../infrastructure/pdf-storage.service.js";
import { aiReviewerClient, type AiPreReviewResponse } from "../../papers/ai-reviewer.client.js";
import { manuscriptService as writing } from "../../workspaces/manuscript.service.js";
import { submissionService as submissions } from "../submission.service.js";

vi.mock("../../../infrastructure/queue.js", () => ({ aiJobsQueue: { add: vi.fn().mockResolvedValue({}) }, notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));
vi.mock("../../../infrastructure/pdf-storage.service.js", () => ({ pdfStorageService: { savePdf: vi.fn(), deletePdf: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("../../papers/ai-reviewer.client.js", () => ({ aiReviewerClient: { preReview: vi.fn() } }));
vi.mock("../../retrieval/retriever.js", () => ({ retrieve: vi.fn().mockResolvedValue([]) }));
const aiResponse: AiPreReviewResponse = { status: "completed", provider: "fixture", model: "fixture", analysis: { summary: "Fixture analysis", goal_alignment: { assessment: "Aligned", evidence_ids: [] }, rq_coverage: [], unsupported_claims: [], citation_issues: [], contribution_comparison: "Fixture comparison", review_focus_areas: [], limitations: [] } };
const isolated = process.env.NODE_ENV === "test" && process.env.PROJECT_SLICE_TEST === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";

describe.skipIf(!isolated).sequential("project submission boundaries in disposable PostgreSQL", () => {
  const db = getPrisma(); let owner: string, member: string, reviewer: string;
  const pdf = { buffer: Buffer.from("%PDF-test"), originalname: "fixture.pdf", size: 9 };
  beforeAll(async () => {
    const users: string[] = [];
    for (const name of ["Owner", "Member", "Reviewer"]) {
      const user = await db.user.create({ data: { fullName: name, email: `submission-boundary-${crypto.randomUUID()}@example.test`, isActive: true, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), admissionBasis: "INVITATION" } });
      await db.academicProfile.create({ data: { userId: user.id, primaryPosition: name === "Reviewer" ? "LECTURER" : "RESEARCH_STAFF", academicRole: name === "Reviewer" ? "LECTURER" : "RESEARCHER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED" } });
      users.push(user.id);
    }
    [owner, member, reviewer] = users;
  });
  beforeEach(() => {
    vi.mocked(pdfStorageService.savePdf).mockReset().mockResolvedValue({ uri: "local:fixture.pdf" } as never);
    vi.mocked(pdfStorageService.deletePdf).mockClear();
    vi.mocked(aiReviewerClient.preReview).mockReset().mockResolvedValue(aiResponse);
  });
  async function fixture() {
    const project = await createProjectFixture({ data: { ownerId: owner, title: "Submission boundary", status: "ACTIVE" } });
    await db.projectMember.create({ data: { projectId: project.id, userId: member } });
    const submission = await db.submission.create({ data: { projectId: project.id, createdById: member, title: "Private project submission", abstractText: "Private project summary", status: "submitted" } });
    await db.submissionAuthor.create({ data: { submissionId: submission.id, userId: member, position: 0 } });
    const revision = await db.submissionRevision.create({ data: { submissionId: submission.id, uploadedById: member, revisionNumber: 1, contentType: "MARKDOWN", contentSnapshot: "Assigned source", sizeBytes: 15 } });
    await db.submission.update({ where: { id: submission.id }, data: { currentRevisionId: revision.id } });
    return { project, submission, revision };
  }
  it("does not list historical author submissions after project membership is removed", async () => {
    const d = await fixture();
    expect((await submissions.listMine(member, "user")).map(item => item._id)).toContain(d.submission.id);
    await db.projectMember.update({ where: { projectId_userId: { projectId: d.project.id, userId: member } }, data: { status: "REMOVED" } });
    expect((await submissions.listMine(member, "user")).map(item => item._id)).not.toContain(d.submission.id);
    await expect(submissions.get(d.submission.id, member, "user")).rejects.toMatchObject({ statusCode: 403 });
  });
  it("rechecks membership after storing an uploaded submission and removes the unused PDF", async () => {
    const d = await fixture(), before = await db.submission.count({ where: { projectId: d.project.id } });
    vi.mocked(pdfStorageService.savePdf).mockImplementationOnce(async () => {
      await db.projectMember.update({ where: { projectId_userId: { projectId: d.project.id, userId: member } }, data: { status: "REMOVED" } });
      return { uri: "local:revoked-create.pdf" } as never;
    });
    await expect(submissions.create({ projectId: d.project.id, title: "Removed during upload" }, pdf, member, "user")).rejects.toMatchObject({ statusCode: 403 });
    expect(await db.submission.count({ where: { projectId: d.project.id } })).toBe(before);
    expect(pdfStorageService.deletePdf).toHaveBeenCalledWith("local:revoked-create.pdf");
  });
  it("rechecks archival after storing an uploaded submission", async () => {
    const d = await fixture();
    vi.mocked(pdfStorageService.savePdf).mockImplementationOnce(async () => {
      await db.project.update({ where: { id: d.project.id }, data: { status: "ARCHIVED" } });
      return { uri: "local:archived-create.pdf" } as never;
    });
    await expect(submissions.create({ projectId: d.project.id, title: "Archived during upload" }, pdf, owner, "user")).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.submission.count({ where: { projectId: d.project.id } })).toBe(1);
    expect(pdfStorageService.deletePdf).toHaveBeenCalledWith("local:archived-create.pdf");
  });
  it("rechecks membership before committing a PDF revision", async () => {
    const d = await fixture();
    vi.mocked(pdfStorageService.savePdf).mockImplementationOnce(async () => {
      await db.projectMember.update({ where: { projectId_userId: { projectId: d.project.id, userId: member } }, data: { status: "REMOVED" } });
      return { uri: "local:revoked-revision.pdf" } as never;
    });
    await expect(submissions.addRevision(d.submission.id, "Private revision", pdf, member, "user")).rejects.toMatchObject({ statusCode: 403 });
    expect(await db.submissionRevision.count({ where: { submissionId: d.submission.id } })).toBe(1);
    expect((await db.submission.findUniqueOrThrow({ where: { id: d.submission.id } })).currentRevisionId).toBe(d.revision.id);
    expect(pdfStorageService.deletePdf).toHaveBeenCalledWith("local:revoked-revision.pdf");
  });
  it("only shares AI pre-reviews for a formal reviewer's assigned revision", async () => {
    const d = await fixture();
    await db.reviewerAssignment.create({ data: { submissionId: d.submission.id, artifactRevisionId: d.revision.id, reviewerId: reviewer, assignedById: owner, status: "accepted", anonymousCode: crypto.randomUUID() } });
    const newer = await db.submissionRevision.create({ data: { submissionId: d.submission.id, uploadedById: member, revisionNumber: 2, contentType: "MARKDOWN", contentSnapshot: "Private unpublished source", sizeBytes: 26 } });
    await db.submission.update({ where: { id: d.submission.id }, data: { currentRevisionId: newer.id, currentRevisionNumber: 2 } });
    const analyses = [];
    for (const source of [d.revision, newer, undefined]) analyses.push(await db.aiPreReview.create({ data: { submissionId: d.submission.id, requestedById: member, status: "COMPLETED", summary: source?.contentSnapshot ?? "Unversioned analysis", ...(source ? { rawStructuredOutput: { sourceRevisionId: source.id, sourceRevisionNumber: source.revisionNumber } } : {}) } }));
    expect((await submissions.listAiPreReviews(d.submission.id, reviewer, "user")).map(item => item.id)).toEqual([analyses[0]!.id]);
    expect(await submissions.listAiPreReviews(d.submission.id, owner, "user")).toHaveLength(3);
  });
  it("cancels queued AI work after its author loses project membership", async () => {
    const d = await fixture(), queued = await submissions.runAiPreReview(d.submission.id, member, "user");
    await db.projectMember.update({ where: { projectId_userId: { projectId: d.project.id, userId: member } }, data: { status: "REMOVED" } });
    await submissions.processAiPreReview({ preReviewId: queued.id });
    expect(aiReviewerClient.preReview).not.toHaveBeenCalled();
    expect((await db.aiPreReview.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe("CANCELLED");
    expect((await db.submission.findUniqueOrThrow({ where: { id: d.submission.id } })).status).toBe("submitted");
  });
  it.each(["archive", "remove author"] as const)("does not publish AI output after %s while the provider runs", async (change) => {
    const d = await fixture(), queued = await submissions.runAiPreReview(d.submission.id, member, "user");
    vi.mocked(aiReviewerClient.preReview).mockImplementationOnce(async () => {
      if (change === "archive") await db.project.update({ where: { id: d.project.id }, data: { status: "ARCHIVED" } });
      else await db.projectMember.update({ where: { projectId_userId: { projectId: d.project.id, userId: member } }, data: { status: "REMOVED" } });
      return aiResponse;
    });
    await submissions.processAiPreReview({ preReviewId: queued.id });
    const record = await db.aiPreReview.findUniqueOrThrow({ where: { id: queued.id } });
    expect(record).toMatchObject({ status: "CANCELLED", summary: null });
    expect((await db.submission.findUniqueOrThrow({ where: { id: d.submission.id } })).status).toBe("submitted");
  });
  async function latexSubmission() {
    const project = await createProjectFixture({ data: { ownerId: owner, title: "LaTeX submission integration", status: "ACTIVE" } });
    const manuscript = await writing.create(project.id, owner, { title: "Sealed LaTeX methods", documentType: "RESEARCH_PAPER", template: "ARTICLE", description: "", clientKey: crypto.randomUUID() });
    const snapshot = await writing.snapshot(project.id, owner, manuscript.id, { label: "Review source", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const published = await writing.publish(project.id, owner, manuscript.id, snapshot.id, [owner]);
    const original = await db.submissionRevision.findUniqueOrThrow({ where: { id: published.revisionId } });
    return { published, original, snapshot };
  }
  it("includes sealed LaTeX source in an AI pre-review", async () => {
    const { published, original } = await latexSubmission();
    const queued = await submissions.runAiPreReview(published.submissionId, owner, "user");
    await submissions.processAiPreReview({ preReviewId: queued.id });
    expect(aiReviewerClient.preReview).toHaveBeenCalledWith(expect.objectContaining({ manuscript_text: original.contentSnapshot }));
  });
  it("retains its manuscript snapshot when a LaTeX submission revision is restored", async () => {
    const { published, original, snapshot } = await latexSubmission();
    const restored = await submissions.createVersion(published.submissionId, { sourceRevisionId: original.id, summary: "Restore sealed source", expectedRevisionNumber: 1 }, owner, "user");
    expect(await db.submissionRevision.findUniqueOrThrow({ where: { id: restored.id } })).toMatchObject({ contentType: "LATEX", manuscriptSnapshotId: snapshot.id, sourceRevisionId: original.id, contentSnapshot: original.contentSnapshot });
  });
});
