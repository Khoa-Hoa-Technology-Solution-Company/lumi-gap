import { expect, it, vi } from "vitest";
import { TrackedProposalSaver } from "../tracked-proposal-saver";
const receipt = { id: "proposal", revision: 1 };
it("serializes typing during an in-flight create and only acknowledges the latest saved text", async () => {
  let finish!: (value: typeof receipt) => void;
  const create = vi.fn(() => new Promise<typeof receipt>(resolve => { finish = resolve; })), update = vi.fn(async () => ({ ...receipt, revision: 2 }));
  const saver = new TrackedProposalSaver("original", create, update, () => undefined);
  saver.edit("first"); const saving = saver.save(); await Promise.resolve();
  saver.edit("latest"); expect(saver.dirty).toBe(true);
  finish(receipt); await saving;
  expect(create).toHaveBeenCalledOnce(); expect(create).toHaveBeenCalledWith("first"); expect(update).toHaveBeenCalledOnce(); expect(update).toHaveBeenCalledWith(receipt, "latest");
  expect(saver.dirty).toBe(false); expect(saver.revision).toBe(2);
});
it("replays an uncertain create verbatim before saving newer typing", async () => {
  const create = vi.fn().mockRejectedValueOnce(new Error("Lost response")).mockResolvedValue(receipt), update = vi.fn(async () => ({ ...receipt, revision: 2 }));
  const saver = new TrackedProposalSaver("original", create, update, () => undefined);
  saver.edit("initial request"); await expect(saver.save()).rejects.toThrow();
  saver.edit("new typing after timeout"); await saver.save();
  expect(create.mock.calls.map(call => call[0])).toEqual(["initial request", "initial request"]);
  expect(update).toHaveBeenCalledWith(receipt, "new typing after timeout"); expect(saver.failed).toBe(false); expect(saver.dirty).toBe(false);
});
it("retries a failed revision update without changing its expected revision", async () => {
  const update = vi.fn().mockRejectedValueOnce(new Error("Lost update response")).mockResolvedValue({ ...receipt, revision: 2 });
  const saver = new TrackedProposalSaver("original", async () => receipt, update, () => undefined);
  saver.edit("first"); await saver.save(); saver.edit("second"); await expect(saver.save()).rejects.toThrow();
  expect(saver.dirty).toBe(true); await saver.save();
  expect(update.mock.calls).toEqual([[receipt, "second"], [receipt, "second"]]); expect(saver.dirty).toBe(false);
});
it("does not create unchanged proposals, persists reversions, and stops queued work on disposal", async () => {
  const create = vi.fn(async () => receipt), update = vi.fn(async () => ({ ...receipt, revision: 2 }));
  const saver = new TrackedProposalSaver("original", create, update, () => undefined);
  saver.edit("original"); await saver.save(); expect(create).not.toHaveBeenCalled();
  saver.edit("edited"); await saver.save(); saver.edit("original"); await saver.save(); expect(update).toHaveBeenCalledWith(receipt, "original");
  saver.dispose(); saver.edit("after close"); await saver.save(); expect(update).toHaveBeenCalledOnce();
});
it("replays an uncertain update before saving newer typing, even after reverting to saved text", async () => {
  const second = { ...receipt, revision: 2 }, third = { ...receipt, revision: 3 };
  const update = vi.fn().mockRejectedValueOnce(new Error("Lost response")).mockResolvedValueOnce(second).mockResolvedValueOnce(third);
  const saver = new TrackedProposalSaver("original", async () => receipt, update, () => undefined);
  saver.edit("first"); await saver.save(); saver.edit("second"); await expect(saver.save()).rejects.toThrow();
  saver.edit("first"); expect(saver.dirty).toBe(true); await saver.save();
  expect(update.mock.calls).toEqual([[receipt, "second"], [receipt, "second"], [second, "first"]]);
  expect(saver.dirty).toBe(false); expect(saver.revision).toBe(3);
});
it("retains over-limit typing received during a save and resumes after shortening", async () => {
  let finish!: (value: typeof receipt) => void;
  const update = vi.fn(async () => ({ ...receipt, revision: 2 }));
  const saver = new TrackedProposalSaver("original", () => new Promise(resolve => { finish = resolve; }), update, () => undefined);
  saver.edit("first"); const saving = saver.save(); await Promise.resolve();
  saver.edit("x".repeat(100001)); finish(receipt); await expect(saving).rejects.toThrow("PROPOSAL_TOO_LARGE");
  expect(update).not.toHaveBeenCalled(); expect(saver.dirty).toBe(true);
  saver.edit("shorter"); await saver.save(); expect(saver.dirty).toBe(false);
});
