import type { Request, Response } from "express";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { embeddingQueue } from "../../infrastructure/queue.js";

/**
 * Thin HTTP layer for embedding. Triggering only ENQUEUES a BullMQ job and
 * returns immediately — the standalone worker (pnpm worker:embedding) does the
 * actual vectorisation.
 */
export const embeddingController = {
  async trigger(_req: Request, res: Response) {
    const job = await embeddingQueue.add("manual-embedding", {});
    res.status(202).json({ success: true, data: { jobId: job.id, status: "queued" } });
  },

  async status(_req: Request, res: Response) {
    const prisma = getPrisma();
    const [analyzable, embedded] = await Promise.all([
      prisma.paper.count({ where: { isAiAnalyzable: true } }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM papers
        WHERE is_ai_analyzable = TRUE AND embedding IS NOT NULL
      `.then((rows) => Number(rows[0]?.count ?? 0)),
    ]);
    res.json({
      success: true,
      data: {
        analyzable,
        embedded,
        pending: analyzable - embedded,
        totalPapers: analyzable,
        embeddedPapers: embedded,
        pendingPapers: analyzable - embedded,
      },
    });
  },
};
