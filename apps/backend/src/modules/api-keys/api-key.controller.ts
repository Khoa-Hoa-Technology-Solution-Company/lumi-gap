import type { Request, Response } from "express";
import { apiKeyService } from "./api-key.service.js";
import type { CreateApiKeyInput, UpdateApiKeyInput } from "./api-key.schema.js";

/** Thin HTTP handlers for Admin → API Keys. */
export const apiKeyController = {
  async list(_req: Request, res: Response) {
    res.json({ success: true, data: await apiKeyService.list() });
  },
  async create(req: Request<unknown, unknown, CreateApiKeyInput>, res: Response) {
    res.status(201).json({ success: true, data: await apiKeyService.create(req.user!.sub, req.body) });
  },
  async update(req: Request<{ id: string }, unknown, UpdateApiKeyInput>, res: Response) {
    res.json({ success: true, data: await apiKeyService.update(req.user!.sub, req.params.id, req.body) });
  },
  async test(req: Request<{ id: string }>, res: Response) {
    res.json({ success: true, data: await apiKeyService.test(req.user!.sub, req.params.id) });
  },
  async remove(req: Request<{ id: string }>, res: Response) {
    await apiKeyService.remove(req.user!.sub, req.params.id);
    res.json({ success: true, data: null });
  },
};
