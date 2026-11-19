import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, unlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { submissionRouter } from "../submission.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { pdfStorageService } from "../../../infrastructure/pdf-storage.service.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { projectMentorshipService as consent } from "../../projects/project-mentorship.service.js";
import { manuscriptService as writing } from "../../workspaces/manuscript.service.js";
import { processCompilation } from "../../workspaces/manuscript-compiler.js";
import { submissionService as submissions } from "../submission.service.js";
import { reviewRequestService as requests } from "../../reviews/review-request.service.js";
import { reviewService as reviews } from "../../reviews/review.service.js";
import { sourceState } from "../../workspaces/manuscript-source.js";
import { scientificIntegrityChecks, type MentorManuscriptSendInput } from "@trend/shared-types";
const storage = vi.hoisted(() => ({ directory: "", files: new Map<string, string>(), bytes: new Map<string, Buffer>() }));
vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn() }, aiJobsQueue: { add: vi.fn() }, manuscriptCompileQueue: { add: vi.fn() } }));
vi.mock("../../../infrastructure/pdf-storage.service.js", () => ({ pdfStorageService: {
  savePdf: vi.fn(async (buffer: Buffer) => { const uri = `fixture:${randomUUID()}`, path = join(storage.directory, `${randomUUID()}.pdf`); await writeFile(path, buffer); storage.files.set(uri, path); storage.bytes.set(uri, buffer); return { uri }; }),
  deletePdf: vi.fn(async (uri: string) => { const path = storage.files.get(uri); if (path) await unlink(path).catch(() => undefined); storage.files.delete(uri); storage.bytes.delete(uri); }),
  getSignedDownloadUrl: vi.fn(async () => null), resolveLocalPath: (uri: string) => storage.files.get(uri) ?? null,
} }));
const enabled = process.env.MENTOR_MANUSCRIPT_INTEGRATION === "1" && /^\/codex_mentor_workspace_[a-f0-9]{12}_test$/.test(new URL(process.env.DATABASE_URL ?? "postgres://localhost/unused").pathname);
describe.skipIf(!enabled).sequential("real mentor manuscript snapshot/PDF delivery", () => {
  const db = getPrisma(); let owner: string, mentor: string, outsider: string, project: string, pendingMentor: string, policy: string;
  let draft: string, main: string, snapshot: string, compilation: string;
  let result: Awaited<ReturnType<typeof submissions.sendMentorFeedback>>;
  let firstPdf: Buffer;
  const app = express(); app.use(express.json()); app.use("/submissions", submissionRouter); app.use(errorHandler);
  const server = createServer(app); let origin: string;
  async function token(userId: string) { const sessionId = randomUUID(); await db.refreshToken.create({ data: { userId, familyId: sessionId, tokenHash: hashOpaqueToken(randomUUID()), expiresAt: new Date(Date.now() + 3600000) } }); return tokenService.signAccessToken({ sub: userId, systemRole: "USER", sessionId }).token; }
  async function user(lecturer = false) {
    const row = await db.user.create({ data: { fullName: lecturer ? "Verified Mentor" : "Research author", email: `${randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), admissionBasis: "INVITATION" } });
    await db.academicProfile.create({ data: { userId: row.id, primaryPosition: lecturer ? "LECTURER" : "STUDENT", academicRole: lecturer ? "LECTURER" : "STUDENT", roleVerificationStatus: lecturer ? "VERIFIED" : "SELF_DECLARED", positionStatus: lecturer ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: true }, reviewAvailability: { enabled: true, maximumActiveReviews: 20 } } }); return row.id;
  }
  const input = (values: Partial<MentorManuscriptSendInput> = {}): MentorManuscriptSendInput => ({ projectId: project, mentorId: mentor, clientKey: randomUUID(), source: "SNAPSHOT", manuscriptSnapshotId: snapshot, compilationId: compilation, ...values });
  async function prepare() {
    const sealed = await writing.snapshot(project, owner, draft, { label: "Mentor version", clientKey: randomUUID(), minimumSequences: {}, reuseUnchanged: true });
    const job = await writing.compile(project, owner, draft, sealed.id);
    if (job.status !== "SUCCESS") await processCompilation(job.id);
    const output = await db.manuscriptCompilation.findUniqueOrThrow({ where: { id: job.id } });
    expect(output.status).toBe("SUCCESS"); return { snapshot: sealed.id, compilation: job.id };
  }
  beforeAll(async () => {
    server.listen(0, "127.0.0.1"); await once(server, "listening"); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    storage.directory = await mkdtemp(join(tmpdir(), "lumigap-mentor-send-"));
    owner = await user(); mentor = await user(true); pendingMentor = await user(true); outsider = await user();
    project = (await createProjectFixture({ data: { title: "Internal review fixture", ownerId: owner, status: "ACTIVE", mentorshipSummary: "A reproducible educational study with explicit evaluation criteria.", mentorshipNeeds: "Research methodology" } })).id;
    const invitation = await consent.request(project, owner, { mentorUserId: mentor, message: "Please guide our reproducible study", idempotencyKey: randomUUID(), access: { preset: "ADVISOR", permissions: ["MENTOR_CHAT"], expiresAt: null } });
    await consent.accept(project, invitation.id, mentor, "Accepted research supervision", invitation.accessPolicy?.version);
    policy = (await db.mentorAccess.findUniqueOrThrow({ where: { requestId: invitation.id } })).id;
    await consent.request(project, owner, { mentorUserId: pendingMentor, message: "Please advise this study", idempotencyKey: randomUUID(), access: { preset: "ADVISOR", permissions: ["MENTOR_CHAT"], expiresAt: null } });
    const created = await writing.create(project, owner, { title: "Evidence-based methods", documentType: "RESEARCH_PAPER", template: "ARTICLE", description: "", clientKey: randomUUID() });
    draft = created.id; main = created.mainFileId!; const prepared = await prepare(); snapshot = prepared.snapshot; compilation = prepared.compilation;
  });
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); const path = resolve(storage.directory); if (path.startsWith(resolve(tmpdir()) + sep) && basename(path).startsWith("lumigap-mentor-send-")) await rm(path, { recursive: true, force: true }); });
  it("sends the compiled snapshot without upload and deduplicates simultaneous sends", async () => {
    const payload = input({ message: "Please focus on reproducibility." });
    const [a, b] = await Promise.all([submissions.sendMentorFeedback(payload, undefined, owner, "USER"), submissions.sendMentorFeedback(payload, undefined, owner, "USER")]);
    expect(a.requestId).toBe(b.requestId); expect(a.revisionId).toBe(b.revisionId); result = a;
    const revision = await db.submissionRevision.findUniqueOrThrow({ where: { id: a.revisionId } });
    expect(revision).toMatchObject({ manuscriptSnapshotId: snapshot, contentType: "LATEX", revisionNumber: 1 });
    firstPdf = storage.bytes.get(revision.storageUri!)!;
    expect(firstPdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await db.reviewRequest.count({ where: { submissionId: a.submissionId } })).toBe(1);
    expect(await db.reviewerAssignment.count({ where: { submissionId: a.submissionId } })).toBe(1);
    expect(storage.files.size).toBe(1);
    const duplicate = await submissions.sendMentorFeedback(input(), undefined, owner, "USER"); expect(duplicate.requestId).toBe(a.requestId); expect(duplicate.reused).toBe(true);
  });
  it("rejects compilation/snapshot mismatches, pending mentors and unauthorized authors", async () => {
    await expect(submissions.sendMentorFeedback(input({ compilationId: randomUUID() }), undefined, owner, "USER")).rejects.toMatchObject({ statusCode: 409 });
    await expect(submissions.sendMentorFeedback(input({ mentorId: pendingMentor }), undefined, owner, "USER")).rejects.toMatchObject({ statusCode: 403 });
    await expect(submissions.sendMentorFeedback(input(), undefined, outsider, "USER")).rejects.toThrow();
    const otherProject = await createProjectFixture({ data: { title: "Other project", ownerId: owner, status: "ACTIVE" } });
    await expect(submissions.sendMentorFeedback(input({ projectId: otherProject.id }), undefined, owner, "USER")).rejects.toThrow();
  });
  it("serves the new multipart and context APIs through real authentication and rejects malformed requests", async () => {
    const auth = await token(owner);
    const form = new FormData();
    for (const [key, value] of Object.entries(input())) if (value !== undefined) form.set(key, String(value));
    const response = await fetch(`${origin}/submissions/mentor-feedback`, { method: "POST", headers: { Authorization: `Bearer ${auth}` }, body: form });
    expect(response.status).toBe(201); expect((await response.json()).data).toMatchObject({ requestId: result.requestId, reused: true });
    const url = `${origin}/submissions/mentor-feedback/context?projectId=${project}&manuscriptId=${draft}`;
    expect((await fetch(url)).status).toBe(401);
    const context = await fetch(url, { headers: { Authorization: `Bearer ${auth}` } });
    expect(context.status).toBe(200); expect((await context.json()).data.submission.id).toBe(result.submissionId);
    expect((await fetch(url, { headers: { Authorization: `Bearer ${await token(mentor)}` } })).status).toBe(403);
    form.set("responses", "invalid-json");
    expect((await fetch(`${origin}/submissions/mentor-feedback`, { method: "POST", headers: { Authorization: `Bearer ${auth}` }, body: form })).status).toBe(400);
  });
  it("pins Mentor access and v1 PDF while the live source changes", async () => {
    await requests.accept(result.requestId, mentor);
    expect((await reviews.getReview(result.assignmentId, mentor)).artifactRevision?.id).toBe(result.revisionId);
    expect((await submissions.resolveDownload(result.submissionId, result.revisionId, mentor, "USER")).kind).toBe("local");
    await expect(writing.detail(project, mentor, draft)).rejects.toThrow();
    await db.manuscriptFile.update({ where: { id: main }, data: { crdtState: sourceState("\\documentclass{article}\n\\begin{document}Revised methods and evaluation.\\end{document}"), sequence: { increment: 1 }, version: { increment: 1 } } });
    await db.draftWorkspace.update({ where: { id: draft }, data: { version: { increment: 1 } } });
    expect(storage.bytes.get((await db.submissionRevision.findUniqueOrThrow({ where: { id: result.revisionId } })).storageUri!)).toEqual(firstPdf);
  });
  it("submits feedback, then sends v2 in the same thread with explicit revision responses", async () => {
    const workspace = await reviews.getReview(result.assignmentId, mentor);
    await reviews.saveReview(result.assignmentId, mentor, { expectedRevisionId: result.revisionId, expectedRoundNumber: workspace.roundNumber, clientKey: randomUUID(), overallAssessment: "MAJOR_REVISION", overallComment: "Clarify the evaluation protocol before advancing.", responses: workspace.criteria.map(c => ({ criterionKey: c.key, performanceLevelId: c.levels.find(level => level.score === 4)!.id, comment: "Explain this criterion using evidence from the methods section." })), integrityChecks: Object.fromEntries(scientificIntegrityChecks.map(check => [check.key, { status: "CHECKED" as const }])), requiredRevisions: [{ priority: "MAJOR", description: "Explain the comparison group and evaluation protocol.", locator: "Methods" }] }, true);
    const context = await submissions.mentorFeedbackContext({ projectId: project, manuscriptId: draft }, owner, "USER");
    expect(context.submission?.id).toBe(result.submissionId); const item = context.requests[0]!.items[0]!;
    const prepared = await prepare(); snapshot = prepared.snapshot; compilation = prepared.compilation;
    await expect(submissions.sendMentorFeedback(input({ submissionId: result.submissionId, expectedRevisionNumber: 1 }), undefined, owner, "USER")).rejects.toMatchObject({ statusCode: 400 });
    const payload = input({ submissionId: result.submissionId, expectedRevisionNumber: 1, responses: [{ revisionItemId: item.id, responseText: "The updated methods describe the comparison group and protocol." }] });
    vi.spyOn(requests, "resubmit").mockRejectedValueOnce(new Error("Temporary delivery failure"));
    await expect(submissions.sendMentorFeedback(payload, undefined, owner, "USER")).rejects.toThrow("Temporary delivery failure");
    expect((await reviews.getReview(result.assignmentId, mentor)).artifactRevision?.id).toBe(result.revisionId);
    expect(await db.submissionRevision.count({ where: { submissionId: result.submissionId } })).toBe(2);
    const sent = await submissions.sendMentorFeedback(payload, undefined, owner, "USER");
    expect(sent).toMatchObject({ submissionId: result.submissionId, requestId: result.requestId, revisionNumber: 2 });
    expect(await db.submissionRevision.count({ where: { submissionId: sent.submissionId } })).toBe(2);
    expect((await reviews.getReview(result.assignmentId, mentor)).artifactRevision?.id).toBe(sent.revisionId);
    expect((await db.humanReview.findFirstOrThrow({ where: { assignmentId: result.assignmentId, status: "SUBMITTED" } })).revisionId).toBe(result.revisionId);
  });
  it("keeps external PDF provenance separate and rejects malformed PDF bytes", async () => {
    const doc = await PDFDocument.create(); doc.addPage([300, 400]); const bytes = Buffer.from(await doc.save());
    const sent = await submissions.sendMentorFeedback(input({ source: "PDF", manuscriptSnapshotId: undefined, compilationId: undefined, title: "External manuscript" }), { buffer: bytes, size: bytes.length, originalname: "external.pdf" }, owner, "USER");
    const repeated = await submissions.sendMentorFeedback(input({ source: "PDF", manuscriptSnapshotId: undefined, compilationId: undefined, title: "External manuscript" }), { buffer: bytes, size: bytes.length, originalname: "external.pdf" }, owner, "USER");
    expect(repeated.requestId).toBe(sent.requestId); expect(repeated.reused).toBe(true);
    expect(sent.submissionId).not.toBe(result.submissionId);
    expect(await db.submissionRevision.findUniqueOrThrow({ where: { id: sent.revisionId } })).toMatchObject({ manuscriptSnapshotId: null, contentType: "PDF" });
    await expect(submissions.sendMentorFeedback(input({ source: "PDF", manuscriptSnapshotId: undefined, compilationId: undefined }), { buffer: Buffer.from("%PDF-1.7\nspoof\n%%EOF"), size: 22, originalname: "fake.pdf" }, owner, "USER")).rejects.toMatchObject({ statusCode: 400 });
  });
  it("rechecks sender and source after file storage, preserving authorization across races", async () => {
    const save = vi.mocked(pdfStorageService.savePdf), original = save.getMockImplementation()!;
    save.mockImplementationOnce(async (...args) => { const stored = await original(...args); await db.user.update({ where: { id: owner }, data: { isActive: false } }); return stored; });
    try { await expect(submissions.sendMentorFeedback(input(), undefined, owner, "USER")).rejects.toMatchObject({ statusCode: 401 }); }
    finally { await db.user.update({ where: { id: owner }, data: { isActive: true } }); }
    save.mockImplementationOnce(async (...args) => { const stored = await original(...args); await db.draftWorkspace.update({ where: { id: draft }, data: { archivedAt: new Date() } }); return stored; });
    try { await expect(submissions.sendMentorFeedback(input(), undefined, owner, "USER")).rejects.toMatchObject({ statusCode: 404 }); }
    finally { await db.draftWorkspace.update({ where: { id: draft }, data: { archivedAt: null } }); }
    expect(await db.submissionRevision.count({ where: { submissionId: result.submissionId } })).toBe(2);
  });
  it("revocation blocks both review access and new sends without deleting feedback", async () => {
    await db.mentorAccess.update({ where: { id: policy }, data: { revokedAt: new Date() } });
    await expect(reviews.getReview(result.assignmentId, mentor)).rejects.toThrow();
    await expect(submissions.sendMentorFeedback(input(), undefined, owner, "USER")).rejects.toMatchObject({ statusCode: 403 });
    expect(await db.humanReview.count({ where: { assignmentId: result.assignmentId, status: "SUBMITTED" } })).toBe(1);
  });
});
