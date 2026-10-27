// @vitest-environment jsdom
import "fake-indexeddb/auto";
import * as Y from "yjs";
import { afterEach, expect, it, vi } from "vitest";
import { ManuscriptProvider, encodeBytes } from "../collaboration-provider";
import { manuscriptRecovery } from "../manuscript-recovery";

const auth = vi.hoisted(() => ({ user: { id: "recovery-user" } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: { getState: () => auth, subscribe: () => () => {} } }));
vi.mock("@/services/api-client", () => ({ API_BASE_URL: "/api/v1", api: { post: async () => ({ data: { data: { ticket: "fixture-ticket" } } }) } }));
const sockets: Socket[] = [], providers: ManuscriptProvider[] = [];
class Socket {
  static OPEN = 1; readyState = 1; messages: unknown[] = [];
  onopen?: () => void; onmessage?: (event: { data: string }) => void;
  onclose?: () => void; onerror?: () => void;
  constructor() { sockets.push(this); }
  send(message: string) { this.messages.push(JSON.parse(message)); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
  receive(frame: unknown) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}
const until = async (check: () => boolean | Promise<boolean>) => { for (let i = 0; i < 100; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error("Recovery did not complete"); };
afterEach(async () => { providers.forEach(provider => provider.destroy()); providers.length = 0; sockets.length = 0; vi.useRealTimers(); await manuscriptRecovery.clearUser(auth.user.id); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("reopens unsaved CRDT edits, replays original receipts and removes recovery only after the server acknowledges", async () => {
  vi.stubGlobal("WebSocket", Socket);
  const server = new Y.Doc(), text = server.getText("source"); text.insert(0, "Original");
  const project = crypto.randomUUID(), file = crypto.randomUUID(), scope = `${auth.user.id}:${project}:draft:${file}`;
  const first = new ManuscriptProvider(project, "draft", file, auth.user.id, () => {}); providers.push(first);
  await until(() => sockets.length === 1);
  const state = () => ({ type: "state", update: encodeBytes(Y.encodeStateAsUpdate(server)), canWrite: true, sequence: 0, fileVersion: 1, user: { id: auth.user.id, name: "Team member", color: "#000000" } });
  sockets[0]!.receive(state()); first.text.insert(first.text.length, " offline");
  await until(async () => (await manuscriptRecovery.load(scope)).length === 1);
  const pending = (await manuscriptRecovery.load(scope))[0]!.queue[0]!;
  first.destroy();
  const reopened = new ManuscriptProvider(project, "draft", file, auth.user.id, () => {}); providers.push(reopened);
  await until(() => sockets.length === 2);
  expect(reopened.text.toString()).toBe("Original offline");
  sockets[1]!.receive(state());
  expect(sockets[1]!.messages).toContainEqual(pending);
  expect((await manuscriptRecovery.load(scope)).length).toBeGreaterThan(0);
  sockets[1]!.receive({ type: "receipt", clientSessionId: pending.clientSessionId, clientSequence: pending.clientSequence, update: encodeBytes(Y.encodeStateAsUpdate(server)), sequence: 1, fileVersion: 2 });
  await until(async () => (await manuscriptRecovery.load(scope)).length === 0);
  expect(reopened.getSnapshot()).toMatchObject({ status: "SAVED", pending: 0 });
  expect(reopened.text.toString()).toBe("Original offline");
  server.destroy();
});

async function connected() {
  vi.stubGlobal("WebSocket", Socket);
  const provider = new ManuscriptProvider(crypto.randomUUID(), "draft", crypto.randomUUID(), auth.user.id, () => {});
  providers.push(provider);
  await until(() => sockets.length === 1);
  const doc = new Y.Doc();
  const update = encodeBytes(Y.encodeStateAsUpdate(doc)); doc.destroy();
  sockets[0]!.receive({ type: "state", update, canWrite: true, sequence: 2, fileVersion: 3, user: { id: auth.user.id } });
  return { provider, socket: sockets[0]!, update };
}

it("keeps revision counters monotonic when a delayed update follows a newer receipt", async () => {
  const { provider, socket, update } = await connected();
  socket.receive({ type: "update", update, sequence: 10, fileVersion: 11 });
  socket.receive({ type: "update", update, sequence: 9, fileVersion: 10 });
  expect(provider.getSnapshot()).toMatchObject({ sequence: 10, fileVersion: 11 });
});

it("reconnects and replays the same receipt if an open socket stops acknowledging saves", async () => {
  const { provider, socket, update } = await connected();
  vi.useFakeTimers();
  provider.text.insert(0, "Unacknowledged writing");
  const pending = socket.messages.find((message: any) => message.type === "update");
  await vi.advanceTimersByTimeAsync(12_000);
  expect(socket.readyState).toBe(3);
  expect(provider.getSnapshot().pending).toBe(1);
  expect(sockets).toHaveLength(2);
  sockets[1]!.receive({ type: "state", update, canWrite: true, sequence: 2, fileVersion: 3, user: { id: auth.user.id } });
  expect(sockets[1]!.messages).toContainEqual(pending);
  expect(provider.text.toString()).toBe("Unacknowledged writing");
});

it("does not report a read-only manuscript as saved after an in-flight receipt", async () => {
  const { provider, socket, update } = await connected();
  provider.text.insert(0, "Before archival");
  const pending = socket.messages.find((message: any) => message.type === "update") as Record<string, unknown>;
  socket.receive({ type: "permission", canWrite: false });
  socket.receive({ ...pending, type: "receipt", update, sequence: 3, fileVersion: 4 });
  expect(provider.getSnapshot()).toMatchObject({ canWrite: false, status: "READ_ONLY", pending: 0 });
});

it("coalesces queued local checkpoints while retaining every pending receipt", async () => {
  const { provider } = await connected();
  const writes = vi.spyOn(manuscriptRecovery, "save").mockResolvedValue("stored");
  for (let index = 0; index < 1001; index++) provider.text.insert(provider.text.length, "a");
  await until(() => writes.mock.calls.some(([record]) => record.queue.length === 1001));
  expect(writes.mock.calls.length).toBeLessThanOrEqual(2);
  expect(provider.getSnapshot().pending).toBe(1001);
});

it("reconnects a silent idle socket even when there are no pending edits", async () => {
  const { provider, socket } = await connected();
  vi.useFakeTimers();
  socket.receive({ type: "permission", canWrite: true });
  await vi.advanceTimersByTimeAsync(16_100);
  expect(socket.readyState).toBe(3);
  expect(sockets).toHaveLength(2);
  expect(provider.getSnapshot()).toMatchObject({ pending: 0, ready: false, status: "RECONNECTING" });
});

it("does not let heartbeats hide an unacknowledged source update", async () => {
  const { provider, socket } = await connected();
  vi.useFakeTimers();
  provider.text.insert(0, "Retain this edit");
  await vi.advanceTimersByTimeAsync(5_000);
  socket.receive({ type: "permission", canWrite: true });
  await vi.advanceTimersByTimeAsync(5_100);
  expect(socket.readyState).toBe(3);
  expect(provider.getSnapshot().pending).toBe(1);
});
