import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { sweepStuckGapAnalyses } from "../gap-sweep.js";

// Never touch the real queue: a running dev worker would pick the jobs up.
vi.mock("../../../infrastructure/queue.js", () => ({ gapsQueue: { add: vi.fn().mockResolvedValue(undefined) }, hasLiveJob: vi.fn().mockResolvedValue(false) }));

const CHARGE = 30;
const MINUTE = 60_000;

describe.sequential("sweep of stuck gap analyses (PostgreSQL)", () => {
  const marker = crypto.randomUUID();
  const prisma = getPrisma();
  const analysisIds: string[] = [];
  let userId = "";
  let balanceBefore = 0;
  const live = new Set<string>();

  /** Only the analyses this test created are ever swept; every other row in the shared database is treated as live. */
  const deps = {
    isLive: async (id: string) => !analysisIds.includes(id) || live.has(id),
    now: Date.now,
  };

  async function createAnalysis(status: string, ageMs: number, charged = false) {
    const id = crypto.randomUUID();
    analysisIds.push(id);
    let creditTransactionId: string | undefined;
    if (charged) {
      const charge = await prisma.creditTransaction.create({
        data: { userId, type: "charge", action: "generate_gaps", amount: CHARGE, balanceAfter: balanceBefore, targetKind: "gap_analysis", targetUuid: id, idempotencyKey: `gap_analysis:${id}`, status: "applied" },
      });
      creditTransactionId = charge.id;
    }
    await prisma.gapAnalysis.create({
      data: { id, userId, topic: `sweep ${marker}`, status, updatedAt: new Date(Date.now() - ageMs), creditTransactionId, creditCost: charged ? CHARGE : undefined, creditAction: charged ? "generate_gaps" : undefined },
    });
    return { id, creditTransactionId };
  }
  const reload = (id: string) => prisma.gapAnalysis.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { fullName: "Sweep user", email: `gap-sweep-${marker}@example.test` } });
    userId = user.id;
    balanceBefore = user.credits;
  });

  afterAll(async () => {
    await prisma.gapAnalysis.deleteMany({ where: { id: { in: analysisIds } } });
    // Refunds point at their charge, so they go first.
    await prisma.creditTransaction.deleteMany({ where: { userId, type: "refund" } });
    await prisma.creditTransaction.deleteMany({ where: { userId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("fails an analysis stuck in analyzing and refunds its credits", async () => {
    const stuck = await createAnalysis("analyzing", 10 * MINUTE, true);

    await sweepStuckGapAnalyses(deps);

    const after = await reload(stuck.id);
    expect(after.status).toBe("failed");
    expect(after.creditRefundedAt).not.toBeNull();
    const charge = await prisma.creditTransaction.findUniqueOrThrow({ where: { id: stuck.creditTransactionId! } });
    expect(charge.status).toBe("refunded");
    const refund = await prisma.creditTransaction.findFirst({ where: { refundedTransactionId: stuck.creditTransactionId!, type: "refund" } });
    expect(refund?.amount).toBe(CHARGE);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).credits).toBe(balanceBefore + CHARGE);
  });

  it("leaves an analysis alone while its job is still live", async () => {
    const slow = await createAnalysis("analyzing", 10 * MINUTE, true);
    live.add(slow.id);

    await sweepStuckGapAnalyses(deps);

    const after = await reload(slow.id);
    expect(after.status).toBe("analyzing");
    expect(after.creditRefundedAt).toBeNull();
  });

  it("leaves a recently updated analyzing run alone", async () => {
    const fresh = await createAnalysis("analyzing", MINUTE, true);

    await sweepStuckGapAnalyses(deps);

    const after = await reload(fresh.id);
    expect(after.status).toBe("analyzing");
    expect(after.creditRefundedAt).toBeNull();
  });

  it("fails an analysis that sat in the queue for over 30 minutes and refunds it", async () => {
    const lost = await createAnalysis("queued", 45 * MINUTE, true);
    const recent = await createAnalysis("queued", 10 * MINUTE, true);

    await sweepStuckGapAnalyses(deps);

    const after = await reload(lost.id);
    expect(after.status).toBe("failed");
    expect(after.creditRefundedAt).not.toBeNull();
    const charge = await prisma.creditTransaction.findUniqueOrThrow({ where: { id: lost.creditTransactionId! } });
    expect(charge.status).toBe("refunded");
    // A queued run younger than 30 minutes may simply be waiting its turn.
    expect((await reload(recent.id)).status).toBe("queued");
  });
});
