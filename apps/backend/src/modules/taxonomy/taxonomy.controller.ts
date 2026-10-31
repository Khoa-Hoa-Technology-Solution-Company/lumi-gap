import type { Request, Response } from "express";
import type {
  ListKeywordsQuery, ListNodesQuery, MergeKeywordInput, UpdateKeywordInput, UpdateNodeInput,
} from "./dto/taxonomy.schema.js";
import { taxonomyService } from "./taxonomy.service.js";

export const taxonomyController = {
  async listNodes(req: Request, res: Response) {
    const result = await taxonomyService.listNodes(req.query as unknown as ListNodesQuery);
    res.json({ success: true, data: result.data, meta: result.meta });
  },

  async getNode(req: Request<{ id: string }>, res: Response) {
    res.json({ success: true, data: await taxonomyService.getNode(req.params.id) });
  },

  async updateNode(req: Request<{ id: string }, unknown, UpdateNodeInput>, res: Response) {
    res.json({ success: true, data: await taxonomyService.updateNode(req.params.id, req.body) });
  },

  async listKeywords(req: Request, res: Response) {
    const result = await taxonomyService.listKeywords(req.query as unknown as ListKeywordsQuery);
    res.json({ success: true, data: result.data, meta: result.meta });
  },

  async updateKeyword(req: Request<{ id: string }, unknown, UpdateKeywordInput>, res: Response) {
    res.json({ success: true, data: await taxonomyService.updateKeyword(req.params.id, req.body) });
  },

  async mergeKeyword(req: Request<{ id: string }, unknown, MergeKeywordInput>, res: Response) {
    res.json({ success: true, data: await taxonomyService.mergeKeywords(req.params.id, req.body.targetId) });
  },

  async stats(_req: Request, res: Response) {
    res.json({ success: true, data: await taxonomyService.stats() });
  },
};
