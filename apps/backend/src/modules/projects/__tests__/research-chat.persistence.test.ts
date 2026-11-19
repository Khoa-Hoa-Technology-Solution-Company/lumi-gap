import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import { afterAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { projectTeamChatService as chat } from "../project-team-chat.service.js";
import { projectChatReferences as refs } from "../project-chat-references.service.js";
import { projectTeamChatEventHub } from "../project-team-chat.events.js";
import { projectDiscussionsService as journal } from "../project-discussions.service.js";
import { projectRouter } from "../project.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { SendProjectTeamChatMessageSchema as sendSchema, ListProjectTeamChatQuerySchema as listSchema } from "../dto/project-team-chat.schema.js";

vi.mock("../../../infrastructure/queue.js", () => {
  const queue = () => ({ add: vi.fn().mockResolvedValue({}), getJob: vi.fn().mockResolvedValue(null) });
  return { QUEUE_NAMES: {}, notificationQueue: queue(), aiJobsQueue: queue(), apiSyncQueue: queue(), openAlexIngestQueue: queue(), corpusValidationQueue: queue(), embeddingQueue: queue(), paperAnalysisQueue: queue(), reportQueue: queue(), gapsQueue: queue(), taggingQueue: queue(), topicBackfillQueue: queue(), manuscriptCompileQueue: queue(), communitySummaryQueue: queue(), hasLiveJob: vi.fn().mockResolvedValue(false) };
});
const enabled = process.env.MENTOR_WORKSPACE_INTEGRATION === "1";
if (enabled && !/^codex_mentor_workspace_[a-f0-9]{12}_test$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1))) throw new Error("Isolated chat database required");

