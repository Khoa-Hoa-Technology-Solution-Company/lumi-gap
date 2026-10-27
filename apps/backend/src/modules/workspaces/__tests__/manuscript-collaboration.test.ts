import { afterEach, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { attachManuscriptCollaboration } from "../manuscript-collaboration.js";
import { manuscriptEvents } from "../manuscript.service.js";

const fixture = vi.hoisted(() => ({
  actorId: "20000000-0000-4000-8000-000000000001", projectId: "10000000-0000-4000-8000-000000000001",
  manuscriptId: "30000000-0000-4000-8000-000000000001", fileId: "40000000-0000-4000-8000-000000000001",
  sessionId: "50000000-0000-4000-8000-000000000001", content: vi.fn(),
}));
vi.mock("../../../config/env.js", () => ({ env: { CORS_ORIGIN: "http://localhost:13000" } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({
  refreshToken: { findFirst: async () => ({ id: "active-session" }) }, user: { findUnique: async () => ({ fullName: "Synthetic writer" }) },
}) }));
vi.mock("../../auth/token.service.js", () => ({ tokenService: { verifyPurposeToken: () => fixture } }));
vi.mock("../manuscript.service.js", async () => {
  const { EventEmitter } = await import("node:events");
  return { manuscriptService: { fileContent: fixture.content }, manuscriptEvents: new EventEmitter() };
});

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => { await cleanup?.(); fixture.content.mockReset(); });

it("includes a commit made between authorization and room admission in the initial checkpoint", async () => {
  const before = { state: "old-checkpoint", sequence: 0, version: 1, canWrite: true };
  const committed = { state: "new-checkpoint", sequence: 1, version: 2, canWrite: true };
  let release!: () => void, captured!: () => void;
  const waiting = new Promise<void>(resolve => { captured = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  fixture.content.mockImplementationOnce(async () => { captured(); await gate; return before; }).mockResolvedValue(committed);
  const server = createServer(), stop = attachManuscriptCollaboration(server);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const socket = new WebSocket(`ws://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/manuscript-collaboration`, { origin: "http://localhost:13000" });
  cleanup = async () => { socket.terminate(); await stop(); await new Promise<void>(resolve => server.close(() => resolve())); };
  await once(socket, "open");
  const packets: Array<{ type: string; update: string; sequence: number }> = [];
  socket.on("message", data => packets.push(JSON.parse(data.toString())));
  socket.send(JSON.stringify({ type: "hello", ticket: "fixture-ticket", clientId: 123 }));
  await waiting;
  // A transaction has committed, but this socket is not in the room yet.
  manuscriptEvents.emit("source", { ...fixture, update: committed.state, sequence: committed.sequence, fileVersion: committed.version });
  release();
  await vi.waitFor(() => expect(packets.some(frame => frame.type === "state")).toBe(true));
  expect(packets.find(frame => frame.type === "state")).toMatchObject({ update: committed.state, sequence: committed.sequence, fileVersion: committed.version });
});

it("enforces the account connection limit when authentication completes concurrently", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const content = { state: "checkpoint", sequence: 0, version: 1, canWrite: true };
  fixture.content.mockImplementation(async () => { await gate; return content; });
  const server = createServer(), stop = attachManuscriptCollaboration(server);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const sockets = Array.from({ length: 41 }, () => new WebSocket(`ws://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/manuscript-collaboration`, { origin: "http://localhost:13000" }));
  cleanup = async () => { release(); sockets.forEach(socket => socket.terminate()); await stop(); await new Promise<void>(resolve => server.close(() => resolve())); };
  const packets = sockets.map(() => [] as Array<{ type: string; code?: string }>);
  sockets.forEach((socket, index) => socket.on("message", data => packets[index]!.push(JSON.parse(data.toString()))));
  await Promise.all(sockets.map(socket => once(socket, "open")));
  sockets.forEach((socket, index) => socket.send(JSON.stringify({ type: "hello", ticket: "fixture-ticket", clientId: index + 1 })));
  await vi.waitFor(() => expect(fixture.content).toHaveBeenCalledTimes(41));
  release();
  await vi.waitFor(() => expect(packets.every(frames => frames.some(frame => frame.type === "state" || frame.type === "error"))).toBe(true));
  expect(packets.filter(frames => frames.some(frame => frame.type === "state"))).toHaveLength(40);
  expect(packets.filter(frames => frames.some(frame => frame.type === "error" && frame.code === "RATE_LIMITED"))).toHaveLength(1);
});
