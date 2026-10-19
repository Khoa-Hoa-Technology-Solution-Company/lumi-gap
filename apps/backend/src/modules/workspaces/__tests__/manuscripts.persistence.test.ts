import { beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import sharp from "sharp";
import { unzipSync, strFromU8 } from "fflate";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { manuscriptService as writing } from "../manuscript.service.js";
import { citationKey, hashBytes, sourceDocument, sourceText } from "../manuscript-source.js";
import { projectDiscussionsService as discussions } from "../../projects/project-discussions.service.js";
import { reviewTemplateService } from "../../reviews/review-template.service.js";
import { reviewRequestService } from "../../reviews/review-request.service.js";
import { reviewService } from "../../reviews/review.service.js";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));
const isolated = (process.env.NODE_ENV === "test" && process.env.MANUSCRIPT_COMPILER_INTEGRATION === "1" && /^postgres(?:ql)?:\/\/[^/]+@(127\.0\.0\.1|localhost):[0-9]+\/codex_mentorship_[a-f0-9]{12}_test(?:\?|$)/.test(process.env.DATABASE_URL ?? "")) || process.env.PROJECT_SLICE_TEST === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";
describe.skipIf(!isolated).sequential("manuscripts in disposable PostgreSQL", () => {
  const db = getPrisma(); let owner: string, member: string, outsider: string, mentor: string, reviewer: string;
  async function actor(name: string, lecturer = false) {
    const user = await db.user.create({ data: { fullName: name, email: `writing-${crypto.randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), admissionBasis: "INVITATION" } });
    await db.academicProfile.create({ data: { userId: user.id, primaryPosition: lecturer ? "LECTURER" : "RESEARCH_STAFF", academicRole: lecturer ? "LECTURER" : "RESEARCHER", roleVerificationStatus: lecturer ? "VERIFIED" : "SELF_DECLARED", positionStatus: lecturer ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: true }, reviewAvailability: { enabled: true, maximumActiveReviews: 10 } } }); return user.id;
  }
  async function draft() {
    const project = await createProjectFixture({ data: { title: "Collaborative research", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.create({ data: { projectId: project.id, userId: member } });
    const manuscript = await writing.create(project.id, owner, { title: "Methods study", documentType: "RESEARCH_PROPOSAL", template: "PROPOSAL", description: "", clientKey: crypto.randomUUID() });
    const detail = await writing.detail(project.id, owner, manuscript.id); return { project: project.id, id: manuscript.id, detail, file: detail.mainFileId! };
  }
  async function update(d: Awaited<ReturnType<typeof draft>>, user: string, edit: (text: Y.Text) => void, fileId = d.file) {
    const row = await writing.fileContent(d.project, user, d.id, fileId), doc = sourceDocument(Buffer.from(row.state!, "base64"));
    const vector = Y.encodeStateVector(doc); edit(doc.getText("source"));
    const input = { clientSessionId: crypto.randomUUID(), clientSequence: 1, update: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString("base64") }; doc.destroy();
    return { input, result: await writing.applyUpdate(d.project, user, d.id, fileId, input) };
  }
  beforeAll(async () => { owner = await actor("Owner"); member = await actor("Member"); outsider = await actor("Outsider"); mentor = await actor("Mentor", true); reviewer = await actor("Reviewer", true); });
  it("creates multiple canonical manuscripts, preserves legacy workspace uniqueness and retries", async () => {
    const d = await draft(), input = { title: "Second manuscript", description: "", documentType: "THESIS" as const, template: "REPORT" as const, clientKey: crypto.randomUUID() };
    const second = await writing.create(d.project, member, input); expect((await writing.list(d.project, owner))).toHaveLength(2);
    expect((await writing.list(d.project, owner)).every(row => row.latestFeedback === null)).toBe(true);
    expect((await writing.create(d.project, member, input)).id).toBe(second.id);
    await expect(writing.create(d.project, member, { ...input, title: "Changed" })).rejects.toMatchObject({ statusCode: 409 });
    await db.draftWorkspace.create({ data: { projectId: d.project, createdById: owner, name: "Legacy" } });
    await expect(db.draftWorkspace.create({ data: { projectId: d.project, createdById: owner, name: "Duplicate legacy" } })).rejects.toThrow();
  });
  it("merges concurrent insert/delete, checks receipts, causal completeness and attribution", async () => {
    const d = await draft(), state = (await writing.fileContent(d.project, owner, d.id, d.file)).state!;
    const a = sourceDocument(Buffer.from(state, "base64")), b = sourceDocument(Buffer.from(state, "base64"));
    const vector = Y.encodeStateVector(a); a.getText("source").insert(10, "ALPHA"); b.getText("source").delete(8, 3); b.getText("source").insert(8, "BETA");
    const ua = Y.encodeStateAsUpdate(a, vector), ub = Y.encodeStateAsUpdate(b, vector);
    const ia = { clientSessionId: crypto.randomUUID(), clientSequence: 1, update: Buffer.from(ua).toString("base64") }, ib = { clientSessionId: crypto.randomUUID(), clientSequence: 1, update: Buffer.from(ub).toString("base64") };
    await Promise.all([writing.applyUpdate(d.project, owner, d.id, d.file, ia), writing.applyUpdate(d.project, member, d.id, d.file, ib)]);
    Y.applyUpdate(a, ub); Y.applyUpdate(b, ua); expect(a.getText("source").toString()).toBe(b.getText("source").toString());
    const canonical = await writing.fileContent(d.project, owner, d.id, d.file); expect(sourceText(Buffer.from(canonical.state!, "base64"))).toBe(a.getText("source").toString());
    const receipt = await writing.applyUpdate(d.project, owner, d.id, d.file, ia); expect(receipt.replay).toBe(true);
    await expect(writing.applyUpdate(d.project, owner, d.id, d.file, { ...ia, update: ib.update })).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.manuscriptUpdate.count({ where: { fileId: d.file } })).toBe(2);
    expect((await db.projectActivity.findMany({ where: { projectId: d.project, type: "MANUSCRIPT_WRITING_SESSION" } })).map(e => e.actorId).sort()).toEqual([owner, member].sort());
    const causal = sourceDocument(); causal.getText("source").insert(0, "dependency"); const before = Y.encodeStateVector(causal); causal.getText("source").insert(10, "missing");
    await expect(writing.applyUpdate(d.project, owner, d.id, d.file, { clientSessionId: crypto.randomUUID(), clientSequence: 1, update: Buffer.from(Y.encodeStateAsUpdate(causal, before)).toString("base64") })).rejects.toMatchObject({ statusCode: 409 });
    a.destroy(); b.destroy(); causal.destroy();
  });
  it("rejects path and same-name races, preserves stable renamed/deleted file history", async () => {
    const d = await draft();
    for (const path of ["../secret.tex", "C:/x.tex", "a\\b.tex", "/root.tex", "a/../../b.tex"]) await expect(writing.createFile(d.project, member, d.id, { path, kind: "TEXT", content: "", clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
    await expect(writing.createFile(d.project, member, d.id, { path: "oversize.tex", kind: "TEXT", content: "漢".repeat(200000), clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
    const races = await Promise.allSettled([owner, member].map(actor => writing.createFile(d.project, actor, d.id, { path: "sections/concurrent.tex", kind: "TEXT", content: "", clientKey: crypto.randomUUID() })));
    expect(races.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const f = (await writing.detail(d.project, member, d.id)).files.find(f => f.path === "sections/concurrent.tex")!;
    const edit = await update(d, member, text => text.insert(0, "Acknowledged section"), f.id);
    await writing.changeFile(d.project, owner, d.id, f.id, { path: "sections/renamed.tex", expectedVersion: edit.result.fileVersion });
    expect((await writing.fileContent(d.project, member, d.id, f.id)).path).toBe("sections/renamed.tex");
    await expect(writing.changeFile(d.project, member, d.id, f.id, { delete: true, expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
    await writing.changeFile(d.project, owner, d.id, f.id, { delete: true, expectedVersion: edit.result.fileVersion + 1 });
    expect(sourceText((await db.manuscriptFile.findUniqueOrThrow({ where: { id: f.id } })).crdtState!)).toBe("Acknowledged section");
    await expect(writing.applyUpdate(d.project, member, d.id, f.id, edit.input)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.changeFile(d.project, owner, d.id, d.file, { delete: true, expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("atomically resolves citation keys from canonical literature while keeping manual content", async () => {
    const d = await draft(), paper = await db.paper.create({ data: { primaryProvider: "user", title: "Canonical methods", publicationYear: 2024, doi: `10.1234/${crypto.randomUUID()}` } });
    await db.projectPaper.create({ data: { projectId: d.project, paperId: paper.id, addedById: owner } });
    const base = citationKey(paper, []), bib = d.detail.files.find(f => f.path === "references.bib")!;
    await update(d, owner, text => text.insert(text.length, `@article{${base}, title={Manual metadata}}\n`), bib.id);
    const results = await Promise.all([owner, member].map(actor => writing.insertCitation(d.project, actor, d.id, paper.id)));
    expect(results[0]!.key).toBe(`${base}_2`); expect(results[1]!.key).toBe(results[0]!.key);
    const text = sourceText(Buffer.from((await writing.fileContent(d.project, owner, d.id, bib.id)).state!, "base64"));
    expect(text).toContain("Manual metadata"); expect(text.match(/lumigap-paper:/g)).toHaveLength(1); expect(text).toContain("Canonical methods");
    await expect(writing.insertCitation(d.project, member, d.id, crypto.randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });
  it("retains exact source and raster bytes in immutable snapshots, export and restored drafts", async () => {
    const d = await draft(), png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    const asset = await writing.asset(d.project, member, d.id, { path: "figures/test.png", data: png.toString("base64") });
    const change = await update(d, member, text => text.insert(0, "% original\n"));
    const snap = await writing.snapshot(d.project, owner, d.id, { label: "v1", clientKey: crypto.randomUUID(), minimumSequences: { [d.file]: change.result.sequence } });
    await expect(writing.snapshot(d.project, owner, d.id, { label: "invalid", clientKey: crypto.randomUUID(), minimumSequences: { [d.file]: change.result.sequence + 100 } })).rejects.toMatchObject({ statusCode: 409 });
    const before = await writing.viewSnapshot(d.project, owner, d.id, snap.id);
    await update(d, member, text => text.insert(0, "% changed\n"));
    const blue = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).png().toBuffer();
    await writing.asset(d.project, member, d.id, { path: asset.path, data: blue.toString("base64"), replaceId: asset.id, expectedVersion: asset.version });
    expect((await writing.viewSnapshot(d.project, member, d.id, snap.id)).checksum).toBe(before.checksum);
    const zip = unzipSync(await writing.export(d.project, member, d.id, snap.id));
    expect(strFromU8(zip["main.tex"]!)).toBe(before.manifest!.files.find(f => f.id === d.file)!.text);
    expect(hashBytes(zip[asset.path]!)).toBe(asset.checksum);
    await expect(db.manuscriptSnapshot.update({ where: { id: snap.id }, data: { label: "mutated" } })).rejects.toThrow(/append-only/);
    const restored = await writing.restore(d.project, owner, d.id, snap.id, { title: "Restored v1", clientKey: crypto.randomUUID() });
    expect(restored.id).not.toBe(d.id); expect(sourceText(Buffer.from((await writing.fileContent(d.project, owner, restored.id, restored.mainFileId!)).state!, "base64"))).toBe(strFromU8(zip["main.tex"]!));
    await expect(writing.asset(d.project, member, d.id, { path: "evil.png", data: Buffer.from("<svg><script>alert(1)</script></svg>").toString("base64") })).rejects.toMatchObject({ statusCode: 400 });
    await expect(writing.compile(d.project, member, d.id, snap.id)).rejects.toMatchObject({ statusCode: 503 });
  });
  it("scopes mentor feedback to shared immutable versions and preserves replies after v2", async () => {
    const d = await draft(), req = await db.mentorshipRequest.create({ data: { projectId: d.project, mentorUserId: mentor, requestedBy: owner, direction: "PROJECT_TO_LECTURER", status: "ACCEPTED", expiresAt: new Date(Date.now() + 86400000) } });
    const relation = await db.mentorRelationship.create({ data: { projectId: d.project, mentorUserId: mentor, sourceRequestId: req.id } });
    const v1 = await writing.snapshot(d.project, owner, d.id, { label: "v1", clientKey: crypto.randomUUID(), minimumSequences: {} });
    await expect(writing.viewSnapshot(d.project, mentor, d.id, v1.id)).rejects.toMatchObject({ statusCode: 404 });
    const thread = await writing.comment(d.project, owner, d.id, { body: "Please evaluate sampling", clientKey: crypto.randomUUID(), snapshotId: v1.id, mentorRelationshipId: relation.id });
    expect((await writing.detail(d.project, member, d.id)).latestFeedback).toMatchObject({ snapshotId: v1.id, snapshotLabel: "v1", status: "PENDING" });
    expect((await writing.viewSnapshot(d.project, mentor, d.id, v1.id)).canComment).toBe(true);
    await discussions.reply(d.project, member, thread.id, { body: "We will clarify this", clientKey: crypto.randomUUID(), mentions: [], replyToId: null });
    expect((await writing.list(d.project, owner))[0]!.latestFeedback?.status).toBe("PENDING");
    await discussions.reply(d.project, mentor, thread.id, { body: "Check the sampling frame", clientKey: crypto.randomUUID(), mentions: [], replyToId: null });
    expect((await writing.list(d.project, owner))[0]!.latestFeedback?.status).toBe("RESPONDED");
    await writing.comment(d.project, mentor, d.id, { body: "Explain inclusion criteria", clientKey: crypto.randomUUID(), snapshotId: v1.id });
    await discussions.resolve(d.project, owner, thread.id, { expectedVersion: 1, status: "RESOLVED", conclusion: "Updated sampling rationale" });
    expect((await writing.list(d.project, member))[0]!.latestFeedback?.status).toBe("RESOLVED");
    await discussions.resolve(d.project, owner, thread.id, { expectedVersion: 2, status: "OPEN", conclusion: "" });
    expect((await writing.list(d.project, member))[0]!.latestFeedback?.status).toBe("RESPONDED");
    await update(d, member, text => text.insert(0, "% inclusion criteria\n"));
    const v2 = await writing.snapshot(d.project, member, d.id, { label: "v2", clientKey: crypto.randomUUID(), minimumSequences: {} });
    expect(await writing.comments(d.project, member, d.id, v2.id)).toHaveLength(0);
    expect((await writing.comments(d.project, mentor, d.id, v1.id))).toHaveLength(2);
    await expect(writing.detail(d.project, mentor, d.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.createFile(d.project, mentor, d.id, { path: "attack.tex", kind: "TEXT", content: "", clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 404 });
    await writing.comment(d.project, owner, d.id, { body: "Please review the revised version", clientKey: crypto.randomUUID(), snapshotId: v2.id, mentorRelationshipId: relation.id });
    expect((await writing.detail(d.project, member, d.id)).latestFeedback).toMatchObject({ snapshotId: v2.id, status: "PENDING" });
    await db.mentorRelationship.update({ where: { id: relation.id }, data: { status: "ENDED" } });
    expect((await writing.list(d.project, owner))[0]!.latestFeedback?.status).toBe("ENDED");
    await expect(writing.viewSnapshot(d.project, mentor, d.id, v1.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.list(d.project, outsider)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("executes formal request, acceptance and structured review against the sealed source only", async () => {
    const d = await draft(), v1 = await writing.snapshot(d.project, owner, d.id, { label: "Submission v1", clientKey: crypto.randomUUID(), minimumSequences: {} });
    const sealed = await writing.publish(d.project, member, d.id, v1.id, [owner, member]);
    await expect(writing.publish(d.project, member, d.id, v1.id, [member])).rejects.toMatchObject({ statusCode: 409 });
    const template = await reviewTemplateService.create({ name: "Manuscript methods rubric", source: "PERSONAL", reviewMode: "RUBRIC_ASSESSMENT", publish: true, guidelines: [], criteria: [{ key: "method", title: "Method", weight: 1, required: true, levels: [{ label: "Clear", score: 4 }] }] }, owner, "USER");
    const request = await reviewRequestService.create({ submissionId: sealed.submissionId, reviewerId: reviewer, templateVersionId: template.activeVersion!.id }, owner);
    await expect(writing.viewSnapshot(d.project, reviewer, d.id, v1.id)).rejects.toMatchObject({ statusCode: 404 });
    await reviewRequestService.accept(request.id, reviewer);
    expect((await reviewService.getReview(request.assignment.id, reviewer)).manuscriptSource).toEqual({ projectId: d.project, manuscriptId: d.id, snapshotId: v1.id });
    const view = await writing.viewSnapshot(d.project, reviewer, d.id, v1.id); expect(view.canComment).toBe(false); expect(view.formalRevisionId).toBe(sealed.revisionId);
    await update(d, member, text => text.insert(0, "% live source changed after review started\n"));
    const v2 = await writing.snapshot(d.project, owner, d.id, { label: "Submission v2", clientKey: crypto.randomUUID(), minimumSequences: {} });
    await expect(writing.viewSnapshot(d.project, reviewer, d.id, v2.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.detail(d.project, reviewer, d.id)).rejects.toMatchObject({ statusCode: 404 });
    const review = await reviewService.saveReview(request.assignment.id, reviewer, { overallAssessment: "STRONG", responses: [{ criterionKey: "method", performanceLevelId: template.activeVersion!.criteria[0]!.levels[0]!.id, comment: "Sampling is clear" }], requiredRevisions: [] }, true);
    expect(review.review.revisionId).toBe(sealed.revisionId);
    expect((await db.submissionRevision.findUniqueOrThrow({ where: { id: sealed.revisionId } })).contentSnapshot).not.toContain("live source changed");
  });
  it("denies outsiders, nested ID attacks, archived mutations and revoked sessions", async () => {
    const d = await draft(), other = await draft();
    await expect(writing.detail(d.project, outsider, d.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.fileContent(d.project, member, d.id, other.file)).rejects.toMatchObject({ statusCode: 404 });
    await expect(writing.export(d.project, outsider, d.id)).rejects.toMatchObject({ statusCode: 404 });
    const input = { clientSessionId: crypto.randomUUID(), clientSequence: 1, update: Buffer.from(Y.encodeStateAsUpdate(sourceDocument())).toString("base64") };
    await expect(writing.applyUpdate(d.project, member, d.id, d.file, input, crypto.randomUUID())).rejects.toMatchObject({ statusCode: 401 });
    await db.project.update({ where: { id: d.project }, data: { status: "ARCHIVED" } });
    expect((await writing.detail(d.project, member, d.id)).canWrite).toBe(false);
    await expect(writing.createFile(d.project, member, d.id, { path: "archived.tex", kind: "TEXT", content: "", clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
  });
});
