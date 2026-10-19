import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { Worker } from "bullmq";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { makeConnection, QUEUE_NAMES } from "../../../infrastructure/queue.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { manuscriptRouter } from "../manuscript.routes.js";
import { manuscriptService as writing } from "../manuscript.service.js";
import { processCompilation } from "../manuscript-compiler.js";
import { sourceState } from "../manuscript-source.js";

const auth = vi.hoisted(() => ({ sub: "" }));
vi.mock("../../../common/middleware/auth.js", () => ({ requireAuth: (req: any, _res: any, next: () => void) => { req.user = { sub: auth.sub }; next(); } }));
vi.mock("../../authorization/authorization.middleware.js", () => ({ requireResearchWorkflow: (_req: any, _res: any, next: () => void) => next() }));
const isolated = process.env.MANUSCRIPT_COMPILER_INTEGRATION === "1" && /\/codex_mentorship_[a-f0-9]+_test(?:\?|$)/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!isolated).sequential("real manuscript compilation (disposable DB, Redis and compiler)", () => {
  const db = getPrisma(), app = express(), server = createServer(app);
  let owner: string, member: string, outsider: string, mentor: string, relationship: string, project: string, id: string, snapshot: string, compilation: string, main: string, origin: string;
  let worker: Worker;
  app.use(express.json()); app.use("/projects/:projectId/manuscripts", manuscriptRouter); app.use(errorHandler);
  const call = (path: string, body?: unknown) => fetch(`${origin}/projects/${project}/manuscripts/${id}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const seal = async () => (await writing.snapshot(project, owner, id, { label: "Compile test", clientKey: crypto.randomUUID(), minimumSequences: {} })).id;
  async function complete(jobId: string) {
    for (let i = 0; i < 150; i++) {
      const row = await db.manuscriptCompilation.findUniqueOrThrow({ where: { id: jobId } });
      if (["SUCCESS", "FAILED", "TIMED_OUT"].includes(row.status)) return row;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error("Compiler did not finish");
  }
  beforeAll(async () => {
    const users = await Promise.all(["Owner", "Member", "Outsider", "Mentor"].map(fullName => db.user.create({ data: { fullName, email: `${crypto.randomUUID()}@compile.invalid`, emailVerifiedAt: new Date() } })));
    [owner, member, outsider, mentor] = users.map(user => user.id) as [string, string, string, string];
    await db.academicProfile.create({ data: { userId: mentor, primaryPosition: "LECTURER", academicRole: "LECTURER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED", supportAvailability: { enabled: true } } });
    const p = await createProjectFixture({ data: { title: "Private team manuscript", ownerId: owner, status: "ACTIVE", visibility: "PRIVATE" } }); project = p.id;
    await db.projectMember.create({ data: { projectId: project, userId: member } });
    const request = await db.mentorshipRequest.create({ data: { projectId: project, mentorUserId: mentor, requestedBy: owner, direction: "PROJECT_TO_LECTURER", status: "ACCEPTED", expiresAt: new Date(Date.now() + 86400000) } });
    relationship = (await db.mentorRelationship.create({ data: { projectId: project, mentorUserId: mentor, sourceRequestId: request.id } })).id;
    const draft = await writing.create(project, owner, { title: "Compile shared LaTeX", documentType: "RESEARCH_PAPER", template: "ARTICLE", description: "", clientKey: crypto.randomUUID() }); id = draft.id; main = draft.mainFileId!;
    auth.sub = owner; snapshot = await seal();
    server.listen(0, "127.0.0.1"); await once(server, "listening"); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    worker = new Worker(QUEUE_NAMES.manuscriptCompile, job => processCompilation(job.data.compilationId), { connection: makeConnection(), concurrency: 1 });
  });
  afterAll(async () => { await worker?.close(); if (server.listening) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
  it("compiles an immutable snapshot through HTTP, BullMQ and the real engine, and downloads private PDF", async () => {
    const response = await call(`/snapshots/${snapshot}/compile`, { engine: "pdflatex" }); expect(response.status).toBe(202);
    compilation = (await response.json()).data.id;
    const result = await complete(compilation); expect(result.status, result.diagnostics).toBe("SUCCESS"); expect(result.checksum).toHaveLength(64);
    const pdf = await call(`/compilations/${compilation}/pdf`); expect(pdf.status).toBe(200); expect(pdf.headers.get("cache-control")).toContain("no-store"); expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    const state = (await (await call("/compilations")).json()).data;
    expect(state.successful).toMatchObject({ id: compilation, snapshotId: snapshot, sourceVersion: 1, engine: "pdflatex" }); expect(state.successful.pdfData).toBeUndefined();
  });
  it("deduplicates concurrent team requests and rejects invalid engine and IDs", async () => {
    const requests = await Promise.all([writing.compile(project, owner, id, snapshot), writing.compile(project, member, id, snapshot)]);
    expect(requests.map(row => row.id)).toEqual([compilation, compilation]);
    expect((await call(`/snapshots/${snapshot}/compile`, { engine: "sh" })).status).toBe(400);
    expect((await call("/compilations/invalid/pdf")).status).toBe(400);
  });
  it("reuses saved compile sources across team requests, validates receipts and preserves manual versions", async () => {
    const input = { label: "Repeat compile", clientKey: crypto.randomUUID(), minimumSequences: {}, reuseUnchanged: true };
    const sealed = await Promise.all([writing.snapshot(project, owner, id, input), writing.snapshot(project, member, id, { ...input, clientKey: crypto.randomUUID() })]);
    expect(sealed.map(row => row.id)).toEqual([snapshot, snapshot]);
    await expect(writing.snapshot(project, owner, id, { ...input, minimumSequences: { [main]: 999 } })).rejects.toMatchObject({ statusCode: 409 });
    await expect(writing.snapshot(project, outsider, id, input)).rejects.toMatchObject({ statusCode: 404 });
    const manual = await writing.snapshot(project, member, id, { ...input, clientKey: crypto.randomUUID(), reuseUnchanged: false });
    expect(manual.id).not.toBe(snapshot);
  });
  it("allows recompiling an unchanged source at the version limit while rejecting a new manual version", async () => {
    const draft = await writing.create(project, owner, { title: "Version quota fixture", documentType: "RESEARCH_PAPER", template: "ARTICLE", description: "", clientKey: crypto.randomUUID() });
    const input = { label: "Saved", clientKey: crypto.randomUUID(), minimumSequences: {}, reuseUnchanged: true };
    const first = await writing.snapshot(project, owner, draft.id, input);
    const row = await db.manuscriptSnapshot.findUniqueOrThrow({ where: { id: first.id } });
    await db.manuscriptSnapshot.createMany({ data: Array.from({ length: 99 }, () => ({ workspaceId: draft.id, projectId: project, label: "Quota fixture", sourceVersion: row.sourceVersion, manifest: row.manifest!, checksum: row.checksum, createdById: owner, clientKey: crypto.randomUUID() })) });
    const reused = await writing.snapshot(project, member, draft.id, { ...input, clientKey: crypto.randomUUID() });
    expect((await db.manuscriptSnapshot.findUniqueOrThrow({ where: { id: reused.id } })).checksum).toBe(row.checksum);
    expect(await db.manuscriptSnapshot.count({ where: { workspaceId: draft.id } })).toBe(100);
    await expect(writing.snapshot(project, owner, draft.id, { ...input, clientKey: crypto.randomUUID(), reuseUnchanged: false })).rejects.toMatchObject({ statusCode: 400 });
  });
  it("uses the sealed source even after the live source changes, then reports real source errors and preserves the last PDF", async () => {
    await db.manuscriptFile.update({ where: { id: main }, data: { crdtState: sourceState("\\documentclass{article}\n\\begin{document}\n\\unknownLumiGapCommand\n\\end{document}") } });
    await db.draftWorkspace.update({ where: { id }, data: { version: { increment: 1 } } });
    expect((await writing.compile(project, owner, id, snapshot)).id).toBe(compilation);
    const failedSnapshot = await seal(), job = await writing.compile(project, owner, id, failedSnapshot);
    const result = await complete(job.id); expect(result.status).toBe("FAILED"); expect(result.diagnostics).toContain("main.tex:3:"); expect(result.pdfData).toBeNull();
    const state = await writing.compilations(project, owner, id); expect(state.latest?.id).toBe(job.id); expect(state.successful?.id).toBe(compilation);
  });
  it("protects PDFs/status from outsiders, cross-project requests and removed members", async () => {
    auth.sub = outsider; expect((await call("/compilations")).status).toBe(404); expect((await call(`/compilations/${compilation}/pdf`)).status).toBe(404); expect((await call(`/snapshots/${snapshot}/compile`, {})).status).toBe(404);
    const other = await createProjectFixture({ data: { title: "Other private project", ownerId: outsider } });
    await expect(writing.compilationPdf(other.id, outsider, id, compilation)).rejects.toMatchObject({ statusCode: 404 });
    auth.sub = member; expect((await call(`/compilations/${compilation}/pdf`)).status).toBe(200);
    await db.projectMember.update({ where: { projectId_userId: { projectId: project, userId: member } }, data: { status: "REMOVED" } });
    expect((await call(`/compilations/${compilation}/pdf`)).status).toBe(404);
  });
  it("persists structured compiler timeouts, preserves the successful PDF and allows retry", async () => {
    const request = globalThis.fetch;
    // Exercise the internal compiler contract without imposing a 60-second test wait.
    const compilerFetch = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => String(input).endsWith('/compile') && init?.headers && 'X-Internal-Key' in init.headers
      ? Promise.resolve(new Response(JSON.stringify({ success: false, errorCode: "TIMED_OUT", diagnostics: "Compilation time limit exceeded.", toolchain: "Test timeout response", pdf: null }), { status: 200 }))
      : request(input, init));
    const timeoutSnapshot = await seal();
    try {
      const job = await writing.compile(project, owner, id, timeoutSnapshot);
      const result = await complete(job.id);
      expect(result.status).toBe("TIMED_OUT"); expect(result.pdfData).toBeNull();
      const state = await writing.compilations(project, owner, id);
      expect(state.latest?.status).toBe("TIMED_OUT"); expect(state.successful?.id).toBe(compilation);
    } finally { compilerFetch.mockRestore(); }
    const retry = await writing.compile(project, owner, id, timeoutSnapshot);
    expect((await complete(retry.id)).status).toBe("FAILED"); // Original invalid LaTeX reaches the real compiler again.
  });
  it("grants mentors only the shared snapshot PDF and revokes access when mentorship ends", async () => {
    auth.sub = mentor; expect((await call(`/compilations/${compilation}/pdf`)).status).toBe(404);
    await db.projectDiscussion.create({ data: { projectId: project, authorId: owner, category: "MENTOR_QUESTION", title: "Review sealed draft", body: "Please review", targetKind: "MANUSCRIPT_SNAPSHOT", targetId: snapshot, mentorRelationshipId: relationship, clientKey: crypto.randomUUID() } });
    expect((await call(`/compilations/${compilation}/pdf`)).status).toBe(200);
    expect((await call(`/compilations?snapshotId=${snapshot}`)).status).toBe(200);
    expect((await call("/compilations")).status).toBe(404);
    expect((await call(`/snapshots/${snapshot}/compile`, {})).status).toBe(404);
    await db.mentorRelationship.update({ where: { id: relationship }, data: { status: "ENDED", endedAt: new Date(), endReason: "Test complete" } });
    expect((await call(`/compilations/${compilation}/pdf`)).status).toBe(404);
  });
});
