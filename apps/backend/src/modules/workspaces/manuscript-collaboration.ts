import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { z } from "zod";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { tokenService } from "../auth/token.service.js";
import { manuscriptService, manuscriptEvents } from "./manuscript.service.js";
import { collaborationFrame } from "./dto/manuscript.schema.js";

const ticketClaims = z.object({ actorId: z.string().uuid(), projectId: z.string().uuid(), manuscriptId: z.string().uuid(), fileId: z.string().uuid(), sessionId: z.string().uuid() });
type Scope = z.infer<typeof ticketClaims>;
type Client = { socket: WebSocket; ticket: string; scope: Scope; clientId: number; clock: number; cursor: unknown; user: { id: string; name: string; color: string; colorLight: string }; canWrite: boolean };
const colors = ["#2563eb", "#a855f7", "#059669", "#dc2626", "#d97706", "#0891b2"];
const send = (socket: WebSocket, value: unknown) => { if (socket.readyState === WebSocket.OPEN) { if (socket.bufferedAmount > 4_000_000) socket.close(1013, "Backpressure"); else socket.send(JSON.stringify(value)); } };
const room = (client: Client) => `${client.scope.projectId}:${client.scope.manuscriptId}:${client.scope.fileId}`;

/** Rooms are transport/presence only. Every canonical text state lives in PostgreSQL. */
export function attachManuscriptCollaboration(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 3_000_000, perMessageDeflate: false });
  const clients = new Map<WebSocket, Client>();
  const accountBudgets = new Map<string, { start: number; messages: number; bytes: number }>();
  const origins = new Set(env.CORS_ORIGIN.split(",").map(value => value.trim()).filter(Boolean));
  async function authorize(client: Client) {
    const claims = ticketClaims.parse(tokenService.verifyPurposeToken(client.ticket, "manuscript-room"));
    const session = await getPrisma().refreshToken.findFirst({ where: { userId: claims.actorId, familyId: claims.sessionId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
    if (!session) throw AppError.unauthorized("Session ended");
    const content = await manuscriptService.fileContent(claims.projectId, claims.actorId, claims.manuscriptId, claims.fileId);
    client.canWrite = content.canWrite;
    return content;
  }
  const presence = (client: Client, gone = false) => ({ clientId: client.clientId, clock: client.clock = Math.max(client.clock + 1, Date.now()), state: gone ? null : { user: client.user, cursor: client.cursor } });
  async function broadcast(sender: Client, packet: unknown, sameFile = true, includeSelf = false) {
    for (const client of clients.values()) {
      if ((!includeSelf && client === sender) || (sameFile ? room(client) !== room(sender) : client.scope.manuscriptId !== sender.scope.manuscriptId || client.scope.projectId !== sender.scope.projectId)) continue;
      try { await authorize(client); send(client.socket, packet); }
      catch { client.socket.close(4401, "Authorization required"); }
    }
  }
  const upgrade = (req: import("node:http").IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) => {
    if (req.url?.split("?")[0] !== "/api/v1/manuscript-collaboration") return;
    // A browser always supplies Origin. Non-browser clients must supply the same allowlisted value.
    if (!req.headers.origin || !origins.has(req.headers.origin) || req.url.includes("?") || wss.clients.size >= 1000) { socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws));
  };
  server.on("upgrade", upgrade);
  wss.on("connection", socket => {
    let chain = Promise.resolve(), queued = 0, queuedBytes = 0, count = 0, windowStart = Date.now();
    const handshake = setTimeout(() => socket.close(4401, "Authenticate first"), 5000);
    socket.on("message", (raw, binary) => {
      const bytes = raw instanceof ArrayBuffer ? raw.byteLength : Array.isArray(raw) ? raw.reduce((sum, b) => sum + b.length, 0) : raw.length;
      queuedBytes += bytes;
      if (++queued > 16 || queuedBytes > 4_000_000 || binary) { socket.close(1008, "Invalid or excessive messages"); return; }
      chain = chain.then(async () => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (Date.now() - windowStart > 60000) { windowStart = Date.now(); count = 0; }
        if (++count > 1200) throw new AppError(429, "RATE_LIMITED", "Collaboration message limit reached");
        const frame = collaborationFrame.parse(JSON.parse(raw.toString()));
        if (frame.type === "hello") {
          if (clients.has(socket)) throw AppError.badRequest("Room already authenticated");
          const scope = ticketClaims.parse(tokenService.verifyPurposeToken(frame.ticket, "manuscript-room"));
          if ([...clients.values()].filter(c => c.scope.actorId === scope.actorId).length >= 40) throw new AppError(429, "RATE_LIMITED", "Account collaboration connection limit reached");
          if ([...clients.values()].some(c => room(c) === `${scope.projectId}:${scope.manuscriptId}:${scope.fileId}` && c.clientId === frame.clientId)) throw AppError.conflict("Duplicate collaboration client identity");
          const name = await getPrisma().user.findUnique({ where: { id: scope.actorId }, select: { fullName: true } });
          const color = colors[parseInt(scope.actorId.slice(0, 8), 16) % colors.length]!;
          const client: Client = { socket, ticket: frame.ticket, scope, clientId: frame.clientId, clock: 0, cursor: null, canWrite: false, user: { id: scope.actorId, name: name?.fullName || "Researcher", color, colorLight: `${color}30` } };
          const content = await authorize(client);
          clients.set(socket, client); clearTimeout(handshake);
          send(socket, { type: "state", update: content.state, sequence: content.sequence, fileVersion: content.version, canWrite: content.canWrite, user: client.user });
          const peers = [...clients.values()].filter(c => c !== client && room(c) === room(client)).map(c => presence(c));
          send(socket, { type: "presence", entries: peers });
          await broadcast(client, { type: "presence", entries: [presence(client)] });
          return;
        }
        const client = clients.get(socket);
        if (!client) throw AppError.unauthorized("Authenticate first");
        let budget = accountBudgets.get(client.scope.actorId);
        if (!budget || Date.now() - budget.start > 60000) { budget = { start: Date.now(), messages: 0, bytes: 0 }; accountBudgets.set(client.scope.actorId, budget); }
        if (++budget.messages > 2400 || (budget.bytes += bytes) > 10_000_000) throw new AppError(429, "RATE_LIMITED", "Account collaboration traffic limit reached");
        await authorize(client);
        if (frame.type === "presence") {
          if (JSON.stringify(frame.cursor).length > 2000) throw AppError.badRequest("Cursor payload is too large");
          client.clock = Math.max(client.clock, frame.clock); client.cursor = frame.cursor;
          await broadcast(client, { type: "presence", entries: [presence(client)] }); return;
        }
        if (!client.canWrite) throw AppError.forbidden("This manuscript is read-only");
        const result = await manuscriptService.applyUpdate(client.scope.projectId, client.scope.actorId, client.scope.manuscriptId, client.scope.fileId, frame, client.scope.sessionId);
        // This point is reached only after PostgreSQL commits. No provisional source broadcast.
        send(socket, { type: "receipt", clientSessionId: frame.clientSessionId, clientSequence: frame.clientSequence, sequence: result.sequence, fileVersion: result.fileVersion, update: result.state });
        if (!result.replay) await broadcast(client, { type: "update", sequence: result.sequence, fileVersion: result.fileVersion, update: frame.update });
      }).catch(error => {
        const code = error instanceof AppError ? error.code : "SYNC_ERROR";
        send(socket, { type: "error", code }); socket.close(code === "UNAUTHORIZED" || code === "NOT_FOUND" ? 4401 : 1011, "Synchronization interrupted");
      }).finally(() => { queued--; queuedBytes -= bytes; });
    });
    socket.on("error", () => socket.close());
    socket.on("close", () => {
      clearTimeout(handshake); const client = clients.get(socket); clients.delete(socket);
      if (client) void broadcast(client, { type: "presence", entries: [presence(client, true)] });
    });
  });
  const metadata = (event: { projectId: string; manuscriptId: string }) => {
    for (const client of clients.values()) if (client.scope.projectId === event.projectId && client.scope.manuscriptId === event.manuscriptId) send(client.socket, { type: "metadata" });
  };
  const source = (event: { projectId: string; manuscriptId: string; fileId: string; update: string; sequence: number; fileVersion: number }) => {
    for (const client of clients.values()) if (client.scope.projectId === event.projectId && client.scope.manuscriptId === event.manuscriptId && client.scope.fileId === event.fileId) {
      void authorize(client).then(() => send(client.socket, { ...event, type: "update" })).catch(() => client.socket.close(4401, "Authorization required"));
    }
  };
  manuscriptEvents.on("changed", metadata); manuscriptEvents.on("source", source);
  let auditing = false;
  const audit = setInterval(() => {
    for (const [id, budget] of accountBudgets) if (Date.now() - budget.start > 60000) accountBudgets.delete(id);
    if (auditing) return; auditing = true;
    void Promise.all([...clients.values()].map(async client => {
      try { const content = await authorize(client); send(client.socket, { type: "permission", canWrite: content.canWrite }); }
      catch { client.socket.close(4401, "Authorization required"); }
    })).finally(() => { auditing = false; });
  }, 5000); audit.unref();
  return async () => { clearInterval(audit); manuscriptEvents.off("changed", metadata); manuscriptEvents.off("source", source); server.off("upgrade", upgrade); for (const socket of wss.clients) socket.terminate(); await new Promise<void>(resolve => wss.close(() => resolve())); };
}
