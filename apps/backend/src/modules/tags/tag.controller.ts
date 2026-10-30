import type { Request, Response } from "express";
import type { CreateTagInput, ListTagsQuery, ReplaceRulesInput, UpdateTagInput } from "./dto/tag.schema.js";
import { tagService } from "./tag.service.js";

export const tagController = {
  async list(req: Request, res: Response) {
    const result = await tagService.list(req.query as unknown as ListTagsQuery);
    res.json({ success: true, data: result.data, meta: result.meta });
  },

  async create(req: Request<unknown, unknown, CreateTagInput>, res: Response) {
    const data = await tagService.create(req.user?.sub, req.body);
    res.status(201).json({ success: true, data });
  },

  async get(req: Request<{ id: string }>, res: Response) {
    res.json({ success: true, data: await tagService.get(req.params.id) });
  },

  async update(req: Request<{ id: string }, unknown, UpdateTagInput>, res: Response) {
    res.json({ success: true, data: await tagService.update(req.params.id, req.body) });
  },

  async replaceRules(req: Request<{ id: string }, unknown, ReplaceRulesInput>, res: Response) {
    res.json({ success: true, data: await tagService.replaceRules(req.params.id, req.body) });
  },

  async archive(req: Request<{ id: string }>, res: Response) {
    res.json({ success: true, data: await tagService.archive(req.params.id) });
  },

  async preview(req: Request<{ id: string }>, res: Response) {
    res.json({ success: true, data: await tagService.preview(req.params.id) });
  },
};
