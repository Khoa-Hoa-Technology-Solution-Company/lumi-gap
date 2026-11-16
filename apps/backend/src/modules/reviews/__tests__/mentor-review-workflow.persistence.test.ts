import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, unlink, rmdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { tokenService } from "../../auth/token.service.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { submissionRouter } from "../../submissions/submission.routes.js";
import { humanReviewRouter, reviewRequestRouter } from "../review.routes.js";
import { projectMentorshipService as consent } from "../../projects/project-mentorship.service.js";
import { mentorWorkspaceService as queue } from "../../projects/mentor-workspace.service.js";
import { mentorWorkspaceQuerySchema } from "../../projects/dto/mentor-workspace.schema.js";
import { submissionService as submissions } from "../../submissions/submission.service.js";
import { reviewRequestService as requests } from "../review-request.service.js";
import { reviewService as reviews } from "../review.service.js";
import { manuscriptService as writing } from "../../workspaces/manuscript.service.js";
import { scientificIntegrityChecks, type AcademicReviewInput } from "@trend/shared-types";
import { notificationQueue } from "../../../infrastructure/queue.js";
import { notificationService } from "../../notifications/notification.service.js";
import { dispatchReviewNotifications, reviewNotificationRecoveryConditions } from "../review-notifications.js";
import { requireAuth } from "../../../common/middleware/auth.js";
import { academicProfileRouter } from "../../academic-profiles/academic-profile.routes.js";
const storage = vi.hoisted(() => ({ path: "" }));
vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) }, aiJobsQueue: { add: vi.fn().mockResolvedValue({}) } }));
vi.mock("../../../infrastructure/pdf-storage.service.js", () => ({ pdfStorageService: { savePdf: vi.fn(async () => ({ uri: "test:pinned-pdf" })), deletePdf: vi.fn(), getSignedDownloadUrl: vi.fn(async () => null), resolveLocalPath: vi.fn(() => storage.path) } }));
const enabled = process.env.MENTOR_REVIEW_WORKFLOW_INTEGRATION === "1";
if (enabled && !/^\/codex_mentor_workspace_[a-f0-9]{12}_test$/.test(new URL(process.env.DATABASE_URL!).pathname)) throw Error("Use the isolated mentor workspace runner");

