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
  close() { this.readyState = 3; }
  receive(frame: unknown) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}
const until = async (check: () => boolean | Promise<boolean>) => { for (let i = 0; i < 100; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error("Recovery did not complete"); };
afterEach(async () => { providers.forEach(provider => provider.destroy()); providers.length = 0; sockets.length = 0; await manuscriptRecovery.clearUser(auth.user.id); vi.unstubAllGlobals(); });
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
