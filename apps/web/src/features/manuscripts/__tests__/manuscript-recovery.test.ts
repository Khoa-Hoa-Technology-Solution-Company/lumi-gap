// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { manuscriptRecovery as store } from "../manuscript-recovery";

it("persists pending receipts across provider instances and isolates users and files", async () => {
  const record = { id: "session-a", scope: "alice:project:draft:file", user: "alice", updated: Date.now(), state: "encoded-yjs", queue: [{ type: "update" as const, clientSessionId: "receipt-session", clientSequence: 3, update: "pending" }] };
  await store.save(record);
  expect(await store.load(record.scope)).toEqual([record]);
  expect(await store.load("bob:project:draft:file")).toEqual([]);
  expect(await store.load("alice:project:draft:other")).toEqual([]);
  await store.save({ ...record, updated: record.updated + 1, state: "another-tab-new-edits" });
  await store.removeIfUnchanged(record);
  expect((await store.load(record.scope))[0]?.state).toBe("another-tab-new-edits");
  await store.save({ ...record, id: "session-b", user: "bob", scope: "bob:project:draft:file" });
  await store.clearUser("alice");
  expect(await store.load(record.scope)).toEqual([]);
  expect(await store.load("bob:project:draft:file")).toHaveLength(1);
  await store.remove("session-b");
  expect(await store.load("bob:project:draft:file")).toEqual([]);
});

it.each(["long session", "older draft"])("keeps unacknowledged edits from a %s", async kind => {
  const record = {
    id: `recovery-${kind}`, scope: `writer:${kind}`, user: "writer",
    updated: Date.now() - (kind === "older draft" ? 8 * 86400000 : 0), state: "encoded-yjs",
    queue: Array.from({ length: kind === "long session" ? 1001 : 1 }, (_, index) => ({
      type: "update" as const, clientSessionId: "receipt-session", clientSequence: index + 1, update: "pending",
    })),
  };
  await store.save(record);
  try {
    const recovered = await store.load(record.scope);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.queue.length).toBe(record.queue.length);
    expect(recovered[0]?.state).toBe(record.state);
  }
  finally { await store.remove(record.id); }
});