describe.skipIf(!enabled).sequential("scoped mentor delivery and revision workflow", () => {
  const db = getPrisma();
  let owner: string, mentor: string, secondMentor: string, stranger: string, project: string, policy: string, invitation: string;
  let submission: string, v1: string, v2: string, assignment: string, request: string, firstReview: string, revisionItem: string;
  let sourceWorkspace: string, sourceSnapshot: string;
  let server: ReturnType<express.Express["listen"]>, base: string, directory: string;
  let finishInteractive: (() => void) | undefined;
  let interactiveFixture: { submissionId: string; requestId: string } | undefined;
  const sessions = new Map<string, string>();
  const headers = (id: string) => ({ Authorization: `Bearer ${tokenService.signAccessToken({ sub: id, systemRole: "USER", sessionId: sessions.get(id)! }).token}`, "Content-Type": "application/json" });
  const read = (extra = {}) => queue.read(mentor, mentorWorkspaceQuerySchema.parse(extra));
  async function user(lecturer: boolean) {
    const row = await db.user.create({ data: { email: `${randomUUID()}@workflow.invalid`, fullName: lecturer ? "Verified mentor" : "Research author", emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), admissionBasis: "INVITATION" } });
    await db.academicProfile.create({ data: { userId: row.id, academicRole: lecturer ? "LECTURER" : "STUDENT", primaryPosition: lecturer ? "LECTURER" : "STUDENT", roleVerificationStatus: lecturer ? "VERIFIED" : "SELF_DECLARED", positionStatus: lecturer ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: lecturer }, reviewAvailability: { enabled: true, maximumActiveReviews: 20 } } });
    const familyId = randomUUID(); sessions.set(row.id, familyId);
    await db.refreshToken.create({ data: { userId: row.id, familyId, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
    return row.id;
  }
  async function input(assessment: AcademicReviewInput["overallAssessment"], changes = false): Promise<AcademicReviewInput> {
    const workspace = await reviews.getReview(assignment, mentor);
    return { expectedRevisionId: workspace.artifactRevision!.id, expectedRoundNumber: workspace.roundNumber, clientKey: randomUUID(), overallAssessment: assessment, overallComment: "Evaluate the comparison group and reproducibility of the proposed method.", responses: workspace.criteria.map(c => ({ criterionKey: c.key, performanceLevelId: c.levels.find(level => level.score === 4)!.id, comment: "Reasoned academic feedback with section evidence." })), integrityChecks: Object.fromEntries(scientificIntegrityChecks.map(c => [c.key, { status: "CHECKED" as const }])), requiredRevisions: changes ? [{ priority: "MAJOR", description: "Document the comparison group and its selection criteria.", locator: "Methods" }] : [] };
  }
  beforeAll(async () => {
    owner = await user(false); mentor = await user(true); secondMentor = await user(true); stranger = await user(true);
    project = (await createProjectFixture({ data: { ownerId: owner, title: "Scoped mentor review study", status: "ACTIVE", mentorshipSummary: "A study of reproducible evaluation methods and clear evidence.", mentorshipNeeds: "Research methodology", mentorshipDiscovery: "SEEKING_MENTOR" } })).id;
    const pending = await consent.request(project, owner, { mentorUserId: mentor, message: "Please guide the design of our reproducible study", idempotencyKey: randomUUID(), access: { preset: "ADVISOR", permissions: ["MENTOR_CHAT"], expiresAt: null } });
    invitation = pending.id; policy = (await db.mentorAccess.findUniqueOrThrow({ where: { requestId: invitation } })).id;
    directory = await mkdtemp(join(tmpdir(), "lumigap-review-")); storage.path = join(directory, "assigned.pdf");
    await writeFile(storage.path, "%PDF-1.4\nPinned manuscript v1\n%%EOF");
    const app = express(); app.use(express.json()); app.use("/submissions", submissionRouter); app.use("/reviews", humanReviewRouter); app.use("/review-requests", reviewRequestRouter);
    if (process.env.MENTOR_REVIEW_INTERACTIVE_UI === "1") {
      app.use("/api/v1/submissions", submissionRouter); app.use("/api/v1/reviews", humanReviewRouter); app.use("/api/v1/review-requests", reviewRequestRouter); app.use("/api/v1/academic-profiles", academicProfileRouter);
      app.get("/api/v1/projects/academic-support/workspace", requireAuth, async (req, res) => res.json({ success: true, data: await queue.read(req.user!.sub, mentorWorkspaceQuerySchema.parse(req.query)) }));
      app.get("/qa/session/:role", async (req, res) => {
        const id = req.params.role === "student" ? owner : mentor;
        const actor = await db.user.findUniqueOrThrow({ where: { id } });
        res.json({ user: { id, fullName: actor.fullName, email: actor.email, systemRole: "USER" }, tokens: { accessToken: headers(id).Authorization.slice(7), refreshToken: "isolated-test-session" }, fixture: interactiveFixture });
      });
      app.post("/qa/finish", (_req, res) => { res.json({ success: true }); finishInteractive?.(); });
    }
    app.use(errorHandler);
    server = app.listen(process.env.MENTOR_REVIEW_INTERACTIVE_UI === "1" ? 4001 : 0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => { if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } if (directory) { await unlink(storage.path); await rmdir(directory); } await disconnectPostgres(); });

  it("rejects delivery to a pending mentor atomically and leaves no broken manuscript, request or task", async () => {
    const before = await db.submission.count({ where: { projectId: project } });
    await expect(submissions.create({ projectId: project, title: "Not yet authorized", contentSnapshot: "Private text", mentorId: mentor }, undefined, owner, "user")).rejects.toMatchObject({ statusCode: 403 });
    expect(await db.submission.count({ where: { projectId: project } })).toBe(before);
    expect(await db.reviewRequest.count({ where: { projectId: project } })).toBe(0);
    expect(await db.projectTask.count({ where: { projectId: project } })).toBe(0);
    expect((await read()).items).toEqual([]);
  });
  it("accepts supervision without project membership and sends a version-bound request without broad sharing", async () => {
    const version = (await db.mentorAccess.findUniqueOrThrow({ where: { id: policy } })).version;
    await consent.accept(project, invitation, mentor, "Agreed to guide this research", version);
    expect(await db.projectMember.count({ where: { projectId: project, userId: mentor } })).toBe(0);
    const created = await submissions.create({ projectId: project, title: "Reproducible methods", submissionType: "RESEARCH_PAPER", mentorId: mentor }, { buffer: Buffer.from("%PDF-1.4\nPinned manuscript v1\n%%EOF"), originalname: "study.pdf", size: 40 }, owner, "user");
    submission = created.submission.id; v1 = created.revision.id;
    const sent = await db.reviewerAssignment.findFirstOrThrow({ where: { submissionId: submission, reviewerId: mentor } }); assignment = sent.id; request = sent.reviewRequestId!;
    expect(sent).toMatchObject({ mentorAccessId: policy, artifactRevisionId: v1, status: "assigned" });
    expect((await db.mentorAccess.findUniqueOrThrow({ where: { id: policy } })).permissions).toEqual(["MENTOR_CHAT"]);
    expect(await db.mentorResourceShare.count({ where: { accessId: policy } })).toBe(0);
    expect(await db.projectTask.count({ where: { targetId: submission } })).toBe(0);
    expect((await read()).items[0]).toMatchObject({ kind: "MANUSCRIPT_REVIEW", version: 1, href: `/review-requests/${request}` });
    expect((await fetch(`${base}/submissions/${submission}`, { headers: headers(mentor) })).status).toBe(403);
    expect(await db.notification.count({ where: { userId: mentor, targetUuid: request, type: "REVIEW_REQUESTED" } })).toBe(1);
  });
  it("opens the assigned PDF through authenticated endpoints and refuses other reviewers, edits, and guessed versions", async () => {
    expect((await fetch(`${base}/review-requests/${request}/accept`, { method: "POST", headers: headers(mentor) })).status).toBe(204);
    expect((await fetch(`${base}/reviews/${assignment}`)).status).toBe(401);
    expect((await fetch(`${base}/reviews/${assignment}`, { headers: headers(mentor) })).status).toBe(200);
    expect((await fetch(`${base}/reviews/${assignment}`, { headers: headers(stranger) })).status).toBe(404);
    const pdf = await fetch(`${base}/submissions/${submission}/revisions/${v1}/download`, { headers: headers(mentor) }); expect(pdf.status).toBe(200); expect(await pdf.text()).toContain("Pinned manuscript v1");
    expect((await fetch(`${base}/submissions/${submission}/revisions/${randomUUID()}/download`, { headers: headers(mentor) })).status).toBe(404);
    await expect(submissions.createVersion(submission, { content: "Unauthorized change", summary: "Try to edit", expectedRevisionNumber: 1 }, mentor, "user")).rejects.toMatchObject({ statusCode: 403 });
  });
  it("requests changes, sends feedback notifications, and moves both queue projections to waiting", async () => {
    const payload = await input("MAJOR_REVISION", true);
    const response = await fetch(`${base}/reviews/${assignment}/submit`, { method: "POST", headers: headers(mentor), body: JSON.stringify(payload) }); expect(response.status).toBe(200);
    const saved = (await response.json()).data; firstReview = saved.review.id; revisionItem = saved.requiredRevisions[0].id;
    expect((await read()).items).toEqual([]);
    const global = await read({ status: "WAITING" }), scoped = await read({ status: "WAITING", projectId: project });
    expect(global.items).toEqual(scoped.items); expect(global.items[0]).toMatchObject({ status: "WAITING", version: 1 });
    expect(await db.notification.count({ where: { userId: owner, targetUuid: request, type: "REVISION_REQUESTED" } })).toBe(1);
    expect((await requests.detail(request, owner)).reviews[0]!.overallComment).toBe(payload.overallComment);
  });
  it("keeps a new v2 draft private until explicit resubmission", async () => {
    v2 = (await submissions.createVersion(submission, { content: "# Methods\nA comparison group is selected by predeclared criteria.", summary: "Describe the comparison group", expectedRevisionNumber: 1 }, owner, "user")).id;
    expect((await reviews.getReview(assignment, mentor)).artifactRevision!.id).toBe(v1);
    const visible = await submissions.listRevisions(submission, mentor, "user"); expect(visible.map(v => v.id)).toEqual([v1]);
    expect((await submissions.history(submission, mentor, "user")).currentRevisionId).toBe(v1);
    expect((await fetch(`${base}/submissions/${submission}/revisions/${v2}/download`, { headers: headers(mentor) })).status).toBe(404);
    expect(JSON.stringify(await requests.detail(request, mentor))).not.toContain("predeclared criteria");
  });
  it("keeps submitted feedback successful and durable when notification transport is unavailable", async () => {
    const sent = await submissions.create({ projectId: project, title: "Notification resilience", submissionType: "RESEARCH_PAPER", mentorId: mentor, contentSnapshot: "# Methods\nA reproducible study." }, undefined, owner, "user");
    const task = await db.reviewerAssignment.findFirstOrThrow({ where: { submissionId: sent.submission.id, reviewerId: mentor } });
    await requests.accept(task.reviewRequestId!, mentor);
    vi.mocked(notificationQueue.add).mockRejectedValueOnce(new Error("Notification transport unavailable"));
    const payload: AcademicReviewInput = { clientKey: randomUUID(), expectedRevisionId: sent.revision.id, expectedRoundNumber: 1, commentOnly: true, overallComment: "The methods are clear; consider documenting the random seed.", responses: [] };
    const response = await fetch(`${base}/reviews/${task.id}/submit`, { method: "POST", headers: headers(mentor), body: JSON.stringify(payload) });
    expect(response.status).toBe(200);
    const replay = await fetch(`${base}/reviews/${task.id}/submit`, { method: "POST", headers: headers(mentor), body: JSON.stringify(payload) });
    expect(replay.status).toBe(200);
    expect(await db.humanReview.count({ where: { assignmentId: task.id, status: "SUBMITTED" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: owner, targetUuid: task.reviewRequestId, type: "REVIEW_SUBMITTED" } })).toBe(1);
    const recoverable = await db.notification.findMany({ where: { userId: owner, targetUuid: task.reviewRequestId, dispatchedAt: null, OR: reviewNotificationRecoveryConditions } });
    expect(recoverable).toHaveLength(1);
    await dispatchReviewNotifications(recoverable);
    expect((await db.notification.findUniqueOrThrow({ where: { id: recoverable[0].id } })).dispatchedAt).not.toBeNull();
  });
  it("rolls back manuscript delivery if its durable notification cannot be persisted", async () => {
    const before = await db.submission.count({ where: { projectId: project } });
    const failure = vi.spyOn(notificationService, "create").mockRejectedValueOnce(new Error("Notification persistence failed"));
    try {
      await expect(submissions.create({ projectId: project, title: "Atomic delivery failure", contentSnapshot: "A manuscript", submissionType: "RESEARCH_PAPER", mentorId: mentor }, undefined, owner, "user")).rejects.toThrow("Notification persistence failed");
      expect(await db.submission.count({ where: { projectId: project } })).toBe(before);
      expect(await db.reviewRequest.count({ where: { submissionId: { in: (await db.submission.findMany({ where: { title: "Atomic delivery failure" }, select: { id: true } })).map(row => row.id) } } })).toBe(0);
    } finally { failure.mockRestore(); }
  });
  it("serializes simultaneous delivery requests without duplicate assignments, tasks or notifications", async () => {
    const sent = await submissions.create({ projectId: project, title: "Concurrent review requests", contentSnapshot: "# Methods\nA concurrency check.", submissionType: "RESEARCH_PAPER" }, undefined, owner, "user");
    const template = (await db.reviewRequest.findUniqueOrThrow({ where: { id: request } })).templateVersionId;
    const input = { submissionId: sent.submission.id, reviewerId: mentor, templateVersionId: template, purpose: "MENTOR_GUIDANCE" as const };
    const results = await Promise.allSettled([requests.create(input, owner), requests.create(input, owner)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await db.reviewerAssignment.count({ where: { submissionId: sent.submission.id, reviewerId: mentor } })).toBe(1);
    expect(await db.projectTask.count({ where: { targetId: sent.submission.id } })).toBe(0);
    const delivered = await db.reviewRequest.findFirstOrThrow({ where: { submissionId: sent.submission.id } });
    expect(await db.notification.count({ where: { targetUuid: delivered.id, type: "REVIEW_REQUESTED" } })).toBe(1);
    await requests.decline(delivered.id, mentor, "Concurrency verification complete");
  });
  it("resubmits v2, retains immutable v1 feedback and exposes only the newly delivered version", async () => {
    await requests.resubmit(request, owner, { revisionId: v2, responses: [{ revisionItemId: revisionItem, responseText: "Comparison group criteria are now recorded in Methods." }] });
    const workspace = await reviews.getReview(assignment, mentor); expect(workspace.artifactRevision!.id).toBe(v2); expect(workspace.artifactContent).toContain("predeclared criteria");
    expect(workspace.comparisonVersions.map(v => v.id)).toEqual([v1, v2]);
    expect((await requests.detail(request, mentor)).reviews[0]!.id).toBe(firstReview);
    expect((await read()).items[0]).toMatchObject({ version: 2, kind: "MANUSCRIPT_REVIEW" });
    await requests.resolveRevisionItem(request, revisionItem, "ACCEPTED", mentor, v2);
    await reviews.saveReview(assignment, mentor, await input("STRONG"), true);
    expect((await db.humanReview.findUniqueOrThrow({ where: { id: firstReview } })).revisionId).toBe(v1);
    expect((await db.submission.findUniqueOrThrow({ where: { id: submission } })).status).toBe("READY_TO_ADVANCE");
  });
  it("keeps two mentors' drafts independent and aggregates another accepted project", async () => {
    const p = await createProjectFixture({ data: { ownerId: owner, title: "Another guided team", status: "ACTIVE" } });
    const invitation2 = await db.mentorshipRequest.create({ data: { projectId: p.id, requestedBy: owner, mentorUserId: mentor, status: "ACCEPTED" } });
    const relation = await db.mentorRelationship.create({ data: { projectId: p.id, mentorUserId: mentor, sourceRequestId: invitation2.id } });
    await db.mentorAccess.create({ data: { projectId: p.id, requestId: invitation2.id, relationshipId: relation.id, mentorUserId: mentor, configuredById: owner, permissions: ["MENTOR_CHAT"] } });
    await submissions.create({ projectId: p.id, title: "Another team's draft", submissionType: "RESEARCH_PAPER", contentSnapshot: "A second private study", mentorId: mentor }, undefined, owner, "user");
    expect((await read()).summary.projects).toBe(2); expect((await read()).items.some(i => i.projectId === p.id)).toBe(true);
    const invite = await consent.request(project, owner, { mentorUserId: secondMentor, mentorRole: "SECONDARY", message: "Please review another perspective on our methods", idempotencyKey: randomUUID(), access: { preset: "ADVISOR", permissions: ["MENTOR_CHAT"], expiresAt: null } });
    await consent.accept(project, invite.id, secondMentor, "Agreed", invite.accessPolicy?.version);
    const tpl = (await db.reviewRequest.findUniqueOrThrow({ where: { id: request } })).templateVersionId;
    const a = await requests.create({ submissionId: submission, reviewerId: mentor, templateVersionId: tpl, purpose: "MENTOR_GUIDANCE" }, owner);
    const b = await requests.create({ submissionId: submission, reviewerId: secondMentor, templateVersionId: tpl, purpose: "MENTOR_GUIDANCE" }, owner);
    await requests.accept(a.id, mentor); await requests.accept(b.id, secondMentor);
    await Promise.all([[a.assignment.id, mentor, "First mentor's private draft"], [b.assignment.id, secondMentor, "Second mentor's private draft"]].map(([id, reviewer, comment]) => reviews.saveReview(id, reviewer, { responses: [], commentOnly: true, overallComment: comment, expectedRevisionId: v2, expectedRoundNumber: 1 }, false)));
    expect((await reviews.getReview(a.assignment.id, mentor)).review!.overallComment).toBe("First mentor's private draft");
    expect((await reviews.getReview(b.assignment.id, secondMentor)).review!.overallComment).toBe("Second mentor's private draft");
    await expect(reviews.getReview(b.assignment.id, mentor)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("reads the exact delivered LaTeX snapshot while refusing the live editor and other snapshots", async () => {
    const manuscript = await writing.create(project, owner, { title: "Source-bound study", documentType: "RESEARCH_PROPOSAL", template: "PROPOSAL", description: "", clientKey: randomUUID() });
    sourceWorkspace = manuscript.id;
    sourceSnapshot = (await writing.snapshot(project, owner, sourceWorkspace, { label: "Delivered v1", clientKey: randomUUID(), minimumSequences: {} })).id;
    const sent = await submissions.create({ projectId: project, title: "Source-bound study", submissionType: "RESEARCH_PROPOSAL", manuscriptSnapshotId: sourceSnapshot, mentorId: mentor }, undefined, owner, "user");
    const assigned = await db.reviewerAssignment.findFirstOrThrow({ where: { submissionId: sent.submission.id, reviewerId: mentor } });
    await requests.accept(assigned.reviewRequestId!, mentor);
    const workspace = await reviews.getReview(assigned.id, mentor);
    if (process.env.MENTOR_REVIEW_QA_OUTPUT) {
      await mkdir(dirname(process.env.MENTOR_REVIEW_QA_OUTPUT), { recursive: true });
      await writeFile(process.env.MENTOR_REVIEW_QA_OUTPUT, JSON.stringify(workspace));
    }
    expect(workspace.artifactContent).toContain("\\documentclass");
    expect(workspace.artifactContent).not.toMatch(/^% Manuscript Snapshot/);
    expect((await writing.viewSnapshot(project, mentor, sourceWorkspace, sourceSnapshot)).canComment).toBe(false);
    await expect(writing.detail(project, mentor, sourceWorkspace)).rejects.toMatchObject({ statusCode: 404 });
    const privateSnapshot = await writing.snapshot(project, owner, sourceWorkspace, { label: "Not sent to reviewer", clientKey: randomUUID(), minimumSequences: {} });
    await expect(writing.viewSnapshot(project, mentor, sourceWorkspace, privateSnapshot.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.viewSnapshot(project, stranger, sourceWorkspace, sourceSnapshot)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("blocks cancelled, expired and revoked review grants without deleting submitted evidence", async () => {
    const pending = await db.reviewRequest.findFirstOrThrow({ where: { projectId: { not: project }, requesterId: owner, status: "REQUESTED" } });
    await requests.cancel(pending.id, owner);
    await expect(requests.accept(pending.id, mentor)).rejects.toMatchObject({ statusCode: 403 });
    const expiredSubmission = await submissions.create({ projectId: pending.projectId, title: "Expiring review", contentSnapshot: "A private draft", submissionType: "RESEARCH_PAPER", mentorId: mentor }, undefined, owner, "user");
    const expiring = await db.reviewRequest.findFirstOrThrow({ where: { submissionId: expiredSubmission.submission.id } });
    await db.reviewRequest.update({ where: { id: expiring.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(requests.accept(expiring.id, mentor)).rejects.toMatchObject({ statusCode: 403 });
    expect((await db.reviewRequest.findUniqueOrThrow({ where: { id: expiring.id } })).status).toBe("EXPIRED");
    await db.mentorAccess.update({ where: { id: policy }, data: { revokedAt: new Date() } });
    expect((await read({ projectId: project }).catch(error => error.statusCode))).toBe(404);
    expect((await fetch(`${base}/reviews/${assignment}`, { headers: headers(mentor) })).status).toBe(403);
    expect((await fetch(`${base}/submissions/${submission}/revisions/${v1}/download`, { headers: headers(mentor) })).status).toBe(403);
    await expect(writing.viewSnapshot(project, mentor, sourceWorkspace, sourceSnapshot)).rejects.toMatchObject({ statusCode: 404 });
    expect((await db.humanReview.findUniqueOrThrow({ where: { id: firstReview } })).revisionId).toBe(v1);
  });
  it("does not leak revoked manuscript metadata or feedback through review list endpoints", async () => {
    const list = await fetch(`${base}/reviews`, { headers: headers(mentor) });
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.data.some((row: { id: string }) => row.id === assignment)).toBe(false);
    expect(JSON.stringify(body)).not.toContain("Reproducible methods");
    const center = await fetch(`${base}/review-requests`, { headers: headers(mentor) });
    expect(center.status).toBe(200);
    const requestsBody = await center.json();
    expect(requestsBody.data.incoming.some((row: { id: string }) => row.id === request)).toBe(false);
    expect(JSON.stringify(requestsBody)).not.toContain("Reproducible methods");
  });
  it.skipIf(process.env.MENTOR_REVIEW_INTERACTIVE_UI !== "1")("serves disposable real-API fixtures for manual student and mentor UI verification", async () => {
    for (const title of ["UI audit: Methods team", "UI audit: Evidence team"]) {
      const p = await createProjectFixture({ data: { ownerId: owner, title, status: "ACTIVE", mentorshipSummary: "A study of reproducible academic methods", mentorshipNeeds: "Methodology", mentorshipDiscovery: "SEEKING_MENTOR" } });
      const invite = await consent.request(p.id, owner, { mentorUserId: mentor, message: "Please guide this reproducible study", idempotencyKey: randomUUID(), access: { preset: "ADVISOR", permissions: ["MENTOR_CHAT"], expiresAt: null } });
      await consent.accept(p.id, invite.id, mentor, "Accepted", invite.accessPolicy?.version);
      const sent = await submissions.create({ projectId: p.id, title: `${title}: manuscript`, submissionType: "RESEARCH_PAPER", mentorId: mentor, contentSnapshot: "# Research question\nHow can evaluation be reproduced?\n\n# Methods\nWe document the dataset, baselines and evaluation protocol.\n\n# Results\nInitial observations and limitations are reported transparently." }, undefined, owner, "user");
      const assigned = await db.reviewerAssignment.findFirstOrThrow({ where: { submissionId: sent.submission.id } });
      interactiveFixture ??= { submissionId: sent.submission.id, requestId: assigned.reviewRequestId! };
    }
    console.log("Disposable UI API ready on 127.0.0.1:4001; finish via the local QA harness.");
    await new Promise<void>((resolve, reject) => { finishInteractive = resolve; const timeout = setTimeout(() => reject(Error("UI verification timed out")), 25 * 60000); timeout.unref(); });
  }, 26 * 60000);
});
