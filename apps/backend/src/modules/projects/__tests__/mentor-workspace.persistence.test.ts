import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { mentorWorkspaceService as service, mentorWorkHref } from "../mentor-workspace.service.js";
import { mentorWorkspaceQuerySchema as query } from "../dto/mentor-workspace.schema.js";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { projectDiscussionsService as discussions } from "../project-discussions.service.js";
import { reviewService } from "../../reviews/review.service.js";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) }, aiJobsQueue: { add: vi.fn().mockResolvedValue({}) } }));
const enabled = process.env.MENTOR_WORKSPACE_INTEGRATION === "1";
if (enabled) {
  const url = new URL(process.env.DATABASE_URL!);
  if (!/^codex_mentor_workspace_[a-f0-9]{12}_test$/.test(url.pathname.slice(1)) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Use the isolated mentor workspace test runner");
}

describe("mentor workspace routes and filters", () => {
  it("bounds pagination and rejects invalid status, IDs, selectors and unknown flags", () => {
    for (const value of [{ page: 0 }, { pageSize: 1000 }, { status: "ACCEPTED" }, { projectFilter: "ACTIVE" }, { projectSort: "urgency" }, { item: "TASK:../../../private" }, { assigneeId: randomUUID() }, { projectId: "not-an-id" }]) expect(query.safeParse(value).success).toBe(false);
    expect(query.parse({ page: "2", pageSize: "10", status: "WAITING", projectFilter: "ATTENTION", projectSort: "name", projectPage: "3" })).toMatchObject({ page: 2, pageSize: 10, status: "WAITING", projectFilter: "ATTENTION", projectSort: "name", projectPage: 3 });
    expect(query.parse({ status: "OVERDUE" })).toMatchObject({ status: "OVERDUE", projectFilter: "ALL", projectSort: "attention", projectPage: 1 });
  });
  it("targets an exact review request until it is being edited and keeps task and question routes distinct", () => {
    const row = { kind: "MANUSCRIPT_REVIEW" as const, sourceId: "request", projectId: "project", status: "TODO" as const, assignmentId: "assignment" };
    expect(mentorWorkHref(row)).toBe("/review-requests/request");
    expect(mentorWorkHref({ ...row, status: "IN_PROGRESS" })).toBe("/reviews/assignment");
    expect(mentorWorkHref({ ...row, kind: "MENTOR_QUESTION" })).toBe("/projects/project?tab=tasks&discussion=request");
    expect(mentorWorkHref({ ...row, kind: "TASK" })).toBe("/projects/project?tab=tasks&workItem=TASK:request");
    expect(mentorWorkHref({ ...row, kind: "TASK", resourceId: "shared-submission" })).toBe("/projects/project?view=resources&resourceId=shared-submission");
  });
});

describe.skipIf(!enabled).sequential("mentor workspace PostgreSQL projection and authorization", () => {
  const db = getPrisma();
  afterAll(disconnectPostgres);
  async function user(lecturer = false) {
    const row = await db.user.create({ data: { email: `${randomUUID()}@mentor-workspace.invalid`, fullName: lecturer ? "Assigned mentor" : "Student owner", emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
    await db.academicProfile.create({ data: { userId: row.id, academicRole: lecturer ? "LECTURER" : "STUDENT", primaryPosition: lecturer ? "LECTURER" : "STUDENT", roleVerificationStatus: lecturer ? "VERIFIED" : "SELF_DECLARED", positionStatus: lecturer ? "VERIFIED" : "NOT_SUBMITTED" } });
    return row.id;
  }
  async function fixture(mentor?: string, pending = false) {
    const owner = await user(), actor = mentor ?? await user(true);
    const p = await createProjectFixture({ data: { ownerId: owner, title: `Research ${randomUUID()}`, researchField: "Computer science", status: "ACTIVE" } });
    const request = await db.mentorshipRequest.create({ data: { projectId: p.id, requestedBy: owner, mentorUserId: actor, status: pending ? "PENDING" : "ACCEPTED", expiresAt: new Date(Date.now() + 86400000) } });
    const relation = pending ? null : await db.mentorRelationship.create({ data: { projectId: p.id, mentorUserId: actor, sourceRequestId: request.id } });
    const access = await db.mentorAccess.create({ data: { projectId: p.id, requestId: request.id, relationshipId: relation?.id, mentorUserId: actor, configuredById: owner, permissions: ["TASKS_VIEW", "SUBMISSIONS_VIEW"] } });
    return { p, actor, owner, request, relation, access };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const read = (actor: string, extra = {}) => service.read(actor, query.parse(extra));
  const task = (f: Fixture, extra = {}) => db.projectTask.create({ data: { projectId: f.p.id, title: "Directly assigned work", assigneeId: f.actor, createdById: f.owner, clientKey: randomUUID(), ...extra } });
  async function review(f: Fixture, shared = true) {
    const submission = await db.submission.create({ data: { projectId: f.p.id, createdById: f.owner, title: "Pinned manuscript", submissionType: "RESEARCH_PAPER" } });
    const revision = await db.submissionRevision.create({ data: { submissionId: submission.id, revisionNumber: 1, uploadedById: f.owner, contentType: "MARKDOWN", contentSnapshot: "Immutable scientific content", sizeBytes: Buffer.byteLength("Immutable scientific content") } });
    await db.submission.update({ where: { id: submission.id }, data: { currentRevisionId: revision.id } });
    const template = await db.reviewTemplate.create({ data: { name: "Workspace test template" } });
    const version = await db.reviewTemplateVersion.create({ data: { templateId: template.id, versionNumber: 1, reviewMode: "RUBRIC_ASSESSMENT", status: "PUBLISHED" } });
    const request = await db.reviewRequest.create({ data: { projectId: f.p.id, submissionId: submission.id, artifactRevisionId: revision.id, templateVersionId: version.id, requesterId: f.owner, origin: "MENTOR_GUIDANCE", status: "ACCEPTED" } });
    const assignment = await db.reviewerAssignment.create({ data: { submissionId: submission.id, reviewRequestId: request.id, artifactRevisionId: revision.id, reviewerId: f.actor, assignedById: f.owner, anonymousCode: randomUUID(), status: "accepted" } });
    const share = shared ? await db.mentorResourceShare.create({ data: { accessId: f.access.id, projectId: f.p.id, kind: "SUBMISSION", resourceId: submission.id, sharedById: f.owner, title: "Shared manuscript", content: "Shared revision" } }) : null;
    return { submission, revision, request, assignment, share };
  }

  it("computes facets before status, item and pagination while respecting project, search and kind", async () => {
    const f = await fixture(), other = await fixture(f.actor);
    const todo = await task(f, { title: "Facet work to do" });
    await task(f, { title: "Facet work in progress", status: "IN_PROGRESS" });
    await task(f, { title: "Facet work blocked", status: "BLOCKED", blockedReason: "Waiting for the research protocol" });
    await task(f, { title: "Facet work done", status: "DONE", completedAt: new Date(), completedById: f.actor });
    await task(other, { title: "Facet work in another project" });
    await task(f, { title: "Excluded search match" });
    await review(f);
    const scoped = await read(f.actor, { projectId: f.p.id, q: "Facet", kind: "TASK", pageSize: 1, status: "DONE" });
    expect(scoped.meta.total).toBe(1);
    expect(scoped.facets).toMatchObject({ ALL: 4, ACTIONABLE: 3, TODO: 1, IN_PROGRESS: 1, WAITING: 0, BLOCKED: 1, DONE: 1 });
    const selected = await read(f.actor, { projectId: f.p.id, q: "Facet", kind: "TASK", item: `TASK:${todo.id}`, status: "ALL" });
    expect(selected.items).toHaveLength(1); expect(selected.facets).toEqual(scoped.facets);
    await db.project.update({ where: { id: f.p.id }, data: { status: "ARCHIVED" } });
    const archived = await read(f.actor, { projectId: f.p.id, q: "Facet", kind: "TASK", status: "ALL" });
    expect(archived.facets).toMatchObject({ ALL: 4, ACTIONABLE: 0, IN_PROGRESS: 1, DONE: 1, BLOCKED: 1 });
    expect(archived.items.every(item => item.readOnly && !item.needsAction)).toBe(true);
  });
  it("includes revision requests in waiting and all, without treating them as completed", async () => {
    const f = await fixture(), r = await review(f);
    await db.reviewRequest.update({ where: { id: r.request.id }, data: { status: "REVISION_REQUESTED" } });
    const waiting = await read(f.actor, { projectId: f.p.id, status: "WAITING" });
    expect(waiting.items.map(item => item.sourceId)).toEqual([r.request.id]);
    expect(waiting.facets).toMatchObject({ ALL: 1, WAITING: 1, DONE: 0, ACTIONABLE: 0 });
    expect((await read(f.actor, { projectId: f.p.id, status: "ALL" })).items).toEqual(waiting.items);
    expect((await read(f.actor, { projectId: f.p.id, status: "DONE" })).items).toEqual([]);
  });
  it("aggregates multiple accepted teams, excludes member tasks, and paginates after global priority sorting", async () => {
    const f = await fixture(), other = await fixture(f.actor);
    const normal = await task(f), late = await task(other, { title: "Overdue assignment", dueAt: new Date(Date.now() - 3600000) });
    await task(f, { assigneeId: f.owner, title: "PRIVATE OTHER PERSON TASK" });
    const first = await read(f.actor, { pageSize: 1 });
    expect(first.summary.projects).toBe(2); expect(first.summary.needsResponse).toBe(2); expect(first.summary.overdue).toBe(1);
    expect(first.items.map(i => i.sourceId)).toEqual([late.id]); expect(first.meta.total).toBe(2);
    const second = await read(f.actor, { pageSize: 1, page: 2 }); expect(second.items.map(i => i.sourceId)).toEqual([normal.id]);
    expect(JSON.stringify(first)).not.toContain("PRIVATE OTHER PERSON TASK");
  });
  it("never grants project content through a pending invitation, arbitrary project filter, revoked or expired access", async () => {
    const f = await fixture(undefined, true); await task(f);
    const pending = await read(f.actor); expect(pending.items).toEqual([]); expect(pending.projectOptions).toEqual([]); expect(pending.summary.invitations).toBe(1);
    await expect(read(f.actor, { projectId: f.p.id })).rejects.toMatchObject({ statusCode: 404 });
    const active = await fixture(f.actor); await task(active);
    for (const patch of [{ revokedAt: new Date() }, { revokedAt: null, expiresAt: new Date(Date.now() - 1000) }]) {
      await db.mentorAccess.update({ where: { id: active.access.id }, data: patch });
      expect((await read(f.actor)).items).toEqual([]);
    }
  });
  it("removes ended/deleted projects and rejects suspended, unverified and student accounts", async () => {
    const f = await fixture(); await task(f);
    await db.mentorRelationship.update({ where: { id: f.relation!.id }, data: { status: "ENDED", endedAt: new Date() } });
    expect((await read(f.actor)).projectOptions).toEqual([]);
    await db.mentorRelationship.update({ where: { id: f.relation!.id }, data: { status: "ACTIVE", endedAt: null } });
    await db.project.update({ where: { id: f.p.id }, data: { deletedAt: new Date(), deletedById: f.owner, purgeAt: new Date(Date.now() + 30 * 86400000) } });
    expect((await read(f.actor)).items).toEqual([]);
    await expect(read(f.owner)).rejects.toMatchObject({ statusCode: 403 });
    await db.academicProfile.update({ where: { userId: f.actor }, data: { positionStatus: "INVALIDATED" } });
    await expect(read(f.actor)).rejects.toMatchObject({ statusCode: 403 });
    await db.academicProfile.update({ where: { userId: f.actor }, data: { positionStatus: "VERIFIED" } });
    await db.user.update({ where: { id: f.actor }, data: { accountStatus: "SUSPENDED" } });
    await expect(read(f.actor)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("deduplicates upgraded manuscript tasks, pins the requested version and follows review transitions", async () => {
    const f = await fixture(), r = await review(f);
    await task(f, { targetKind: "submission", targetId: r.submission.id, title: "Cần góp ý bản thảo (v1): Pinned manuscript" });
    const newer = await db.submissionRevision.create({ data: { submissionId: r.submission.id, revisionNumber: 2, uploadedById: f.owner, contentType: "MARKDOWN", contentSnapshot: "NEWER PRIVATE VERSION", sizeBytes: Buffer.byteLength("NEWER PRIVATE VERSION") } });
    let result = await read(f.actor); expect(result.items).toHaveLength(1); expect(result.items[0]).toMatchObject({ kind: "MANUSCRIPT_REVIEW", version: 1, href: `/review-requests/${r.request.id}` });
    await db.reviewRequest.update({ where: { id: r.request.id }, data: { status: "IN_REVIEW" } });
    result = await read(f.actor); expect(result.items[0]?.href).toBe(`/reviews/${r.assignment.id}`);
    await db.reviewRequest.update({ where: { id: r.request.id }, data: { status: "REVISION_REQUESTED" } });
    expect((await read(f.actor)).items).toEqual([]); expect((await read(f.actor, { status: "WAITING" })).items).toHaveLength(1);
    await db.reviewRequest.update({ where: { id: r.request.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    expect((await read(f.actor)).summary.needsResponse).toBe(0); expect((await read(f.actor, { status: "DONE" })).items).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("NEWER PRIVATE VERSION");
    await db.reviewRequest.update({ where: { id: r.request.id }, data: { status: "RESUBMITTED", artifactRevisionId: newer.id, completedAt: null } });
    // Do not label an assignment with a different, not-yet-assigned version.
    expect((await read(f.actor)).items.filter(i => i.kind === "MANUSCRIPT_REVIEW")).toEqual([]);
    await db.reviewerAssignment.update({ where: { id: r.assignment.id }, data: { artifactRevisionId: newer.id } });
    expect((await read(f.actor)).items.find(i => i.kind === "MANUSCRIPT_REVIEW")?.version).toBe(2);
  });
  it("requires effective submission permission and exact unrevoked artifact sharing", async () => {
    const f = await fixture(), r = await review(f, false);
    expect((await read(f.actor)).items).toEqual([]);
    const share = await db.mentorResourceShare.create({ data: { accessId: f.access.id, projectId: f.p.id, kind: "SUBMISSION", resourceId: r.submission.id, sharedById: f.owner, title: "Exact artifact", content: "Shared" } });
    expect((await read(f.actor)).items).toHaveLength(1);
    await db.mentorResourceShare.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
    expect((await read(f.actor)).items).toEqual([]);
    await db.mentorResourceShare.update({ where: { id: share.id }, data: { revokedAt: null } });
    await db.mentorAccess.update({ where: { id: f.access.id }, data: { permissions: ["TASKS_VIEW"] } });
    expect((await read(f.actor)).items).toEqual([]);
  });
  it("keeps separately assigned manuscript tasks visible beside the canonical review", async () => {
    const f = await fixture(), r = await review(f);
    const independent = await task(f, { targetKind: "submission", targetId: r.submission.id, title: "Check citation permission for this manuscript" });
    const result = await read(f.actor);
    expect(result.items.map(item => item.sourceId)).toEqual(expect.arrayContaining([r.request.id, independent.id]));
    expect(result.meta.total).toBe(2);
  });
  it("explains an unshared legacy mentor review task, opens permitted chat, and restores its manuscript link after sharing", async () => {
    const f = await fixture(), r = await review(f, false);
    await db.reviewerAssignment.update({ where: { id: r.assignment.id }, data: { reviewRequestId: null, anonymousCode: `unrelated-${r.submission.id}` } });
    await db.reviewRequest.delete({ where: { id: r.request.id } });
    await db.mentorAccess.update({ where: { id: f.access.id }, data: { permissions: ["MENTOR_CHAT"] } });
    const legacy = await task(f, { targetKind: "submission", targetId: r.submission.id, title: "Cần góp ý bản thảo (v1): Pinned manuscript" });
    let result = await read(f.actor);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ sourceId: legacy.id, status: "BLOCKED", blocked: true, accessIssue: "MANUSCRIPT_NOT_SHARED", canContactTeam: true, action: "RESPOND", href: `/projects/${f.p.id}?tab=chat&channel=mentors` });
    expect(result.summary.blocked).toBe(1);
    expect(JSON.stringify(result)).not.toContain(r.submission.id);
    await db.mentorAccess.update({ where: { id: f.access.id }, data: { permissions: ["SUBMISSIONS_VIEW"] } });
    result = await read(f.actor);
    expect(result.items[0]).toMatchObject({ accessIssue: "MANUSCRIPT_NOT_SHARED", canContactTeam: false, action: "VIEW", href: `/projects/${f.p.id}?tab=tasks&workItem=TASK:${legacy.id}` });
    const share = await db.mentorResourceShare.create({ data: { accessId: f.access.id, projectId: f.p.id, kind: "SUBMISSION", resourceId: r.submission.id, sharedById: f.owner, title: "Shared exact manuscript", content: "Shared" } });
    result = await read(f.actor);
    expect(result.items[0]).toMatchObject({ status: "TODO", blocked: false, href: `/projects/${f.p.id}?view=resources&resourceId=${r.submission.id}` });
    expect(result.items[0]).not.toHaveProperty("accessIssue");
    expect((await db.projectTask.findUniqueOrThrow({ where: { id: legacy.id } })).status).toBe("TODO");
    await db.mentorResourceShare.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
    expect((await read(f.actor)).items[0]).toMatchObject({ status: "BLOCKED", accessIssue: "MANUSCRIPT_NOT_SHARED" });
  });
  it("shows only explicitly shared proposal questions, clears action after a mentor reply, and rejects cross-project questions", async () => {
    const f = await fixture(), other = await fixture();
    const plan = await db.researchPlan.findUniqueOrThrow({ where: { projectId: f.p.id } });
    const revision = await db.planRevision.create({ data: { projectId: f.p.id, planId: plan.id, version: 1, snapshot: {} } });
    const share = await db.planShare.create({ data: { projectId: f.p.id, relationshipId: f.relation!.id, revisionId: revision.id, sharedById: f.owner } });
    const thread = await db.projectDiscussion.create({ data: { projectId: f.p.id, authorId: f.owner, title: "Please assess our proposal", body: "Is this design sufficient?", category: "MENTOR_QUESTION", targetKind: "PLAN_REVISION", targetId: revision.id, mentorRelationshipId: f.relation!.id, clientKey: randomUUID() } });
    expect((await read(f.actor)).items[0]).toMatchObject({ kind: "MENTOR_QUESTION", version: 1 });
    await expect(discussions.detail(f.p.id, other.actor, thread.id, { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 404 });
    await discussions.reply(f.p.id, f.actor, thread.id, { body: "Add an explicit comparison group.", mentions: [], clientKey: randomUUID(), replyToId: null });
    expect((await read(f.actor)).items).toEqual([]);
    expect((await read(f.actor, { status: "WAITING" })).items).toHaveLength(1);
    await db.planShare.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
    expect((await read(f.actor, { status: "ALL" })).items).toEqual([]);
    await expect(discussions.detail(f.p.id, f.actor, thread.id, { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 404 });
  });
  it("supports project/type/status/text filters, literal wildcard search and SQL-like user input without widening scope", async () => {
    const f = await fixture(), other = await fixture(f.actor);
    await task(f, { title: "Literal 100% coverage", status: "BLOCKED", blockedReason: "Waiting on evidence" }); await task(other);
    expect((await read(f.actor, { projectId: f.p.id, kind: "TASK", status: "BLOCKED", q: "100%" })).meta.total).toBe(1);
    expect((await read(f.actor, { q: "' OR true --" })).meta.total).toBe(0);
    expect((await read(f.actor, { q: "%" })).meta.total).toBe(1);
    expect((await read(f.actor, { projectSearch: "not a project" })).projects).toEqual([]);
  });
  it("does not revive an old scoped review through a replacement mentorship policy and share", async () => {
    const f = await fixture(), r = await review(f);
    await db.reviewerAssignment.update({ where: { id: r.assignment.id }, data: { mentorAccessId: f.access.id } });
    await db.mentorAccess.update({ where: { id: f.access.id }, data: { revokedAt: new Date() } });
    await db.mentorRelationship.update({ where: { id: f.relation!.id }, data: { status: "ENDED" } });
    const invitation = await db.mentorshipRequest.create({ data: { projectId: f.p.id, requestedBy: f.owner, mentorUserId: f.actor, status: "ACCEPTED" } });
    const relation = await db.mentorRelationship.create({ data: { projectId: f.p.id, mentorUserId: f.actor, sourceRequestId: invitation.id } });
    const policy = await db.mentorAccess.create({ data: { projectId: f.p.id, requestId: invitation.id, relationshipId: relation.id, mentorUserId: f.actor, configuredById: f.owner, permissions: ["SUBMISSIONS_VIEW"] } });
    await db.mentorResourceShare.create({ data: { accessId: policy.id, projectId: f.p.id, kind: "SUBMISSION", resourceId: r.submission.id, sharedById: f.owner, title: "New share", content: "Shared" } });
    await expect(reviewService.getReview(r.assignment.id, f.actor)).rejects.toMatchObject({ statusCode: 403 });
    expect((await read(f.actor)).items).toEqual([]);
  });
  it("prioritizes overdue, blocked, due-soon and review work before routine tasks and supports deadline sorting", async () => {
    const f = await fixture(), r = await review(f);
    const normal = await task(f, { title: "Routine task", priority: "URGENT" });
    const soon = await task(f, { title: "Due in twelve hours", dueAt: new Date(Date.now() + 12 * 3600000) });
    const blocked = await task(f, { title: "Blocked task", status: "BLOCKED", blockedReason: "Evidence needed", dueAt: new Date(Date.now() + 7 * 86400000) });
    const late = await task(f, { title: "Past deadline", dueAt: new Date(Date.now() - 3600000) });
    expect((await read(f.actor)).items.map(i => i.sourceId)).toEqual([late.id, blocked.id, soon.id, r.request.id, normal.id]);
    expect((await read(f.actor, { sort: "deadline" })).items.slice(0, 3).map(i => i.sourceId)).toEqual([late.id, soon.id, blocked.id]);
  });
  it("filters overdue actionable work before pagination and excludes completed or undated work", async () => {
    const f = await fixture(), other = await fixture(f.actor);
    const late = await task(f, { dueAt: new Date(Date.now() - 3600000) });
    await task(other, { dueAt: new Date(Date.now() - 7200000) });
    await task(f, { status: "DONE", completedAt: new Date(), dueAt: new Date(Date.now() - 3600000) });
    await task(f, { dueAt: new Date(Date.now() + 3600000) });
    await task(f);
    const all = await read(f.actor, { status: "OVERDUE", pageSize: 1 });
    expect(all.meta).toMatchObject({ total: 2, totalPages: 2 });
    expect(all.items).toHaveLength(1);
    expect(all.items.every(item => item.needsAction && item.overdue)).toBe(true);
    const scoped = await read(f.actor, { status: "OVERDUE", projectId: f.p.id });
    expect(scoped.items.map(item => item.sourceId)).toEqual([late.id]);
    expect(scoped.meta.total).toBe(scoped.summary.overdue);
  });
  it("submits immutable, version-bound mentor comments and notifies the team without granting readiness approval", async () => {
    const f = await fixture(), r = await review(f);
    const input = { commentOnly: true, overallComment: "Consider a clearer comparison group before the next draft.", responses: [], expectedRevisionId: r.revision.id, expectedRoundNumber: 1, clientKey: randomUUID() };
    await reviewService.saveReview(r.assignment.id, f.actor, input, false);
    const draft = await reviewService.getReview(r.assignment.id, f.actor);
    expect(draft.review).toMatchObject({ status: "DRAFT", recommendation: "COMMENT_ONLY", overallAssessment: null });
    const { review: saved } = await reviewService.saveReview(r.assignment.id, f.actor, input, true);
    expect(saved).toMatchObject({ status: "SUBMITTED", revisionId: r.revision.id, overallAssessment: null, recommendation: "COMMENT_ONLY" });
    expect((await db.reviewRequest.findUniqueOrThrow({ where: { id: r.request.id } })).status).toBe("COMPLETED");
    expect((await db.submission.findUniqueOrThrow({ where: { id: r.submission.id } })).status).not.toBe("READY_TO_ADVANCE");
    expect((await read(f.actor)).summary.needsResponse).toBe(0);
    expect(await db.notification.count({ where: { userId: f.owner, eventKey: { startsWith: `REVIEW_SUBMITTED:${saved.id}:` } } })).toBe(1);
    await reviewService.saveReview(r.assignment.id, f.actor, input, true);
    expect(await db.humanReview.count({ where: { assignmentId: r.assignment.id, status: "SUBMITTED" } })).toBe(1);
  });
  it("does not let a comment-only flag bypass approval, mandatory changes or formal peer-review rules", async () => {
    const f = await fixture(), r = await review(f);
    const input = { commentOnly: true, overallComment: "Feedback on the assigned version", responses: [], expectedRevisionId: r.revision.id, expectedRoundNumber: 1 };
    await expect(reviewService.saveReview(r.assignment.id, f.actor, { ...input, overallAssessment: "STRONG" }, true)).rejects.toMatchObject({ statusCode: 400 });
    await expect(reviewService.saveReview(r.assignment.id, f.actor, { ...input, requiredRevisions: [{ priority: "MAJOR", description: "Add a comparison group" }] }, true)).rejects.toMatchObject({ statusCode: 400 });
    await db.reviewRequest.update({ where: { id: r.request.id }, data: { origin: "DIRECT_INVITATION" } });
    await expect(reviewService.saveReview(r.assignment.id, f.actor, input, true)).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.humanReview.count({ where: { assignmentId: r.assignment.id } })).toBe(0);
  });
  it("cannot close unresolved earlier changes with a comment-only response", async () => {
    const f = await fixture(), r = await review(f);
    const previous = await db.humanReview.create({ data: { assignmentId: r.assignment.id, submissionId: r.submission.id, revisionId: r.revision.id, reviewerId: f.actor, templateVersionId: r.request.templateVersionId, roundNumber: 1, status: "SUBMITTED", overallAssessment: "MINOR_REVISION", overallComment: "An explicit comparison is required" } });
    await db.reviewRevisionItem.create({ data: { reviewId: previous.id, position: 1, description: "Add a comparison group", priority: "MAJOR" } });
    const newer = await db.submissionRevision.create({ data: { submissionId: r.submission.id, revisionNumber: 2, uploadedById: f.owner, contentType: "MARKDOWN", contentSnapshot: "Revised study methods", sizeBytes: 21 } });
    await db.reviewRequest.update({ where: { id: r.request.id }, data: { status: "RESUBMITTED", artifactRevisionId: newer.id } });
    await db.reviewerAssignment.update({ where: { id: r.assignment.id }, data: { artifactRevisionId: newer.id } });
    await expect(reviewService.saveReview(r.assignment.id, f.actor, { commentOnly: true, overallComment: "Some additional comments", responses: [], expectedRevisionId: newer.id, expectedRoundNumber: 2 }, true)).rejects.toMatchObject({ statusCode: 409 });
    expect((await db.reviewRequest.findUniqueOrThrow({ where: { id: r.request.id } })).status).toBe("RESUBMITTED");
  });
});
