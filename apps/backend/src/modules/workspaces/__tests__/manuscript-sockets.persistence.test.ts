import { afterAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { env } from "../../../config/env.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { manuscriptService as writing } from "../manuscript.service.js";
import { attachManuscriptCollaboration } from "../manuscript-collaboration.js";
import { sourceText } from "../manuscript-source.js";

const isolated = process.env.MANUSCRIPT_COMPILER_INTEGRATION === "1" && /\/codex_mentorship_[a-f0-9]{12}_test(?:\?|$)/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!isolated)("actual manuscript collaboration sockets", () => {
  const db = getPrisma(), server = createServer(), close = attachManuscriptCollaboration(server);
  const clients: Array<{ socket: WebSocket; doc: Y.Doc }> = [];
  afterAll(async () => { await close(); for (const client of clients) client.doc.destroy(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); });
  const waitFor = async (test: () => boolean) => {
    const end = Date.now() + 8000;
    while (!test()) { if (Date.now() > end) throw new Error("Collaboration event timed out"); await new Promise(resolve => setTimeout(resolve, 20)); }
  };
  it("merges six simultaneous authors, survives reconnect/replay and revokes membership/session access", async () => {
    const people = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
      const user = await db.user.create({ data: { fullName: "Socket author " + i, email: crypto.randomUUID() + "@sockets.invalid", emailVerifiedAt: new Date() } });
      const sessionId = crypto.randomUUID();
      await db.refreshToken.create({ data: { userId: user.id, familyId: sessionId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
      return { id: user.id, sessionId };
    }));
    const owner = people[0]!, project = await createProjectFixture({ data: { title: "Concurrent socket fixture", ownerId: owner.id, status: "ACTIVE", visibility: "PRIVATE" } });
    await db.projectMember.createMany({ data: people.slice(1).map(person => ({ projectId: project.id, userId: person.id })) });
    const draft = await writing.create(project.id, owner.id, { title: "Socket manuscript", description: "", template: "ARTICLE", documentType: "RESEARCH_PAPER", clientKey: crypto.randomUUID() });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    async function connect(person: typeof owner) {
      const doc = new Y.Doc(), text = doc.getText("source"), session = crypto.randomUUID();
      const ticket = tokenService.signPurposeToken({ projectId: project.id, manuscriptId: draft.id, fileId: draft.mainFileId!, actorId: person.id, sessionId: person.sessionId }, "manuscript-room", "5m");
      const socket = new WebSocket("ws://127.0.0.1:" + port + "/api/v1/manuscript-collaboration", { origin: env.CORS_ORIGIN.split(",")[0]!.trim() });
      let initialized = false, receipts = 0;
      socket.on("message", raw => {
        const message = JSON.parse(raw.toString());
        if (["state", "update", "receipt"].includes(message.type) && message.update) Y.applyUpdate(doc, Buffer.from(message.update, "base64"));
        if (message.type === "state") initialized = true;
        if (message.type === "receipt") receipts++;
      });
      socket.on("error", () => {});
      clients.push({ socket, doc }); await once(socket, "open");
      socket.send(JSON.stringify({ type: "hello", ticket, clientId: doc.clientID }));
      await waitFor(() => initialized);
      return { doc, text, socket, session, receipts: () => receipts };
    }
    const editors = await Promise.all(people.map(connect));
    const updates = editors.map((editor, i) => {
      const vector = Y.encodeStateVector(editor.doc);
      editor.text.insert(editor.text.length, "\n% Author " + i + " simultaneous contribution\n");
      return { type: "update", clientSessionId: editor.session, clientSequence: 1, update: Buffer.from(Y.encodeStateAsUpdate(editor.doc, vector)).toString("base64") };
    });
    editors.forEach((editor, i) => editor.socket.send(JSON.stringify(updates[i])));
    await waitFor(() => editors.every(editor => editor.receipts() === 1 && people.every((_, i) => editor.text.toString().includes("% Author " + i + " simultaneous"))));
    const canonical = editors[0]!.text.toString();
    expect(new Set(editors.map(editor => editor.text.toString())).size).toBe(1);
    const stored = await writing.fileContent(project.id, owner.id, draft.id, draft.mainFileId!);
    expect(sourceText(Buffer.from(stored.state!, "base64"))).toBe(canonical);
    editors[0]!.socket.send(JSON.stringify(updates[0]));
    await waitFor(() => editors[0]!.receipts() === 2);
    expect((await writing.fileContent(project.id, owner.id, draft.id, draft.mainFileId!)).sequence).toBe(stored.sequence);
    editors[2]!.socket.close(); const reloaded = await connect(people[2]!);
    expect(reloaded.text.toString()).toBe(canonical);
    await db.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: people[1]!.id } }, data: { status: "REMOVED" } });
    const removed = editors[1]!, vector = Y.encodeStateVector(removed.doc); removed.text.insert(0, "FORBIDDEN");
    removed.socket.send(JSON.stringify({ type: "update", clientSessionId: removed.session, clientSequence: 2, update: Buffer.from(Y.encodeStateAsUpdate(removed.doc, vector)).toString("base64") }));
    await waitFor(() => removed.socket.readyState === WebSocket.CLOSED);
    expect(sourceText(Buffer.from((await writing.fileContent(project.id, owner.id, draft.id, draft.mainFileId!)).state!, "base64"))).toBe(canonical);
    await db.refreshToken.updateMany({ where: { familyId: owner.sessionId }, data: { revokedAt: new Date() } });
    editors[0]!.socket.send(JSON.stringify({ type: "presence", clock: Date.now(), cursor: null }));
    await waitFor(() => editors[0]!.socket.readyState === WebSocket.CLOSED);
  });
});
