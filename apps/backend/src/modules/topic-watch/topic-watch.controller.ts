import type { Request, Response } from "express";
import type { ListTopicWatchesQuery, UpdateTopicWatchInput, UpsertTopicWatchInput } from "./dto/topic-watch.schema.js";
import { topicWatchService } from "./topic-watch.service.js";

export const topicWatchController = {
  async list(req: Request, res: Response) {
    res.json({ success: true, data: await topicWatchService.list(req.query as unknown as ListTopicWatchesQuery) });
  },

  async upsert(req: Request<unknown, unknown, UpsertTopicWatchInput>, res: Response) {
    const result = await topicWatchService.upsert(req.user?.sub, req.body);
    res.status(result.created ? 201 : 200).json({ success: true, data: result });
  },

  async update(req: Request<{ id: string }, unknown, UpdateTopicWatchInput>, res: Response) {
    res.json({ success: true, data: await topicWatchService.update(req.user?.sub, req.params.id, req.body) });
  },

  async remove(req: Request<{ id: string }>, res: Response) {
    await topicWatchService.remove(req.user?.sub, req.params.id);
    res.json({ success: true, data: { removed: true } });
  },

  async run(_req: Request, res: Response) {
    const result = await topicWatchService.requestRun();
    res.status(result.queued ? 202 : 200).json({ success: true, data: result });
  },
};