describe.skipIf(!enabled).sequential("research-context chat, PostgreSQL and HTTP", () => {
  const db = getPrisma(); afterAll(disconnectPostgres);
  async function account(name = "Student") {
    const u = await db.user.create({ data: { fullName: name, email: `${randomUUID()}@chat.invalid`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
    await db.academicProfile.create({ data: { userId: u.id, academicRole: "RESEARCHER", primaryPosition: "RESEARCH_STAFF" } }); return u.id;
  }
  async function fixture() {
    const owner = await account("Student A"), member = await account("Student B"), outsider = await account("Lecturer C");
    const project = await createProjectFixture({ data: { title: "Research chat QA", ownerId: owner, status: "ACTIVE", legacyMongoId: randomUUID().replaceAll("-", "").slice(0, 24) } });
    await db.projectMember.create({ data: { projectId: project.id, userId: member } });
    const paper = await db.paper.create({ data: { title: "Evidence-based collaboration for multilingual research teams", publicationYear: 2026, primaryProvider: "user", dataStatus: "active" } });
    await db.projectPaper.create({ data: { projectId: project.id, paperId: paper.id, addedById: owner } });
    const task = await db.projectTask.create({ data: { projectId: project.id, createdById: owner, assigneeId: member, title: "Compare sources and write the method", clientKey: randomUUID() } });
    const draft = await db.draftWorkspace.create({ data: { projectId: project.id, createdById: owner, name: "Collaborative study", writingMode: "LATEX" } });
    const snapshot = await db.manuscriptSnapshot.create({ data: { projectId: project.id, workspaceId: draft.id, label: "Methods v1", sourceVersion: 1, manifest: { title: draft.name, documentType: "RESEARCH_PAPER", mainFileId: null, files: [], references: [] }, checksum: "a".repeat(64), createdById: owner, clientKey: randomUUID() } });
    const submission = await db.submission.create({ data: { projectId: project.id, createdById: owner, title: "Shared scientific study" } });
    const revision = await db.submissionRevision.create({ data: { submissionId: submission.id, revisionNumber: 1, uploadedById: owner, contentType: "MARKDOWN", contentSnapshot: "Original v1", sizeBytes: 11 } });
    return { owner, member, outsider, project, paper, task, draft, snapshot, submission, revision };
  }
  async function headers(id: string) {
    const sessionId = randomUUID(); await db.refreshToken.create({ data: { userId: id, familyId: sessionId, tokenHash: hashOpaqueToken(randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
    return { Authorization: `Bearer ${tokenService.signAccessToken({ sub: id, systemRole: "USER", sessionId }).token}`, "Content-Type": "application/json" };
  }
  async function http() {
    const app = express(); app.use(express.json()); app.use("/projects", projectRouter); app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}/projects` };
  }
  it("persists once on concurrent retry and creates one notification per recipient", async () => {
    const f = await fixture(), key = randomUUID(), listener = vi.fn(), stop = projectTeamChatEventHub.subscribe(f.project.id, listener);
    try {
      const [a, b] = await Promise.all([chat.sendMessage(f.project.id, f.owner, "Xin chào nhóm", key), chat.sendMessage(f.project.legacyMongoId!, f.owner, "Xin chào nhóm", key)]);
      expect(a.id).toBe(b.id); expect(listener).toHaveBeenCalledTimes(1); expect(await db.projectTeamMessage.count({ where: { projectId: f.project.id } })).toBe(1);
      expect(await db.notification.count({ where: { eventKey: `TEAM_CHAT:${a.id}:${f.member}` } })).toBe(1);
      expect((await chat.listMessages(f.project.id, f.member, { limit: 50 }))[0]?.content).toBe("Xin chào nhóm");
      await expect(chat.sendMessage(f.project.id, f.owner, "Different", key)).rejects.toMatchObject({ statusCode: 409 });
    } finally { stop(); }
  });
  it("retains reply provenance and tombstones after deletion", async () => {
    const f = await fixture(), original = await chat.sendMessage(f.project.id, f.owner, "Compare the methods", randomUUID());
    const reply = await chat.sendMessage(f.project.id, f.member, "I checked the source", randomUUID(), { replyToId: original.id });
    expect(reply.replyTo).toMatchObject({ id: original.id, content: "Compare the methods", sender: { id: f.owner } }); await expect(chat.deleteMessage(f.project.id, original.id, f.member)).rejects.toMatchObject({ statusCode: 403 }); await chat.deleteMessage(f.project.id, original.id, f.owner);
    const rows = await chat.listMessages(f.project.id, f.member, { limit: 50 }); expect(rows.find(r => r.id === reply.id)?.replyTo).toMatchObject({ isDeleted: true, content: "" });
    expect((await chat.listMessages(f.project.id, f.member, { limit: 50, ids: reply.id }))[0]?.replyTo?.isDeleted).toBe(true);
    await expect(chat.sendMessage(f.project.id, f.member, "new", randomUUID(), { replyToId: original.id })).rejects.toMatchObject({ statusCode: 404 });
  });
  it("protects immutable references and resolves all four source types", async () => {
    const f = await fixture();
    for (const reference of [{ kind: "PAPER", id: f.paper.id }, { kind: "TASK", id: f.task.id }, { kind: "MANUSCRIPT_SNAPSHOT", id: f.snapshot.id }, { kind: "SUBMISSION_REVISION", id: f.revision.id }] as const) {
      const key = randomUUID(), message = await chat.sendMessage(f.project.id, f.owner, "", key, { reference }); expect(message.reference).toEqual(reference);
      expect((await refs.resolve(f.project.id, f.member, reference)).href).toContain(reference.id);
      await expect(chat.sendMessage(f.project.id, f.owner, "", key, { reference: { ...reference, id: randomUUID() } })).rejects.toMatchObject({ statusCode: 409 });
    }
    await db.submissionRevision.create({ data: { submissionId: f.submission.id, revisionNumber: 2, uploadedById: f.owner, contentSnapshot: "Revised v2", sizeBytes: 10 } });
    expect(await refs.resolve(f.project.id, f.member, { kind: "SUBMISSION_REVISION", id: f.revision.id })).toMatchObject({ version: 1 });
    await db.draftWorkspace.update({ where: { id: f.draft.id }, data: { deletedAt: new Date() } }); await expect(refs.resolve(f.project.id, f.member, { kind: "MANUSCRIPT_SNAPSHOT", id: f.snapshot.id })).rejects.toMatchObject({ statusCode: 404 });
    expect(JSON.stringify((await db.projectActivity.findMany({ where: { projectId: f.project.id, sourceModule: "TEAM_CHAT" } })).map(r => r.metadata))).not.toContain(f.draft.name);
  });
  it("denies outsiders, cross-project references/replies, revoked members and mentor access to team chat", async () => {
    const f = await fixture(), other = await fixture(), foreign = await chat.sendMessage(other.project.id, other.owner, "Private", randomUUID());
    await expect(chat.listMessages(f.project.id, f.outsider, { limit: 50 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(chat.sendMessage(f.project.id, f.member, "foreign", randomUUID(), { replyToId: foreign.id })).rejects.toMatchObject({ statusCode: 404 });
    await expect(chat.sendMessage(f.project.id, f.member, "", randomUUID(), { reference: { kind: "PAPER", id: other.paper.id } })).rejects.toMatchObject({ statusCode: 404 });
    const invitation = await db.mentorshipRequest.create({ data: { projectId: f.project.id, mentorUserId: f.outsider, requestedBy: f.owner, status: "PENDING" } });
    await expect(chat.assertCanOpenEvents(f.project.id, f.outsider)).rejects.toMatchObject({ statusCode: 404 });
    await db.mentorshipRequest.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } }); await db.mentorRelationship.create({ data: { projectId: f.project.id, mentorUserId: f.outsider, sourceRequestId: invitation.id } });
    await expect(refs.resolve(f.project.id, f.outsider, { kind: "MANUSCRIPT_SNAPSHOT", id: f.snapshot.id })).rejects.toMatchObject({ statusCode: 404 });
    await db.projectMember.update({ where: { projectId_userId: { projectId: f.project.id, userId: f.member } }, data: { status: "REMOVED" } }); await expect(chat.listMessages(f.project.id, f.member, { limit: 50 })).rejects.toMatchObject({ statusCode: 404 });
  });
  it("paginates tied timestamps, searches only team messages and catches up beyond 50 events", async () => {
    const f = await fixture(), stamp = new Date("2026-11-17T10:00:00Z"); await db.projectTeamMessage.createMany({ data: Array.from({ length: 125 }, (_, i) => ({ projectId: f.project.id, senderId: f.owner, content: `Research note ${i} Tiếng Việt`, createdAt: stamp })) });
    const first = await chat.listMessages(f.project.id, f.member, { limit: 50 }), older = await chat.listMessages(f.project.id, f.member, { limit: 50, beforeId: first[0]!.id }), last = await chat.listMessages(f.project.id, f.member, { limit: 50, beforeId: older[0]!.id });
    expect(new Set([...last, ...older, ...first].map(r => r.id)).size).toBe(125); expect(await chat.listMessages(f.project.id, f.member, { limit: 100, afterId: last[0]!.id })).toHaveLength(100);
    expect(await chat.listMessages(f.project.id, f.member, { limit: 30, q: "Tiếng Việt" })).toHaveLength(30); expect((await chat.listMessages(f.project.id, f.member, { limit: 20, aroundId: older[25]!.id })).some(r => r.id === older[25]!.id)).toBe(true);
    const thread = await db.projectDiscussion.create({ data: { projectId: f.project.id, authorId: f.owner, title: "Separate discussion", body: "Hidden thread", category: "GENERAL", clientKey: randomUUID() } }); await db.projectTeamMessage.create({ data: { projectId: f.project.id, senderId: f.owner, threadId: thread.id, content: "Thread-only secret" } });
    expect(await chat.listMessages(f.project.id, f.member, { limit: 50, q: "Thread-only secret" })).toEqual([]);
  });
  it("does not lose older rows that differ only in PostgreSQL microseconds", async () => {
    const f = await fixture();
    await db.$executeRaw`INSERT INTO project_team_messages (id,project_id,sender_id,content,created_at) VALUES (gen_random_uuid(),${f.project.id}::uuid,${f.owner}::uuid,'Earlier microsecond','2026-11-17T10:00:00.000101Z'),(gen_random_uuid(),${f.project.id}::uuid,${f.owner}::uuid,'Later microsecond','2026-11-17T10:00:00.000202Z')`;
    const latest = await chat.listMessages(f.project.id, f.member, { limit: 1 });
    const earlier = await chat.listMessages(f.project.id, f.member, { limit: 1, beforeId: latest[0]!.id });
    expect(earlier[0]?.content).toBe("Earlier microsecond");
    expect((await chat.listMessages(f.project.id, f.member, { limit: 1, afterId: earlier[0]!.id }))[0]?.id).toBe(latest[0]?.id);
    expect(latest[0]?.createdAt).toContain(".000202Z");
  });
  it("reuses decision permissions, idempotent history and a durable source link", async () => {
    const f = await fixture(), original = await chat.sendMessage(f.project.id, f.member, "Compare three baselines", randomUUID());
    const input = { decision: "Compare three baselines", context: original.content, alternatives: "", rationale: "Comparable evidence across datasets", threadId: null, link: { kind: "TEAM_MESSAGE" as const, id: original.id }, clientKey: randomUUID() };
    const a = await journal.saveDecision(f.project.id, f.member, input), b = await journal.saveDecision(f.project.id, f.member, input); expect(a).toEqual(b); expect((await journal.decisions(f.project.id, f.owner, { page: 1, pageSize: 20 })).items[0]?.link).toEqual(input.link);
    expect((await journal.history(f.project.id, f.owner, "DECISION", a.id, { page: 1, pageSize: 20 })).total).toBe(1); await expect(journal.saveDecision(f.project.id, f.outsider, input)).rejects.toMatchObject({ statusCode: 404 }); await chat.deleteMessage(f.project.id, original.id, f.member);
    expect((await journal.decisions(f.project.id, f.owner, { page: 1, pageSize: 20 })).items[0]?.decision).toBe(input.decision);
  });
  it("validates strict input and enforces authentication through HTTP", async () => {
    const f = await fixture(), h = await headers(f.member), app = await http(), base = `${app.base}/${f.project.id}/team-chat`;
    try {
      expect((await fetch(base)).status).toBe(401); for (const body of [{ content: "hello", senderId: f.owner }, { content: "", reference: { kind: "TASK", id: "invalid" } }, { content: "x".repeat(2001) }]) expect((await fetch(base, { method: "POST", headers: h, body: JSON.stringify(body) })).status).toBe(400);
      expect((await fetch(`${base}/reference?kind=PAPER&id=${f.paper.id}`, { headers: await headers(f.outsider) })).status).toBe(404); expect((await fetch(`${base}/references?kind=PAPER`, { headers: h })).status).toBe(200);
      expect((await fetch(base, { method: "POST", headers: h, body: JSON.stringify({ content: "<img src=x onerror=alert(1)> Unicode 研究", clientKey: randomUUID() }) })).status).toBe(201);
      expect(sendSchema.safeParse({ content: "", reference: { kind: "PAPER", id: f.paper.id } }).success).toBe(true); expect(listSchema.safeParse({ beforeId: f.paper.id, afterId: f.paper.id }).success).toBe(false);
    } finally { app.server.close(); await once(app.server, "close"); }
  });
  it("streams between UUID and legacy project URLs and closes on access revocation", async () => {
    const f = await fixture(), app = await http(), controller = new AbortController();
    try {
      const response = await fetch(`${app.base}/${f.project.legacyMongoId}/team-chat/events`, { headers: await headers(f.member), signal: controller.signal }); expect(response.status).toBe(200); const reader = response.body!.getReader(); await reader.read();
      const sent = await chat.sendMessage(f.project.id, f.owner, "Realtime from another browser", randomUUID()); expect(new TextDecoder().decode((await reader.read()).value)).toContain(sent.id);
      await db.projectMember.update({ where: { projectId_userId: { projectId: f.project.id, userId: f.member } }, data: { status: "REMOVED" } }); await chat.sendMessage(f.project.id, f.owner, "Must not be delivered", randomUUID()); expect((await reader.read()).done).toBe(true);
    } finally { controller.abort(); app.server.closeAllConnections(); app.server.close(); await once(app.server, "close"); }
  });
  it.skipIf(process.env.RESEARCH_CHAT_BROWSER !== "1")("verifies two browser accounts, source sharing, search, decisions and responsive layouts", async () => {
    const f = await fixture();
    const { researchChatBrowser } = await import("./research-chat.browser.js");
    await researchChatBrowser(db, { projectId: f.project.id, owner: { id: f.owner, token: (await headers(f.owner)).Authorization.slice(7) }, member: { id: f.member, token: (await headers(f.member)).Authorization.slice(7) }, paperTitle: f.paper.title, taskTitle: f.task.title, draftTitle: f.draft.name, submissionTitle: f.submission.title });
  }, 300000);

});
