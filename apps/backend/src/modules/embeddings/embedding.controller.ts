import type { Request, Response } from "express";
import { embeddingQueue } from "../../infrastructure/queue.js";
import { PaperModel } from "../papers/models/paper.model.js";

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
    const [analyzable, embedded] = await Promise.all([
      PaperModel.countDocuments({ isAiAnalyzable: true }),
      PaperModel.countDocuments({ isAiAnalyzable: true, embedding: { $exists: true } }),
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
