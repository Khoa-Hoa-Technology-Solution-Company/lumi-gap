import { beforeEach, describe, expect, it, vi } from "vitest";

const queue = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock("../../../infrastructure/queue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../infrastructure/queue.js")>();
  return { ...actual, taggingQueue: queue };
});

import { cache } from "../../../infrastructure/cache.js";
import {
  enqueueRecomputeForumTopics, requeueIfVersionAdvanced, runVersionedRecompute, VOCAB_VERSION_KEY,
  type RecomputeResult,
} from "../personalization-topics.service.js";

const result = (): RecomputeResult => ({ vocabularySize: 1, droppedTerms: 0, scanned: 1, updated: 0, unchanged: 1, withTopics: 0, skippedConcurrent: 0 });

/** A version source that returns the given values in order (the last one repeats). */
const versions = (...values: Array<number | null>) => {
  let index = 0;
  return vi.fn(async () => values[Math.min(index++, values.length - 1)]!);
};

describe("47. the recompute job does not lose changes made while it runs (F5)", () => {
  it("runs once when the version did not move", async () => {
    const recompute = vi.fn(async () => result());
    const outcome = await runVersionedRecompute({ recompute, readVersion: versions(5, 5), maxPasses: 3 });
    expect(outcome).toMatchObject({ passes: 1, settledVersion: 5, capped: false });
    expect(recompute).toHaveBeenCalledTimes(1);
  });

  it("runs a second pass when the version bumped during the first", async () => {
    const recompute = vi.fn(async () => result());
    // start 5, after pass 1 -> 6 (moved), after pass 2 -> 6 (settled)
    const outcome = await runVersionedRecompute({ recompute, readVersion: versions(5, 6, 6), maxPasses: 3 });
    expect(outcome).toMatchObject({ passes: 2, settledVersion: 6, capped: false });
    expect(recompute).toHaveBeenCalledTimes(2);
  });

  it("stops at 3 passes when the version keeps moving and asks for another job", async () => {
    const recompute = vi.fn(async () => result());
    let counter = 0;
    const outcome = await runVersionedRecompute({ recompute, readVersion: async () => counter++, maxPasses: 3 });
    expect(recompute).toHaveBeenCalledTimes(3);
    expect(outcome).toMatchObject({ passes: 3, capped: true });
  });

  it("runs a single pass without throwing when Redis is unavailable", async () => {
    const recompute = vi.fn(async () => result());
    const atStart = await runVersionedRecompute({ recompute, readVersion: async () => null, maxPasses: 3 });
    expect(atStart).toMatchObject({ passes: 1, settledVersion: null, capped: false });
    const afterPass = await runVersionedRecompute({ recompute, readVersion: versions(4, null), maxPasses: 3 });
    expect(afterPass).toMatchObject({ passes: 1, settledVersion: null });
  });
});

describe("47. enqueueing bumps the version and still queues the job when Redis fails", () => {
  beforeEach(() => { queue.add.mockReset().mockResolvedValue(undefined); vi.restoreAllMocks(); });

  it("INCRs the version first, then adds the job with the fixed id", async () => {
    const incr = vi.spyOn(cache, "incr").mockResolvedValue(7);
    await enqueueRecomputeForumTopics();
    expect(incr).toHaveBeenCalledWith(VOCAB_VERSION_KEY);
    expect(queue.add).toHaveBeenCalledWith("recompute-forum-topics", {}, expect.objectContaining({ jobId: "recompute-forum-topics" }));
  });

  it("an INCR that returns null or throws still enqueues and does not reject", async () => {
    vi.spyOn(cache, "incr").mockResolvedValueOnce(null);
    await expect(enqueueRecomputeForumTopics()).resolves.toBeUndefined();
    expect(queue.add).toHaveBeenCalledTimes(1);
    vi.spyOn(cache, "incr").mockRejectedValueOnce(new Error("redis down"));
    await expect(enqueueRecomputeForumTopics()).resolves.toBeUndefined();
    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it("a failing queue never rejects", async () => {
    vi.spyOn(cache, "incr").mockResolvedValue(1);
    queue.add.mockRejectedValueOnce(new Error("queue down"));
    await expect(enqueueRecomputeForumTopics()).resolves.toBeUndefined();
  });

  it("requeues without bumping when the version moved after the job settled or the cap was hit", async () => {
    const incr = vi.spyOn(cache, "incr").mockResolvedValue(1);
    vi.spyOn(cache, "getInt").mockResolvedValue(9);
    await requeueIfVersionAdvanced({ settledVersion: 8, capped: false });
    expect(queue.add).toHaveBeenCalledTimes(1);
    await requeueIfVersionAdvanced({ settledVersion: 9, capped: false });
    expect(queue.add).toHaveBeenCalledTimes(1);
    await requeueIfVersionAdvanced({ settledVersion: 9, capped: true });
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(incr).not.toHaveBeenCalled();
  });
});
