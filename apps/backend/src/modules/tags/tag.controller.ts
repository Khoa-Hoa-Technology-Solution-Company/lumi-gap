import type { Request, Response } from "express";
import type {
  AddTagPapersInput, CreateTagInput, ListTagPapersQuery, ListTagsQuery, ReplaceRulesInput, UpdateTagInput,
} from "./dto/tag.schema.js";
import { tagAssignmentService } from "./tag-assignment.service.js";
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

  async apply(req: Request<{ id: string }>, res: Response) {
    // 404 for an unknown tag before queueing, so the admin is not handed a job that can only fail.
    await tagService.get(req.params.id);
    res.status(202).json({ success: true, data: await tagAssignmentService.enqueueApplyTag(req.params.id) });
  },

  async applyAll(_req: Request, res: Response) {
    res.status(202).json({ success: true, data: await tagAssignmentService.enqueueApplyAll() });
  },

  async listPapers(req: Request<{ id: string }>, res: Response) {
    const result = await tagAssignmentService.listPapers(req.params.id, req.query as unknown as ListTagPapersQuery);
    res.json({ success: true, data: result.data, meta: result.meta });
  },

  async addPapers(req: Request<{ id: string }, unknown, AddTagPapersInput>, res: Response) {
    res.json({ success: true, data: await tagAssignmentService.addPapers(req.params.id, req.body.paperIds) });
  },

  async removePaper(req: Request<{ id: string; paperId: string }>, res: Response) {
    res.json({ success: true, data: await tagAssignmentService.removePaper(req.params.id, req.params.paperId) });
  },

  async unblockPaper(req: Request<{ id: string; paperId: string }>, res: Response) {
    res.status(202).json({ success: true, data: await tagAssignmentService.unblockPaper(req.params.id, req.params.paperId) });
  },
};
