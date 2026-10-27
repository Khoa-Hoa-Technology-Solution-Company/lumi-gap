import { beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { manuscriptService as writing } from "../manuscript.service.js";
import { manuscriptSuggestions } from "../manuscript-suggestions.js";
import { manuscriptSync } from "../manuscript-sync.js";
import { reviewTemplateService } from "../../reviews/review-template.service.js";
import { reviewRequestService } from "../../reviews/review-request.service.js";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));
const isolated = process.env.NODE_ENV === "test" && process.env.MANUSCRIPT_DELETE_INTEGRATION === "1" && /^postgres(?:ql)?:\/\/[^/]+@(127\.0\.0\.1|localhost):[0-9]+\/codex_github_[a-f0-9]{12}_test(?:\?|$)/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!isolated).sequential("manuscript deletion in disposable PostgreSQL", () => {
  const db = getPrisma(); let owner: string, author: string, teammate: string, outsider: string;
  const input = () => ({ title: "Deletion test paper", documentType: "RESEARCH_PAPER" as const, template: "ARTICLE" as const, description: "", clientKey: crypto.randomUUID() });
  beforeAll(async () => {
    const users = [];
    for (const name of ["Owner", "Author", "Teammate", "Outsider"]) {
      const user = await db.user.create({ data: { fullName: name, email: `delete-${crypto.randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), admissionBasis: "INVITATION" } });
      await db.academicProfile.create({ data: { userId: user.id, primaryPosition: "RESEARCH_STAFF", academicRole: "RESEARCHER", roleVerificationStatus: "SELF_DECLARED", positionStatus: "NOT_SUBMITTED" } });
      users.push(user.id);
    }
    [owner, author, teammate, outsider] = users as [string, string, string, string];
  });
  async function fixture() {
    const project = await createProjectFixture({ data: { title: "Manuscript deletion", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.createMany({ data: [author, teammate].map(userId => ({ projectId: project.id, userId })) });
    const request = input(), row = await writing.create(project.id, author, request);
    return { project: project.id, row, request };
  }

  it("exposes deletion to the project owner and creator, blocking others and other projects", async () => {
    const d = await fixture(), other = await fixture();
    expect((await writing.list(d.project, owner))[0]?.canDelete).toBe(true);
    expect((await writing.list(d.project, author))[0]?.canDelete).toBe(true);
    expect((await writing.list(d.project, teammate))[0]?.canDelete).toBe(false);
    await expect(writing.remove(d.project, teammate, d.row.id, 1)).rejects.toMatchObject({ statusCode: 403 });
    await expect(writing.remove(d.project, outsider, d.row.id, 1)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.remove(other.project, owner, d.row.id, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("deletes from the live workspace, retains history and is idempotent without resurrecting requests", async () => {
    const d = await fixture();
    const snapshot = await writing.snapshot(d.project, author, d.row.id, { label: "Retained version", clientKey: crypto.randomUUID(), minimumSequences: {} });
    await writing.remove(d.project, author, d.row.id, 1);
    await writing.remove(d.project, owner, d.row.id, 1);
    expect(await writing.list(d.project, owner)).toEqual([]);
    expect((await db.draftWorkspace.findUniqueOrThrow({ where: { id: d.row.id } })).deletedAt).not.toBeNull();
    expect(await db.manuscriptSnapshot.findUnique({ where: { id: snapshot.id } })).not.toBeNull();
    expect(await db.manuscriptFile.count({ where: { workspaceId: d.row.id } })).toBeGreaterThan(0);
    expect(await db.projectActivity.count({ where: { projectId: d.project, entityId: d.row.id, type: "MANUSCRIPT_DELETED" } })).toBe(1);
    for (const operation of [
      () => writing.detail(d.project, owner, d.row.id),
      () => writing.fileContent(d.project, author, d.row.id, d.row.mainFileId!),
      () => writing.export(d.project, owner, d.row.id),
      () => writing.viewSnapshot(d.project, owner, d.row.id, snapshot.id),
      () => writing.createFile(d.project, owner, d.row.id, { path: "new.tex", kind: "TEXT", content: "", clientKey: crypto.randomUUID() }),
      () => manuscriptSuggestions.list(d.project, owner, d.row.id),
      () => manuscriptSync.binding(d.project, owner, d.row.id),
    ]) await expect(operation()).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.create(d.project, author, d.request)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuses stale deletion and revokes permission after membership or project changes", async () => {
    const d = await fixture();
    await writing.createFile(d.project, teammate, d.row.id, { path: "new.tex", kind: "TEXT", content: "", clientKey: crypto.randomUUID() });
    await expect(writing.remove(d.project, owner, d.row.id, 1)).rejects.toMatchObject({ statusCode: 409 });
    const live = await writing.detail(d.project, owner, d.row.id);
    await db.projectMember.update({ where: { projectId_userId: { projectId: d.project, userId: author } }, data: { status: "REMOVED" } });
    await expect(writing.remove(d.project, author, d.row.id, live.version)).rejects.toMatchObject({ statusCode: 404 });
    await db.project.update({ where: { id: d.project }, data: { status: "ARCHIVED" } });
    expect((await writing.list(d.project, owner))[0]?.canDelete).toBe(false);
    await expect(writing.remove(d.project, owner, d.row.id, live.version)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("serializes concurrent deletions and denies edits after deletion", async () => {
    const d = await fixture();
    const results = await Promise.all([writing.remove(d.project, owner, d.row.id, 1), writing.remove(d.project, author, d.row.id, 1)]);
    expect(results).toEqual([{ id: d.row.id }, { id: d.row.id }]);
    expect(await db.projectActivity.count({ where: { projectId: d.project, type: "MANUSCRIPT_DELETED" } })).toBe(1);
    await expect(writing.createFile(d.project, teammate, d.row.id, { path: "race.tex", kind: "TEXT", content: "", clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("preserves an assigned reviewer's sealed submission after deleting the live manuscript", async () => {
    const d = await fixture();
    await db.academicProfile.update({ where: { userId: outsider }, data: { primaryPosition: "LECTURER", academicRole: "LECTURER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED", reviewAvailability: { enabled: true, maximumActiveReviews: 10 } } });
    const snapshot = await writing.snapshot(d.project, author, d.row.id, { label: "Submitted version", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const sealed = await writing.publish(d.project, owner, d.row.id, snapshot.id, [owner, author]);
    const template = await reviewTemplateService.create({ name: "Retained manuscript review", source: "PERSONAL", reviewMode: "RUBRIC_ASSESSMENT", publish: true, guidelines: [], criteria: [{ key: "method", title: "Method", weight: 1, required: true, levels: [{ label: "Clear", score: 4 }] }] }, owner, "USER");
    const request = await reviewRequestService.create({ submissionId: sealed.submissionId, reviewerId: outsider, templateVersionId: template.activeVersion!.id }, owner);
    await reviewRequestService.accept(request.id, outsider);
    await writing.remove(d.project, owner, d.row.id, d.row.version);
    expect((await writing.viewSnapshot(d.project, outsider, d.row.id, snapshot.id)).formalRevisionId).toBe(sealed.revisionId);
    await expect(writing.detail(d.project, outsider, d.row.id)).rejects.toMatchObject({ statusCode: 404 });
    await db.reviewerAssignment.update({ where: { id: request.assignment.id }, data: { status: "cancelled" } });
    await expect(writing.viewSnapshot(d.project, outsider, d.row.id, snapshot.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
